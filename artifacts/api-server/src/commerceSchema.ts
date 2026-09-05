import { pool } from "@workspace/db";

export async function ensureCommerceSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE placement_orders
      ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS stripe_checkout_idempotency_key text,
      ADD COLUMN IF NOT EXISTS checkout_access_token_hash text,
      ADD COLUMN IF NOT EXISTS stripe_refund_id text,
      ADD COLUMN IF NOT EXISTS stripe_refund_status text,
      ADD COLUMN IF NOT EXISTS logo_object_path text,
      ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS confirmation_email_message_id text,
      ADD COLUMN IF NOT EXISTS funding_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS funding_email_message_id text,
      ADD COLUMN IF NOT EXISTS funding_email_state text,
      ADD COLUMN IF NOT EXISTS payment_decline_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_decline_email_message_id text,
      ADD COLUMN IF NOT EXISTS payment_reopened_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS release_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS release_email_message_id text,
      ADD COLUMN IF NOT EXISTS payment_reopened_email_message_id text;
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS presentation jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS owner_access_token_hash text,
      ADD COLUMN IF NOT EXISTS shipping_recipient_name text,
      ADD COLUMN IF NOT EXISTS shipping_line1 text,
      ADD COLUMN IF NOT EXISTS shipping_line2 text,
      ADD COLUMN IF NOT EXISTS shipping_city text,
      ADD COLUMN IF NOT EXISTS shipping_state text,
      ADD COLUMN IF NOT EXISTS shipping_postal_code text,
      ADD COLUMN IF NOT EXISTS shipping_country text,
      ADD COLUMN IF NOT EXISTS shipping_validated_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_status text NOT NULL DEFAULT 'not_submitted',
      ADD COLUMN IF NOT EXISTS proof_revision integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS proof_object_path text,
      ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_approved_by text,
      ADD COLUMN IF NOT EXISTS carrier text,
      ADD COLUMN IF NOT EXISTS tracking_number text,
      ADD COLUMN IF NOT EXISTS shipment_status text NOT NULL DEFAULT 'not_shipped',
      ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
      ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_due_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_reminder_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_pre_due_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_due_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_missed_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS checkin_status text NOT NULL DEFAULT 'not_started',
      ADD COLUMN IF NOT EXISTS consecutive_missed_checkins integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS owner_restricted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS make_good_selection text,
      ADD COLUMN IF NOT EXISTS make_good_selected_at timestamptz,
      ADD COLUMN IF NOT EXISTS make_good_status text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS make_good_source text,
      ADD COLUMN IF NOT EXISTS make_good_note text,
      ADD COLUMN IF NOT EXISTS make_good_police_report_object_path text,
      ADD COLUMN IF NOT EXISTS make_good_flagged_at timestamptz,
      ADD COLUMN IF NOT EXISTS make_good_admin_confirmed_at timestamptz,
      ADD COLUMN IF NOT EXISTS make_good_admin_confirmed_by text,
      ADD COLUMN IF NOT EXISTS make_good_refunded_at timestamptz,
      ADD COLUMN IF NOT EXISTS restriction_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_auto_approved_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS expired_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS funded_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS funded_email_message_id text,
      ADD COLUMN IF NOT EXISTS reopened_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS reopened_email_message_id text;
    ALTER TABLE placement_orders
      ADD COLUMN IF NOT EXISTS proof_status text NOT NULL DEFAULT 'not_required',
      ADD COLUMN IF NOT EXISTS proof_revision integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS proof_object_path text,
      ADD COLUMN IF NOT EXISTS proof_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS proof_applied_at timestamptz;
    CREATE TABLE IF NOT EXISTS campaign_checkins (
      id text PRIMARY KEY, campaign_id text NOT NULL REFERENCES campaigns(id),
      submitted_by text NOT NULL, note text, photo_object_path text,
      submitted_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS campaign_checkins_campaign_submitted_idx ON campaign_checkins (campaign_id, submitted_at);
    CREATE TABLE IF NOT EXISTS audit_events (
      id text PRIMARY KEY, actor_type text NOT NULL, actor_id text, action text NOT NULL,
      entity_type text NOT NULL, entity_id text NOT NULL, request_ip text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_events_entity_created_idx ON audit_events (entity_type, entity_id, created_at);
    CREATE TABLE IF NOT EXISTS tracking_magic_links (
      token_hash text PRIMARY KEY,
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tracking_magic_links_expires_at_idx
      ON tracking_magic_links (expires_at);
    CREATE TABLE IF NOT EXISTS tracking_magic_link_requests (
      id text PRIMARY KEY,
      normalized_email text NOT NULL,
      requested_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tracking_magic_link_requests_email_requested_idx
      ON tracking_magic_link_requests (normalized_email, requested_at);
    CREATE TABLE IF NOT EXISTS update_card_capabilities (
      token_hash text PRIMARY KEY,
      placement_order_id text NOT NULL REFERENCES placement_orders(id),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS update_card_capabilities_order_idx
      ON update_card_capabilities (placement_order_id);
    CREATE INDEX IF NOT EXISTS update_card_capabilities_expires_idx
      ON update_card_capabilities (expires_at);
    CREATE TABLE IF NOT EXISTS admin_magic_links (
      token_hash text PRIMARY KEY,
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_magic_links_expires_idx
      ON admin_magic_links (expires_at);
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash text PRIMARY KEY,
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx
      ON admin_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS upload_intents (
      id text PRIMARY KEY,
      capability_digest text NOT NULL,
      purpose text NOT NULL,
      actor_type text NOT NULL,
      actor_id text NOT NULL,
      resource_type text NOT NULL,
      resource_id text NOT NULL,
      campaign_id text REFERENCES campaigns(id),
      placement_order_id text,
      spot_index integer,
      object_path text NOT NULL,
      expected_mime_type text NOT NULL,
      expected_size_bytes integer NOT NULL,
      expected_file_name text NOT NULL,
      status text NOT NULL DEFAULT 'issued',
      status_version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      finalized_at timestamptz,
      consumed_at timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS upload_intents_capability_digest_unique
      ON upload_intents (capability_digest);
    CREATE INDEX IF NOT EXISTS upload_intents_lookup_idx
      ON upload_intents (actor_type, actor_id, purpose, status, expires_at);
    CREATE INDEX IF NOT EXISTS upload_intents_resource_lookup_idx
      ON upload_intents (resource_type, resource_id, purpose);
    CREATE INDEX IF NOT EXISTS upload_intents_campaign_placement_idx
      ON upload_intents (campaign_id, placement_order_id, spot_index);
    CREATE INDEX IF NOT EXISTS upload_intents_expiry_idx ON upload_intents (expires_at);
    CREATE INDEX IF NOT EXISTS upload_intents_consumed_idx ON upload_intents (consumed_at)
  `);
}