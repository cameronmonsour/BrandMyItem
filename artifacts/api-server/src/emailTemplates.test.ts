import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignItemDisplayName,
  contactSupportEmail,
  reservationConfirmationEmail,
  trackingMagicLinkEmail,
} from "./emailTemplates.ts";

test("campaign email names use the display item name, not the internal title", () => {
  assert.equal(
    campaignItemDisplayName({
      itemType: "iphone",
      presentation: { title: "Custom item", itemName: "iPhone 17 · 512GB" },
    }),
    "iPhone 17 · 512GB",
  );
  const email = reservationConfirmationEmail({
    email: "brand@example.com",
    reservationId: "BMI-73E690",
    itemDisplayName: "iPhone 17 · 512GB",
    amountCents: 24000,
  });
  assert.match(email.text, /iPhone 17 · 512GB/);
  assert.doesNotMatch(email.text, /Custom item/);
  assert.match(email.html, /iPhone 17 · 512GB/);
});

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