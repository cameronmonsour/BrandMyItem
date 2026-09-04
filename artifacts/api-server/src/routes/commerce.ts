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
  checkoutTransition,
  isMissingCheckoutSessionError,
  type CheckoutSnapshot,
} from "../paymentTransitions";
import { verifyImageObject } from "../lib/objectStorage";

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
    purchasedAt: order.updatedAt,
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
            eq(placementOrdersTable.status, "paid"),
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
    return { ...publicCampaign, claims };
  });
}

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = RegisterCampaignBody.safeParse(req.body);
  if (!parsed.success || parsed.data.id.startsWith("demo")) {
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

router.post("/checkout/sessions", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = CreatePlacementCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid checkout details" });
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
    .where(
      and(
        eq(campaignsTable.id, input.campaignId),
        eq(campaignsTable.active, true),
      ),
    )
    .limit(1);
  if (!campaign) {
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
  if (["paid", "refunding", "refunded"].includes(existing?.status ?? "")) {
    res.status(409).json({ error: "Placement has already been purchased" });
    return;
  }

  const orderId = existing?.id ?? randomUUID();
  let checkoutAccessTokenHash: string;
  if (existing?.status === "pending") {
    const checkoutAccessToken = readAccessToken(req, "checkout", existing.id);
    if (
      !accessTokenMatches(
        existing.checkoutAccessTokenHash,
        checkoutAccessToken,
      ) ||
      existing.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
    ) {
      res.status(409).json({ error: "Checkout is already in progress" });
      return;
    }
    checkoutAccessTokenHash = existing.checkoutAccessTokenHash as string;
    setAccessCookie(res, "checkout", existing.id, checkoutAccessToken as string);
  } else {
    const checkoutAccessToken = createAccessToken();
    checkoutAccessTokenHash = hashAccessToken(checkoutAccessToken);
    setAccessCookie(res, "checkout", orderId, checkoutAccessToken);
  }
  let previousExpiredSessionId =
    existing?.status === "expired"
      ? existing.stripeCheckoutSessionId
      : null;
  if (existing?.status === "pending" && existing.stripeCheckoutSessionId) {
    let previousSession:
      | (CheckoutSnapshot & { id: string; url: string | null })
      | null = null;
    try {
      previousSession = await stripeRequest<
        CheckoutSnapshot & { id: string; url: string | null }
      >(
        `/v1/checkout/sessions/${encodeURIComponent(existing.stripeCheckoutSessionId)}`,
      );
    } catch (error) {
      if (!isMissingCheckoutSessionError(error)) throw error;
      previousExpiredSessionId = existing.stripeCheckoutSessionId;
    }
    if (previousSession) {
      const transition = checkoutTransition(existing.status, previousSession);
      if (transition?.status === "paid") {
        await db
          .update(placementOrdersTable)
          .set({
            status: "paid",
            stripePaymentIntentId: transition.paymentIntentId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(placementOrdersTable.id, existing.id),
              eq(placementOrdersTable.status, "pending"),
            ),
          );
        res.status(409).json({ error: "Placement has already been purchased" });
        return;
      }
      if (transition?.status !== "expired") {
        if (previousSession.url) {
          res.status(200).json(
            CreatePlacementCheckoutResponse.parse({
              url: previousSession.url,
              orderId,
              sessionId: previousSession.id,
            }),
          );
        } else {
          res.status(409).json({
            error: "Checkout payment is still processing",
            orderId,
            sessionId: previousSession.id,
          });
        }
        return;
      }
    }
  }

  const idempotencyKey =
    existing?.status === "pending" && !existing.stripeCheckoutSessionId
      ? existing.stripeCheckoutIdempotencyKey
      : checkoutIdempotencyKey(orderId, previousExpiredSessionId);
  if (!idempotencyKey) {
    throw new Error("Pending checkout is missing its idempotency key");
  }
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
    if (existing.status !== "pending" || existing.stripeCheckoutSessionId) {
      const claimed = await db
        .update(placementOrdersTable)
        .set(reservationValues)
        .where(
          and(
            eq(placementOrdersTable.id, orderId),
            eq(placementOrdersTable.status, existing.status),
          ),
        )
        .returning({ id: placementOrdersTable.id });
      if (claimed.length === 0) {
        res.status(409).json({ error: "Checkout is already in progress" });
        return;
      }
    }
  } else {
    const inserted = await db
      .insert(placementOrdersTable)
      .values({ id: orderId, ...reservationValues })
      .onConflictDoNothing()
      .returning({ id: placementOrdersTable.id });
    if (inserted.length === 0) {
      res.status(409).json({ error: "Checkout is already in progress" });
      return;
    }
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0];
  const origin = `${forwardedProto ?? req.protocol}://${req.get("host")}`;
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: input.email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `${campaign.title} — Placement ${input.spotIndex + 1}`,
    "line_items[0][price_data][product_data][description]":
      "BrandMyItem sponsored placement service",
    "metadata[orderId]": orderId,
    "metadata[campaignId]": campaign.id,
    "metadata[spotIndex]": String(input.spotIndex),
    "payment_intent_data[metadata][orderId]": orderId,
    "payment_intent_data[metadata][campaignId]": campaign.id,
    "payment_intent_data[metadata][spotIndex]": String(input.spotIndex),
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#item/${encodeURIComponent(campaign.id)}`,
    cancel_url: `${origin}/?checkout=cancelled#item/${encodeURIComponent(campaign.id)}`,
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
  });
  const session = await stripeRequest<{ id: string; url: string | null }>(
    "/v1/checkout/sessions",
    { method: "POST", body: form, idempotencyKey },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

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
    res.status(400).json({ error: "Invalid checkout session" });
    return;
  }
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(
      eq(placementOrdersTable.stripeCheckoutSessionId, params.data.sessionId),
    )
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "Checkout session not found" });
    return;
  }
  const checkoutAccessToken = readAccessToken(req, "checkout", order.id);
  if (!accessTokenMatches(order.checkoutAccessTokenHash, checkoutAccessToken)) {
    res.status(404).json({ error: "Checkout session not found" });
    return;
  }
  const session = await stripeRequest<CheckoutSnapshot>(
    `/v1/checkout/sessions/${encodeURIComponent(params.data.sessionId)}`,
  );
  const transition = checkoutTransition(order.status, session);
  if (transition) {
    order.status = transition.status;
    if (transition.status === "paid") {
      order.stripePaymentIntentId = transition.paymentIntentId;
    }
    await db
      .update(placementOrdersTable)
      .set({
        status: transition.status,
        stripePaymentIntentId: order.stripePaymentIntentId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(placementOrdersTable.id, order.id),
          eq(placementOrdersTable.status, "pending"),
        ),
      );
  }
  res.json(
    GetPlacementCheckoutResponse.parse({
      id: order.id,
      campaignId: order.campaignId,
      spotIndex: order.spotIndex,
      amountCents: order.amountCents,
      status: order.status,
    }),
  );
});

export default router;
