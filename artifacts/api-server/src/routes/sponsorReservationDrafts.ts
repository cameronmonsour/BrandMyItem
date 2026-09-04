import { randomUUID } from "node:crypto";
import { campaignsTable, db, placementOrdersTable, sponsorReservationDraftsTable, uploadIntentsTable } from "@workspace/db";
import {
  CreateSponsorReservationDraftBody, CreateSponsorReservationDraftResponse,
  FinalizeSponsorReservationDraftLogoUploadParams, FinalizeSponsorReservationDraftLogoUploadResponse,
  RequestSponsorReservationDraftLogoUploadBody, RequestSponsorReservationDraftLogoUploadParams,
  RequestSponsorReservationDraftLogoUploadResponse,
} from "@workspace/api-zod";
import { and, eq, gt, lte } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { accessTokenMatches, createAccessToken, hashAccessToken, readAccessToken, setAccessCookie } from "../lib/accessControl.ts";
import { createImageUploadURL, objectPathFromUploadUrl, verifyUploadIntentObject } from "../lib/objectStorage.ts";
import { hashUploadCapability, toPublicUploadIntent, uploadCapabilityMatches } from "../lib/uploadIntents.ts";

const router: IRouter = Router();
const DRAFT_TTL_MS = 15 * 60 * 1000;
const LOGO_TYPES = new Set(["image/svg+xml", "application/pdf"]);
const LOGO_MAX_BYTES = 20_000_000;

async function authorizedDraft(req: Request, draftId: string) {
  const [draft] = await db.select().from(sponsorReservationDraftsTable)
    .where(eq(sponsorReservationDraftsTable.id, draftId)).limit(1);
  const capability = readAccessToken(req, "sponsor_reservation", draftId);
  return draft && capability && accessTokenMatches(draft.capabilityDigest, capability)
    ? { draft, capability }
    : null;
}

function isOpenOrder(status: string): boolean {
  return ["pending", "reserved", "funding", "payment_failed", "funded"].includes(status);
}

router.post("/sponsor-reservation-drafts", async (req, res): Promise<void> => {
  const parsed = CreateSponsorReservationDraftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid reservation draft" }); return; }
  const { campaignId, spotIndex } = parsed.data;
  const now = new Date();
  const [campaign] = await db.select().from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.active, true))).limit(1);
  if (!campaign || campaign.lifecycleStatus !== "live" || (campaign.expiresAt && campaign.expiresAt <= now) ||
      !Number.isInteger(campaign.pricesCents[spotIndex])) {
    res.status(404).json({ error: "Campaign spot is not available" }); return;
  }
  const [order] = await db.select().from(placementOrdersTable).where(and(
    eq(placementOrdersTable.campaignId, campaignId), eq(placementOrdersTable.spotIndex, spotIndex),
  )).limit(1);
  if (order && isOpenOrder(order.status)) { res.status(409).json({ error: "Placement is already reserved" }); return; }

  const id = randomUUID();
  const capability = createAccessToken();
  const expiresAt = new Date(Math.min(Date.now() + DRAFT_TTL_MS, campaign.expiresAt?.getTime() ?? Infinity));
  // The unique spot key makes active drafts mutually exclusive. Expired
  // unconsumed drafts are safe to clear before issuing the next capability.
  await db.delete(sponsorReservationDraftsTable).where(and(
    eq(sponsorReservationDraftsTable.campaignId, campaignId),
    eq(sponsorReservationDraftsTable.spotIndex, spotIndex),
    eq(sponsorReservationDraftsTable.status, "issued"),
    lte(sponsorReservationDraftsTable.expiresAt, now),
  ));
  const [created] = await db.insert(sponsorReservationDraftsTable).values({
    id, capabilityDigest: hashAccessToken(capability), campaignId, spotIndex, expiresAt,
  }).onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "Placement is already being reserved" }); return; }
  setAccessCookie(res, "sponsor_reservation", id, capability);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(CreateSponsorReservationDraftResponse.parse({
    id, campaignId, spotIndex, status: "issued", expiresAt,
  }));
});

router.post("/sponsor-reservation-drafts/:draftId/logo/request-url", async (req, res): Promise<void> => {
  const params = RequestSponsorReservationDraftLogoUploadParams.safeParse(req.params);
  const body = RequestSponsorReservationDraftLogoUploadBody.safeParse(req.body);
  if (!params.success || !body.success || !LOGO_TYPES.has(body.data.contentType) || body.data.size > LOGO_MAX_BYTES) {
    res.status(400).json({ error: "Logo metadata is not permitted" }); return;
  }
  const authorized = await authorizedDraft(req, params.data.draftId);
  const now = new Date();
  if (!authorized) { res.status(404).json({ error: "Reservation draft not found" }); return; }
  const { draft, capability } = authorized;
  if (draft.status !== "issued" || draft.expiresAt <= now) { res.status(409).json({ error: "Reservation draft is expired" }); return; }
  const uploadURL = await createImageUploadURL();
  const objectPath = objectPathFromUploadUrl(uploadURL);
  const [intent] = await db.insert(uploadIntentsTable).values({
    id: randomUUID(), capabilityDigest: hashUploadCapability(capability),
    purpose: "sponsor_reservation_draft_logo", actorType: "sponsor", actorId: draft.id,
    resourceType: "sponsor_reservation_draft", resourceId: draft.id,
    campaignId: draft.campaignId, spotIndex: draft.spotIndex, objectPath,
    expectedMimeType: body.data.contentType, expectedSizeBytes: body.data.size,
    expectedFileName: body.data.name, expiresAt: draft.expiresAt,
  }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(RequestSponsorReservationDraftLogoUploadResponse.parse({
    ...toPublicUploadIntent(intent as Parameters<typeof toPublicUploadIntent>[0]), uploadURL,
  }));
});

router.post("/sponsor-reservation-drafts/:draftId/logo/:intentId/finalize", async (req, res): Promise<void> => {
  const params = FinalizeSponsorReservationDraftLogoUploadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid logo upload intent" }); return; }
  const authorized = await authorizedDraft(req, params.data.draftId);
  if (!authorized) { res.status(404).json({ error: "Reservation draft not found" }); return; }
  const { draft, capability } = authorized;
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, params.data.intentId)).limit(1);
  const now = new Date();
  if (!intent || intent.purpose !== "sponsor_reservation_draft_logo" || intent.actorId !== draft.id ||
      intent.resourceId !== draft.id || intent.campaignId !== draft.campaignId || intent.spotIndex !== draft.spotIndex ||
      !uploadCapabilityMatches(intent.capabilityDigest, capability)) {
    res.status(404).json({ error: "Logo upload intent not found" }); return;
  }
  if (draft.status !== "issued" || draft.expiresAt <= now || intent.status !== "issued" || intent.expiresAt <= now) {
    res.status(409).json({ error: "Logo upload intent is expired or already used" }); return;
  }
  if (!(await verifyUploadIntentObject(intent.objectPath, intent.expectedMimeType, intent.expectedSizeBytes))) {
    res.status(400).json({ error: "Uploaded logo does not match expected metadata" }); return;
  }
  const finalized = await db.update(uploadIntentsTable).set({ status: "finalized", statusVersion: intent.statusVersion + 1, finalizedAt: now })
    .where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "issued"),
      eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
  if (!finalized.length) { res.status(409).json({ error: "Logo upload intent was already used" }); return; }
  res.json(FinalizeSponsorReservationDraftLogoUploadResponse.parse(
    toPublicUploadIntent(finalized[0] as Parameters<typeof toPublicUploadIntent>[0]),
  ));
});

export default router;