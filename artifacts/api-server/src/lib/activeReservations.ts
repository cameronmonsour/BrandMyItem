import { placementOrdersTable, db } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

export const ACTIVE_RESERVATION_STATUSES = [
  "reserved",
  "funding",
  "payment_failed",
  "funded",
] as const;

const activeStatusCondition = inArray(
  placementOrdersTable.status,
  [...ACTIVE_RESERVATION_STATUSES],
);

export function readActiveReservationsForCampaigns(campaignIds: string[]) {
  if (!campaignIds.length) return Promise.resolve([]);
  return db
    .select()
    .from(placementOrdersTable)
    .where(
      and(
        inArray(placementOrdersTable.campaignId, campaignIds),
        activeStatusCondition,
      ),
    );
}

export function readActiveReservationsForSpot(
  campaignId: string,
  spotIndex: number,
) {
  return db
    .select()
    .from(placementOrdersTable)
    .where(
      and(
        eq(placementOrdersTable.campaignId, campaignId),
        eq(placementOrdersTable.spotIndex, spotIndex),
        activeStatusCondition,
      ),
    )
    .limit(1);
}

export function readActiveReservationsForEmail(email: string) {
  return db
    .select()
    .from(placementOrdersTable)
    .where(
      and(
        sql`lower(${placementOrdersTable.email}) = ${email}`,
        activeStatusCondition,
      ),
    );
}