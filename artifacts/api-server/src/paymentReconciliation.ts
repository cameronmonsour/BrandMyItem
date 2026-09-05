import { logger } from "./lib/logger.ts";
import { campaignsTable, db, placementOrdersTable, pool } from "@workspace/db";
import {
  expireUnfundedCampaigns,
  expirePaymentFailures,
  reconcileReservationPayments,
  advanceCheckinLifecycle,
  autoApprovePlacementProofs,
} from "./paymentFunding.ts";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export async function reconcilePayments(now = new Date()): Promise<void> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('brandmyitem-lifecycle-sweep')) AS locked",
    );
    if (!lock.rows[0]?.locked) return;
    try {
      await reconcileReservationPayments(now);
      await expirePaymentFailures(now);
      await expireUnfundedCampaigns(now);
      await advanceCheckinLifecycle(now);
      await autoApprovePlacementProofs(now);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('brandmyitem-lifecycle-sweep'))");
    }
  } finally {
    client.release();
  }
}

type SweepSnapshot = {
  campaigns: Map<string, Record<string, unknown>>;
  orders: Map<string, Record<string, unknown>>;
};

async function snapshotSweeps(): Promise<SweepSnapshot> {
  const [campaigns, orders] = await Promise.all([
    db.select().from(campaignsTable),
    db.select().from(placementOrdersTable),
  ]);
  return {
    campaigns: new Map(campaigns.map((campaign) => [campaign.id, {
      lifecycleStatus: campaign.lifecycleStatus,
      active: campaign.active,
      checkinStatus: campaign.checkinStatus,
      proofStatus: campaign.proofStatus,
      deliveredAt: campaign.deliveredAt?.toISOString() ?? null,
      checkinDueAt: campaign.checkinDueAt?.toISOString() ?? null,
      fundedEmailSentAt: campaign.fundedEmailSentAt?.toISOString() ?? null,
      reopenedEmailSentAt: campaign.reopenedEmailSentAt?.toISOString() ?? null,
      recipient: campaign.ownerEmail,
      checkinPreDueEmailSentAt: campaign.checkinPreDueEmailSentAt?.toISOString() ?? null,
      checkinDueEmailSentAt: campaign.checkinDueEmailSentAt?.toISOString() ?? null,
      checkinMissedEmailSentAt: campaign.checkinMissedEmailSentAt?.toISOString() ?? null,
      restrictionEmailSentAt: campaign.restrictionEmailSentAt?.toISOString() ?? null,
      proofAutoApprovedEmailSentAt: campaign.proofAutoApprovedEmailSentAt?.toISOString() ?? null,
      expiredEmailSentAt: campaign.expiredEmailSentAt?.toISOString() ?? null,
    }])),
    orders: new Map(orders.map((order) => [order.id, {
      status: order.status,
      proofStatus: order.proofStatus,
      proofApprovedAt: order.proofApprovedAt?.toISOString() ?? null,
      paymentFailureExpiresAt: order.paymentFailureExpiresAt?.toISOString() ?? null,
      fundingEmailSentAt: order.fundingEmailSentAt?.toISOString() ?? null,
      paymentDeclineEmailSentAt: order.paymentDeclineEmailSentAt?.toISOString() ?? null,
      paymentReopenedEmailSentAt: order.paymentReopenedEmailSentAt?.toISOString() ?? null,
      stripeRefundStatus: order.stripeRefundStatus,
      recipient: order.email,
      releaseEmailSentAt: order.releaseEmailSentAt?.toISOString() ?? null,
    }])),
  };
}

export async function runLifecycleSweeps(now = new Date()): Promise<{
  locked: boolean;
  changes: Array<Record<string, unknown>>;
  emails: Array<Record<string, unknown>>;
}> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext('brandmyitem-lifecycle-sweep')) AS locked",
    );
    if (!lock.rows[0]?.locked) return { locked: false, changes: [], emails: [] };
    try {
      const before = await snapshotSweeps();
      await reconcileReservationPayments(now);
      await expirePaymentFailures(now);
      await expireUnfundedCampaigns(now);
      await advanceCheckinLifecycle(now);
      await autoApprovePlacementProofs(now);
      const after = await snapshotSweeps();
      const changes: Array<Record<string, unknown>> = [];
      const emails: Array<Record<string, unknown>> = [];
      for (const [id, next] of after.campaigns) {
        const previous = before.campaigns.get(id);
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
          changes.push({ entity: "campaign", id, before: previous ?? null, after: next });
        }
        if (previous?.fundedEmailSentAt !== next.fundedEmailSentAt && next.fundedEmailSentAt) {
          emails.push({ kind: "owner_funded", campaignId: id, sentAt: next.fundedEmailSentAt });
        }
        if (previous?.reopenedEmailSentAt !== next.reopenedEmailSentAt && next.reopenedEmailSentAt) {
          emails.push({ kind: "owner_reopened", campaignId: id, sentAt: next.reopenedEmailSentAt });
        }
         for (const [field, template] of [["checkinPreDueEmailSentAt", "checkin_reminder_pre_due"], ["checkinDueEmailSentAt", "checkin_reminder_due"], ["checkinMissedEmailSentAt", "checkin_missed"], ["restrictionEmailSentAt", "owner_restricted"], ["proofAutoApprovedEmailSentAt", "proof_auto_approved"], ["expiredEmailSentAt", "listing_expired"]] as const) {
           if (previous?.[field] !== next[field] && next[field]) emails.push({ template, recipient: next.recipient, campaignId: id, sentAt: next[field] });
         }
      }
      for (const [id, next] of after.orders) {
        const previous = before.orders.get(id);
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
          changes.push({ entity: "placement_order", id, before: previous ?? null, after: next });
        }
        if (previous?.fundingEmailSentAt !== next.fundingEmailSentAt && next.fundingEmailSentAt) {
          emails.push({ kind: "brand_funding", reservationId: id, sentAt: next.fundingEmailSentAt });
        }
        if (previous?.paymentDeclineEmailSentAt !== next.paymentDeclineEmailSentAt && next.paymentDeclineEmailSentAt) {
          emails.push({ kind: "brand_decline", reservationId: id, sentAt: next.paymentDeclineEmailSentAt });
        }
        if (previous?.paymentReopenedEmailSentAt !== next.paymentReopenedEmailSentAt && next.paymentReopenedEmailSentAt) {
          emails.push({ kind: "brand_reopened", reservationId: id, sentAt: next.paymentReopenedEmailSentAt });
        }
         if (previous?.releaseEmailSentAt !== next.releaseEmailSentAt && next.releaseEmailSentAt) {
           emails.push({ template: "reservation_released", recipient: next.recipient, reservationId: id, sentAt: next.releaseEmailSentAt });
         }
      }
      return { locked: true, changes, emails };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('brandmyitem-lifecycle-sweep'))");
    }
  } finally {
    client.release();
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
      logger.error({ err }, "Reservation payment reconciliation cycle failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}