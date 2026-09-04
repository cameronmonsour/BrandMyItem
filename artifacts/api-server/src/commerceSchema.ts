import { pool } from "@workspace/db";

export async function ensureCommerceSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE placement_orders
      ADD COLUMN IF NOT EXISTS stripe_checkout_idempotency_key text,
      ADD COLUMN IF NOT EXISTS checkout_access_token_hash text,
      ADD COLUMN IF NOT EXISTS stripe_refund_id text,
      ADD COLUMN IF NOT EXISTS stripe_refund_status text,
      ADD COLUMN IF NOT EXISTS logo_object_path text;
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS presentation jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS owner_access_token_hash text
  `);
}