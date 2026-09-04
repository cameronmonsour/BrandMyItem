import { campaignsTable, db, placementOrdersTable } from "@workspace/db";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { logger } from "./lib/logger";
import {
  checkoutTransition,
  isRefundRetryable,
  isRefundSucceeded,
  refundIdempotencyKey,
  shouldRefundCampaign,
  type CheckoutSnapshot,
} from "./paymentTransitions";
import { stripeRequest } from "./stripeClient";

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export async function reconcilePayments(now = new Date()): Promise<void> {
  const pendingOrders = await db
    .select()
    .from(placementOrdersTable)
    .where(
      and(
        eq(placementOrdersTable.status, "pending"),
        isNotNull(placementOrdersTable.stripeCheckoutSessionId),
      ),
    );

  for (const order of pendingOrders) {
    const sessionId = order.stripeCheckoutSessionId;
    if (!sessionId) continue;
    try {
      const session = await stripeRequest<CheckoutSnapshot>(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      );
      const transition = checkoutTransition(order.status, session);
      if (!transition) continue;
      await db
        .update(placementOrdersTable)
        .set({
          status: transition.status,
          stripePaymentIntentId:
            transition.status === "paid"
              ? transition.paymentIntentId
              : order.stripePaymentIntentId,
          updatedAt: now,
        })
        .where(
          and(
            eq(placementOrdersTable.id, order.id),
            eq(placementOrdersTable.status, "pending"),
          ),
        );
    } catch (err) {
      logger.error(
        { err, orderId: order.id },
        "Checkout reconciliation failed",
      );
    }
  }

  const cutoff = new Date(now.getTime() - SIXTY_DAYS_MS);
  const oldCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.active, true),
        lte(campaignsTable.createdAt, cutoff),
      ),
    );
  const orders = await db.select().from(placementOrdersTable);

  for (const campaign of oldCampaigns) {
    const campaignOrders = orders.filter(
      (order) => order.campaignId === campaign.id,
    );
    const refundableOrders = campaignOrders.filter(
      (order) => order.status === "paid" || order.status === "refunding",
    );
    if (
      !shouldRefundCampaign(
        campaign.pricesCents.length,
        refundableOrders.length,
      )
    ) {
      continue;
    }

    let allRefunded = true;
    for (const order of refundableOrders) {
      if (!order.stripePaymentIntentId) {
        allRefunded = false;
        logger.error(
          { orderId: order.id },
          "Cannot refund paid order without a Stripe payment intent",
        );
        continue;
      }
      try {
        if (order.status === "paid") {
          const claimed = await db
            .update(placementOrdersTable)
            .set({ status: "refunding", updatedAt: now })
            .where(
              and(
                eq(placementOrdersTable.id, order.id),
                eq(placementOrdersTable.status, "paid"),
              ),
            )
            .returning({ id: placementOrdersTable.id });
          if (claimed.length === 0) {
            allRefunded = false;
            continue;
          }
        }

        let previousFailedRefundId: string | null = null;
        if (order.stripeRefundId) {
          const existingRefund = await stripeRequest<{
            id: string;
            status: string;
          }>(`/v1/refunds/${encodeURIComponent(order.stripeRefundId)}`);
          await db
            .update(placementOrdersTable)
            .set({
              stripeRefundStatus: existingRefund.status,
              updatedAt: now,
            })
            .where(eq(placementOrdersTable.id, order.id));
          if (isRefundSucceeded(existingRefund.status)) {
            await db
              .update(placementOrdersTable)
              .set({ status: "refunded", updatedAt: now })
              .where(
                and(
                  eq(placementOrdersTable.id, order.id),
                  eq(placementOrdersTable.status, "refunding"),
                ),
              );
            continue;
          }
          if (!isRefundRetryable(existingRefund.status)) {
            allRefunded = false;
            continue;
          }
          previousFailedRefundId = existingRefund.id;
        }

        const refund = await stripeRequest<{ id: string; status: string }>(
          "/v1/refunds",
          {
            method: "POST",
            body: new URLSearchParams({
              payment_intent: order.stripePaymentIntentId,
              reason: "requested_by_customer",
              "metadata[orderId]": order.id,
              "metadata[campaignId]": campaign.id,
            }),
            idempotencyKey: refundIdempotencyKey(
              order.id,
              previousFailedRefundId,
            ),
          },
        );
        await db
          .update(placementOrdersTable)
          .set({
            status: isRefundSucceeded(refund.status) ? "refunded" : "refunding",
            stripeRefundId: refund.id,
            stripeRefundStatus: refund.status,
            updatedAt: now,
          })
          .where(
            and(
              eq(placementOrdersTable.id, order.id),
              eq(placementOrdersTable.status, "refunding"),
            ),
          );
        if (!isRefundSucceeded(refund.status)) allRefunded = false;
      } catch (err) {
        allRefunded = false;
        logger.error({ err, orderId: order.id }, "Order refund failed");
      }
    }

    if (allRefunded) {
      await db
        .update(campaignsTable)
        .set({ active: false, updatedAt: now })
        .where(
          and(
            eq(campaignsTable.id, campaign.id),
            eq(campaignsTable.active, true),
          ),
        );
    }
  }
}

export function startPaymentReconciliation(): () => void {
  const configured = Number(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(configured) && configured >= 10_000
      ? configured
      : DEFAULT_INTERVAL_MS;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcilePayments();
    } catch (err) {
      logger.error({ err }, "Payment reconciliation cycle failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
