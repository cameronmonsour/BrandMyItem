import assert from "node:assert/strict";
import test from "node:test";
import { computeCampaignPricesCents } from "./campaignPricing.ts";

test("server pricing computes the MacBook one-spot campaign total", () => {
  assert.deepEqual(
    computeCampaignPricesCents({
      retail: 1599,
      faces: [{ photo: "/objects/uploads/macbook", tiles: [{ w: 0.4, h: 0.4 }] }],
    }),
    [223900],
  );
});

test("server pricing apportions unequal sized spots and preserves the exact total", () => {
  const prices = computeCampaignPricesCents({
    retail: 1599,
    faces: [{
      photo: "/objects/uploads/macbook",
      tiles: [{ w: 0.7, h: 0.4 }, { w: 0.5, h: 0.4 }],
    }],
  });
  assert.deepEqual(prices, [130600, 93300]);
  assert.equal(prices.reduce((sum, price) => sum + price, 0), 223900);
});

test("server pricing rejects drafts without sized placement areas", () => {
  assert.throws(
    () => computeCampaignPricesCents({ retail: 1599 }),
    /sized placement areas/,
  );
});