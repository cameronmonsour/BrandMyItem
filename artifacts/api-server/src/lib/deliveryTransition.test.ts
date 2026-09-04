import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import app from "../app.ts";
import {
  deliveryTransition,
  FIRST_CHECKIN_DELAY_MS,
} from "./deliveryTransition.ts";

test("delivery starts the first check-in cycle exactly seven days later", () => {
  const deliveredAt = new Date("2026-02-03T04:05:06.000Z");
  const transition = deliveryTransition(
    { shipmentStatus: "shipped", lifecycleStatus: "shipped" },
    deliveredAt,
  );

  assert.deepEqual(transition, {
    shipmentStatus: "delivered",
    lifecycleStatus: "active",
    deliveredAt,
    checkinStatus: "due",
    checkinDueAt: new Date(deliveredAt.getTime() + FIRST_CHECKIN_DELAY_MS),
    checkinReminderSentAt: null,
    updatedAt: deliveredAt,
  });
});

test("delivery refuses non-shipped and already-delivered states", () => {
  const now = new Date("2026-02-03T04:05:06.000Z");
  assert.equal(
    deliveryTransition({ shipmentStatus: "not_shipped", lifecycleStatus: "funded" }, now),
    null,
  );
  assert.equal(
    deliveryTransition({ shipmentStatus: "delivered", lifecycleStatus: "active" }, now),
    null,
  );
});

test("delivery route requires operator authentication before touching campaign state", async () => {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/operator/campaigns/campaign-1/delivery`,
      { method: "POST" },
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Operator authentication required",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});