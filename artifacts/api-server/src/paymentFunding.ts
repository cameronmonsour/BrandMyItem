import { campaignsTable, db, placementOrdersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./lib/logger.ts";
import { stripeRequest } from "./stripeClient.ts";
import {
  fundingChargeIdempotencyKey,
  paymentFailureExpiresAt,
  paymentRetryAt,
} from "./paymentTransitions.ts";

const FUNDING_STATUSES = ["reserved", "funding", "payment_failed"] as const;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type PaymentIntentSnapshot = {
  id: string;
  status: string;
  last_payment_error?: { message?: string; code?: string } | null;
};

function chargeableOrders(
  orders: Array<typeof placementOrdersTable.$inferSelect>,
  now: Date,
) {
  return orders.filter((order) => {
    if (order.status === "reserved" || order.status === "funding") return true;
    return (
      order.status === "payment_failed" &&
      !!order.paymentFailureExpiresAt &&
      order.paymentFailureExpiresAt > now &&
      !!order.paymentRetryAt &&
      order.paymentRetryAt <= now
    );
  });
}

export async function attemptCampaignFunding(
  campaignId: string,
  now = new Date(),
): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  if (!campaign || campaign.lifecycleStatus === "expired") return;

  const orders = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.campaignId, campaignId));
  const reserved = orders.filter((order) =>
    FUNDING_STATUSES.includes(order.status as (typeof FUNDING_STATUSES)[number]),
  );
  if (reserved.length < campaign.pricesCents.length) return;

  await db
    .update(campaignsTable)
    .set({ lifecycleStatus: "funding", updatedAt: now })
    .where(
      and(
        eq(campaignsTable.id, campaignId),
        eq(campaignsTable.lifecycleStatus, "live"),
      ),
    );

  for (const order of chargeableOrders(reserved, now)) {
    if (!order.stripeCustomerId || !order.stripePaymentMethodId) {
      await markPaymentFailure(order, "Saved payment method is unavailable", now);
      continue;
    }
    const attempt = order.paymentAttempt ?? 0;
    try {
      await db
        .update(placementOrdersTable)
        .set({ status: "funding", updatedAt: now })
        .where(
          and(
            eq(placementOrdersTable.id, order.id),
            inArray(placementOrdersTable.status, ["reserved", "payment_failed"]),
          ),
        );
      const paymentIntent = await stripeRequest<PaymentIntentSnapshot>(
        "/v1/payment_intents",
        {
          method: "POST",
          body: new URLSearchParams({
            amount: String(order.amountCents),
            currency: order.currency,
            customer: order.stripeCustomerId,
            payment_method: order.stripePaymentMethodId,
            confirm: "true",
            off_session: "true",
            "metadata[reservationId]": order.id,
            "metadata[campaignId]": order.campaignId,
            "metadata[spotIndex]": String(order.spotIndex),
          }),
          idempotencyKey: fundingChargeIdempotencyKey(order.id, attempt),
        },
      );
      if (paymentIntent.status !== "succeeded") {
        await markPaymentFailure(
          order,
          paymentIntent.last_payment_error?.message ||
            `Payment requires attention (${paymentIntent.status})`,
          now,
          paymentIntent.id,
        );
        continue;
      }
      await db
        .update(placementOrdersTable)
        .set({
          status: "funded",
          stripePaymentIntentId: paymentIntent.id,
          chargedAt: now,
          paymentFailureAt: null,
          paymentFailureExpiresAt: null,
          paymentRetryAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(placementOrdersTable.id, order.id),
            inArray(placementOrdersTable.status, ["reserved", "funding", "payment_failed"]),
          ),
        );
    } catch (error) {
      await markPaymentFailure(
        order,
        error instanceof Error ? error.message : "Payment was declined",
        now,
      );
      logger.warn({ err: error, reservationId: order.id }, "Funding payment failed");
    }
  }

  const finalOrders = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.campaignId, campaignId));
  if (
    finalOrders.length >= campaign.pricesCents.length &&
    finalOrders.every((order) => order.status === "funded")
  ) {
    await db
      .update(campaignsTable)
      .set({
        lifecycleStatus: "funded",
        fundedAt: now,
        updatedAt: now,
      })
      .where(eq(campaignsTable.id, campaignId));
  }
}

async function markPaymentFailure(
  order: typeof placementOrdersTable.$inferSelect,
  reason: string,
  now: Date,
  paymentIntentId?: string,
) {
  await db
    .update(placementOrdersTable)
    .set({
      status: "payment_failed",
      stripePaymentIntentId: paymentIntentId ?? order.stripePaymentIntentId,
      declineReason: reason.slice(0, 500),
      paymentFailureAt: now,
      paymentFailureExpiresAt: paymentFailureExpiresAt(now),
      paymentRetryAt: paymentRetryAt(now),
      paymentAttempt: (order.paymentAttempt ?? 0) + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(placementOrdersTable.id, order.id),
        inArray(placementOrdersTable.status, ["reserved", "funding", "payment_failed"]),
      ),
    );
}

export async function reconcileReservationPayments(now = new Date()): Promise<void> {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(inArray(campaignsTable.lifecycleStatus, ["live", "funding"]));
  for (const campaign of campaigns) {
    const orders = await db
      .select()
      .from(placementOrdersTable)
      .where(eq(placementOrdersTable.campaignId, campaign.id));
    const shouldRetry = orders.some(
      (order) =>
        order.status === "payment_failed" &&
        !!order.paymentRetryAt &&
        order.paymentRetryAt <= now &&
        !!order.paymentFailureExpiresAt &&
        order.paymentFailureExpiresAt > now,
    );
    const allReserved = orders.filter(
      (order) =>
        order.status === "reserved" ||
        order.status === "funding" ||
        order.status === "payment_failed",
    ).length >= campaign.pricesCents.length;
    if (shouldRetry || allReserved) await attemptCampaignFunding(campaign.id, now);
  }
}

export async function expireUnfundedCampaigns(now = new Date()): Promise<void> {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(inArray(campaignsTable.lifecycleStatus, ["live", "funding"]));
  for (const campaign of campaigns) {
    const expiresAt =
      campaign.expiresAt ??
      new Date(campaign.createdAt.getTime() + SIXTY_DAYS_MS);
    if (expiresAt > now) continue;
    const orders = await db
      .select()
      .from(placementOrdersTable)
      .where(eq(placementOrdersTable.campaignId, campaign.id));
    const fundedCount = orders.filter((order) => order.status === "funded").length;
    if (fundedCount === campaign.pricesCents.length) continue;
    const reservedCount = orders.filter(
      (order) => order.status === "reserved" || order.status === "payment_failed",
    ).length;
    const relistEligible = reservedCount >= Math.ceil(campaign.pricesCents.length / 2);
    await db
      .update(campaignsTable)
      .set({
        active: false,
        lifecycleStatus: "expired",
        expiredAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(campaignsTable.id, campaign.id),
          inArray(campaignsTable.lifecycleStatus, ["live", "funding"]),
        ),
      );
    if (!relistEligible) {
      await db
        .update(placementOrdersTable)
        .set({ status: "released", updatedAt: now })
        .where(
          and(
            eq(placementOrdersTable.campaignId, campaign.id),
            inArray(placementOrdersTable.status, [
              "reserved",
              "funding",
              "payment_failed",
            ]),
          ),
        );
    }
  }
}

export async function relistCampaign(
  campaignId: string,
  now = new Date(),
): Promise<boolean> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  if (!campaign || campaign.relistCount >= 1) return false;
  const orders = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.campaignId, campaignId));
  const reservedCount = orders.filter(
    (order) =>
      order.status === "reserved" ||
      order.status === "funding" ||
      order.status === "payment_failed",
  ).length;
  if (reservedCount < Math.ceil(campaign.pricesCents.length / 2)) return false;
  await db
    .update(campaignsTable)
    .set({
      active: true,
      lifecycleStatus: "live",
      relistCount: campaign.relistCount + 1,
      relistedAt: now,
      relistExpiresAt: new Date(now.getTime() + THIRTY_DAYS_MS),
      expiresAt: new Date(now.getTime() + THIRTY_DAYS_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(campaignsTable.id, campaignId),
        eq(campaignsTable.lifecycleStatus, "expired"),
      ),
    );
  return true;
}