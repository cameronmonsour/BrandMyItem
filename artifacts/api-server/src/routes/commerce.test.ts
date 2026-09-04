import assert from "node:assert/strict";
import test from "node:test";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation.ts";

test("campaign presentation accepts known bounded fields", () => {
  assert.equal(
    isSafeCampaignPresentation({
      photo: "/objects/uploads/123",
      faces: [{ photo: "/objects/uploads/456", tiles: [] }],
      socialLinks: { instagram: "brand" },
    }),
    true,
  );
});

test("campaign presentation rejects unknown and prototype-related fields", () => {
  assert.equal(isSafeCampaignPresentation({ injected: "<script>" }), false);
  assert.equal(
    isSafeCampaignPresentation(JSON.parse('{"socialLinks":{"constructor":"bad"}}')),
    false,
  );
});

test("campaign presentation rejects deeply nested and oversized values", () => {
  assert.equal(
    isSafeCampaignPresentation({ faces: [[[[[[["too deep"]]]]]]] }),
    false,
  );
  assert.equal(isSafeCampaignPresentation({ purpose: "x".repeat(20_001) }), false);
});

test("campaign presentation rejects invalid semantic field types", () => {
  assert.equal(isSafeCampaignPresentation({ faces: { photo: "x" } }), false);
  assert.equal(isSafeCampaignPresentation({ cities: "<img>" }), false);
  assert.equal(isSafeCampaignPresentation({ slots: "many" }), false);
});