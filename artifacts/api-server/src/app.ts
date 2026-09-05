import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes/index.ts";
import { logger } from "./lib/logger.ts";
import { rateLimit } from "./lib/rateLimit.ts";
import { stripeWebhook } from "./routes/stripeWebhook.ts";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  next();
});
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// These endpoints accept anonymous identifiers or bearer-like capability
// tokens and therefore need a tighter budget than normal public browsing.
app.use("/api/tracking", rateLimit("tracking", 30, 15 * 60 * 1000));
app.use("/api/tracking/magic-link", rateLimit("tracking-link", 5, 15 * 60 * 1000));
app.use("/api/campaign-drafts", rateLimit("campaign-drafts", 10, 15 * 60 * 1000));
// Count only new reservation attempts. Capability-protected upload, finalize,
// and release calls are part of one attempt and must not consume the budget.
app.post("/api/sponsor-reservation-drafts", rateLimit("sponsor-reservation-drafts", 10, 15 * 60 * 1000));
app.use("/api/operator/campaigns/:campaignId/placement-orders/:placementOrderId/proofs", rateLimit("operator-proof-uploads", 30, 15 * 60 * 1000));
app.use("/api/operator/campaigns/:campaignId/proofs", rateLimit("operator-proof-submissions", 30, 15 * 60 * 1000));
app.use("/api/campaigns/:campaignId/checkins/photo", rateLimit("campaign-checkin-uploads", 30, 15 * 60 * 1000));
app.use("/api", router);

export default app;
