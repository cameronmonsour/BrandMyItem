import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const campaignsTable = pgTable("campaigns", {
  id: text("id").primaryKey(),
  itemType: text("item_type").notNull(),
  title: text("title").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerEmail: text("owner_email"),
  ownerAccessTokenHash: text("owner_access_token_hash"),
  ownerAssentAt: timestamp("owner_assent_at", { withTimezone: true }),
  ownerAssentIp: text("owner_assent_ip"),
  ownerTermsVersion: text("owner_terms_version"),
  ownerContentVersion: text("owner_content_version"),
  ownerCheckinVersion: text("owner_checkin_version"),
  w9Required: boolean("w9_required").notNull().default(false),
  w9Status: text("w9_status").notNull().default("not_required"),
  w9ObjectPath: text("w9_object_path"),
  w9SubmittedAt: timestamp("w9_submitted_at", { withTimezone: true }),
  pricesCents: jsonb("prices_cents").$type<number[]>().notNull(),
  presentation: jsonb("presentation").$type<Record<string, unknown>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const placementOrdersTable = pgTable(
  "placement_orders",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignsTable.id),
    spotIndex: integer("spot_index").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    brandName: text("brand_name").notNull(),
    email: text("email").notNull(),
    destinationUrl: text("destination_url"),
    logoObjectPath: text("logo_object_path"),
    status: text("status").notNull().default("pending"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeCheckoutIdempotencyKey: text("stripe_checkout_idempotency_key"),
    checkoutAccessTokenHash: text("checkout_access_token_hash"),
    brandAssentAt: timestamp("brand_assent_at", { withTimezone: true }),
    brandAssentIp: text("brand_assent_ip"),
    brandTermsVersion: text("brand_terms_version"),
    brandContentVersion: text("brand_content_version"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    stripeRefundStatus: text("stripe_refund_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("placement_orders_campaign_spot_unique").on(
      table.campaignId,
      table.spotIndex,
    ),
    uniqueIndex("placement_orders_stripe_session_unique").on(
      table.stripeCheckoutSessionId,
    ),
  ],
);
