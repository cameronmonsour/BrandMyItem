import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { finalizeCheckoutSession, sendReservationConfirmationForOrder } from "./commerce.ts";
import { logger } from "../lib/logger.ts";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: { id?: string } };
};

type StripeWebhookDependencies = {
  claimEvent: (
    eventId: string,
    eventType: string,
    objectId: string | null,
  ) => Promise<boolean>;
  processCheckoutSession: (sessionId: string) => Promise<void>;
  markProcessed: (eventId: string) => Promise<void>;
  markFailed: (eventId: string, error: unknown) => Promise<void>;
};

export function signatureIsValid(payload: Buffer, signature: string, secret: string): boolean {
  const parts = new Map(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value] as const;
    }),
  );
  const timestamp = parts.get("t");
  const expected = parts.get("v1");
  if (!timestamp || !expected) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const actualBuffer = Buffer.from(expected, "utf8");
  const digestBuffer = Buffer.from(digest, "utf8");
  return actualBuffer.length === digestBuffer.length &&
    timingSafeEqual(actualBuffer, digestBuffer);
}

const defaultDependencies: StripeWebhookDependencies = {
  async claimEvent(eventId, eventType, objectId) {
    const result = await pool.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, object_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType, objectId],
    );
    return result.rowCount === 1;
  },
  async processCheckoutSession(sessionId) {
    const order = await finalizeCheckoutSession(sessionId);
    if (!["reserved", "funded"].includes(order.status)) return;
    const delivery = await sendReservationConfirmationForOrder(order.id);
    logger.info(
      { orderId: order.id, emailSent: delivery.sent },
      "Stripe Checkout reservation finalized",
    );
  },
  async markProcessed(eventId) {
    await pool.query(
      `UPDATE stripe_webhook_events
       SET status = 'processed', processed_at = now(), error = NULL
       WHERE event_id = $1`,
      [eventId],
    );
  },
  async markFailed(eventId, error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await pool.query(
      `UPDATE stripe_webhook_events
       SET status = 'failed', processed_at = now(), error = $2
       WHERE event_id = $1`,
      [eventId, message.slice(0, 1000)],
    );
  },
};

export function createStripeWebhookHandler(
  dependencies: StripeWebhookDependencies,
) {
  return async function stripeWebhookHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}));
    const signatureHeader = req.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (
      !webhookSecret ||
      !signatureHeader ||
      !signatureIsValid(payload, signatureHeader, webhookSecret)
    ) {
      res.status(400).json({ error: "Invalid Stripe webhook signature" });
      return;
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(payload.toString("utf8")) as StripeEvent;
    } catch {
      res.status(400).json({ error: "Invalid Stripe webhook payload" });
      return;
    }
    if (!event.id || !event.type) {
      res.status(400).json({ error: "Stripe webhook event identity is missing" });
      return;
    }
    const objectId = event.data?.object?.id ?? null;

    let claimed: boolean;
    try {
      claimed = await dependencies.claimEvent(event.id, event.type, objectId);
    } catch (error) {
      logger.error({ err: error, stripeEventId: event.id }, "Stripe webhook event claim failed");
      res.status(500).json({ error: "Stripe webhook could not be accepted" });
      return;
    }

    if (!claimed) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    if (event.type !== "checkout.session.completed") {
      await dependencies.markProcessed(event.id);
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    if (!objectId) {
      await dependencies.markFailed(event.id, new Error("Stripe Checkout session is missing"));
      res.status(400).json({ error: "Stripe webhook session is missing" });
      return;
    }

    res.status(200).json({ received: true });
    setImmediate(() => {
      void dependencies.processCheckoutSession(objectId)
        .then(() => dependencies.markProcessed(event.id!))
        .catch(async (error) => {
          logger.error(
            { err: error, sessionId: objectId, stripeEventId: event.id },
            "Stripe Checkout webhook background finalization failed",
          );
          try {
            await dependencies.markFailed(event.id!, error);
          } catch (markError) {
            logger.error(
              { err: markError, stripeEventId: event.id },
              "Stripe webhook failure status could not be recorded",
            );
          }
        });
    });
  };
}

export const stripeWebhook = createStripeWebhookHandler(defaultDependencies);