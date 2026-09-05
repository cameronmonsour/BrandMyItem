import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { fileURLToPath } from "node:url";
import router from "./routes/index.ts";
import { logger } from "./lib/logger.ts";
import { publicBaseUrl } from "./lib/publicBaseUrl.ts";
import { rateLimit } from "./lib/rateLimit.ts";
import { stripeWebhook } from "./routes/stripeWebhook.ts";

const app: Express = express();
const productionClientDirectory = fileURLToPath(
  new URL("../../brandmyitem/dist/public/", import.meta.url),
);

app.set("trust proxy", 1);
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
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const requestHost = (req.get("x-forwarded-host") ?? req.get("host") ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const canonical = new URL(publicBaseUrl());
    const canonicalHost = canonical.host.toLowerCase();
    if (
      (forwardedProto === "http" && requestHost === canonicalHost) ||
      requestHost === `www.${canonicalHost}`
    ) {
      res.redirect(301, new URL(req.originalUrl, canonical).toString());
      return;
    }
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  next();
});
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

if (process.env.NODE_ENV === "production") {
  app.use(express.static(productionClientDirectory, { index: false }));
  app.get(["/", "/admin"], (_req, res) => {
    res.sendFile("index.html", { root: productionClientDirectory });
  });
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/api/") ||
      (req.method !== "GET" && req.method !== "HEAD")
    ) {
      next();
      return;
    }
    res.status(404).sendFile("404.html", { root: productionClientDirectory });
  });
}

export default app;
