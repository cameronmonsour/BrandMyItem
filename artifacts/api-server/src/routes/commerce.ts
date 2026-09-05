import { randomUUID } from "node:crypto";
import {
  campaignsTable,
  db,
  placementOrdersTable,
  sponsorReservationDraftsTable,
  trackingMagicLinksTable,
  trackingMagicLinkRequestsTable,
  uploadIntentsTable,
} from "@workspace/db";
import {
  CreatePlacementCheckoutBody,
  CreatePlacementCheckoutResponse,
  GetPlacementCheckoutParams,
  GetPlacementCheckoutResponse,
  GetTrackingQueryParams,
  GetTrackingResponse,
  ListCampaignsResponse,
  RegisterCampaignBody,
  RegisterCampaignResponse,
  RequestTrackingMagicLinkBody,
} from "@workspace/api-zod";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import { stripeRequest } from "../stripeClient.ts";
import {
  accessTokenHashesForScope,
  accessTokenMatches,
  createAccessToken,
  hashAccessToken,
  readAccessToken,
  setAccessCookie,
} from "../lib/accessControl.ts";
import {
  checkoutIdempotencyKey,
} from "../paymentTransitions.ts";
import { verifyImageObject } from "../lib/objectStorage.ts";
import { uploadCapabilityMatches } from "../lib/uploadIntents.ts";
import {
  attemptCampaignFunding,
  relistCampaign,
} from "../paymentFunding.ts";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation.ts";
import { sendTransactionalEmail } from "../emailDelivery.ts";
import {
  campaignItemDisplayName,
  reservationConfirmationEmail,
  trackingMagicLinkEmail,
} from "../emailTemplates.ts";
import { logger } from "../lib/logger.ts";
import {
  readActiveReservationsForCampaigns,
  readActiveReservationsForEmail,
} from "../lib/activeReservations.ts";

const router: IRouter = Router();
const TRACKING_LINK_TTL_MS = 15 * 60 * 1000;

// Kept as a deliberately non-functional compatibility endpoint.  New
// registrations must establish a draft and owner capability before publish.
router.post("/campaigns", (_req, res): void => {
  res.status(410).json({
    error: "Campaign registration now requires POST /campaign-drafts followed by publication.",
  });
});

async function cleanupTrackingMagicLinks(now = new Date()): Promise<void> {
  await db
    .delete(trackingMagicLinksTable)
    .where(
      or(
        lte(trackingMagicLinksTable.expiresAt, now),
        isNotNull(trackingMagicLinksTable.usedAt),
      ),
    );
}

function publicClaim(order: typeof placementOrdersTable.$inferSelect) {
  return {
    orderId: order.id,
    spotIndex: order.spotIndex,
    brandName: order.brandName,
    destinationUrl: order.destinationUrl,
    logoObjectPath: order.logoObjectPath,
    amountCents: order.amountCents,
    reservedAt: order.reservedAt ?? order.updatedAt,
    status: order.status,
  };
}

async function publicCampaigns(
  campaigns: Array<typeof campaignsTable.$inferSelect>,
) {
  campaigns = campaigns.filter((campaign) => !campaign.test);
  const ids = campaigns.map((campaign) => campaign.id);
  const orders = await readActiveReservationsForCampaigns(ids);
  const claimsByCampaign = new Map<string, Array<ReturnType<typeof publicClaim>>>();
  for (const order of orders) {
    const claims = claimsByCampaign.get(order.campaignId) ?? [];
    claims.push(publicClaim(order));
    claimsByCampaign.set(order.campaignId, claims);
  }
  return campaigns.map((campaign) => {
    const claims: Array<ReturnType<typeof publicClaim> | null> =
      campaign.pricesCents.map(() => null);
    for (const claim of claimsByCampaign.get(campaign.id) ?? []) {
      if (claim.spotIndex >= 0 && claim.spotIndex < claims.length) {
        claims[claim.spotIndex] = claim;
      }
    }
    const {
      ownerEmail: _ownerEmail,
      ownerAccessTokenHash: _ownerAccessTokenHash,
      ...publicCampaign
    } = campaign;
    const reservedCount = claims.filter(Boolean).length;
    return {
      ...publicCampaign,
      claims,
      relistCount: campaign.relistCount,
      relistEligible:
        campaign.lifecycleStatus === "expired" &&
        campaign.relistCount < 1 &&
        reservedCount >= Math.ceil(campaign.pricesCents.length / 2),
    };
  });
}

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = RegisterCampaignBody.safeParse(req.body);
  if (
    !parsed.success ||
    parsed.data.id.startsWith("demo") ||
    !isSafeCampaignPresentation(parsed.data.presentation)
  ) {
    res.status(400).json({ error: "Invalid campaign" });
    return;
  }
  const input = parsed.data;
  const totalCents = input.pricesCents.reduce((sum, cents) => sum + cents, 0);
  const highValue = totalCents >= 200000;
  const socialHandle = typeof input.presentation.social === "string"
    ? input.presentation.social.trim()
    : "";
  if (
    highValue &&
    (!socialHandle || !input.w9ObjectPath || !(await verifyImageObject(input.w9ObjectPath, "w9")))
  ) {
    res.status(400).json({ error: "High-value listings require a social handle and submitted W-9 before publication." });
    return;
  }
  const [existing] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, input.id))
    .limit(1);
  let campaign: typeof campaignsTable.$inferSelect;
  if (existing) {
    const sameCore =
      existing.itemType === input.itemType &&
      existing.title === input.title &&
      existing.ownerName === input.ownerName &&
      existing.ownerEmail === input.ownerEmail &&
      JSON.stringify(existing.pricesCents) === JSON.stringify(input.pricesCents);
    if (!sameCore) {
      res.status(409).json({ error: "Campaign identity or prices cannot be changed" });
      return;
    }
    if (Object.keys(existing.presentation ?? {}).length > 0) {
      campaign = existing;
    } else {
      [campaign] = await db
        .update(campaignsTable)
        .set({ presentation: input.presentation, updatedAt: new Date() })
        .where(eq(campaignsTable.id, input.id))
        .returning();
    }
  } else {
    const ownerAccessToken = createAccessToken();
    [campaign] = await db
      .insert(campaignsTable)
      .values({
        ...input,
        ownerAccessTokenHash: hashAccessToken(ownerAccessToken),
        ownerAssentAt: new Date(),
        ownerAssentIp: req.ip,
        ownerTermsVersion: input.ownerAssent.termsVersion,
        ownerContentVersion: input.ownerAssent.contentVersion,
        ownerCheckinVersion: input.ownerAssent.checkinVersion,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        w9Required: highValue,
        w9Status:
          highValue
            ? "submitted"
            : "not_required",
        w9ObjectPath: highValue ? input.w9ObjectPath : null,
        w9SubmittedAt: highValue ? new Date() : null,
      })
      .returning();
    setAccessCookie(res, "campaign", campaign.id, ownerAccessToken);
  }
  const [registered] = await publicCampaigns([campaign]);
  res.status(201).json(RegisterCampaignResponse.parse(registered));
});

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(
      eq(campaignsTable.active, true),
      ne(campaignsTable.lifecycleStatus, "draft"),
      ne(campaignsTable.test, true),
    ))
    .orderBy(desc(campaignsTable.createdAt));
  res.json(ListCampaignsResponse.parse(await publicCampaigns(campaigns)));
});

router.post("/tracking/magic-link", async (req, res): Promise<void> => {
  const parsed = RequestTrackingMagicLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ tokenHash: trackingMagicLinkRequestsTable.id })
    .from(trackingMagicLinkRequestsTable)
    .where(and(eq(trackingMagicLinkRequestsTable.normalizedEmail, email), gte(trackingMagicLinkRequestsTable.requestedAt, hourAgo)));
  if (recent.length >= 5) {
    res.status(202).json({ message: "If that email is linked to an item, a one-time tracking link is on its way." });
    return;
  }
  const [ownerMatch, reservationMatch] = await Promise.all([
    db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(and(
        sql`lower(${campaignsTable.ownerEmail}) = ${email}`,
        ne(campaignsTable.test, true),
      ))
      .limit(1),
    db
      .select({ id: placementOrdersTable.id })
      .from(placementOrdersTable)
      .innerJoin(campaignsTable, eq(placementOrdersTable.campaignId, campaignsTable.id))
      .where(and(
        sql`lower(${placementOrdersTable.email}) = ${email}`,
        ne(campaignsTable.test, true),
      ))
      .limit(1),
  ]);
  if (!ownerMatch.length && !reservationMatch.length) {
    res.status(202).json({ message: "If that email is linked to an item, a one-time tracking link is on its way." });
    return;
  }
  await db.insert(trackingMagicLinkRequestsTable).values({ id: randomUUID(), normalizedEmail: email });
  const token = createAccessToken();
  const tokenHash = hashAccessToken(token);
  const expiresAt = new Date(Date.now() + TRACKING_LINK_TTL_MS);
  await cleanupTrackingMagicLinks();
  await db.insert(trackingMagicLinksTable).values({
    tokenHash,
    email,
    expiresAt,
  });

  try {
    const publicAppUrl = process.env.BRANDMYITEM_PUBLIC_URL;
    const allowedOrigins = (process.env.BRANDMYITEM_PUBLIC_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean);
    const canonicalOrigin = publicAppUrl?.replace(/\/$/, "");
    if (
      !canonicalOrigin ||
      !/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(canonicalOrigin) ||
      !allowedOrigins.includes(canonicalOrigin)
    ) {
      throw new Error("BRANDMYITEM_PUBLIC_URL must be an allowlisted HTTPS canonical origin");
    }
    const trackingUrl = new URL("/", canonicalOrigin);
    trackingUrl.searchParams.set("tracking_token", token);

    const delivery = await sendTransactionalEmail(
      trackingMagicLinkEmail({
        email,
        trackingUrl: trackingUrl.toString(),
      }),
    );
    logger.info({ resendMessageId: delivery.messageId }, "Tracking magic link sent");
  } catch (error) {
    await db
      .delete(trackingMagicLinksTable)
      .where(eq(trackingMagicLinksTable.tokenHash, tokenHash));
    logger.warn({ err: error }, "Tracking magic link delivery failed");
  }

  // Always return the same response. Do not reveal whether the address is
  // present in the marketplace or whether delivery succeeded.
  res.status(202).json({
    message:
      "If that email is linked to an item, a one-time tracking link is on its way.",
  });
});

router.get("/tracking", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = GetTrackingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid or expired tracking link" });
    return;
  }

  const tokenHash = hashAccessToken(parsed.data.token);
  const now = new Date();
  await cleanupTrackingMagicLinks(now);
  const [magicLink] = await db
    .update(trackingMagicLinksTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(trackingMagicLinksTable.tokenHash, tokenHash),
        isNull(trackingMagicLinksTable.usedAt),
        gt(trackingMagicLinksTable.expiresAt, now),
      ),
    )
    .returning({ email: trackingMagicLinksTable.email });

  if (!magicLink) {
    res.status(401).json({ error: "Tracking link is invalid or expired" });
    return;
  }
  const email = magicLink.email.trim().toLowerCase();
  const ownerAccessHashes = accessTokenHashesForScope(req, "campaign");
  const checkoutAccessHashes = accessTokenHashesForScope(req, "checkout");
  if (!magicLink && !ownerAccessHashes.length && !checkoutAccessHashes.length) {
    res.status(401).json({ error: "Tracking access is required" });
    return;
  }

  const ownerCampaigns = magicLink || ownerAccessHashes.length
    ? await db
        .select()
        .from(campaignsTable)
        .where(
          and(
            ne(campaignsTable.test, true),
            sql`lower(${campaignsTable.ownerEmail}) = ${email}`,
            magicLink
              ? sql`true`
              : inArray(campaignsTable.ownerAccessTokenHash, ownerAccessHashes),
          ),
        )
        .orderBy(desc(campaignsTable.createdAt))
    : [];
  const emailOrders = magicLink || checkoutAccessHashes.length
    ? await readActiveReservationsForEmail(email)
    : [];
  const brandOrders = emailOrders
    .filter((order) =>
      magicLink || (
        order.checkoutAccessTokenHash &&
        checkoutAccessHashes.includes(order.checkoutAccessTokenHash)
      ),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const ownerCampaignIds = ownerCampaigns.map((campaign) => campaign.id);
  const ownerOrders = (await readActiveReservationsForCampaigns(ownerCampaignIds))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const campaignIds = Array.from(
    new Set([
      ...ownerCampaignIds,
      ...brandOrders.map((order) => order.campaignId),
    ]),
  );
  const campaigns = campaignIds.length
    ? await db
        .select()
        .from(campaignsTable)
        .where(and(inArray(campaignsTable.id, campaignIds), ne(campaignsTable.test, true)))
        .orderBy(desc(campaignsTable.createdAt))
    : [];

  const ownerIdSet = new Set(ownerCampaignIds);
  const ordersByCampaign = new Map<
    string,
    Map<string, (typeof brandOrders)[number]>
  >();
  for (const order of [...ownerOrders, ...brandOrders]) {
    const campaignOrders =
      ordersByCampaign.get(order.campaignId) ??
      new Map<string, (typeof brandOrders)[number]>();
    campaignOrders.set(order.id, order);
    ordersByCampaign.set(order.campaignId, campaignOrders);
  }

  res.json(
    GetTrackingResponse.parse({
      email,
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        itemType: campaign.itemType,
        title: campaign.title,
        ownerName: campaign.ownerName,
        pricesCents: campaign.pricesCents,
        active: campaign.active,
        ownerMatch: ownerIdSet.has(campaign.id),
        createdAt: campaign.createdAt,
        orders: Array.from(
          ordersByCampaign.get(campaign.id)?.values() ?? [],
        ).map((order) => ({
          id: order.id,
          campaignId: order.campaignId,
          spotIndex: order.spotIndex,
          amountCents: order.amountCents,
          brandName: order.brandName,
          email: order.email,
          destinationUrl: order.destinationUrl,
          logoObjectPath: order.logoObjectPath,
          status: order.status,
          createdAt: order.createdAt,
        })),
      })),
    }),
  );
});

type SetupSessionSnapshot = {
  id: string;
  status: string;
  url?: string | null;
  customer?: string | null;
  setup_intent?: string | null;
  metadata?: Record<string, string>;
};

type SetupIntentSnapshot = {
  id: string;
  status: string;
  customer?: string | null;
  payment_method?: string | null;
  metadata?: Record<string, string>;
};

type CustomerSnapshot = {
  id: string;
  email?: string | null;
  name?: string | null;
};

function metadataValue(
  metadata: Record<string, string> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataInteger(
  metadata: Record<string, string> | undefined,
  key: string,
): number | undefined {
  const value = metadataValue(metadata, key);
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

async function orderForCheckoutSession(
  session: SetupSessionSnapshot,
): Promise<typeof placementOrdersTable.$inferSelect> {
  const metadata = session.metadata ?? {};
  const [bySession] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.stripeCheckoutSessionId, session.id))
    .limit(1);
  if (bySession) return bySession;

  const metadataOrderId = metadataValue(metadata, "reservationId");
  if (metadataOrderId) {
    const [byMetadata] = await db
      .select()
      .from(placementOrdersTable)
      .where(eq(placementOrdersTable.id, metadataOrderId))
      .limit(1);
    if (byMetadata) return byMetadata;
  }

  const campaignId = metadataValue(metadata, "campaignId");
  const spotIndex = metadataInteger(metadata, "spotIndex");
  let email = metadataValue(metadata, "email");
  let brandName = metadataValue(metadata, "brandName");
  if ((!email || !brandName) && session.customer) {
    const customer = await stripeRequest<CustomerSnapshot>(
      `/v1/customers/${encodeURIComponent(session.customer)}`,
    );
    email ||= customer.email?.trim() || undefined;
    brandName ||= customer.name?.trim() || undefined;
  }
  if (!campaignId || spotIndex === undefined || !email) {
    throw new Error("Checkout session metadata is incomplete");
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  const amountCents = campaign?.pricesCents[spotIndex];
  if (!campaign || !Number.isInteger(amountCents) || amountCents < 100) {
    throw new Error("Checkout session campaign placement is unavailable");
  }

  const orderId = metadataOrderId ?? randomUUID();
  const now = new Date();
  const inserted = await db
    .insert(placementOrdersTable)
    .values({
      id: orderId,
      campaignId,
      spotIndex,
      amountCents,
      brandName: brandName ?? "Brand sponsor",
      email,
      destinationUrl: metadataValue(metadata, "destinationUrl") ?? null,
      logoObjectPath: metadataValue(metadata, "logoObjectPath") ?? null,
      status: "pending",
      stripeCheckoutSessionId: session.id,
      stripeCheckoutIdempotencyKey: checkoutIdempotencyKey(orderId, session.id),
      checkoutAccessTokenHash: null,
      brandAssentAt: now,
      brandTermsVersion: metadataValue(metadata, "termsVersion") ?? "2026-09-04",
      brandContentVersion: metadataValue(metadata, "contentVersion") ?? "2026-09-04",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.stripeCheckoutSessionId, session.id))
    .limit(1);
  if (!existing) throw new Error("Checkout reservation could not be recovered");
  return existing;
}

async function reserveFromSetupSession(
  order: typeof placementOrdersTable.$inferSelect,
  session: SetupSessionSnapshot,
): Promise<typeof placementOrdersTable.$inferSelect> {
  if (session.status !== "complete" || !session.setup_intent) return order;
  const setupIntent = await stripeRequest<SetupIntentSnapshot>(
    `/v1/setup_intents/${encodeURIComponent(session.setup_intent)}`,
  );
  if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
    return order;
  }
  const [reserved] = await db
    .update(placementOrdersTable)
    .set({
      status: "reserved",
      stripeSetupIntentId: setupIntent.id,
      stripeCustomerId: session.customer ?? setupIntent.customer ?? null,
      stripePaymentMethodId: setupIntent.payment_method,
      reservedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(placementOrdersTable.id, order.id),
        inArray(placementOrdersTable.status, ["pending", "payment_failed"]),
      ),
    )
    .returning();
  const result = reserved ?? order;
  if (result.status === "reserved") {
    await attemptCampaignFunding(result.campaignId);
  }
  return result;
}

export async function finalizeCheckoutSession(
  sessionId: string,
): Promise<typeof placementOrdersTable.$inferSelect> {
  const session = await stripeRequest<SetupSessionSnapshot>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (session.setup_intent) {
    const setupIntent = await stripeRequest<SetupIntentSnapshot>(
      `/v1/setup_intents/${encodeURIComponent(session.setup_intent)}`,
    );
    session.metadata = { ...setupIntent.metadata, ...session.metadata };
  }
  const order = await orderForCheckoutSession(session);
  return reserveFromSetupSession(order, session);
}

export async function sendReservationConfirmationForOrder(
  orderId: string,
): Promise<{ sent: boolean; messageId?: string }> {
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.id, orderId))
    .limit(1);
  if (!order || !["reserved", "funded"].includes(order.status)) {
    throw new Error("Reservation is not confirmed");
  }
  if (order.confirmationEmailSentAt) {
    return { sent: false, messageId: order.confirmationEmailMessageId ?? undefined };
  }
  const [campaign] = await db
    .select({
      itemType: campaignsTable.itemType,
      presentation: campaignsTable.presentation,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, order.campaignId))
    .limit(1);
  if (!campaign) throw new Error("Campaign not found");
  const delivery = await sendTransactionalEmail(
    reservationConfirmationEmail({
      email: order.email,
      reservationId: `BMI-${order.id.toUpperCase().slice(0, 6)}`,
      itemDisplayName: campaignItemDisplayName(campaign),
      amountCents: order.amountCents,
    }),
  );
  await db
    .update(placementOrdersTable)
    .set({
      confirmationEmailSentAt: new Date(),
      confirmationEmailMessageId: delivery.messageId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(placementOrdersTable.id, order.id), isNull(placementOrdersTable.confirmationEmailSentAt)));
  return { sent: true, messageId: delivery.messageId };
}

router.post("/checkout/sessions", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = CreatePlacementCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reservation details" });
    return;
  }
  const input = parsed.data;
  const reservationCapability = readAccessToken(req, "sponsor_reservation", input.reservationDraftId);
  if (!reservationCapability) {
    res.status(404).json({ error: "Reservation draft not found" });
    return;
  }
  const now = new Date();
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, input.campaignId), eq(campaignsTable.active, true)))
    .limit(1);
  if (!campaign || campaign.lifecycleStatus !== "live" || (campaign.expiresAt && campaign.expiresAt <= now)) {
    res.status(404).json({ error: "Campaign is not available" });
    return;
  }
  const amountCents = campaign.pricesCents[input.spotIndex];
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    res.status(400).json({ error: "Placement is not available" });
    return;
  }
  const orderId = randomUUID();
  const checkoutAccessToken = createAccessToken();
  const checkoutAccessTokenHash = hashAccessToken(checkoutAccessToken);
  const idempotencyKey = checkoutIdempotencyKey(orderId);
  const reservationValues = {
    campaignId: campaign.id,
    spotIndex: input.spotIndex,
    amountCents,
    brandName: input.brandName,
    email: input.email,
    destinationUrl: input.destinationUrl || null,
    logoObjectPath: null,
    status: "pending",
    stripeCheckoutSessionId: null,
    stripeCheckoutIdempotencyKey: idempotencyKey,
    checkoutAccessTokenHash,
    brandAssentAt: now,
    brandAssentIp: req.ip,
    brandTermsVersion: input.brandAssent.termsVersion,
    brandContentVersion: input.brandAssent.contentVersion,
    updatedAt: now,
  };
  const committed = await db.transaction(async (tx) => {
    const [liveCampaign] = await tx.select({
      id: campaignsTable.id,
      active: campaignsTable.active,
      lifecycleStatus: campaignsTable.lifecycleStatus,
      expiresAt: campaignsTable.expiresAt,
    }).from(campaignsTable).where(eq(campaignsTable.id, campaign.id)).limit(1);
    const [draft] = await tx.select().from(sponsorReservationDraftsTable)
      .where(eq(sponsorReservationDraftsTable.id, input.reservationDraftId)).limit(1);
    const [intent] = await tx.select().from(uploadIntentsTable)
      .where(eq(uploadIntentsTable.id, input.logoIntentId)).limit(1);
    const invalidReasons = [
      !liveCampaign || !liveCampaign.active ? "campaign_inactive" : null,
      liveCampaign?.lifecycleStatus !== "live" ? "campaign_not_live" : null,
      liveCampaign?.expiresAt && liveCampaign.expiresAt <= now ? "campaign_expired" : null,
      !draft ? "draft_missing" : null,
      draft && draft.status !== "issued" ? "draft_not_issued" : null,
      draft && draft.expiresAt <= now ? "draft_expired" : null,
      draft && !accessTokenMatches(draft.capabilityDigest, reservationCapability) ? "draft_capability" : null,
      !intent ? "intent_missing" : null,
      intent && intent.purpose !== "sponsor_reservation_draft_logo" ? "intent_purpose" : null,
      intent && intent.actorType !== "sponsor" ? "intent_actor_type" : null,
      intent && draft && intent.actorId !== draft.id ? "intent_actor" : null,
      intent && intent.resourceType !== "sponsor_reservation_draft" ? "intent_resource_type" : null,
      intent && draft && intent.resourceId !== draft.id ? "intent_resource" : null,
      intent && intent.campaignId !== campaign.id ? "intent_campaign" : null,
      intent && intent.spotIndex !== input.spotIndex ? "intent_spot" : null,
      intent && intent.status !== "finalized" ? "intent_not_finalized" : null,
      intent && intent.expiresAt <= now ? "intent_expired" : null,
      intent && !uploadCapabilityMatches(intent.capabilityDigest, reservationCapability) ? "intent_capability" : null,
    ].filter(Boolean);
    if (invalidReasons.length) {
        req.log.warn({ invalidReasons, campaignId: campaign.id, spotIndex: input.spotIndex }, "Reservation draft validation failed");
        throw new Error("invalid_reservation_draft");
    }
    const consumedIntent = await tx.update(uploadIntentsTable).set({
      status: "consumed", statusVersion: intent.statusVersion + 1, consumedAt: now,
    }).where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "finalized"),
      eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
    const consumedDraft = await tx.update(sponsorReservationDraftsTable).set({
      status: "consumed", statusVersion: draft.statusVersion + 1, consumedAt: now, updatedAt: now,
    }).where(and(eq(sponsorReservationDraftsTable.id, draft.id), eq(sponsorReservationDraftsTable.status, "issued"),
      eq(sponsorReservationDraftsTable.statusVersion, draft.statusVersion), gt(sponsorReservationDraftsTable.expiresAt, now))).returning();
    if (!consumedIntent.length || !consumedDraft.length) throw new Error("invalid_reservation_draft");
    const inserted = await tx.insert(placementOrdersTable).values({
      id: orderId, ...reservationValues, logoObjectPath: intent.objectPath,
    }).onConflictDoNothing().returning({ id: placementOrdersTable.id });
    if (!inserted.length) throw new Error("invalid_reservation_draft");
    return inserted[0];
  }).catch((error) => {
    if (error instanceof Error && error.message === "invalid_reservation_draft") return null;
    throw error;
  });
  if (!committed) {
    res.status(409).json({ error: "Reservation draft or logo intent is no longer valid" });
    return;
  }
  setAccessCookie(res, "checkout", orderId, checkoutAccessToken);
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0];
  const origin = `${forwardedProto ?? req.protocol}://${req.get("host")}`;
  const form = new URLSearchParams({
    mode: "setup",
    customer_creation: "always",
    "payment_method_types[0]": "card",
    "wallet_options[link][display]": "never",
    "metadata[reservationId]": orderId,
    "metadata[campaignId]": campaign.id,
    "metadata[spotIndex]": String(input.spotIndex),
    "metadata[draftId]": input.reservationDraftId,
    "metadata[brandName]": input.brandName,
    "metadata[email]": input.email,
    "metadata[destinationUrl]": input.destinationUrl || "",
    "metadata[logoObjectPath]": String((await db
      .select({ logoObjectPath: placementOrdersTable.logoObjectPath })
      .from(placementOrdersTable)
      .where(eq(placementOrdersTable.id, orderId))
      .limit(1))[0]?.logoObjectPath || ""),
    "metadata[termsVersion]": input.brandAssent.termsVersion,
    "metadata[contentVersion]": input.brandAssent.contentVersion,
    "setup_intent_data[metadata][reservationId]": orderId,
    "setup_intent_data[metadata][campaignId]": campaign.id,
    "setup_intent_data[metadata][spotIndex]": String(input.spotIndex),
    "setup_intent_data[metadata][draftId]": input.reservationDraftId,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&campaign=${encodeURIComponent(campaign.id)}&demo=${input.demo ? "1" : "0"}#item/${encodeURIComponent(campaign.id)}`,
    cancel_url: `${origin}/?checkout=cancelled&campaign=${encodeURIComponent(campaign.id)}&demo=${input.demo ? "1" : "0"}#item/${encodeURIComponent(campaign.id)}`,
  });
  const session = await stripeRequest<{ id: string; url: string | null }>(
    "/v1/checkout/sessions",
    { method: "POST", body: form, idempotencyKey },
  );
  if (!session.url) throw new Error("Stripe did not return a reservation URL");
  await db
    .update(placementOrdersTable)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(
      and(
        eq(placementOrdersTable.id, orderId),
        eq(placementOrdersTable.status, "pending"),
        eq(placementOrdersTable.stripeCheckoutIdempotencyKey, idempotencyKey),
      ),
    );
  res.status(201).json(
    CreatePlacementCheckoutResponse.parse({
      url: session.url,
      orderId,
      sessionId: session.id,
    }),
  );
});

router.get("/checkout/sessions/:sessionId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const params = GetPlacementCheckoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid reservation session" });
    return;
  }
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.stripeCheckoutSessionId, params.data.sessionId))
    .limit(1);
  const session = await stripeRequest<SetupSessionSnapshot>(
    `/v1/checkout/sessions/${encodeURIComponent(params.data.sessionId)}`,
  );
  const checkoutAccessToken = order
    ? readAccessToken(req, "checkout", order.id)
    : undefined;
  if (order && !accessTokenMatches(order.checkoutAccessTokenHash, checkoutAccessToken ?? "") && session.status !== "complete") {
    res.status(404).json({ error: "Reservation session not found" });
    return;
  }
  const reserved = await finalizeCheckoutSession(params.data.sessionId);
  res.json(
    GetPlacementCheckoutResponse.parse({
      id: reserved.id,
      campaignId: reserved.campaignId,
      spotIndex: reserved.spotIndex,
      amountCents: reserved.amountCents,
      brandName: reserved.brandName,
      email: reserved.email,
      destinationUrl: reserved.destinationUrl,
      logoObjectPath: reserved.logoObjectPath,
      status: reserved.status,
    }),
  );
});

router.post("/checkout/reservations/:orderId/confirmation-email", async (req, res): Promise<void> => {
  const orderId = String(req.params.orderId);
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.id, orderId))
    .limit(1);
  const token = readAccessToken(req, "checkout", orderId);
  if (!order || !accessTokenMatches(order.checkoutAccessTokenHash, token)) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (!["reserved", "funded"].includes(order.status)) {
    res.status(409).json({ error: "Reservation is not confirmed" });
    return;
  }
  try {
    const delivery = await sendReservationConfirmationForOrder(order.id);
    res.status(202).json(delivery);
  } catch (error) {
    req.log.error({ err: error, reservationId: order.id }, "Unable to deliver reservation confirmation");
    res.status(502).json({ sent: false, error: "Reservation confirmation email is unavailable" });
  }
});

router.post("/checkout/reservations/:orderId/update-card", async (req, res): Promise<void> => {
  const orderId = String(req.params.orderId);
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.id, orderId))
    .limit(1);
  const token = readAccessToken(req, "checkout", orderId);
  if (!order || !accessTokenMatches(order.checkoutAccessTokenHash, token)) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (
    order.status !== "payment_failed" ||
    !order.paymentFailureExpiresAt ||
    order.paymentFailureExpiresAt <= new Date()
  ) {
    res.status(409).json({ error: "This reservation does not need a card update." });
    return;
  }
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0];
  const origin = `${forwardedProto ?? req.protocol}://${req.get("host")}`;
  const idempotencyKey = `brandmyitem-reservation-${order.id}-card-update-${order.paymentAttempt}`;
  const form = new URLSearchParams({
    mode: "setup",
    customer: order.stripeCustomerId || "",
    "payment_method_types[0]": "card",
    "wallet_options[link][display]": "never",
    "metadata[reservationId]": order.id,
    "setup_intent_data[metadata][reservationId]": order.id,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#item/${encodeURIComponent(order.campaignId)}`,
    cancel_url: `${origin}/?checkout=cancelled#item/${encodeURIComponent(order.campaignId)}`,
  });
  const session = await stripeRequest<{ id: string; url: string | null }>(
    "/v1/checkout/sessions",
    { method: "POST", body: form, idempotencyKey },
  );
  if (!session.url) throw new Error("Stripe did not return a card update URL");
  await db
    .update(placementOrdersTable)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(placementOrdersTable.id, order.id));
  res.json({ url: session.url, orderId: order.id, sessionId: session.id });
});

router.post("/checkout/reservations/:orderId/cancel", async (req, res): Promise<void> => {
  const orderId = String(req.params.orderId);
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.id, orderId))
    .limit(1);
  const token = readAccessToken(req, "checkout", orderId);
  if (!order || !accessTokenMatches(order.checkoutAccessTokenHash, token)) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }
  if (["funded", "funding"].includes(order.status)) {
    res.status(409).json({ error: "Funded reservations cannot be cancelled here" });
    return;
  }
  await db
    .update(placementOrdersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(placementOrdersTable.id, orderId),
        inArray(placementOrdersTable.status, ["pending", "reserved", "payment_failed"]),
      ),
    );
  res.json({ id: orderId, status: "cancelled", message: "Reservation cancelled. You were never charged." });
});

router.post("/campaigns/:campaignId/relist", async (req, res): Promise<void> => {
  const campaignId = String(req.params.campaignId);
  const token = readAccessToken(req, "campaign", campaignId);
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  if (!campaign || !accessTokenMatches(campaign.ownerAccessTokenHash, token)) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const relisted = await relistCampaign(campaignId);
  if (!relisted) {
    res.status(409).json({ error: "This campaign is not eligible for its one relist." });
    return;
  }
  res.json({ campaignId, status: "live", relistDays: 30 });
});

export default router;
