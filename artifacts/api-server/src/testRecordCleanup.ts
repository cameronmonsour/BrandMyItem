import {
  campaignsTable,
  campaignCheckinsTable,
  db,
  placementOrdersTable,
  updateCardCapabilitiesTable,
  sponsorReservationDraftsTable,
  uploadIntentsTable,
} from "@workspace/db";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { logger } from "./lib/logger.ts";

export const TEST_RECORD_DELETE_CAP = 20;
const DEFAULT_TEST_RECORD_AGE_MS = 60 * 60 * 1000;

export type TestRecordCleanupOptions = {
  dryRun?: boolean;
  maxDeletions?: number;
  now?: Date;
  olderThanMs?: number;
};

export type TestRecordCleanupResult = {
  dryRun: boolean;
  cutoff: string;
  candidates: Array<{ entity: "campaign" | "placement_order"; id: string; reason: string }>;
  deleted: Array<{ entity: "campaign" | "placement_order"; id: string; reason: string }>;
  aborted: boolean;
};

/**
 * Delete only explicitly flagged test records. This is intentionally separate
 * from lifecycle reconciliation so a test cleanup can never infer that a
 * production-looking record is disposable from its name or email address.
 */
export async function cleanupTestRecords(
  options: TestRecordCleanupOptions = {},
): Promise<TestRecordCleanupResult> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.olderThanMs ?? DEFAULT_TEST_RECORD_AGE_MS));
  const maxDeletions = options.maxDeletions ?? TEST_RECORD_DELETE_CAP;
  if (!Number.isInteger(maxDeletions) || maxDeletions < 1 || maxDeletions > TEST_RECORD_DELETE_CAP) {
    throw new Error(`maxDeletions must be between 1 and ${TEST_RECORD_DELETE_CAP}`);
  }

  const [campaigns, orders] = await Promise.all([
    db.select({ id: campaignsTable.id, createdAt: campaignsTable.createdAt })
      .from(campaignsTable)
      .where(and(eq(campaignsTable.test, true), lt(campaignsTable.createdAt, cutoff))),
    db.select({ id: placementOrdersTable.id, campaignId: placementOrdersTable.campaignId, createdAt: placementOrdersTable.createdAt })
      .from(placementOrdersTable)
      .where(and(eq(placementOrdersTable.test, true), lt(placementOrdersTable.createdAt, cutoff))),
  ]);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const campaignOrders = campaignIds.length
    ? await db.select({ campaignId: placementOrdersTable.campaignId, test: placementOrdersTable.test })
      .from(placementOrdersTable)
      .where(inArray(placementOrdersTable.campaignId, campaignIds))
    : [];
  const deletableCampaigns = campaigns.filter((campaign) =>
    !campaignOrders.some((order) => order.campaignId === campaign.id && !order.test),
  );
  const deletableCampaignIds = new Set(deletableCampaigns.map((campaign) => campaign.id));
  const deletableOrders = orders;
  const candidates = [
    ...deletableOrders.map(({ id, campaignId }) => ({
      entity: "placement_order" as const,
      id,
      reason: `test reservation older than cleanup cutoff${deletableCampaignIds.has(campaignId) ? " with test campaign" : ""}`,
    })),
    ...deletableCampaigns.map(({ id }) => ({
      entity: "campaign" as const,
      id,
      reason: "test campaign older than cleanup cutoff",
    })),
  ];

  if (candidates.length > maxDeletions) {
    logger.error(
      { candidateCount: candidates.length, maxDeletions, cutoff: cutoff.toISOString() },
      "Test-record cleanup aborted above deletion cap",
    );
    return { dryRun: Boolean(options.dryRun), cutoff: cutoff.toISOString(), candidates, deleted: [], aborted: true };
  }

  if (options.dryRun) {
    logger.info({ candidates, cutoff: cutoff.toISOString() }, "Test-record cleanup dry run");
    return { dryRun: true, cutoff: cutoff.toISOString(), candidates, deleted: [], aborted: false };
  }

  const deleted = await db.transaction(async (tx) => {
    const deletedRows: TestRecordCleanupResult["deleted"] = [];
    for (const order of deletableOrders) {
      await tx.delete(updateCardCapabilitiesTable)
        .where(eq(updateCardCapabilitiesTable.placementOrderId, order.id));
      await tx.delete(uploadIntentsTable)
        .where(or(
          eq(uploadIntentsTable.placementOrderId, order.id),
          eq(uploadIntentsTable.resourceId, order.id),
        ));
      const result = await tx.delete(placementOrdersTable)
        .where(and(eq(placementOrdersTable.id, order.id), eq(placementOrdersTable.test, true)))
        .returning({ id: placementOrdersTable.id });
      if (result.length) {
        const entry = {
          entity: "placement_order" as const,
          id: order.id,
          reason: `test reservation older than cleanup cutoff${deletableCampaignIds.has(order.campaignId) ? " with test campaign" : ""}`,
        };
        deletedRows.push(entry);
        logger.info(entry, "Deleted test placement order");
      }
    }
    for (const campaign of deletableCampaigns) {
      await tx.delete(campaignCheckinsTable)
        .where(eq(campaignCheckinsTable.campaignId, campaign.id));
      await tx.delete(sponsorReservationDraftsTable)
        .where(eq(sponsorReservationDraftsTable.campaignId, campaign.id));
      await tx.delete(uploadIntentsTable)
        .where(eq(uploadIntentsTable.campaignId, campaign.id));
      const result = await tx.delete(campaignsTable)
        .where(and(eq(campaignsTable.id, campaign.id), eq(campaignsTable.test, true)))
        .returning({ id: campaignsTable.id });
      if (result.length) {
        const entry = { entity: "campaign" as const, id: campaign.id, reason: "test campaign older than cleanup cutoff" };
        deletedRows.push(entry);
        logger.info(entry, "Deleted test campaign");
      }
    }
    return deletedRows;
  });
  return { dryRun: false, cutoff: cutoff.toISOString(), candidates, deleted, aborted: false };
}