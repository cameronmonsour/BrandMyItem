import app from "./app.ts";
import { ensureCommerceSchema } from "./commerceSchema.ts";
import { logger } from "./lib/logger.ts";
import { publicBaseUrl } from "./lib/publicBaseUrl.ts";
import { startPaymentReconciliation } from "./paymentReconciliation.ts";
import { getConfiguredStripeDiagnostics } from "./stripeClient.ts";
import {
  cleanupTestRecords,
  TEST_RECORD_DELETE_CAP,
} from "./testRecordCleanup.ts";

const REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "ADMIN_EMAIL",
  "SESSION_SECRET",
  "DATABASE_URL",
  "PUBLIC_BASE_URL",
] as const;

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
  const environmentPresence = Object.fromEntries(
    REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES.map((name) => [
      name,
      Boolean(process.env[name]?.trim()),
    ]),
  );
  logger.info(
    { environmentPresence },
    "Required production environment variable presence",
  );

  const missing = REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES.filter(
    (name) => !environmentPresence[name],
  );
  if (process.env.NODE_ENV === "production" && missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }

  const stripe = getConfiguredStripeDiagnostics();
  logger.info({ stripeMode: stripe.mode }, "Stripe configuration mode");
  const configuredPublicBaseUrl = environmentPresence.PUBLIC_BASE_URL
    ? publicBaseUrl()
    : null;
  if (
    stripe.mode === "test" &&
    configuredPublicBaseUrl === "https://brandmyitem.com"
  ) {
    logger.warn(
      { stripeMode: stripe.mode, publicBaseUrl: "https://brandmyitem.com" },
      "Production domain is configured with Stripe test-mode credentials",
    );
  }
  await ensureCommerceSchema();
  if (process.env.NODE_ENV === "production") {
    const cleanup = await cleanupTestRecords({
      maxDeletions: TEST_RECORD_DELETE_CAP,
      olderThanMs: 0,
    });
    logger.info(
      {
        candidateCount: cleanup.candidates.length,
        deletedCount: cleanup.deleted.length,
        aborted: cleanup.aborted,
      },
      "Startup test-record cleanup summary",
    );
  }
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
