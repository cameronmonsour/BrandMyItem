import assert from "node:assert/strict";
import test from "node:test";
import {
  hashUploadCapability,
  toPublicUploadIntent,
  uploadIntentCompareAndSet,
  validateUploadIntent,
  type UploadIntentBinding,
  type UploadIntentRecord,
} from "./uploadIntents.ts";

const capability = "capability-not-for-storage";
const binding: UploadIntentBinding = {
  purpose: "owner_checkin",
  actorType: "campaign_owner",
  actorId: "owner-1",
  resourceType: "campaign",
  resourceId: "campaign-1",
  campaignId: "campaign-1",
};

function intent(overrides: Partial<UploadIntentRecord> = {}): UploadIntentRecord {
  return {
    id: "intent-1",
    capabilityDigest: hashUploadCapability(capability),
    purpose: binding.purpose,
    actorType: binding.actorType,
    actorId: binding.actorId,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    campaignId: binding.campaignId ?? null,
    placementOrderId: null,
    spotIndex: null,
    objectPath: "campaigns/campaign-1/checkins/intent-1.jpg",
    expectedMimeType: "image/jpeg",
    expectedSizeBytes: 1024,
    expectedFileName: "checkin.jpg",
    status: "issued",
    statusVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-01T01:00:00.000Z"),
    finalizedAt: null,
    consumedAt: null,
    ...overrides,
  };
}

const now = new Date("2026-01-01T00:30:00.000Z");

test("upload intent validation rejects an incorrect actor", () => {
  assert.deepEqual(
    validateUploadIntent(intent(), capability, { ...binding, actorId: "owner-2" }, now),
    { ok: false, reason: "actor" },
  );
});

test("upload intent validation rejects an incorrect purpose or resource", () => {
  assert.deepEqual(
    validateUploadIntent(intent(), capability, { ...binding, purpose: "campaign_draft_w9" }, now),
    { ok: false, reason: "purpose" },
  );
  assert.deepEqual(
    validateUploadIntent(intent(), capability, { ...binding, resourceId: "campaign-2" }, now),
    { ok: false, reason: "resource" },
  );
});

test("upload intent validation rejects expired capabilities", () => {
  assert.deepEqual(
    validateUploadIntent(intent(), capability, binding, new Date("2026-01-01T01:00:00.000Z")),
    { ok: false, reason: "expired" },
  );
});

test("upload intent validation rejects finalized or consumed intents and exposes CAS values", () => {
  assert.deepEqual(
    validateUploadIntent(intent({ status: "consumed", consumedAt: now }), capability, binding, now),
    { ok: false, reason: "replayed" },
  );
  assert.deepEqual(uploadIntentCompareAndSet(intent(), "finalized"), {
    id: "intent-1",
    expectedStatus: "issued",
    expectedStatusVersion: 0,
    nextStatus: "finalized",
    nextStatusVersion: 1,
  });
});

test("public upload intent records never include capability digests", () => {
  const publicIntent = toPublicUploadIntent(intent());
  assert.equal("capabilityDigest" in publicIntent, false);
  assert.equal(publicIntent.objectPath, "campaigns/campaign-1/checkins/intent-1.jpg");
});

test("sponsor logo intents are bound to their reservation draft and spot", () => {
  const sponsorBinding: UploadIntentBinding = {
    purpose: "sponsor_reservation_draft_logo",
    actorType: "sponsor",
    actorId: "draft-1",
    resourceType: "sponsor_reservation_draft",
    resourceId: "draft-1",
    campaignId: "campaign-1",
    spotIndex: 2,
  };
  const sponsorIntent = intent({
    purpose: sponsorBinding.purpose,
    actorType: sponsorBinding.actorType,
    actorId: sponsorBinding.actorId,
    resourceType: sponsorBinding.resourceType,
    resourceId: sponsorBinding.resourceId,
    spotIndex: 2,
  });
  assert.deepEqual(validateUploadIntent(sponsorIntent, capability, sponsorBinding, now), { ok: true });
  assert.deepEqual(
    validateUploadIntent(sponsorIntent, capability, { ...sponsorBinding, spotIndex: 3 }, now),
    { ok: false, reason: "resource" },
  );
});