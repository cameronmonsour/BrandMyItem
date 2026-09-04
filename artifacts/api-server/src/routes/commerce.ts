import { randomUUID } from "node:crypto";
import { campaignsTable, db, placementOrdersTable } from "@workspace/db";
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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { stripeRequest } from "../stripeClient";
import {
  accessTokenHashesForScope,
  accessTokenMatches,
  createAccessToken,
  hashAccessToken,
  readAccessToken,
  setAccessCookie,
} from "../lib/accessControl";
import {
  checkoutIdempotencyKey,
} from "../paymentTransitions";
import { verifyImageObject } from "../lib/objectStorage";
import {
  attemptCampaignFunding,
  relistCampaign,
} from "../paymentFunding";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation";

const router: IRouter = Router();
const TRACKING_LINK_TTL_MS = 15 * 60 * 1000;
const trackingMagicLinks = new Map<
  string,
  { email: string; expiresAt: number; used: boolean }
>();

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
  const ids = campaigns.map((campaign) => campaign.id);
  const orders = ids.length
    ? await db
        .select()
        .from(placementOrdersTable)
        .where(
          and(
            inArray(placementOrdersTable.campaignId, ids),
            inArray(placementOrdersTable.status, ["reserved", "funding", "payment_failed", "funded"]),
          ),
        )
    : [];
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
        w9Required: input.pricesCents.reduce((sum, cents) => sum + cents, 0) >= 200000,
        w9Status:
          input.pricesCents.reduce((sum, cents) => sum + cents, 0) >= 200000
            ? "required"
            : "not_required",
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
    .where(eq(campaignsTable.active, true))
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
  for (const [hash, link] of trackingMagicLinks) {
    if (link.used || link.expiresAt <= Date.now()) trackingMagicLinks.delete(hash);
  }
  const token = createAccessToken();
  trackingMagicLinks.set(hashAccessToken(token), {
    email,
    expiresAt: Date.now() + TRACKING_LINK_TTL_MS,
    used: false,
  });
  // Email delivery belongs behind this boundary. Never return tracking data
  // or reveal whether the address is present in the marketplace.
  res.status(202).json({
    message:
      "If that email is linked to an item, a one-time tracking link is on its way.",
  });
});

router.get("/tracking", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const magicLink = token
    ? trackingMagicLinks.get(hashAccessToken(token))
    : undefined;
  if (magicLink && (magicLink.used || magicLink.expiresAt <= Date.now())) {
    trackingMagicLinks.delete(hashAccessToken(token));
    res.status(401).json({ error: "Tracking link is invalid or expired" });
    return;
  }
  if (magicLink) {
    magicLink.used = true;
    trackingMagicLinks.delete(hashAccessToken(token));
  }
  const parsed = GetTrackingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid or expired tracking link" });
    return;
  }

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
            sql`lower(${campaignsTable.ownerEmail}) = ${email}`,
            magicLink
              ? sql`true`
              : inArray(campaignsTable.ownerAccessTokenHash, ownerAccessHashes),
          ),
        )
        .orderBy(desc(campaignsTable.createdAt))
    : [];
  const brandOrders = magicLink || checkoutAccessHashes.length
    ? await db
        .select()
        .from(placementOrdersTable)
        .where(
          and(
            sql`lower(${placementOrdersTable.email}) = ${email}`,
            magicLink
              ? sql`true`
              : inArray(
                  placementOrdersTable.checkoutAccessTokenHash,
                  checkoutAccessHashes,
                ),
          ),
        )
        .orderBy(desc(placementOrdersTable.createdAt))
    : [];

  const ownerCampaignIds = ownerCampaigns.map((campaign) => campaign.id);
  const ownerOrders = ownerCampaignIds.length
    ? await db
        .select()
        .from(placementOrdersTable)
        .where(inArray(placementOrdersTable.campaignId, ownerCampaignIds))
        .orderBy(desc(placementOrdersTable.createdAt))
    : [];
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
        .where(inArray(campaignsTable.id, campaignIds))
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
};

type SetupIntentSnapshot = {
  id: string;
  status: string;
  customer?: string | null;
  payment_method?: string | null;
};

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

router.post("/checkout/sessions", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = CreatePlacementCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reservation details" });
    return;
  }
  const input = parsed.data;
  if (!(await verifyImageObject(input.logoObjectPath))) {
    res.status(400).json({ error: "Sponsor logo upload is missing or invalid" });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, input.campaignId), eq(campaignsTable.active, true)))
    .limit(1);
  if (!campaign || campaign.lifecycleStatus === "expired") {
    res.status(404).json({ error: "Campaign is not available" });
    return;
  }
  const amountCents = campaign.pricesCents[input.spotIndex];
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    res.status(400).json({ error: "Placement is not available" });
    return;
  }
  const [existing] = await db
    .select()
    .from(placementOrdersTable)
    .where(
      and(
        eq(placementOrdersTable.campaignId, campaign.id),
        eq(placementOrdersTable.spotIndex, input.spotIndex),
      ),
    )
    .limit(1);
  if (
    existing &&
    ["reserved", "funding", "funded", "payment_failed"].includes(existing.status)
  ) {
    res.status(409).json({ error: "Placement is already reserved" });
    return;
  }
  const orderId = existing?.id ?? randomUUID();
  const checkoutAccessToken = createAccessToken();
  const checkoutAccessTokenHash = hashAccessToken(checkoutAccessToken);
  const idempotencyKey = checkoutIdempotencyKey(orderId);
  setAccessCookie(res, "checkout", orderId, checkoutAccessToken);
  const reservationValues = {
    campaignId: campaign.id,
    spotIndex: input.spotIndex,
    amountCents,
    brandName: input.brandName,
    email: input.email,
    destinationUrl: input.destinationUrl || null,
    logoObjectPath: input.logoObjectPath || null,
    status: "pending",
    stripeCheckoutSessionId: null,
    stripeCheckoutIdempotencyKey: idempotencyKey,
    checkoutAccessTokenHash,
    brandAssentAt: new Date(),
    brandAssentIp: req.ip,
    brandTermsVersion: input.brandAssent.termsVersion,
    brandContentVersion: input.brandAssent.contentVersion,
    updatedAt: new Date(),
  };
  if (existing) {
    const claimed = await db
      .update(placementOrdersTable)
      .set(reservationValues)
      .where(
        and(
          eq(placementOrdersTable.id, orderId),
          inArray(placementOrdersTable.status, ["cancelled", "released", "expired"]),
        ),
      )
      .returning({ id: placementOrdersTable.id });
    if (!claimed.length) {
      res.status(409).json({ error: "Placement is already reserved" });
      return;
    }
  } else {
    const inserted = await db
      .insert(placementOrdersTable)
      .values({ id: orderId, ...reservationValues })
      .onConflictDoNothing()
      .returning({ id: placementOrdersTable.id });
    if (!inserted.length) {
      res.status(409).json({ error: "Placement is already reserved" });
      return;
    }
  }
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0];
  const origin = `${forwardedProto ?? req.protocol}://${req.get("host")}`;
  const form = new URLSearchParams({
    mode: "setup",
    customer_creation: "always",
    "payment_method_types[0]": "card",
    "metadata[reservationId]": orderId,
    "metadata[campaignId]": campaign.id,
    "metadata[spotIndex]": String(input.spotIndex),
    "setup_intent_data[metadata][reservationId]": orderId,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#item/${encodeURIComponent(campaign.id)}`,
    cancel_url: `${origin}/?checkout=cancelled#item/${encodeURIComponent(campaign.id)}`,
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
  if (!order) {
    res.status(404).json({ error: "Reservation session not found" });
    return;
  }
  const checkoutAccessToken = readAccessToken(req, "checkout", order.id);
  if (!accessTokenMatches(order.checkoutAccessTokenHash, checkoutAccessToken)) {
    res.status(404).json({ error: "Reservation session not found" });
    return;
  }
  const session = await stripeRequest<SetupSessionSnapshot>(
    `/v1/checkout/sessions/${encodeURIComponent(params.data.sessionId)}`,
  );
  const reserved = await reserveFromSetupSession(order, session);
  res.json(
    GetPlacementCheckoutResponse.parse({
      id: reserved.id,
      campaignId: reserved.campaignId,
      spotIndex: reserved.spotIndex,
      amountCents: reserved.amountCents,
      status: reserved.status,
    }),
  );
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
