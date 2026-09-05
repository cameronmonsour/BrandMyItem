import assert from "node:assert/strict";
import test from "node:test";
import { hourlySweepBucket } from "./paymentReconciliation.ts";

test("hourly sweep bucket is stable throughout a UTC hour", () => {
  assert.equal(
    hourlySweepBucket(new Date("2026-09-05T05:59:59.999Z")).toISOString(),
    "2026-09-05T05:00:00.000Z",
  );
});

test("hourly sweep bucket advances at the next UTC hour", () => {
  assert.equal(
    hourlySweepBucket(new Date("2026-09-05T06:00:00.000Z")).toISOString(),
    "2026-09-05T06:00:00.000Z",
  );
});