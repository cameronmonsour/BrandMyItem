import { randomUUID } from "node:crypto";
import {
  campaignsTable,
  db,
  placementOrdersTable,
} from "@workspace/db";
import {
  CreatePlacementCheckoutBody,
  CreatePlacementCheckoutResponse,
  GetPlacementCheckoutParams,
  GetPlacementCheckoutResponse,
  ListCampaignsResponse,
  RegisterCampaignBody,
  RegisterCampaignResponse,
} from "@workspace/api-zod";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { stripeRequest } from "../stripeClient";

const router: IRouter = Router();

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = RegisterCampaignBody.safeParse(req.body);
  if (!parsed.success || parsed.data.id.startsWith("demo")) {
    res.status(400).json({ error: "Invalid campaign" });
    return;
  }
  const input = parsed.data;
  const [campaign] = await db
    .insert(campaignsTable)
    .values(input)
    .onConflictDoUpdate({
      target: campaignsTable.id,
      set: {
        itemType: input.itemType,
        title: input.title,
        ownerName: input.ownerName,
        pricesCents: input.pricesCents,
        active: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(
    RegisterCampaignResponse.parse({
      ...campaign,
      createdAt: campaign.createdAt,
    }),
  );
});

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.active, true))
    .orderBy(desc(campaignsTable.createdAt));
  res.json(ListCampaignsResponse.parse(campaigns));
});

router.post("/checkout/sessions", async (req, res): Promise<void> => {
  const parsed = CreatePlacementCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid checkout details" });
    return;
  }
  const input = parsed.data;
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
  if (existing?.status === "paid" || existing?.status === "refunded") {
    res.status(409).json({ error: "Placement has already been purchased" });
    return;
  }

  const orderId = existing?.id ?? randomUUID();
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0];
  const origin = `${forwardedProto ?? req.protocol}://${req.get("host")}`;
  const form = new URLSearchParams({
    mode: "payment",
    customer_email: input.email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]":
      `${campaign.title} — Placement ${input.spotIndex + 1}`,
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
    { method: "POST", body: form },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  const values = {
    campaignId: campaign.id,
    spotIndex: input.spotIndex,
    amountCents,
    brandName: input.brandName,
    email: input.email,
    destinationUrl: input.destinationUrl || null,
    status: "pending",
    stripeCheckoutSessionId: session.id,
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(placementOrdersTable)
      .set(values)
      .where(eq(placementOrdersTable.id, orderId));
  } else {
    await db.insert(placementOrdersTable).values({ id: orderId, ...values });
  }

  res.status(201).json(
    CreatePlacementCheckoutResponse.parse({
      url: session.url,
      orderId,
      sessionId: session.id,
    }),
  );
});

router.get("/checkout/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetPlacementCheckoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid checkout session" });
    return;
  }
  const session = await stripeRequest<{
    payment_status: string;
    payment_intent: string | null;
  }>(`/v1/checkout/sessions/${encodeURIComponent(params.data.sessionId)}`);
  const [order] = await db
    .select()
    .from(placementOrdersTable)
    .where(
      eq(
        placementOrdersTable.stripeCheckoutSessionId,
        params.data.sessionId,
      ),
    )
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "Checkout session not found" });
    return;
  }
  if (session.payment_status === "paid" && order.status !== "paid") {
    order.status = "paid";
    order.stripePaymentIntentId = session.payment_intent;
    await db
      .update(placementOrdersTable)
      .set({
        status: "paid",
        stripePaymentIntentId: order.stripePaymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(placementOrdersTable.id, order.id));
  }
  res.json(GetPlacementCheckoutResponse.parse(order));
});

export default router;
