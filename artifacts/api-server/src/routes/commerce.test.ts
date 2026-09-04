import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { AddressInfo } from "node:net";
import { ReplitConnectors } from "@replit/connectors-sdk";
import app from "../app.ts";
import { isSafeCampaignPresentation } from "../lib/campaignPresentation.ts";

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
  process.env.BRANDMYITEM_PUBLIC_URL = "https://example.test";
  process.env.BRANDMYITEM_PUBLIC_ORIGINS = "https://example.test";
  let requestBody = "";
  const providerError = "provider outage details must stay server-side";
  const proxyMock = mock.method(
    ReplitConnectors.prototype,
    "proxy",
    async (
      _connectorName: string,
      _path: string,
      options?: { body?: unknown },
    ) => {
      requestBody = String(options?.body ?? "");
      return new Response(providerError, { status: 400 });
    },
  );
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    const email = `failure-${Date.now()}@example.com`;
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
    if (previousOrigin === undefined) delete process.env.BRANDMYITEM_PUBLIC_URL;
    else process.env.BRANDMYITEM_PUBLIC_URL = previousOrigin;
    if (previousOrigins === undefined) delete process.env.BRANDMYITEM_PUBLIC_ORIGINS;
    else process.env.BRANDMYITEM_PUBLIC_ORIGINS = previousOrigins;
    proxyMock.mock.restore();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});