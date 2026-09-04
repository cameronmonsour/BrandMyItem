import app from "./app.ts";
import { ensureCommerceSchema } from "./commerceSchema.ts";
import { logger } from "./lib/logger.ts";
import { startPaymentReconciliation } from "./paymentReconciliation.ts";
import { getConfiguredStripeDiagnostics } from "./stripeClient.ts";
import { isResendConfigured } from "./emailDelivery.ts";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  const stripe = getConfiguredStripeDiagnostics();
  logger.info(
    `Stripe secret key: ${stripe.secretKeyPrefix}... source=process.env.STRIPE_SECRET_KEY`,
  );
  logger.info(
    `Stripe publishable key: ${stripe.publishableKeyPrefix}... source=process.env.STRIPE_PUBLISHABLE_KEY`,
  );
  logger.info(`Stripe mode: ${stripe.mode}`);
  logger.info(`Resend: ${isResendConfigured() ? "configured" : "missing"}`);
  await ensureCommerceSchema();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startPaymentReconciliation();
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
