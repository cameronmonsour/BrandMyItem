import { randomUUID } from "node:crypto";
import {
  FinalizeCampaignCheckinPhotoUploadParams, FinalizeCampaignCheckinPhotoUploadResponse,
  FinalizeOperatorProductionProofUploadParams, FinalizeOperatorProductionProofUploadResponse,
  RecordCampaignDeliveryParams, RecordCampaignDeliveryResponse,
  RecordCampaignShipmentBody, RecordCampaignShipmentParams,
  RequestCampaignCheckinPhotoUploadBody, RequestCampaignCheckinPhotoUploadParams, RequestCampaignCheckinPhotoUploadResponse,
  RequestOperatorProductionProofUploadBody, RequestOperatorProductionProofUploadParams, RequestOperatorProductionProofUploadResponse,
  SaveShippingAddressBody, SaveShippingAddressParams, SaveShippingAddressResponse,
  SelectCampaignMakeGoodBody, SelectCampaignMakeGoodParams, SubmitCampaignCheckinBody,
  SubmitCampaignCheckinParams, SubmitCampaignCheckinResponse, SubmitCampaignProofBody, SubmitCampaignProofParams,
  SubmitCampaignProofResponse, SubmitOperatorCampaignProofBody, SubmitOperatorCampaignProofParams, SubmitOperatorCampaignProofResponse,
} from "@workspace/api-zod";
import { campaignCheckinsTable, campaignsTable, db, placementOrdersTable, uploadIntentsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { readAccessToken, accessTokenMatches } from "../lib/accessControl.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { operatorIdentity } from "../lib/operatorAuth.ts";
import { isDeliverableUsStreetAddress } from "../lib/shippingAddress.ts";
import { createImageUploadURL, objectPathFromUploadUrl, verifyUploadIntentObject } from "../lib/objectStorage.ts";
import { deliveryTransition } from "../lib/deliveryTransition.ts";
import { hashUploadCapability, toPublicUploadIntent, uploadCapabilityMatches } from "../lib/uploadIntents.ts";

const router: IRouter = Router();

async function ownerCampaign(req: import("express").Request, campaignId: string) {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)).limit(1);
  return campaign && accessTokenMatches(campaign.ownerAccessTokenHash, readAccessToken(req, "campaign", campaignId))
    ? campaign : null;
}

router.put("/campaigns/:campaignId/shipping-address", async (req, res): Promise<void> => {
  const params = SaveShippingAddressParams.safeParse(req.params);
  const input = SaveShippingAddressBody.safeParse(req.body);
  if (!params.success || !input.success || !isDeliverableUsStreetAddress(input.data)) {
    res.status(400).json({ error: "A deliverable US street address is required. PO Boxes are not supported." }); return;
  }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const validatedAt = new Date();
  await db.update(campaignsTable).set({
    shippingRecipientName: input.data.recipientName, shippingLine1: input.data.line1, shippingLine2: input.data.line2 ?? null,
    shippingCity: input.data.city, shippingState: input.data.state, shippingPostalCode: input.data.postalCode,
    shippingCountry: "US", shippingValidatedAt: validatedAt, updatedAt: validatedAt,
  }).where(eq(campaignsTable.id, campaign.id));
  await recordAuditEvent({ actorType: "owner", actorId: campaign.id, action: "shipping_address_saved", entityType: "campaign", entityId: campaign.id, requestIp: req.ip });
  res.json(SaveShippingAddressResponse.parse({ ...input.data, validatedAt }));
});

const PROOF_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PROOF_MAX_BYTES = 10_000_000;

router.post("/operator/campaigns/:campaignId/placement-orders/:placementOrderId/proofs/request-url", async (req, res): Promise<void> => {
  const params = RequestOperatorProductionProofUploadParams.safeParse(req.params), body = RequestOperatorProductionProofUploadBody.safeParse(req.body), operator = operatorIdentity(req);
  if (!operator) { res.status(401).json({ error: "Operator authentication required" }); return; }
  if (!params.success || !body.success || !PROOF_TYPES.has(body.data.contentType) || body.data.size > PROOF_MAX_BYTES) { res.status(400).json({ error: "Invalid proof metadata" }); return; }
  const [order] = await db.select().from(placementOrdersTable).where(and(eq(placementOrdersTable.id, params.data.placementOrderId), eq(placementOrdersTable.campaignId, params.data.campaignId), eq(placementOrdersTable.status, "funded"))).limit(1);
  if (!order) { res.status(409).json({ error: "Proof uploads require a funded placement." }); return; }
  const uploadURL = await createImageUploadURL(), objectPath = objectPathFromUploadUrl(uploadURL);
  const [intent] = await db.insert(uploadIntentsTable).values({ id: randomUUID(), capabilityDigest: hashUploadCapability(operator), purpose: "operator_production_proof", actorType: "operator", actorId: operator, resourceType: "placement_order", resourceId: order.id, campaignId: order.campaignId, placementOrderId: order.id, spotIndex: order.spotIndex, objectPath, expectedMimeType: body.data.contentType, expectedSizeBytes: body.data.size, expectedFileName: body.data.name, expiresAt: new Date(Date.now() + 15 * 60_000) }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(RequestOperatorProductionProofUploadResponse.parse({ ...toPublicUploadIntent(intent as Parameters<typeof toPublicUploadIntent>[0]), uploadURL }));
});

router.post("/operator/campaigns/:campaignId/placement-orders/:placementOrderId/proofs/:intentId/finalize", async (req, res): Promise<void> => {
  const params = FinalizeOperatorProductionProofUploadParams.safeParse(req.params), operator = operatorIdentity(req);
  if (!operator) { res.status(401).json({ error: "Operator authentication required" }); return; }
  if (!params.success) { res.status(400).json({ error: "Invalid proof upload" }); return; }
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, params.data.intentId)).limit(1);
  const [order] = await db.select().from(placementOrdersTable).where(and(eq(placementOrdersTable.id, params.data.placementOrderId), eq(placementOrdersTable.campaignId, params.data.campaignId), eq(placementOrdersTable.status, "funded"))).limit(1);
  const now = new Date();
  if (!order || !intent || intent.purpose !== "operator_production_proof" || intent.actorType !== "operator" || intent.actorId !== operator || intent.campaignId !== params.data.campaignId || intent.placementOrderId !== params.data.placementOrderId || !uploadCapabilityMatches(intent.capabilityDigest, operator)) { res.status(404).json({ error: "Proof upload intent not found" }); return; }
  if (!(await verifyUploadIntentObject(intent.objectPath, intent.expectedMimeType, intent.expectedSizeBytes))) { res.status(400).json({ error: "Uploaded proof does not match its intent" }); return; }
  const finalized = await db.update(uploadIntentsTable).set({ status: "finalized", statusVersion: intent.statusVersion + 1, finalizedAt: now }).where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "issued"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
  if (!finalized.length) { res.status(409).json({ error: "Proof upload intent was already used" }); return; }
  res.json(FinalizeOperatorProductionProofUploadResponse.parse(toPublicUploadIntent(finalized[0] as Parameters<typeof toPublicUploadIntent>[0])));
});

router.post("/operator/campaigns/:campaignId/proofs", async (req, res): Promise<void> => {
  const params = SubmitOperatorCampaignProofParams.safeParse(req.params), input = SubmitOperatorCampaignProofBody.safeParse(req.body), operator = operatorIdentity(req);
  if (!operator) { res.status(401).json({ error: "Operator authentication required" }); return; }
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid proof submission" }); return; }
  const [order] = await db.select().from(placementOrdersTable).where(and(eq(placementOrdersTable.id, input.data.placementOrderId), eq(placementOrdersTable.campaignId, params.data.campaignId), eq(placementOrdersTable.status, "funded"))).limit(1);
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, input.data.intentId)).limit(1);
  const now = new Date();
  if (!order || !intent || intent.purpose !== "operator_production_proof" || intent.actorId !== operator || intent.campaignId !== params.data.campaignId || intent.placementOrderId !== order.id || intent.status !== "finalized" || intent.expiresAt <= now || !uploadCapabilityMatches(intent.capabilityDigest, operator)) { res.status(409).json({ error: "Finalized proof intent is not valid for this placement." }); return; }
  const revision = order.proofRevision + 1;
  const changed = await db.transaction(async (tx) => {
    const consumed = await tx.update(uploadIntentsTable).set({ status: "consumed", statusVersion: intent.statusVersion + 1, consumedAt: now }).where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "finalized"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning({ id: uploadIntentsTable.id });
    if (!consumed.length) return [];
    return tx.update(placementOrdersTable).set({ proofStatus: "submitted", proofRevision: revision, proofObjectPath: intent.objectPath, proofSentAt: now, proofApprovedAt: null, proofAppliedAt: null, updatedAt: now }).where(and(eq(placementOrdersTable.id, order.id), eq(placementOrdersTable.proofRevision, order.proofRevision))).returning({ id: placementOrdersTable.id });
  });
  if (!changed.length) { res.status(409).json({ error: "Proof revision changed. Please retry." }); return; }
  await recordAuditEvent({ actorType: "operator", actorId: operator, action: "proof_submitted", entityType: "placement_order", entityId: order.id, requestIp: req.ip, metadata: { revision } });
  res.status(201).json(SubmitOperatorCampaignProofResponse.parse({ revision, objectPath: intent.objectPath, status: "submitted", submittedAt: now, approvedAt: null }));
});

router.post("/campaigns/:campaignId/proofs", async (req, res): Promise<void> => {
  const params = SubmitCampaignProofParams.safeParse(req.params), input = SubmitCampaignProofBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid proof submission" }); return; }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const [order] = await db.select().from(placementOrdersTable).where(and(eq(placementOrdersTable.id, input.data.placementOrderId), eq(placementOrdersTable.campaignId, campaign.id))).limit(1);
  if (!order) { res.status(409).json({ error: "Submitted proof is not available." }); return; }
  const now = new Date();
  const updated = await db.update(placementOrdersTable).set({ proofStatus: "approved", proofApprovedAt: now, updatedAt: now }).where(and(eq(placementOrdersTable.id, order.id), eq(placementOrdersTable.proofStatus, "submitted"), eq(placementOrdersTable.proofRevision, input.data.revision))).returning({ id: placementOrdersTable.id });
  if (!updated.length) { res.status(409).json({ error: "Submitted proof revision is no longer available" }); return; }
  await recordAuditEvent({ actorType: "owner", actorId: campaign.id, action: "proof_approved", entityType: "placement_order", entityId: order.id, requestIp: req.ip, metadata: { revision: input.data.revision } });
  res.json({ campaignId: campaign.id, placementOrderId: order.id, revision: input.data.revision, status: "approved" });
});

router.post("/operator/campaigns/:campaignId/shipment", async (req, res): Promise<void> => {
  const params = RecordCampaignShipmentParams.safeParse(req.params), input = RecordCampaignShipmentBody.safeParse(req.body), operator = operatorIdentity(req);
  if (!operator) { res.status(401).json({ error: "Operator authentication required" }); return; }
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid shipment" }); return; }
  const now = new Date();
  const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, params.data.campaignId), eq(campaignsTable.shippingCountry, "US"))).limit(1);
  const proofs = campaign ? await db.select({ status: placementOrdersTable.proofStatus }).from(placementOrdersTable).where(and(eq(placementOrdersTable.campaignId, campaign.id), eq(placementOrdersTable.status, "funded"))) : [];
  const updated = campaign && proofs.length > 0 && proofs.every((proof) => proof.status === "approved")
    ? await db.update(campaignsTable).set({ carrier: input.data.carrier, trackingNumber: input.data.trackingNumber, shipmentStatus: "shipped", shippedAt: now, lifecycleStatus: "shipped", updatedAt: now }).where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.shipmentStatus, "not_shipped"))).returning({ id: campaignsTable.id })
    : [];
  if (!updated.length) { res.status(409).json({ error: "Proof approval and a validated shipping address are required before shipment." }); return; }
  await recordAuditEvent({ actorType: "operator", actorId: operator, action: "shipment_recorded", entityType: "campaign", entityId: params.data.campaignId, requestIp: req.ip });
  res.json({ campaignId: params.data.campaignId, status: "shipped" });
});

router.post("/operator/campaigns/:campaignId/delivery", async (req, res): Promise<void> => {
  const params = RecordCampaignDeliveryParams.safeParse(req.params);
  const operator = operatorIdentity(req);
  if (!operator) { res.status(401).json({ error: "Operator authentication required" }); return; }
  if (!params.success) { res.status(400).json({ error: "Invalid campaign" }); return; }

  const now = new Date();
  const transition = deliveryTransition(
    { shipmentStatus: "shipped", lifecycleStatus: "shipped" },
    now,
  );
  // The source-state predicates are deliberately repeated in this single
  // update: only one concurrent delivery request can consume the shipped state.
  const updated = await db.update(campaignsTable).set(transition!).where(and(
    eq(campaignsTable.id, params.data.campaignId),
    eq(campaignsTable.shipmentStatus, "shipped"),
    eq(campaignsTable.lifecycleStatus, "shipped"),
  )).returning({ id: campaignsTable.id });
  if (!updated.length) {
    res.status(409).json({ error: "Campaign is not awaiting delivery." });
    return;
  }
  await recordAuditEvent({
    actorType: "operator",
    actorId: operator,
    action: "delivery_recorded",
    entityType: "campaign",
    entityId: params.data.campaignId,
    requestIp: req.ip,
  });
  res.json(RecordCampaignDeliveryResponse.parse({
    campaignId: params.data.campaignId,
    shipmentStatus: "delivered",
    lifecycleStatus: "active",
    deliveredAt: now,
    checkinStatus: "due",
    checkinDueAt: transition!.checkinDueAt,
  }));
});

const CHECKIN_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CHECKIN_MAX_BYTES = 25_000_000;
const POLICE_REPORT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const POLICE_REPORT_MAX_BYTES = 10_000_000;
const checkinCycle = (campaign: { checkinDueAt: Date | null }) => campaign.checkinDueAt?.toISOString() ?? "";

router.post("/campaigns/:campaignId/checkins/photo/request-url", async (req, res): Promise<void> => {
  const params = RequestCampaignCheckinPhotoUploadParams.safeParse(req.params), body = RequestCampaignCheckinPhotoUploadBody.safeParse(req.body);
  if (!params.success || !body.success || !CHECKIN_TYPES.has(body.data.contentType) || body.data.size > CHECKIN_MAX_BYTES) { res.status(400).json({ error: "Invalid check-in photo metadata" }); return; }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!["due", "reminded"].includes(campaign.checkinStatus) || !campaign.checkinDueAt || campaign.checkinDueAt > new Date()) { res.status(409).json({ error: "A check-in is not currently due." }); return; }
  const token = readAccessToken(req, "campaign", campaign.id)!;
  const uploadURL = await createImageUploadURL(), objectPath = objectPathFromUploadUrl(uploadURL);
  const [intent] = await db.insert(uploadIntentsTable).values({ id: randomUUID(), capabilityDigest: hashUploadCapability(token), purpose: "owner_checkin", actorType: "campaign_owner", actorId: campaign.id, resourceType: "checkin_cycle", resourceId: checkinCycle(campaign), campaignId: campaign.id, objectPath, expectedMimeType: body.data.contentType, expectedSizeBytes: body.data.size, expectedFileName: body.data.name, expiresAt: new Date(Date.now() + 15 * 60_000) }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(RequestCampaignCheckinPhotoUploadResponse.parse({ ...toPublicUploadIntent(intent as Parameters<typeof toPublicUploadIntent>[0]), uploadURL }));
});

router.post("/campaigns/:campaignId/checkins/photo/:intentId/finalize", async (req, res): Promise<void> => {
  const params = FinalizeCampaignCheckinPhotoUploadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid check-in photo upload" }); return; }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign || !campaign.checkinDueAt) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!["due", "reminded"].includes(campaign.checkinStatus) || campaign.checkinDueAt > new Date()) { res.status(409).json({ error: "A check-in is not currently due." }); return; }
  const token = readAccessToken(req, "campaign", campaign.id)!;
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, params.data.intentId)).limit(1);
  const now = new Date();
  if (!intent || intent.purpose !== "owner_checkin" || intent.actorId !== campaign.id || intent.campaignId !== campaign.id || intent.resourceId !== checkinCycle(campaign) || !uploadCapabilityMatches(intent.capabilityDigest, token)) { res.status(404).json({ error: "Check-in photo upload intent not found" }); return; }
  if (!(await verifyUploadIntentObject(intent.objectPath, intent.expectedMimeType, intent.expectedSizeBytes))) { res.status(400).json({ error: "Uploaded photo does not match its intent" }); return; }
  const finalized = await db.update(uploadIntentsTable).set({ status: "finalized", statusVersion: intent.statusVersion + 1, finalizedAt: now }).where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "issued"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
  if (!finalized.length) { res.status(409).json({ error: "Check-in photo upload intent was already used" }); return; }
  res.json(FinalizeCampaignCheckinPhotoUploadResponse.parse(toPublicUploadIntent(finalized[0] as Parameters<typeof toPublicUploadIntent>[0])));
});

router.post("/campaigns/:campaignId/checkins", async (req, res): Promise<void> => {
  const params = SubmitCampaignCheckinParams.safeParse(req.params), input = SubmitCampaignCheckinBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid check-in" }); return; }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!["due", "reminded"].includes(campaign.checkinStatus) || !campaign.checkinDueAt || campaign.checkinDueAt > new Date()) { res.status(409).json({ error: "A check-in is not currently due." }); return; }
  const now = new Date(), id = randomUUID();
  const photoIntentId = input.data.photoIntentId;
  const submitted = await db.transaction(async (tx) => {
    let photoObjectPath: string | null = null;
    if (photoIntentId) {
      const token = readAccessToken(req, "campaign", campaign.id)!;
      const [intent] = await tx.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, photoIntentId)).limit(1);
      if (!intent || intent.purpose !== "owner_checkin" || intent.actorType !== "campaign_owner" || intent.actorId !== campaign.id || intent.campaignId !== campaign.id || intent.resourceType !== "checkin_cycle" || intent.resourceId !== checkinCycle(campaign) || intent.status !== "finalized" || intent.expiresAt <= now || !uploadCapabilityMatches(intent.capabilityDigest, token)) throw new Error("INVALID_PHOTO");
      const consumed = await tx.update(uploadIntentsTable).set({ status: "consumed", statusVersion: intent.statusVersion + 1, consumedAt: now }).where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "finalized"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning({ objectPath: uploadIntentsTable.objectPath });
      if (!consumed.length) throw new Error("INVALID_PHOTO");
      photoObjectPath = consumed[0].objectPath;
    }
    await tx.insert(campaignCheckinsTable).values({ id, campaignId: campaign.id, submittedBy: campaign.id, note: input.data.note, photoObjectPath, submittedAt: now });
    const reserved = await tx.update(campaignsTable).set({
      checkinStatus: "submitted",
      checkinDueAt: new Date(now.getTime() + 30 * 86400000),
      checkinReminderSentAt: null,
      checkinPreDueEmailSentAt: null,
      checkinDueEmailSentAt: null,
      checkinMissedEmailSentAt: null,
      consecutiveMissedCheckins: 0,
      updatedAt: now,
    }).where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.checkinStatus, campaign.checkinStatus))).returning({ id: campaignsTable.id });
    if (!reserved.length) throw new Error("CHECKIN_ALREADY_SUBMITTED");
    return photoObjectPath;
  }).catch((error) => {
    if (error instanceof Error && ["INVALID_PHOTO", "CHECKIN_ALREADY_SUBMITTED"].includes(error.message)) return undefined;
    throw error;
  });
  if (submitted === undefined) { res.status(409).json({ error: "Check-in photo or current cycle is no longer valid." }); return; }
  await recordAuditEvent({ actorType: "owner", actorId: campaign.id, action: "checkin_submitted", entityType: "campaign", entityId: campaign.id, requestIp: req.ip });
  res.status(201).json(SubmitCampaignCheckinResponse.parse({ id, campaignId: campaign.id, note: input.data.note, photoObjectPath: submitted, submittedAt: now }));
});

router.post("/campaigns/:campaignId/make-good", async (req, res): Promise<void> => {
  const params = SelectCampaignMakeGoodParams.safeParse(req.params), input = SelectCampaignMakeGoodBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid make-good selection" }); return; }
  const campaign = await ownerCampaign(req, params.data.campaignId);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const now = new Date();
  const updated = await db.update(campaignsTable).set({ makeGoodSelection: input.data.selection, makeGoodSelectedAt: now, updatedAt: now }).where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.checkinStatus, "missed"), eq(campaignsTable.makeGoodStatus, "none"))).returning({ id: campaignsTable.id });
  if (!updated.length) { res.status(409).json({ error: "A make-good can only be selected after a missed check-in." }); return; }
  await recordAuditEvent({ actorType: "owner", actorId: campaign.id, action: "make_good_selected", entityType: "campaign", entityId: campaign.id, requestIp: req.ip, metadata: { selection: input.data.selection } });
  res.json({ campaignId: campaign.id, selection: input.data.selection });
});

router.post("/campaigns/:campaignId/condition-report/photo/request-url", async (req, res): Promise<void> => {
  const campaign = await ownerCampaign(req, String(req.params.campaignId));
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const size = Number(req.body?.size);
  const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!name || !Number.isInteger(size) || size < 1 || size > POLICE_REPORT_MAX_BYTES || !POLICE_REPORT_TYPES.has(contentType)) {
    res.status(400).json({ error: "A PNG, JPEG, WebP, or PDF police report is required." }); return;
  }
  const token = readAccessToken(req, "campaign", campaign.id)!;
  const uploadURL = await createImageUploadURL(), objectPath = objectPathFromUploadUrl(uploadURL);
  const [intent] = await db.insert(uploadIntentsTable).values({
    id: randomUUID(), capabilityDigest: hashUploadCapability(token), purpose: "owner_police_report",
    actorType: "campaign_owner", actorId: campaign.id, resourceType: "campaign", resourceId: campaign.id,
    campaignId: campaign.id, objectPath, expectedMimeType: contentType, expectedSizeBytes: size,
    expectedFileName: name, expiresAt: new Date(Date.now() + 15 * 60_000),
  }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ ...toPublicUploadIntent(intent as Parameters<typeof toPublicUploadIntent>[0]), uploadURL });
});

router.post("/campaigns/:campaignId/condition-report/photo/:intentId/finalize", async (req, res): Promise<void> => {
  const campaign = await ownerCampaign(req, String(req.params.campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const token = readAccessToken(req, "campaign", campaign.id)!;
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, String(req.params.intentId))).limit(1);
  const now = new Date();
  if (!intent || intent.purpose !== "owner_police_report" || intent.actorId !== campaign.id || intent.campaignId !== campaign.id || !uploadCapabilityMatches(intent.capabilityDigest, token)) {
    res.status(404).json({ error: "Police report upload intent not found" }); return;
  }
  if (!(await verifyUploadIntentObject(intent.objectPath, intent.expectedMimeType, intent.expectedSizeBytes))) {
    res.status(400).json({ error: "Uploaded police report does not match its intent" }); return;
  }
  const [finalized] = await db.update(uploadIntentsTable).set({ status: "finalized", statusVersion: intent.statusVersion + 1, finalizedAt: now })
    .where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "issued"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
  if (!finalized) { res.status(409).json({ error: "Police report upload intent was already used" }); return; }
  res.json(toPublicUploadIntent(finalized as Parameters<typeof toPublicUploadIntent>[0]));
});

router.post("/campaigns/:campaignId/condition-report", async (req, res): Promise<void> => {
  const campaign = await ownerCampaign(req, String(req.params.campaignId));
  const type = req.body?.type;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  const intentId = typeof req.body?.policeReportIntentId === "string" ? req.body.policeReportIntentId : "";
  const reportNumber = typeof req.body?.reportNumber === "string" ? req.body.reportNumber.trim().slice(0, 120) : "";
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const spots = Array.isArray(req.body?.spots) ? req.body.spots.filter((spot: unknown) => Number.isInteger(spot) && Number(spot) >= 0 && Number(spot) < campaign.pricesCents.length) : [];
  if (type !== "wear" && type !== "theft_loss") { res.status(400).json({ error: "Condition report type is invalid" }); return; }
  if (!spots.length) { res.status(400).json({ error: "Select at least one affected spot." }); return; }
  if (type === "wear" && !intentId) { res.status(400).json({ error: "A wear photo is required." }); return; }
  if (type === "theft_loss" && !intentId) { res.status(400).json({ error: "A police report upload is required for theft or loss." }); return; }
  if (type === "theft_loss" && !reportNumber) { res.status(400).json({ error: "A police report number is required." }); return; }
  let policeReportObjectPath: string | null = null;
  if (intentId) {
    const token = readAccessToken(req, "campaign", campaign.id)!;
    const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, intentId)).limit(1);
    const now = new Date();
    if (!intent || intent.purpose !== "owner_police_report" || intent.actorId !== campaign.id || intent.status !== "finalized" || intent.expiresAt <= now || !uploadCapabilityMatches(intent.capabilityDigest, token)) {
      res.status(409).json({ error: "Police report upload is not valid." }); return;
    }
    const [consumed] = await db.update(uploadIntentsTable).set({ status: "consumed", statusVersion: intent.statusVersion + 1, consumedAt: now })
      .where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "finalized"), eq(uploadIntentsTable.statusVersion, intent.statusVersion))).returning({ objectPath: uploadIntentsTable.objectPath });
    if (!consumed) { res.status(409).json({ error: "Police report upload is no longer valid." }); return; }
    policeReportObjectPath = consumed.objectPath;
  }
  const now = new Date();
  const patch = type === "theft_loss" ? {
    makeGoodStatus: "pending", makeGoodSource: "owner_report", makeGoodNote: note || null,
    makeGoodPoliceReportObjectPath: policeReportObjectPath,
    makeGoodFlaggedAt: now, lifecycleStatus: "complete", active: false, updatedAt: now,
  } : { updatedAt: now };
  await db.update(campaignsTable).set(patch).where(eq(campaignsTable.id, campaign.id));
  await recordAuditEvent({ actorType: "owner", actorId: campaign.id, action: type === "wear" ? "irli_replacement_task_created" : "theft_loss_reported", entityType: "campaign", entityId: campaign.id, requestIp: req.ip, metadata: { note, spots, reportNumber: reportNumber || null, evidenceObjectPath: policeReportObjectPath, ownerLiability: type === "theft_loss" ? "none" : null } });
  res.status(201).json({ campaignId: campaign.id, type, status: type === "theft_loss" ? "make_good_pending" : "reported" });
});

export default router;