import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rateLimit } from "./lib/rateLimit.ts";

const source = (relativePath: string) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

function runLimiter(
  middleware: ReturnType<typeof rateLimit>,
  ip: string,
) {
  const headers = new Map<string, string>();
  let statusCode: number | undefined;
  let body: unknown;
  let calledNext = false;
  middleware(
    { ip } as never,
    {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    } as never,
    () => {
      calledNext = true;
    },
  );
  return { headers, statusCode, body, calledNext };
}

test("anonymous endpoint limiter is deterministic per caller and does not share IP buckets", () => {
  const limiter = rateLimit("launch-critical-test", 2, 60_000);

  assert.equal(runLimiter(limiter, "198.51.100.10").calledNext, true);
  assert.equal(runLimiter(limiter, "198.51.100.10").calledNext, true);
  const blocked = runLimiter(limiter, "198.51.100.10");
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, {
    error: "Too many requests. Please try again later.",
  });
  assert.equal(blocked.headers.get("RateLimit-Remaining"), "0");
  assert.equal(runLimiter(limiter, "198.51.100.11").calledNext, true);
});

test("reservation rate limiting counts draft creation, not capability-protected steps", async () => {
  const app = await source("./app.ts");

  assert.match(
    app,
    /app\.post\("\/api\/sponsor-reservation-drafts", rateLimit\("sponsor-reservation-drafts", 10,/,
  );
  assert.doesNotMatch(
    app,
    /app\.use\("\/api\/sponsor-reservation-drafts", rateLimit/,
  );
});

test("campaign publication keeps the $2,000 W-9 and social-context gate", async () => {
  const commerce = await source("./routes/commerce.ts");

  assert.match(commerce, /const highValue = totalCents >= 200000;/);
  assert.match(commerce, /typeof input\.presentation\.social === "string"/);
  assert.match(
    commerce,
    /!socialHandle \|\| !input\.w9ObjectPath \|\| !\(await verifyImageObject\(input\.w9ObjectPath, "w9"\)\)/,
  );
  assert.match(commerce, /w9Required: highValue/);
  assert.match(commerce, /w9Status:\s*\n\s*highValue\s*\n\s*\?\s*"submitted"/);
});

test("tracking links normalize addresses durably and use only an allowlisted canonical origin", async () => {
  const [commerce, schema] = await Promise.all([
    source("./routes/commerce.ts"),
    source("../../../lib/db/src/schema/campaigns.ts"),
  ]);
  const trackingHandler = commerce.slice(
    commerce.indexOf('router.post("/tracking/magic-link"'),
    commerce.indexOf('router.get("/tracking"'),
  );

  assert.match(trackingHandler, /parsed\.data\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(
    trackingHandler,
    /eq\(trackingMagicLinkRequestsTable\.normalizedEmail, email\)/,
  );
  assert.match(
    trackingHandler,
    /trackingMagicLinkRequestsTable\)\.values\(\{ id: randomUUID\(\), normalizedEmail: email \}\)/,
  );
  assert.match(schema, /normalizedEmail: text\("normalized_email"\)\.notNull\(\)/);
  assert.match(
    schema,
    /tracking_magic_link_requests_email_requested_idx"\)\.on\(table\.normalizedEmail, table\.requestedAt\)/,
  );
  assert.match(trackingHandler, /const canonicalOrigin = publicAppUrl\?\.replace/);
  assert.match(trackingHandler, /allowedOrigins\.includes\(canonicalOrigin\)/);
  assert.match(trackingHandler, /new URL\("\/", canonicalOrigin\)/);
  assert.doesNotMatch(trackingHandler, /req\.get\("host"\)|x-forwarded-host/i);
});

test("proof revisions, approval races, check-ins, and make-goods retain conditional transitions", async () => {
  const [fulfillment, funding] = await Promise.all([
    source("./routes/fulfillment.ts"),
    source("./paymentFunding.ts"),
  ]);

  assert.match(
    fulfillment,
    /eq\(placementOrdersTable\.id, input\.data\.placementOrderId\), eq\(placementOrdersTable\.campaignId, params\.data\.campaignId\), eq\(placementOrdersTable\.status, "funded"\)/,
  );
  assert.match(fulfillment, /operatorIdentity\(req\)/);
  assert.match(
    fulfillment,
    /eq\(placementOrdersTable\.proofRevision, order\.proofRevision\)/,
  );
  assert.match(
    fulfillment,
    /eq\(placementOrdersTable\.proofStatus, "submitted"\)/,
  );
  assert.match(
    funding,
    /eq\(placementOrdersTable\.proofStatus, "submitted"\)[\s\S]*inArray\(placementOrdersTable\.status, \["funded"\]\)/,
  );
  assert.match(
    fulfillment,
    /eq\(campaignsTable\.checkinStatus, campaign\.checkinStatus\)/,
  );
  assert.match(
    fulfillment,
    /eq\(campaignsTable\.checkinStatus, "missed"\)/,
  );
});

test("upload purpose policies remain restrictive and shipment cannot start a check-in clock", async () => {
  const [reservationDrafts, fulfillment, campaignDrafts, objectStorage] = await Promise.all([
    source("./routes/sponsorReservationDrafts.ts"),
    source("./routes/fulfillment.ts"),
    source("./routes/campaignDrafts.ts"),
    source("./lib/objectStorage.ts"),
  ]);
  const shipmentHandler = fulfillment.slice(
    fulfillment.indexOf('router.post("/operator/campaigns/:campaignId/shipment"'),
    fulfillment.indexOf('router.post("/operator/campaigns/:campaignId/delivery"'),
  );

  assert.match(reservationDrafts, /LOGO_TYPES = new Set\(\["image\/svg\+xml", "application\/pdf"\]\)/);
  assert.match(reservationDrafts, /LOGO_MAX_BYTES = 20_000_000/);
  assert.match(fulfillment, /CHECKIN_TYPES = new Set\(\["image\/png", "image\/jpeg", "image\/webp"\]\)/);
  assert.match(fulfillment, /CHECKIN_MAX_BYTES = 25_000_000/);
  assert.match(fulfillment, /PROOF_MAX_BYTES = 10_000_000/);
  assert.match(campaignDrafts, /purpose: "campaign_draft_w9"/);
  assert.match(campaignDrafts, /expectedMimeType: body\.data\.contentType, expectedSizeBytes: body\.data\.size/);
  assert.match(objectStorage, /purpose === "sponsor_logo" \? 20_000_000/);
  assert.doesNotMatch(shipmentHandler, /checkinDueAt|checkinStatus/);
});