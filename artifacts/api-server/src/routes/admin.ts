import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  campaignsTable,
  db,
  placementOrdersTable,
} from "@workspace/db";
import {
  consumeAdminMagicLink,
  issueAdminMagicLink,
  readAdminIdentity,
} from "../lib/adminAuth.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { runLifecycleSweeps } from "../paymentReconciliation.ts";

const router: IRouter = Router();

async function requireAdmin(req: import("express").Request, res: import("express").Response): Promise<string | null> {
  const email = await readAdminIdentity(req);
  if (!email) {
    res.status(401).json({ error: "Admin authentication required" });
    return null;
  }
  return email;
}

router.post("/admin/auth/request", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  try {
    const result = await issueAdminMagicLink(email);
    res.status(202).json({
      accepted: result.accepted,
      message: "If that address is configured for admin access, a one-time login link is on its way.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to send admin magic link");
    res.status(502).json({ error: "Admin login email is unavailable" });
  }
});

router.get("/admin/auth/consume", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const email = await consumeAdminMagicLink(req, res, token);
  if (!email) {
    res.status(401).json({ error: "This admin link is invalid, expired, or already used." });
    return;
  }
  res.json({ authenticated: true, email });
});

router.get("/admin/auth/session", async (req, res): Promise<void> => {
  const email = await readAdminIdentity(req);
  res.json({ authenticated: Boolean(email), email });
});

router.post("/admin/run-sweeps", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const nowInput = typeof req.body?.now === "string" ? req.body.now : "";
  const now = new Date(nowInput);
  if (!nowInput || Number.isNaN(now.getTime())) {
    res.status(400).json({ error: "now must be a valid ISO timestamp" });
    return;
  }
  const report = await runLifecycleSweeps(now);
  res.json({ now: now.toISOString(), ...report });
});

router.post("/admin/auth/logout", async (req, res): Promise<void> => {
  res.clearCookie("bmi_admin_session", { httpOnly: true, sameSite: "lax", path: "/" });
  res.status(204).end();
});

router.get("/admin/campaigns", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;
  const campaigns = await db.select().from(campaignsTable).where(
    inArray(campaignsTable.lifecycleStatus, ["funded", "ordered", "branded", "shipped", "active", "complete"]),
  );
  const result = [];
  for (const campaign of campaigns) {
    const orders = await db.select().from(placementOrdersTable).where(
      and(eq(placementOrdersTable.campaignId, campaign.id), eq(placementOrdersTable.status, "funded")),
    );
    result.push({
      id: campaign.id,
      title: campaign.title,
      itemType: campaign.itemType,
      ownerName: campaign.ownerName,
      ownerEmail: campaign.ownerEmail,
      lifecycleStatus: campaign.lifecycleStatus,
      carrier: campaign.carrier,
      trackingNumber: campaign.trackingNumber,
      shipmentStatus: campaign.shipmentStatus,
      deliveredAt: campaign.deliveredAt,
      checkinDueAt: campaign.checkinDueAt,
      orders: orders.map((order) => ({
        id: order.id,
        reservationId: `BMI-${order.id.toUpperCase().slice(0, 6)}`,
        spotIndex: order.spotIndex,
        brandName: order.brandName,
        email: order.email,
        amountCents: order.amountCents,
        proofStatus: order.proofStatus,
        proofSentAt: order.proofSentAt,
        proofApprovedAt: order.proofApprovedAt,
      })),
    });
  }
  res.json({ campaigns: result });
});

router.patch("/admin/campaigns/:campaignId/orders/:orderId", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { campaignId, orderId } = req.params;
  const [order] = await db.select().from(placementOrdersTable).where(and(
    eq(placementOrdersTable.id, orderId),
    eq(placementOrdersTable.campaignId, campaignId),
    eq(placementOrdersTable.status, "funded"),
  )).limit(1);
  if (!order) {
    res.status(404).json({ error: "Funded placement not found" });
    return;
  }
  const now = new Date();
  const proofSent = typeof req.body?.proofSent === "boolean" ? req.body.proofSent : undefined;
  const proofApproved = typeof req.body?.proofApproved === "boolean" ? req.body.proofApproved : undefined;
  const patch: Record<string, unknown> = { updatedAt: now };
  if (proofSent !== undefined) {
    patch.proofStatus = proofSent ? (proofApproved ? "approved" : "submitted") : "not_required";
    patch.proofSentAt = proofSent ? (order.proofSentAt ?? now) : null;
  }
  if (proofApproved !== undefined) {
    patch.proofStatus = proofApproved ? "approved" : (proofSent === false ? "not_required" : "submitted");
    patch.proofApprovedAt = proofApproved ? (order.proofApprovedAt ?? now) : null;
  }
  const [updated] = await db.update(placementOrdersTable).set(patch).where(eq(placementOrdersTable.id, order.id)).returning();
  await recordAuditEvent({
    actorType: "operator",
    actorId: admin,
    action: "admin_placement_updated",
    entityType: "placement_order",
    entityId: order.id,
    requestIp: req.ip,
    metadata: { proofSent, proofApproved },
  });
  res.json({ order: updated });
});

router.patch("/admin/campaigns/:campaignId/fulfillment", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const campaignId = String(req.params.campaignId);
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)).limit(1);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (typeof req.body?.carrier === "string") patch.carrier = req.body.carrier.trim() || null;
  if (typeof req.body?.trackingNumber === "string") patch.trackingNumber = req.body.trackingNumber.trim() || null;
  if (req.body?.delivered === true) {
    patch.shipmentStatus = "delivered";
    patch.lifecycleStatus = "active";
    patch.deliveredAt = campaign.deliveredAt ?? now;
    patch.checkinDueAt = campaign.checkinDueAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    patch.checkinStatus = campaign.checkinStatus === "not_due" ? "due" : campaign.checkinStatus;
  }
  const [updated] = await db.update(campaignsTable).set(patch).where(eq(campaignsTable.id, campaignId)).returning();
  await recordAuditEvent({
    actorType: "operator",
    actorId: admin,
    action: req.body?.delivered === true ? "admin_delivery_recorded" : "admin_fulfillment_updated",
    entityType: "campaign",
    entityId: campaignId,
    requestIp: req.ip,
  });
  res.json({ campaign: updated });
});

export default router;