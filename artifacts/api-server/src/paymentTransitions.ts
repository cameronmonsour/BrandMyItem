export type CheckoutSnapshot = {
  status: string;
  payment_status: string;
  payment_intent: string | null;
};

export type PlacementStatus =
  | "pending"
  | "reserved"
  | "funding"
  | "payment_failed"
  | "funded"
  | "cancelled"
  | "released"
  | "expired";

export function fundingChargeIdempotencyKey(
  reservationId: string,
  attempt = 0,
): string {
  return `brandmyitem-reservation-${reservationId}-charge-${attempt}`;
}

export function paymentFailureExpiresAt(now: Date): Date {
  return new Date(now.getTime() + 48 * 60 * 60 * 1000);
}

export function paymentRetryAt(now: Date): Date {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000);
}

export function checkoutTransition(
  currentStatus: string,
  session: CheckoutSnapshot,
):
  | { status: "paid"; paymentIntentId: string | null }
  | { status: "expired" }
  | null {
  if (currentStatus !== "pending") return null;
  if (session.payment_status === "paid") {
    return { status: "paid", paymentIntentId: session.payment_intent };
  }
  if (session.status === "expired") return { status: "expired" };
  return null;
}

export function shouldRefundCampaign(
  spotCount: number,
  paidOrRefundingOrderCount: number,
): boolean {
  return spotCount > 0 && paidOrRefundingOrderCount < spotCount;
}

export function refundIdempotencyKey(
  orderId: string,
  previousFailedRefundId?: string | null,
): string {
  const retry = previousFailedRefundId
    ? `-after-${previousFailedRefundId}`
    : "";
  return `brandmyitem-order-${orderId}-60-day-refund${retry}`;
}

export function checkoutIdempotencyKey(
  orderId: string,
  previousExpiredSessionId?: string | null,
): string {
  const retry = previousExpiredSessionId
    ? `-after-${previousExpiredSessionId}`
    : "";
  return `brandmyitem-order-${orderId}-checkout${retry}`;
}

export function isMissingCheckoutSessionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^No such checkout\.session:/i.test(error.message)
  );
}

export function isRefundSucceeded(status: string): boolean {
  return status === "succeeded";
}

export function isRefundRetryable(status: string): boolean {
  return status === "failed" || status === "canceled";
}
