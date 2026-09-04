import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import app from "../app.ts";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation.ts";
import { eq } from "drizzle-orm";
import {
  campaignsTable,
  db,
  trackingMagicLinkRequestsTable,
  trackingMagicLinksTable,
} from "@workspace/db";

test("campaign presentation accepts known bounded fields", () => {
  assert.equal(
    isSafeCampaignPresentation({
      photo: "/objects/uploads/123",
      faces: [{ photo: "/objects/uploads/456", tiles: [] }],
      socialLinks: { instagram: "brand" },
    }),
    true,
  );
});

test("campaign presentation rejects unknown and prototype-related fields", () => {
  assert.equal(isSafeCampaignPresentation({ injected: "<script>" }), false);
  assert.equal(
    isSafeCampaignPresentation(JSON.parse('{"socialLinks":{"constructor":"bad"}}')),
    false,
  );
});

test("campaign presentation rejects deeply nested and oversized values", () => {
  assert.equal(
    isSafeCampaignPresentation({ faces: [[[[[[["too deep"]]]]]]] }),
    false,
  );
  assert.equal(isSafeCampaignPresentation({ purpose: "x".repeat(20_001) }), false);
});

test("campaign presentation rejects invalid semantic field types", () => {
  assert.equal(isSafeCampaignPresentation({ faces: { photo: "x" } }), false);
  assert.equal(isSafeCampaignPresentation({ cities: "<img>" }), false);
  assert.equal(isSafeCampaignPresentation({ slots: "many" }), false);
});

test("tracking email failures keep the response generic and invalidate the link", async () => {
  const previousOrigin = process.env.BRANDMYITEM_PUBLIC_URL;
  const previousOrigins = process.env.BRANDMYITEM_PUBLIC_ORIGINS;
  const previousResendKey = process.env.RESEND_API_KEY;
  const previousResendFrom = process.env.RESEND_FROM;
  process.env.BRANDMYITEM_PUBLIC_URL = "https://example.test";
  process.env.BRANDMYITEM_PUBLIC_ORIGINS = "https://example.test";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "BrandMyItem <test@example.com>";
  let requestBody = "";
  const email = `tracking-test-${randomUUID()}@example.com`;
  const campaignId = `tracking-test-${randomUUID()}`;
  const providerError = "provider outage details must stay server-side";
  const originalFetch = globalThis.fetch;
  const proxyMock = mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input) === "https://api.resend.com/emails") {
        requestBody = String(init?.body ?? "");
        return new Response(providerError, { status: 400 });
      }
      return originalFetch(input, init);
    },
  );
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    await db.insert(campaignsTable).values({
      id: campaignId,
      itemType: "iphone",
      title: "Tracking test item",
      ownerName: "Tracking Test Owner",
      ownerEmail: email,
      pricesCents: [100],
      presentation: {},
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/tracking/magic-link`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );
    const responseText = await response.text();

    assert.equal(response.status, 202);
    assert.deepEqual(JSON.parse(responseText), {
      message:
        "If that email is linked to an item, a one-time tracking link is on its way.",
    });
    assert.doesNotMatch(responseText, new RegExp(email, "i"));
    assert.doesNotMatch(responseText, /provider outage details/i);

    const sentEmail = JSON.parse(requestBody) as { text: string };
    const trackingUrl = sentEmail.text.match(/https?:\/\/\S+/)?.[0];
    assert.ok(trackingUrl);
    const trackingToken = new URL(trackingUrl).searchParams.get("tracking_token");
    assert.ok(trackingToken);
    assert.doesNotMatch(responseText, new RegExp(trackingToken, "i"));

    const trackingResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/tracking?token=${encodeURIComponent(trackingToken)}`,
    );
    assert.equal(trackingResponse.status, 401);
    assert.deepEqual(await trackingResponse.json(), {
      error: "Tracking link is invalid or expired",
    });
  } finally {
    await db.delete(trackingMagicLinksTable).where(eq(trackingMagicLinksTable.email, email));
    await db.delete(trackingMagicLinkRequestsTable).where(eq(trackingMagicLinkRequestsTable.normalizedEmail, email));
    await db.delete(campaignsTable).where(eq(campaignsTable.id, campaignId));
    if (previousOrigin === undefined) delete process.env.BRANDMYITEM_PUBLIC_URL;
    else process.env.BRANDMYITEM_PUBLIC_URL = previousOrigin;
    if (previousOrigins === undefined) delete process.env.BRANDMYITEM_PUBLIC_ORIGINS;
    else process.env.BRANDMYITEM_PUBLIC_ORIGINS = previousOrigins;
    if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendKey;
    if (previousResendFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousResendFrom;
    proxyMock.mock.restore();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});