import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignItemDisplayName,
  contactSupportEmail,
  fundingConfirmationEmail,
  ownerCampaignFundedEmail,
  ownerCampaignConfirmationEmail,
  paymentDeclinedEmail,
  paymentReopenedEmail,
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

test("owner confirmation email includes the listing total and ID", () => {
  const email = ownerCampaignConfirmationEmail({
    email: "owner@example.com",
    itemDisplayName: "MacBook Pro 14",
    campaignId: "owner-listing-123",
    totalCents: 223900,
  });
  assert.equal(email.to, "owner@example.com");
  assert.match(email.text, /listing is live/);
  assert.match(email.text, /\$2239\.00/);
  assert.match(email.text, /owner-listing-123/);
});

test("payment decline email deep-links to the reservation card-update flow", () => {
  const email = paymentDeclinedEmail({
    email: "brand@example.com",
    reservationId: "BMI-775ACF",
    updateCardUrl: "https://brandmyitem.com/?update_card=BMI-775ACF&token=capability-token",
  });

  assert.match(email.text, /update_card=BMI-775ACF&token=capability-token/);
  assert.match(email.html, /href="https:\/\/brandmyitem\.com\/\?update_card=BMI-775ACF&token=capability-token"/);
});

test("funding emails distinguish a completed listing from partial funding", () => {
  const partial = fundingConfirmationEmail({
    email: "brand@example.com",
    reservationId: "BMI-PARTIAL",
    itemDisplayName: "iPhone 17",
    amountCents: 24000,
    listingFunded: false,
  });
  assert.match(partial.text, /listing completes when all spots clear/);
  assert.doesNotMatch(partial.text, /fully funded/);

  const completed = fundingConfirmationEmail({
    email: "brand@example.com",
    reservationId: "BMI-COMPLETE",
    itemDisplayName: "iPhone 17",
    amountCents: 24000,
    listingFunded: true,
  });
  assert.match(completed.text, /listing completed/);
  assert.doesNotMatch(completed.text, /fully funded/);
});

test("released reservation email gives the replacement-card instruction", () => {
  const email = paymentReopenedEmail({
    email: "brand@example.com",
    reservationId: "BMI-775ACF",
    itemDisplayName: "iPhone 17",
  });
  assert.match(email.text, /Your reservation was released\. Reserve again with a different card\./);
  assert.match(email.html, /Your reservation was released\. Reserve again with a different card\./);
});

test("owner funded email describes completion", () => {
  const email = ownerCampaignFundedEmail({
    email: "owner@example.com",
    itemDisplayName: "iPhone 17",
    campaignId: "djr99kx",
    totalCents: 144100,
  });
  assert.match(email.text, /listing completed/);
  assert.doesNotMatch(email.text, /fully funded/);
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