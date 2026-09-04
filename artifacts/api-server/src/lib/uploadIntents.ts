import { createHash, timingSafeEqual } from "node:crypto";

export const uploadIntentPurposes = [
  "campaign_draft_w9",
  "owner_checkin",
  "operator_production_proof",
  "sponsor_reservation_draft_logo",
] as const;

export type UploadIntentPurpose = (typeof uploadIntentPurposes)[number];
export type UploadIntentStatus = "issued" | "finalized" | "consumed" | "revoked";

export interface UploadIntentRecord {
  id: string;
  capabilityDigest: string;
  purpose: UploadIntentPurpose;
  actorType: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  campaignId: string | null;
  placementOrderId: string | null;
  spotIndex: number | null;
  objectPath: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
  expectedFileName: string;
  status: UploadIntentStatus;
  statusVersion: number;
  createdAt: Date;
  expiresAt: Date;
  finalizedAt: Date | null;
  consumedAt: Date | null;
}

export interface UploadIntentBinding {
  purpose: UploadIntentPurpose;
  actorType: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  campaignId?: string | null;
  placementOrderId?: string | null;
  spotIndex?: number | null;
}

export type UploadIntentValidation =
  | { ok: true }
  | {
      ok: false;
      reason: "capability" | "purpose" | "actor" | "resource" | "expired" | "replayed";
    };

export interface PublicUploadIntent {
  id: string;
  purpose: UploadIntentPurpose;
  objectPath: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
  expectedFileName: string;
  status: UploadIntentStatus;
  expiresAt: Date;
}

/**
 * Hash an upload capability before persistence. Raw capabilities must only be
 * returned when issued and must never be written to the database.
 */
export function hashUploadCapability(capability: string): string {
  return createHash("sha256").update(capability).digest("hex");
}

export function uploadCapabilityMatches(
  storedDigest: string,
  capability: string,
): boolean {
  const expected = Buffer.from(storedDigest, "hex");
  const actual = Buffer.from(hashUploadCapability(capability), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validateUploadIntent(
  intent: UploadIntentRecord,
  capability: string,
  binding: UploadIntentBinding,
  now = new Date(),
): UploadIntentValidation {
  if (!uploadCapabilityMatches(intent.capabilityDigest, capability)) {
    return { ok: false, reason: "capability" };
  }
  if (intent.purpose !== binding.purpose) return { ok: false, reason: "purpose" };
  if (intent.actorType !== binding.actorType || intent.actorId !== binding.actorId) {
    return { ok: false, reason: "actor" };
  }
  if (
    intent.resourceType !== binding.resourceType ||
    intent.resourceId !== binding.resourceId ||
    ("campaignId" in binding && intent.campaignId !== binding.campaignId) ||
    ("placementOrderId" in binding && intent.placementOrderId !== binding.placementOrderId) ||
    ("spotIndex" in binding && intent.spotIndex !== binding.spotIndex)
  ) {
    return { ok: false, reason: "resource" };
  }
  if (intent.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (
    intent.status !== "issued" ||
    intent.finalizedAt !== null ||
    intent.consumedAt !== null
  ) {
    return { ok: false, reason: "replayed" };
  }
  return { ok: true };
}

/**
 * Values for an atomic status transition. Apply both predicates in the SQL
 * WHERE clause so concurrent finalization/consumption attempts cannot replay.
 */
export function uploadIntentCompareAndSet(
  intent: Pick<UploadIntentRecord, "id" | "status" | "statusVersion">,
  nextStatus: UploadIntentStatus,
): {
  id: string;
  expectedStatus: UploadIntentStatus;
  expectedStatusVersion: number;
  nextStatus: UploadIntentStatus;
  nextStatusVersion: number;
} {
  return {
    id: intent.id,
    expectedStatus: intent.status,
    expectedStatusVersion: intent.statusVersion,
    nextStatus,
    nextStatusVersion: intent.statusVersion + 1,
  };
}

export function toPublicUploadIntent(intent: UploadIntentRecord): PublicUploadIntent {
  return {
    id: intent.id,
    purpose: intent.purpose,
    objectPath: intent.objectPath,
    expectedMimeType: intent.expectedMimeType,
    expectedSizeBytes: intent.expectedSizeBytes,
    expectedFileName: intent.expectedFileName,
    status: intent.status,
    expiresAt: intent.expiresAt,
  };
}