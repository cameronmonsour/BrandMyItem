import assert from "node:assert/strict";
import test from "node:test";
import { contactSupportEmail, trackingMagicLinkEmail } from "./emailTemplates.ts";

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

test("contact support email targets support and escapes submitted HTML", () => {
  const email = contactSupportEmail({
    name: "A <Sender>",
    email: "sender@example.com",
    subject: "Question <important>",
    message: "Hello <script>alert(1)</script>",
  });

  assert.equal(email.to, "support@brandmyitem.com");
  assert.equal(email.subject, "Contact form: Question <important>");
  assert.match(email.text, /sender@example\.com/);
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
});