import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
// @ts-expect-error TS5097: source-level Node tests need the extension.
import { campaignsTable } from "./campaigns.ts";

/**
 * A capability-backed, one-time authorization to upload a specific object.
 * The capability itself is deliberately not stored; only its SHA-256 digest is.
 */
export const uploadIntentsTable = pgTable(
  "upload_intents",
  {
    id: text("id").primaryKey(),
    capabilityDigest: text("capability_digest").notNull(),
    purpose: text("purpose").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    campaignId: text("campaign_id").references(() => campaignsTable.id),
    placementOrderId: text("placement_order_id"),
    spotIndex: integer("spot_index"),
    objectPath: text("object_path").notNull(),
    expectedMimeType: text("expected_mime_type").notNull(),
    expectedSizeBytes: integer("expected_size_bytes").notNull(),
    expectedFileName: text("expected_file_name").notNull(),
    status: text("status").notNull().default("issued"),
    statusVersion: integer("status_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("upload_intents_capability_digest_unique").on(table.capabilityDigest),
    index("upload_intents_lookup_idx").on(
      table.actorType,
      table.actorId,
      table.purpose,
      table.status,
      table.expiresAt,
    ),
    index("upload_intents_resource_lookup_idx").on(
      table.resourceType,
      table.resourceId,
      table.purpose,
    ),
    index("upload_intents_campaign_placement_idx").on(
      table.campaignId,
      table.placementOrderId,
      table.spotIndex,
    ),
    index("upload_intents_expiry_idx").on(table.expiresAt),
    index("upload_intents_consumed_idx").on(table.consumedAt),
  ],
);

export type UploadIntent = typeof uploadIntentsTable.$inferSelect;
export type NewUploadIntent = typeof uploadIntentsTable.$inferInsert;