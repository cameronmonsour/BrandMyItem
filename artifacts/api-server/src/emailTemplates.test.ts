import assert from "node:assert/strict";
import test from "node:test";
import { trackingMagicLinkEmail } from "./emailTemplates.ts";

test("tracking magic link email contains the one-time URL and expiry", () => {
  const email = trackingMagicLinkEmail({
    email: "owner@example.com",
    trackingUrl: "https://brandmyitem.com/?tracking_token=token-value",
  });

  assert.equal(email.to, "owner@example.com");
  assert.match(email.text, /expires in 15 minutes/);
  assert.match(email.text, /tracking_token=token-value/);
  assert.match(email.html, /href="https:\/\/brandmyitem\.com\/\?tracking_token=token-value"/);
});