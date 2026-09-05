import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { finalizeCheckoutSession, sendReservationConfirmationForOrder } from "./commerce.ts";
import { logger } from "../lib/logger.ts";

type StripeEvent = {
  type?: string;
  data?: { object?: { id?: string } };
};

function signatureIsValid(payload: Buffer, signature: string, secret: string): boolean {
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

export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const payload = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}));
  const signatureHeader = req.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    if (!signatureHeader || !signatureIsValid(payload, signatureHeader, webhookSecret)) {
      res.status(400).json({ error: "Invalid Stripe webhook signature" });
      return;
    }
  } else {
    logger.warn("STRIPE_WEBHOOK_SECRET is not configured; Stripe session state will be revalidated before mutation");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload.toString("utf8")) as StripeEvent;
  } catch {
    res.status(400).json({ error: "Invalid Stripe webhook payload" });
    return;
  }
  if (event.type !== "checkout.session.completed") {
    res.json({ received: true, ignored: true });
    return;
  }
  const sessionId = event.data?.object?.id;
  if (!sessionId) {
    res.status(400).json({ error: "Stripe webhook session is missing" });
    return;
  }

  try {
    const order = await finalizeCheckoutSession(sessionId);
    let emailSent = false;
    if (["reserved", "funded"].includes(order.status)) {
      try {
        const delivery = await sendReservationConfirmationForOrder(order.id);
        emailSent = delivery.sent;
      } catch (error) {
        logger.warn({ err: error, orderId: order.id }, "Stripe Checkout reservation finalized but confirmation email failed");
      }
    }
    res.json({ received: true, orderId: order.id, status: order.status, emailSent });
  } catch (error) {
    logger.error({ err: error, sessionId }, "Stripe Checkout webhook finalization failed");
    res.status(500).json({ error: "Stripe Checkout webhook could not be finalized" });
  }
}