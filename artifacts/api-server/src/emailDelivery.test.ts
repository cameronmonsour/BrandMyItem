import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  isRetryableEmailStatus,
  sendTransactionalEmail,
} from "./emailDelivery.ts";

const email = {
  to: "brand@example.com",
  subject: "Tracking link",
  text: "Use your one-time link.",
  html: "<p>Use your one-time link.</p>",
};

test("sends the configured Resend payload and returns its message ID", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM;
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: "resend-message-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "BrandMyItem <test@example.com>";

  try {
    const result = await sendTransactionalEmail(email, { maxAttempts: 1 });
    assert.equal(result.messageId, "resend-message-id");
    assert.deepEqual(requestBody, {
      from: "BrandMyItem <test@example.com>",
      to: ["brand@example.com"],
      subject: "Tracking link",
      text: "Use your one-time link.",
      html: "<p>Use your one-time link.</p>",
      reply_to: "support@brandmyitem.com",
    });
  } finally {
    fetchMock.mock.restore();
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousFrom;
    globalThis.fetch = originalFetch;
  }
});

test("requires RESEND_FROM even when the API key is configured", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM;
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.RESEND_FROM;

  try {
    await assert.rejects(
      sendTransactionalEmail(email, { maxAttempts: 1 }),
      /RESEND_FROM is not configured/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousFrom;
  }
});

test("only transient provider statuses are retryable", () => {
  assert.equal(isRetryableEmailStatus(400), false);
  assert.equal(isRetryableEmailStatus(401), false);
  assert.equal(isRetryableEmailStatus(404), false);
  assert.equal(isRetryableEmailStatus(408), true);
  assert.equal(isRetryableEmailStatus(429), true);
  assert.equal(isRetryableEmailStatus(500), true);
  assert.equal(isRetryableEmailStatus(503), true);
});

test("retries a transient provider failure with bounded exponential backoff", async () => {
  const statuses = [503, 502, 202];
  const delays: number[] = [];
  let attempts = 0;

  await sendTransactionalEmail(email, {
    initialDelayMs: 10,
    request: async () => {
      const status = statuses[attempts];
      attempts += 1;
      if (status >= 400) {
        const error = new Error(`provider ${status}`) as Error & { status: number };
        error.status = status;
        throw error;
      }
      return { ok: true, status };
    },
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("does not retry permanent provider failures", async () => {
  let attempts = 0;
  const delays: number[] = [];

  await assert.rejects(
    sendTransactionalEmail(email, {
      request: async () => {
        attempts += 1;
        const error = new Error("provider rejected request") as Error & {
          status: number;
        };
        error.status = 400;
        throw error;
      },
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }),
    /provider rejected request/,
  );

  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test("caps repeated network failures at the configured attempt count", async () => {
  let attempts = 0;
  const delays: number[] = [];

  await assert.rejects(
    sendTransactionalEmail(email, {
      maxAttempts: 3,
      initialDelayMs: 100,
      request: async () => {
        attempts += 1;
        throw new Error("network unavailable");
      },
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }),
    /network unavailable/,
  );

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});