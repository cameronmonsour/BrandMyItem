import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// @ts-expect-error TS5097: source-level Node tests need the extension.
import { campaignsTable } from "./campaigns.ts";

/** A short-lived, capability-protected claim on an otherwise public spot. */
export const sponsorReservationDraftsTable = pgTable(
  "sponsor_reservation_drafts",
  {
    id: text("id").primaryKey(),
    capabilityDigest: text("capability_digest").notNull(),
    campaignId: text("campaign_id").notNull().references(() => campaignsTable.id),
    spotIndex: integer("spot_index").notNull(),
    status: text("status").notNull().default("issued"),
    statusVersion: integer("status_version").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sponsor_reservation_drafts_active_spot_unique")
      .on(table.campaignId, table.spotIndex)
      .where(sql`${table.status} = 'issued'`),
    index("sponsor_reservation_drafts_expiry_idx").on(table.expiresAt),
  ],
);