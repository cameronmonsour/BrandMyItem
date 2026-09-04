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
  pricesCents: jsonb("prices_cents").$type<number[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    status: text("status").notNull().default("pending"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
