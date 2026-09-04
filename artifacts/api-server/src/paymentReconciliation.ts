import { logger } from "./lib/logger.ts";
import { pool } from "@workspace/db";
import {
  expireUnfundedCampaigns,
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