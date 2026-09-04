import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import app from "../app.ts";
import { integrationHealth } from "./health.ts";

test("integration health reports connector modes without exposing credentials", async () => {
  assert.deepEqual(await integrationHealth({
    getStripeBalance: async () => ({ livemode: false }),
    checkResend: async () => false,
  }), {
    ok: true,
    stripeMode: "test",
    resend: false,
  });
  assert.deepEqual(await integrationHealth({
    getStripeBalance: async () => ({ livemode: true }),
    checkResend: async () => true,
  }), {
    ok: true,
    stripeMode: "live",
    resend: true,
  });
});

test("integration health fails safe to live when Stripe mode cannot be verified", async () => {
  assert.deepEqual(await integrationHealth({
    getStripeBalance: async () => {
      throw new Error("connector unavailable");
    },
    checkResend: async () => {
      throw new Error("connector unavailable");
    },
  }), {
    ok: true,
    stripeMode: "live",
    resend: false,
  });
});

test("GET /api/health exposes only public integration status", async () => {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.ok(body.stripeMode === "test" || body.stripeMode === "live");
    assert.equal(typeof body.resend, "boolean");
    assert.deepEqual(Object.keys(body).sort(), ["ok", "resend", "stripeMode"]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});