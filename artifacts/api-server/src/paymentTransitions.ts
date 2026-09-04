export type CheckoutSnapshot = {
  status: string;
  payment_status: string;
  payment_intent: string | null;
};

export type PlacementStatus =
  "pending" | "paid" | "expired" | "refunding" | "refunded";

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

export function isRefundSucceeded(status: string): boolean {
  return status === "succeeded";
}

export function isRefundRetryable(status: string): boolean {
  return status === "failed" || status === "canceled";
}
