import { logger } from "./lib/logger";
import {
  expireUnfundedCampaigns,
  reconcileReservationPayments,
} from "./paymentFunding";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export async function reconcilePayments(now = new Date()): Promise<void> {
  await reconcileReservationPayments(now);
  await expireUnfundedCampaigns(now);
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