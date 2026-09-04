import {
  boolean,
  index,
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
  shippingRecipientName: text("shipping_recipient_name"),
  shippingLine1: text("shipping_line1"),
  shippingLine2: text("shipping_line2"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPostalCode: text("shipping_postal_code"),
  shippingCountry: text("shipping_country"),
  shippingValidatedAt: timestamp("shipping_validated_at", { withTimezone: true }),
  proofStatus: text("proof_status").notNull().default("not_submitted"),
  proofRevision: integer("proof_revision").notNull().default(0),
  proofObjectPath: text("proof_object_path"),
  proofSubmittedAt: timestamp("proof_submitted_at", { withTimezone: true }),
  proofApprovedAt: timestamp("proof_approved_at", { withTimezone: true }),
  proofApprovedBy: text("proof_approved_by"),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  shipmentStatus: text("shipment_status").notNull().default("not_shipped"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  checkinDueAt: timestamp("checkin_due_at", { withTimezone: true }),
  checkinReminderSentAt: timestamp("checkin_reminder_sent_at", { withTimezone: true }),
  checkinStatus: text("checkin_status").notNull().default("not_due"),
  makeGoodSelection: text("make_good_selection"),
  makeGoodSelectedAt: timestamp("make_good_selected_at", { withTimezone: true }),
  w9Required: boolean("w9_required").notNull().default(false),
  w9Status: text("w9_status").notNull().default("not_required"),
  w9ObjectPath: text("w9_object_path"),
  w9SubmittedAt: timestamp("w9_submitted_at", { withTimezone: true }),
  lifecycleStatus: text("lifecycle_status").notNull().default("live"),
  // Drafts deliberately have no publication timestamp.  This also makes
  // startup schema push compatible with rows created before draft support.
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  fundedAt: timestamp("funded_at", { withTimezone: true }),
  relistCount: integer("relist_count").notNull().default(0),
  relistedAt: timestamp("relisted_at", { withTimezone: true }),
  relistExpiresAt: timestamp("relist_expires_at", { withTimezone: true }),
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

export const campaignCheckinsTable = pgTable(
  "campaign_checkins",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignsTable.id),
    submittedBy: text("submitted_by").notNull(),
    note: text("note"),
    photoObjectPath: text("photo_object_path"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("campaign_checkins_campaign_submitted_idx").on(table.campaignId, table.submittedAt)],
);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestIp: text("request_ip"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

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
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    stripeSetupIntentId: text("stripe_setup_intent_id"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    chargedAt: timestamp("charged_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    paymentFailureAt: timestamp("payment_failure_at", { withTimezone: true }),
    paymentFailureExpiresAt: timestamp("payment_failure_expires_at", { withTimezone: true }),
    paymentRetryAt: timestamp("payment_retry_at", { withTimezone: true }),
    paymentAttempt: integer("payment_attempt").notNull().default(0),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    stripeRefundStatus: text("stripe_refund_status"),
    proofStatus: text("proof_status").notNull().default("not_required"),
    proofRevision: integer("proof_revision").notNull().default(0),
    proofObjectPath: text("proof_object_path"),
    proofSentAt: timestamp("proof_sent_at", { withTimezone: true }),
    proofApprovedAt: timestamp("proof_approved_at", { withTimezone: true }),
    proofAppliedAt: timestamp("proof_applied_at", { withTimezone: true }),
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

export const trackingMagicLinksTable = pgTable(
  "tracking_magic_links",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("tracking_magic_links_expires_at_idx").on(table.expiresAt)],
);

export const trackingMagicLinkRequestsTable = pgTable(
  "tracking_magic_link_requests",
  {
    id: text("id").primaryKey(),
    normalizedEmail: text("normalized_email").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tracking_magic_link_requests_email_requested_idx").on(table.normalizedEmail, table.requestedAt)],
);
