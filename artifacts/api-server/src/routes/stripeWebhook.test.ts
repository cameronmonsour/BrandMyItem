import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { Request, Response } from "express";
import { createStripeWebhookHandler } from "./stripeWebhook.ts";

function signedRequest(payload: Buffer, secret: string): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  return {
    body: payload,
    get(name: string) {
      return name.toLowerCase() === "stripe-signature"
        ? `t=${timestamp},v1=${signature}`
        : undefined;
    },
  } as Request;
}

function responseCapture() {
  const capture = { statusCode: 200, body: undefined as unknown };
  const response = {
    status(statusCode: number) {
      capture.statusCode = statusCode;
      return response;
    },
    json(body: unknown) {
      capture.body = body;
      return response;
    },
  } as unknown as Response;
  return { capture, response };
}

test("acknowledges a claimed checkout event before slow processing finishes", async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "webhook-test-secret";
  let releaseProcessing!: () => void;
  const processing = new Promise<void>((resolve) => {
    releaseProcessing = resolve;
  });
  let processed = false;
  const handler = createStripeWebhookHandler({
    claimEvent: async () => true,
    processCheckoutSession: async () => processing,
    markProcessed: async () => {
      processed = true;
    },
    markFailed: async () => undefined,
  });
  const payload = Buffer.from(JSON.stringify({
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_live_1" } },
  }));
  const { capture, response } = responseCapture();

  try {
    await handler(signedRequest(payload, process.env.STRIPE_WEBHOOK_SECRET), response);
    assert.equal(capture.statusCode, 200);
    assert.deepEqual(capture.body, { received: true });
    assert.equal(processed, false);
    releaseProcessing();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(processed, true);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});

test("acknowledges a duplicate event without processing it again", async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "webhook-test-secret";
  let processingCalls = 0;
  const handler = createStripeWebhookHandler({
    claimEvent: async () => false,
    processCheckoutSession: async () => {
      processingCalls += 1;
    },
    markProcessed: async () => undefined,
    markFailed: async () => undefined,
  });
  const payload = Buffer.from(JSON.stringify({
    id: "evt_checkout_duplicate",
    type: "checkout.session.completed",
    data: { object: { id: "cs_live_duplicate" } },
  }));
  const { capture, response } = responseCapture();

  try {
    await handler(signedRequest(payload, process.env.STRIPE_WEBHOOK_SECRET), response);
    assert.equal(capture.statusCode, 200);
    assert.deepEqual(capture.body, { received: true, duplicate: true });
    assert.equal(processingCalls, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});