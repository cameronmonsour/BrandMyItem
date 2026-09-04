import { randomUUID } from "node:crypto";
import {
  campaignsTable, db, uploadIntentsTable,
} from "@workspace/db";
import {
  CreateCampaignDraftBody, CreateCampaignDraftResponse,
  FinalizeCampaignDraftW9UploadParams, FinalizeCampaignDraftW9UploadResponse,
  PublishCampaignDraftBody, PublishCampaignDraftParams, PublishCampaignDraftResponse,
  RequestCampaignDraftW9UploadBody, RequestCampaignDraftW9UploadParams,
  RequestCampaignDraftW9UploadResponse,
} from "@workspace/api-zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { accessTokenMatches, createAccessToken, hashAccessToken, readAccessToken, setAccessCookie } from "../lib/accessControl.ts";
import { createImageUploadURL, objectPathFromUploadUrl, verifyUploadIntentObject } from "../lib/objectStorage.ts";
import { hashUploadCapability, toPublicUploadIntent, uploadCapabilityMatches } from "../lib/uploadIntents.ts";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation.ts";

const router: IRouter = Router();
const DRAFT_TTL = 24 * 60 * 60 * 1000;
const LIVE_TTL = 60 * 24 * 60 * 60 * 1000;

async function ownerDraft(req: Request, campaignId: string) {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)).limit(1);
  const token = readAccessToken(req, "campaign", campaignId);
  return token && campaign && campaign.lifecycleStatus === "draft" &&
    accessTokenMatches(campaign.ownerAccessTokenHash, token) ? { campaign, token } : null;
}

router.post("/campaign-drafts", async (req, res): Promise<void> => {
  const parsed = CreateCampaignDraftBody.safeParse(req.body);
  if (!parsed.success || parsed.data.id.startsWith("demo") || !isSafeCampaignPresentation(parsed.data.presentation)) {
    res.status(400).json({ error: "Invalid campaign draft" }); return;
  }
  const input = parsed.data;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL);
  const w9Required = input.pricesCents.reduce((total, value) => total + value, 0) >= 200000;
  const token = createAccessToken();
  try {
    await db.insert(campaignsTable).values({
      ...input, ownerAccessTokenHash: hashAccessToken(token), ownerAssentAt: now, ownerAssentIp: req.ip,
      ownerTermsVersion: input.ownerAssent.termsVersion, ownerContentVersion: input.ownerAssent.contentVersion,
      ownerCheckinVersion: input.ownerAssent.checkinVersion, active: false, lifecycleStatus: "draft",
      publishedAt: null, expiresAt, w9Required, w9Status: w9Required ? "required" : "not_required",
    });
  } catch {
    res.status(409).json({ error: "Campaign ID already exists" }); return;
  }
  setAccessCookie(res, "campaign", input.id, token);
  res.status(201).json(CreateCampaignDraftResponse.parse({ id: input.id, status: "draft", expiresAt, w9Required }));
});

router.post("/campaign-drafts/:campaignId/w9/request-url", async (req, res): Promise<void> => {
  const params = RequestCampaignDraftW9UploadParams.safeParse(req.params);
  const body = RequestCampaignDraftW9UploadBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid W-9 metadata" }); return; }
  const owner = await ownerDraft(req, params.data.campaignId);
  if (!owner) { res.status(404).json({ error: "Campaign draft not found" }); return; }
  if (!owner.campaign.w9Required || !owner.campaign.expiresAt || owner.campaign.expiresAt <= new Date()) {
    res.status(400).json({ error: "Draft is not eligible for W-9 upload" }); return;
  }
  const uploadURL = await createImageUploadURL();
  const objectPath = objectPathFromUploadUrl(uploadURL);
  const expiresAt = new Date(Math.min(owner.campaign.expiresAt.getTime(), Date.now() + 15 * 60 * 1000));
  const [intent] = await db.insert(uploadIntentsTable).values({
    id: randomUUID(), capabilityDigest: hashUploadCapability(owner.token), purpose: "campaign_draft_w9",
    actorType: "campaign_owner", actorId: owner.campaign.id, resourceType: "campaign_draft",
    resourceId: owner.campaign.id, campaignId: owner.campaign.id, objectPath,
    expectedMimeType: body.data.contentType, expectedSizeBytes: body.data.size,
    expectedFileName: body.data.name, expiresAt,
  }).returning();
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(RequestCampaignDraftW9UploadResponse.parse({
    ...toPublicUploadIntent(intent as Parameters<typeof toPublicUploadIntent>[0]), uploadURL,
  }));
});

router.post("/campaign-drafts/:campaignId/w9/:intentId/finalize", async (req, res): Promise<void> => {
  const params = FinalizeCampaignDraftW9UploadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid upload intent" }); return; }
  const owner = await ownerDraft(req, params.data.campaignId);
  if (!owner) { res.status(404).json({ error: "Campaign draft not found" }); return; }
  const [intent] = await db.select().from(uploadIntentsTable).where(eq(uploadIntentsTable.id, params.data.intentId)).limit(1);
  if (!intent || intent.purpose !== "campaign_draft_w9" || intent.campaignId !== owner.campaign.id ||
      !uploadCapabilityMatches(intent.capabilityDigest, owner.token)) { res.status(404).json({ error: "Upload intent not found" }); return; }
  const now = new Date();
  if (intent.status !== "issued" || intent.expiresAt <= now) { res.status(409).json({ error: "Upload intent is expired or already used" }); return; }
  if (!(await verifyUploadIntentObject(intent.objectPath, intent.expectedMimeType, intent.expectedSizeBytes))) {
    res.status(400).json({ error: "Uploaded W-9 does not match expected metadata" }); return;
  }
  const finalized = await db.update(uploadIntentsTable).set({ status: "finalized", statusVersion: intent.statusVersion + 1, finalizedAt: now })
    .where(and(eq(uploadIntentsTable.id, intent.id), eq(uploadIntentsTable.status, "issued"), eq(uploadIntentsTable.statusVersion, intent.statusVersion), gt(uploadIntentsTable.expiresAt, now))).returning();
  if (!finalized.length) { res.status(409).json({ error: "Upload intent was already used" }); return; }
  res.json(FinalizeCampaignDraftW9UploadResponse.parse(
    toPublicUploadIntent(finalized[0] as Parameters<typeof toPublicUploadIntent>[0]),
  ));
});

router.post("/campaign-drafts/:campaignId/publish", async (req, res): Promise<void> => {
  const params = PublishCampaignDraftParams.safeParse(req.params);
  const body = PublishCampaignDraftBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid publication request" }); return; }
  const owner = await ownerDraft(req, params.data.campaignId);
  const now = new Date();
  if (!owner) { res.status(404).json({ error: "Campaign draft not found" }); return; }
  if (!owner.campaign.expiresAt || owner.campaign.expiresAt <= now) { res.status(409).json({ error: "Campaign draft expired" }); return; }
  const social = typeof owner.campaign.presentation.social === "string" ? owner.campaign.presentation.social.trim() : "";
  if (owner.campaign.w9Required && (!social || !body.data.w9IntentId)) {
    res.status(400).json({ error: "High-value listings require social context and a finalized W-9." }); return;
  }
  const published = await db.transaction(async (tx) => {
    let w9ObjectPath: string | null = null;
    if (owner.campaign.w9Required) {
      const consumed = await tx.update(uploadIntentsTable).set({ status: "consumed", statusVersion: sql`${uploadIntentsTable.statusVersion} + 1`, consumedAt: now })
        .where(and(eq(uploadIntentsTable.id, body.data.w9IntentId!), eq(uploadIntentsTable.campaignId, owner.campaign.id),
          eq(uploadIntentsTable.purpose, "campaign_draft_w9"), eq(uploadIntentsTable.actorType, "campaign_owner"),
          eq(uploadIntentsTable.actorId, owner.campaign.id), eq(uploadIntentsTable.resourceType, "campaign_draft"),
          eq(uploadIntentsTable.resourceId, owner.campaign.id), eq(uploadIntentsTable.status, "finalized"),
          gt(uploadIntentsTable.expiresAt, now))).returning();
      if (!consumed.length || !uploadCapabilityMatches(consumed[0].capabilityDigest, owner.token)) throw new Error("invalid_w9");
      w9ObjectPath = consumed[0].objectPath;
    }
    const rows = await tx.update(campaignsTable).set({
      active: true, lifecycleStatus: "live", publishedAt: now, expiresAt: new Date(now.getTime() + LIVE_TTL),
      w9Status: owner.campaign.w9Required ? "submitted" : "not_required", w9ObjectPath,
      w9SubmittedAt: w9ObjectPath ? now : null, updatedAt: now,
    }).where(and(eq(campaignsTable.id, owner.campaign.id), eq(campaignsTable.lifecycleStatus, "draft"))).returning();
    if (!rows.length) throw new Error("invalid_draft");
    return rows[0];
  }).catch((error) => {
    if (error instanceof Error && ["invalid_w9", "invalid_draft"].includes(error.message)) return null;
    throw error;
  });
  if (!published) { res.status(409).json({ error: "Draft or W-9 intent is no longer valid" }); return; }
  const { ownerEmail: _email, ownerAccessTokenHash: _hash, ...safe } = published;
  res.json(PublishCampaignDraftResponse.parse({ ...safe, claims: [], relistEligible: false }));
});

export default router;