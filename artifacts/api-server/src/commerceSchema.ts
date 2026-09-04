import { pool } from "@workspace/db";

export async function ensureCommerceSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE placement_orders
      ADD COLUMN IF NOT EXISTS stripe_checkout_idempotency_key text,
      ADD COLUMN IF NOT EXISTS stripe_refund_id text,
      ADD COLUMN IF NOT EXISTS stripe_refund_status text
  `);
}