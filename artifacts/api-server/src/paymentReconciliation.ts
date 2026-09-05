import { logger } from "./lib/logger.ts";
import { campaignsTable, db, placementOrdersTable, pool } from "@workspace/db";
import {
  expireUnfundedCampaigns,
  expirePaymentFailures,
  reconcileReservationPayments,
  advanceCheckinLifecycle,
  autoApprovePlacementProofs,
} from "./paymentFunding.ts";

const DEFAULT_SCHEDULER_POLL_INTERVAL_MS = 60 * 1000;

function lifecycleSweepJobName(): string {
  return process.env.NODE_ENV === "production"
    ? "lifecycle-sweep-production"
    : "lifecycle-sweep-development";
}

export function hourlySweepBucket(now = new Date()): Date {
  const bucket = new Date(now);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

async function claimHourlySweep(now: Date): Promise<Date | null> {
  const runHour = hourlySweepBucket(now);
  const result = await pool.query<{ run_hour: Date }>(
    `INSERT INTO maintenance_job_runs (job_name, run_hour)
     VALUES ($1, $2)
     ON CONFLICT (job_name, run_hour) DO NOTHING
     RETURNING run_hour`,
    [lifecycleSweepJobName(), runHour],
  );
  return result.rows[0]?.run_hour ?? null;
}

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
           emails.push({ kind: "owner_funded", to: next.recipient, campaignId: id, sentAt: next.fundedEmailSentAt });
        }
        if (previous?.reopenedEmailSentAt !== next.reopenedEmailSentAt && next.reopenedEmailSentAt) {
           emails.push({ kind: "owner_reopened", to: next.recipient, campaignId: id, sentAt: next.reopenedEmailSentAt });
        }
         for (const [field, template] of [["checkinPreDueEmailSentAt", "checkin_reminder_pre_due"], ["checkinDueEmailSentAt", "checkin_reminder_due"], ["checkinMissedEmailSentAt", "checkin_missed"], ["restrictionEmailSentAt", "owner_restricted"], ["proofAutoApprovedEmailSentAt", "proof_auto_approved"], ["expiredEmailSentAt", "listing_expired"]] as const) {
           if (previous?.[field] !== next[field] && next[field]) emails.push({ template, to: next.recipient, campaignId: id, sentAt: next[field] });
         }
      }
      for (const [id, next] of after.orders) {
        const previous = before.orders.get(id);
        if (JSON.stringify(previous) !== JSON.stringify(next)) {
          changes.push({ entity: "placement_order", id, before: previous ?? null, after: next });
        }
        if (previous?.fundingEmailSentAt !== next.fundingEmailSentAt && next.fundingEmailSentAt) {
           emails.push({ kind: "brand_funding", to: next.recipient, reservationId: id, sentAt: next.fundingEmailSentAt });
        }
        if (previous?.paymentDeclineEmailSentAt !== next.paymentDeclineEmailSentAt && next.paymentDeclineEmailSentAt) {
           emails.push({ kind: "brand_decline", to: next.recipient, reservationId: id, sentAt: next.paymentDeclineEmailSentAt });
        }
        if (previous?.paymentReopenedEmailSentAt !== next.paymentReopenedEmailSentAt && next.paymentReopenedEmailSentAt) {
           emails.push({ kind: "brand_reopened", to: next.recipient, reservationId: id, sentAt: next.paymentReopenedEmailSentAt });
        }
         if (previous?.releaseEmailSentAt !== next.releaseEmailSentAt && next.releaseEmailSentAt) {
           emails.push({ template: "reservation_released", to: next.recipient, reservationId: id, sentAt: next.releaseEmailSentAt });
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

export async function runHourlyLifecycleSweep(now = new Date()): Promise<{
  claimed: boolean;
  runHour: string;
  locked?: boolean;
  changeCount?: number;
  emailCount?: number;
}> {
  const runHour = hourlySweepBucket(now).toISOString();
  const claimed = await claimHourlySweep(now);
  if (!claimed) return { claimed: false, runHour };

  try {
    const report = await runLifecycleSweeps(now);
    const summary = {
      claimed: true,
      runHour,
      locked: report.locked,
      changeCount: report.changes.length,
      emailCount: report.emails.length,
    };
    logger.info(summary, "Hourly lifecycle sweep summary");
    return summary;
  } catch (err) {
    logger.error(
      {
        claimed: true,
        runHour,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      "Hourly lifecycle sweep summary",
    );
    return { claimed: true, runHour };
  }
}

export function startPaymentReconciliation(): () => void {
  const configured = Number(process.env.LIFECYCLE_SWEEP_POLL_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(configured) && configured >= 10_000
      ? configured
      : DEFAULT_SCHEDULER_POLL_INTERVAL_MS;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runHourlyLifecycleSweep();
    } catch (err) {
      logger.error({ err }, "Hourly lifecycle sweep scheduler failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}