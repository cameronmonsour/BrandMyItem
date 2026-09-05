import { campaignsTable, db, placementOrdersTable, updateCardCapabilitiesTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { logger } from "./lib/logger.ts";
import { stripeRequest } from "./stripeClient.ts";
import { sendTransactionalEmail } from "./emailDelivery.ts";
import { createAccessToken, hashAccessToken } from "./lib/accessControl.ts";
import {
  campaignItemDisplayName,
  fundingConfirmationEmail,
  ownerCampaignFundedEmail,
  ownerCampaignReopenedEmail,
  paymentDeclinedEmail,
  paymentReopenedEmail,
} from "./emailTemplates.ts";
import {
  fundingChargeIdempotencyKey,
  paymentFailureExpiresAt,
  paymentRetryAt,
} from "./paymentTransitions.ts";

const FUNDING_STATUSES = ["reserved", "funding", "payment_failed"] as const;
const ACTIVE_FUNDING_STATUSES = ["reserved", "funding", "payment_failed", "funded"] as const;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function publicAppUrl(): string {
  const configured = process.env.BRANDMYITEM_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const domain = process.env.REPLIT_DEV_DOMAIN?.trim();
  return domain ? `https://${domain}` : "https://brandmyitem.com";
}

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
  const activeOrders = orders.filter((order) =>
    ACTIVE_FUNDING_STATUSES.includes(order.status as (typeof ACTIVE_FUNDING_STATUSES)[number]),
  );
  if (activeOrders.length < campaign.pricesCents.length) return;

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
          // Standard sticker artwork is automatically approved when funding
          // completes. Later proof revisions replace this state explicitly.
          proofStatus: "approved",
          proofApprovedAt: now,
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
  const finalActiveOrders = finalOrders.filter((order) =>
    ACTIVE_FUNDING_STATUSES.includes(order.status as (typeof ACTIVE_FUNDING_STATUSES)[number]),
  );
  if (
    finalActiveOrders.length >= campaign.pricesCents.length &&
    finalActiveOrders.every((order) => order.status === "funded")
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
  await sendFundingLifecycleEmails(campaignId, now);
}

export async function sendFundingLifecycleEmails(
  campaignId: string,
  now = new Date(),
): Promise<void> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  if (!campaign) return;
  const orders = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.campaignId, campaignId));
  const itemDisplayName = campaignItemDisplayName(campaign);

  const activeOrders = orders.filter((order) =>
    ACTIVE_FUNDING_STATUSES.includes(order.status as (typeof ACTIVE_FUNDING_STATUSES)[number]),
  );
  const listingFunded =
    campaign.lifecycleStatus === "funded" &&
    activeOrders.length >= campaign.pricesCents.length &&
    activeOrders.every((order) => order.status === "funded");
  for (const order of orders) {
    if (
      order.status === "funded" &&
      (!order.fundingEmailSentAt ||
        (listingFunded && order.fundingEmailState !== "funded"))
    ) {
      try {
        const delivery = await sendTransactionalEmail(fundingConfirmationEmail({
          email: order.email,
          reservationId: `BMI-${order.id.toUpperCase().slice(0, 6)}`,
          itemDisplayName,
          amountCents: order.amountCents,
          listingFunded,
        }));
        await db.update(placementOrdersTable).set({
          fundingEmailSentAt: now,
          fundingEmailMessageId: delivery.messageId ?? null,
          fundingEmailState: listingFunded ? "funded" : "partial",
          updatedAt: now,
        }).where(and(
          eq(placementOrdersTable.id, order.id),
          listingFunded
            ? eq(placementOrdersTable.fundingEmailState, "partial")
            : isNull(placementOrdersTable.fundingEmailSentAt),
        ));
      } catch (error) {
        logger.warn({ err: error, reservationId: order.id }, "Funded reservation email delivery failed");
      }
    }
    if (order.status === "payment_failed" && !order.paymentDeclineEmailSentAt) {
      try {
        const capability = createAccessToken();
        await db.insert(updateCardCapabilitiesTable).values({
          tokenHash: hashAccessToken(capability),
          placementOrderId: order.id,
          expiresAt: order.paymentFailureExpiresAt ?? new Date(now.getTime() + 48 * 60 * 60 * 1000),
        });
        const delivery = await sendTransactionalEmail(paymentDeclinedEmail({
          email: order.email,
          reservationId: `BMI-${order.id.toUpperCase().slice(0, 6)}`,
          updateCardUrl: `${publicAppUrl()}/?update_card=${encodeURIComponent(`BMI-${order.id.toUpperCase().slice(0, 6)}`)}&token=${encodeURIComponent(capability)}`,
        }));
        await db.update(placementOrdersTable).set({
          paymentDeclineEmailSentAt: now,
          paymentDeclineEmailMessageId: delivery.messageId ?? null,
          updatedAt: now,
        }).where(and(
          eq(placementOrdersTable.id, order.id),
          isNull(placementOrdersTable.paymentDeclineEmailSentAt),
        ));
      } catch (error) {
        logger.warn({ err: error, reservationId: order.id }, "Payment decline email delivery failed");
      }
    }
    if (order.status === "reserved" && order.paymentReopenedEmailSentAt && !order.paymentReopenedEmailMessageId) {
      // A provider response may have committed the timestamp before its message id.
      // The next pass retries the same durable notification.
    }
  }

  const currentCampaign = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  const latestOrders = await db
    .select()
    .from(placementOrdersTable)
    .where(eq(placementOrdersTable.campaignId, campaignId));
  const latest = currentCampaign[0];
  const latestActiveOrders = latestOrders.filter((order) =>
    ACTIVE_FUNDING_STATUSES.includes(order.status as (typeof ACTIVE_FUNDING_STATUSES)[number]),
  );
  if (
    latest?.lifecycleStatus === "funded" &&
    latest.ownerEmail &&
    !latest.fundedEmailSentAt &&
    latestActiveOrders.length >= latest.pricesCents.length &&
    latestActiveOrders.every((order) => order.status === "funded")
  ) {
    try {
      const delivery = await sendTransactionalEmail(ownerCampaignFundedEmail({
        email: latest.ownerEmail,
        itemDisplayName: campaignItemDisplayName(latest),
        campaignId: latest.id,
        totalCents: latest.pricesCents.reduce((sum, cents) => sum + cents, 0),
      }));
      await db.update(campaignsTable).set({
        fundedEmailSentAt: now,
        fundedEmailMessageId: delivery.messageId ?? null,
        updatedAt: now,
      }).where(and(
        eq(campaignsTable.id, latest.id),
        isNull(campaignsTable.fundedEmailSentAt),
      ));
    } catch (error) {
      logger.warn({ err: error, campaignId }, "Owner funded email delivery failed");
    }
  }
}

export async function expirePaymentFailures(now = new Date()): Promise<void> {
  const failed = await db.select().from(placementOrdersTable).where(and(
    eq(placementOrdersTable.status, "payment_failed"),
    lte(placementOrdersTable.paymentFailureExpiresAt, now),
  ));
  for (const order of failed) {
    if (order.stripePaymentMethodId) {
      try {
        await stripeRequest(
          `/v1/payment_methods/${encodeURIComponent(order.stripePaymentMethodId)}/detach`,
          { method: "POST", idempotencyKey: `brandmyitem-order-${order.id}-detach-payment-method` },
        );
      } catch (error) {
        logger.warn({ err: error, reservationId: order.id }, "Expired reservation payment method detach failed");
      }
    }
    await db.update(placementOrdersTable).set({
      status: "cancelled",
      stripePaymentMethodId: null,
      paymentFailureAt: null,
      paymentFailureExpiresAt: null,
      paymentRetryAt: null,
      updatedAt: now,
    }).where(and(eq(placementOrdersTable.id, order.id), eq(placementOrdersTable.status, "payment_failed")));
    await db.update(campaignsTable).set({
      active: true,
      lifecycleStatus: "live",
      updatedAt: now,
    }).where(and(eq(campaignsTable.id, order.campaignId), eq(campaignsTable.lifecycleStatus, "funding")));
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, order.campaignId)).limit(1);
    if (!campaign) continue;
    try {
      const delivery = await sendTransactionalEmail(paymentReopenedEmail({
        email: order.email,
        reservationId: `BMI-${order.id.toUpperCase().slice(0, 6)}`,
        itemDisplayName: campaignItemDisplayName(campaign),
      }));
      await db.update(placementOrdersTable).set({
        paymentReopenedEmailSentAt: now,
        paymentReopenedEmailMessageId: delivery.messageId ?? null,
        updatedAt: now,
      }).where(and(
        eq(placementOrdersTable.id, order.id),
        isNull(placementOrdersTable.paymentReopenedEmailSentAt),
      ));
    } catch (error) {
      logger.warn({ err: error, reservationId: order.id }, "Payment reopen email delivery failed");
    }
    if (campaign.ownerEmail && !campaign.reopenedEmailSentAt) {
      try {
        const delivery = await sendTransactionalEmail(ownerCampaignReopenedEmail({
          email: campaign.ownerEmail,
          itemDisplayName: campaignItemDisplayName(campaign),
          campaignId: campaign.id,
        }));
        await db.update(campaignsTable).set({
          reopenedEmailSentAt: now,
          reopenedEmailMessageId: delivery.messageId ?? null,
          updatedAt: now,
        }).where(and(eq(campaignsTable.id, campaign.id), isNull(campaignsTable.reopenedEmailSentAt)));
      } catch (error) {
        logger.warn({ err: error, campaignId: campaign.id }, "Campaign reopen email delivery failed");
      }
    }
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
    const allSpotsActive = orders.filter((order) =>
      ACTIVE_FUNDING_STATUSES.includes(order.status as (typeof ACTIVE_FUNDING_STATUSES)[number]),
    ).length >= campaign.pricesCents.length;
    if (shouldRetry || allSpotsActive) await attemptCampaignFunding(campaign.id, now);
  }
  const fundedCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.lifecycleStatus, "funded"));
  for (const campaign of fundedCampaigns) {
    await sendFundingLifecycleEmails(campaign.id, now);
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
    if (relistEligible && campaign.relistCount < 1) {
      const relistExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await db.update(campaignsTable).set({
        active: true,
        lifecycleStatus: "live",
        expiresAt: relistExpiresAt,
        relistedAt: now,
        relistExpiresAt,
        relistCount: campaign.relistCount + 1,
        updatedAt: now,
      }).where(and(
        eq(campaignsTable.id, campaign.id),
        inArray(campaignsTable.lifecycleStatus, ["live", "funding"]),
      ));
      continue;
    }
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

/**
 * Advances check-ins exactly once through due -> reminded -> missed. Email
 * dispatch is intentionally separate from this durable transition so a
 * delivery outage cannot cause duplicate reminders on the next sweep.
 */
export async function advanceCheckinLifecycle(now = new Date()): Promise<void> {
  const reminderCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(campaignsTable)
    .set({ checkinStatus: "reminded", checkinReminderSentAt: now, updatedAt: now })
    .where(
      and(
        isNotNull(campaignsTable.deliveredAt),
        eq(campaignsTable.checkinStatus, "due"),
        lte(campaignsTable.checkinDueAt, now),
      ),
    );
  await db
    .update(campaignsTable)
    .set({ checkinStatus: "missed", updatedAt: now })
    .where(
      and(
        isNotNull(campaignsTable.deliveredAt),
        eq(campaignsTable.checkinStatus, "reminded"),
        lte(campaignsTable.checkinReminderSentAt, reminderCutoff),
      ),
    );
}

export async function autoApprovePlacementProofs(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await db
    .update(placementOrdersTable)
    .set({ proofStatus: "approved", proofApprovedAt: now, updatedAt: now })
    .where(
      and(
        eq(placementOrdersTable.proofStatus, "submitted"),
        // Conditional update makes repeated sweeps harmless.
        inArray(placementOrdersTable.status, ["funded"]),
        lte(placementOrdersTable.proofSentAt, cutoff),
      ),
    );
}

export async function refundPendingMakeGoods(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const campaigns = await db.select().from(campaignsTable).where(and(
    eq(campaignsTable.checkinStatus, "missed"),
    eq(campaignsTable.makeGoodSelection, "cancellation"),
    lte(campaignsTable.makeGoodSelectedAt, cutoff),
  ));
  for (const campaign of campaigns) {
    const termValue = campaign.presentation?.termMonths;
    const termMonths = typeof termValue === "number" && [6, 12, 18].includes(termValue) ? termValue : 12;
    const monthsRemaining = Math.max(0, termMonths - 1);
    const orders = await db.select().from(placementOrdersTable).where(and(
      eq(placementOrdersTable.campaignId, campaign.id),
      eq(placementOrdersTable.status, "funded"),
    ));
    for (const order of orders) {
      if (!order.stripePaymentIntentId || order.stripeRefundStatus === "succeeded") continue;
      const refundCents = Math.floor(order.amountCents * monthsRemaining / termMonths);
      if (refundCents <= 0) continue;
      try {
        const refund = await stripeRequest<{ id: string; status: string }>("/v1/refunds", {
          method: "POST",
          body: new URLSearchParams({
            payment_intent: order.stripePaymentIntentId,
            amount: String(refundCents),
            reason: "requested_by_customer",
          }),
          idempotencyKey: `brandmyitem-order-${order.id}-make-good-refund`,
        });
        await db.update(placementOrdersTable).set({
          stripeRefundId: refund.id,
          stripeRefundStatus: refund.status,
          updatedAt: now,
        }).where(and(
          eq(placementOrdersTable.id, order.id),
          eq(placementOrdersTable.status, "funded"),
        ));
      } catch (error) {
        logger.warn({ err: error, reservationId: order.id }, "Make-good refund failed");
      }
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