import assert from "node:assert/strict";
import test from "node:test";
import { GetPlacementCheckoutResponse } from "../../../lib/api-zod/src/generated/api.ts";
import {
  checkoutTransition,
  checkoutIdempotencyKey,
  isRefundRetryable,
  isRefundSucceeded,
  refundIdempotencyKey,
  shouldRefundCampaign,
} from "./paymentTransitions.ts";

test("a paid Checkout Session moves only a pending order to paid", () => {
  const session = {
    status: "complete",
    payment_status: "paid",
    payment_intent: "pi_123",
  };
  assert.deepEqual(checkoutTransition("pending", session), {
    status: "paid",
    paymentIntentId: "pi_123",
  });
  assert.equal(checkoutTransition("paid", session), null);
  assert.equal(checkoutTransition("refunded", session), null);
});

test("checkout retries reuse one key and expired sessions get a new key", () => {
  assert.equal(
    checkoutIdempotencyKey("order-1"),
    checkoutIdempotencyKey("order-1"),
  );
  assert.notEqual(
    checkoutIdempotencyKey("order-1"),
    checkoutIdempotencyKey("order-1", "cs_expired"),
  );
});

test("a reconciled expired session produces a fresh checkout key", () => {
  const expiredSession = {
    status: "expired",
    payment_status: "unpaid",
    payment_intent: null,
  };
  assert.deepEqual(checkoutTransition("pending", expiredSession), {
    status: "expired",
  });
  assert.notEqual(
    checkoutIdempotencyKey("order-1"),
    checkoutIdempotencyKey("order-1", "cs_expired"),
  );
});

test("an expired unpaid Checkout Session releases only a pending order", () => {
  const session = {
    status: "expired",
    payment_status: "unpaid",
    payment_intent: null,
  };
  assert.deepEqual(checkoutTransition("pending", session), {
    status: "expired",
  });
  assert.equal(checkoutTransition("refunding", session), null);
});

test("a complete unpaid asynchronous Checkout Session is not replaceable", () => {
  const session = {
    status: "complete",
    payment_status: "unpaid",
    payment_intent: "pi_processing",
  };
  assert.equal(checkoutTransition("pending", session), null);
});

test("only incomplete campaigns are eligible for 60-day refunds", () => {
  assert.equal(shouldRefundCampaign(3, 2), true);
  assert.equal(shouldRefundCampaign(3, 3), false);
  assert.equal(shouldRefundCampaign(0, 0), false);
});

test("refund retries use the same Stripe idempotency key", () => {
  assert.equal(
    refundIdempotencyKey("order-1"),
    refundIdempotencyKey("order-1"),
  );
  assert.notEqual(
    refundIdempotencyKey("order-1"),
    refundIdempotencyKey("order-2"),
  );
  assert.equal(
    refundIdempotencyKey("order-1", "re_failed"),
    refundIdempotencyKey("order-1", "re_failed"),
  );
  assert.notEqual(
    refundIdempotencyKey("order-1"),
    refundIdempotencyKey("order-1", "re_failed"),
  );
});

test("only succeeded refunds are final and failed refunds are retryable", () => {
  assert.equal(isRefundSucceeded("succeeded"), true);
  assert.equal(isRefundSucceeded("pending"), false);
  assert.equal(isRefundSucceeded("failed"), false);
  assert.equal(isRefundRetryable("failed"), true);
  assert.equal(isRefundRetryable("canceled"), true);
  assert.equal(isRefundRetryable("pending"), false);
});

test("checkout status responses can expose a refund in progress", () => {
  const result = GetPlacementCheckoutResponse.safeParse({
    id: "order-1",
    campaignId: "campaign-1",
    spotIndex: 0,
    amountCents: 1000,
    brandName: "Example",
    email: "buyer@example.com",
    destinationUrl: null,
    status: "refunding",
    stripeCheckoutSessionId: "cs_123",
  });
  assert.equal(result.success, true);
});
