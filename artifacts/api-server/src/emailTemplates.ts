export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function wrap(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1d1d1f"><h1>${title}</h1><p>${body}</p><p>BrandMyItem</p></div>`;
}

const ITEM_DISPLAY_NAMES: Record<string, string> = {
  backpack: "Backpack",
  bottle: "Bottle",
  case: "Phone case",
  cooler: "Cooler",
  headphones: "Headphones",
  iphone: "iPhone 17",
  macbook: "MacBook Pro",
  paddle: "Paddle",
};

export function campaignItemDisplayName(input: {
  itemType: string;
  presentation?: Record<string, unknown> | null;
}): string {
  const itemName = input.presentation?.itemName;
  if (typeof itemName === "string" && itemName.trim()) {
    return itemName.trim();
  }
  return ITEM_DISPLAY_NAMES[input.itemType] ?? "Your item";
}

export function contactSupportEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): TransactionalEmail {
  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();
  return {
    to: "support@brandmyitem.com",
    subject: `Contact form: ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    html: wrap(
      `Contact form: ${escapeHtml(subject)}`,
      `From: ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}`,
    ),
  };
}

export function reservationConfirmationEmail(input: {
  email: string;
  reservationId: string;
  itemDisplayName: string;
  amountCents: number;
}): TransactionalEmail {
  const amount = `$${(input.amountCents / 100).toFixed(2)}`;
  const itemDisplayName = escapeHtml(input.itemDisplayName);
  return {
    to: input.email,
    subject: `Your BrandMyItem reservation is confirmed`,
    text: `Your spot on ${input.itemDisplayName} is reserved. Reservation ID: ${input.reservationId}. Your card has not been charged. If every spot is reserved and the listing funds, your saved card will be charged ${amount} off-session.`,
    html: wrap(
      "Reservation confirmed",
      `Your spot on ${itemDisplayName} is reserved. Your card has not been charged. If the listing fully funds, the saved card will be charged ${amount} off-session. Reservation ID: ${input.reservationId}.`,
    ),
  };
}

export function paymentDeclinedEmail(input: {
  email: string;
  reservationId: string;
  updateCardUrl: string;
}): TransactionalEmail {
  return {
    to: input.email,
    subject: `Action needed for your BrandMyItem reservation`,
    text: `We could not charge the saved card for reservation ${input.reservationId}. No new charge was made. Update your card within 48 hours: ${input.updateCardUrl}`,
    html: wrap(
      "Card update needed",
      `We could not charge the saved card for reservation ${input.reservationId}. No new charge was made. Update your card within 48 hours: <a href="${input.updateCardUrl}">Update card</a>.`,
    ),
  };
}

export function paymentReopenedEmail(input: {
  email: string;
  reservationId: string;
  itemDisplayName: string;
}): TransactionalEmail {
  return {
    to: input.email,
    subject: "Your BrandMyItem spot is open again",
    text: `The 48-hour card-update window for reservation ${input.reservationId} ended without a successful charge. Your spot on ${input.itemDisplayName} is open again and your card was not charged.`,
    html: wrap(
      "Spot open again",
      `The 48-hour card-update window for reservation ${input.reservationId} ended without a successful charge. Your spot on ${escapeHtml(input.itemDisplayName)} is open again and your card was not charged.`,
    ),
  };
}

export function ownerCampaignReopenedEmail(input: {
  email: string;
  itemDisplayName: string;
  campaignId: string;
}): TransactionalEmail {
  return {
    to: input.email,
    subject: "A BrandMyItem spot is open again",
    text: `A spot on your ${input.itemDisplayName} listing is open again after a declined funding charge. The listing is live and can accept a new reservation. Listing ID: ${input.campaignId}.`,
    html: wrap(
      "Your listing is live again",
      `A spot on your ${escapeHtml(input.itemDisplayName)} listing is open again after a declined funding charge. The listing is live and can accept a new reservation. Listing ID: ${escapeHtml(input.campaignId)}.`,
    ),
  };
}

export function reservationReleaseEmail(input: {
  email: string;
  reservationId: string;
  itemDisplayName: string;
}): TransactionalEmail {
  const itemDisplayName = escapeHtml(input.itemDisplayName);
  return {
    to: input.email,
    subject: `Your BrandMyItem reservation was released`,
    text: `The ${input.itemDisplayName} listing did not fully fund within 60 days. Reservation ${input.reservationId} was released. Your card was never charged.`,
    html: wrap(
      "Reservation released",
      `The ${itemDisplayName} listing did not fully fund within 60 days. Your reservation was released and your card was never charged.`,
    ),
  };
}

export function fundingConfirmationEmail(input: {
  email: string;
  reservationId: string;
  itemDisplayName: string;
  amountCents: number;
  listingFunded?: boolean;
}): TransactionalEmail {
  const itemDisplayName = escapeHtml(input.itemDisplayName);
  const listingFunded = input.listingFunded !== false;
  const subject = listingFunded
    ? "Your BrandMyItem reservation funded"
    : "Your BrandMyItem charge succeeded";
  const text = listingFunded
    ? `The ${input.itemDisplayName} listing fully funded. Your saved card was charged $${(input.amountCents / 100).toFixed(2)} for reservation ${input.reservationId}.`
    : `Your saved card was charged $${(input.amountCents / 100).toFixed(2)} for reservation ${input.reservationId}. Your charge succeeded. The listing completes when all spots clear.`;
  const body = listingFunded
    ? `The ${itemDisplayName} listing fully funded. Your saved card was charged $${(input.amountCents / 100).toFixed(2)} for reservation ${input.reservationId}.`
    : `Your saved card was charged $${(input.amountCents / 100).toFixed(2)} for reservation ${input.reservationId}. <b>Your charge succeeded · listing completes when all spots clear.</b>`;
  return {
    to: input.email,
    subject,
    text,
    html: wrap(
      listingFunded ? "Listing funded" : "Charge succeeded",
      body,
    ),
  };
}

export function adminMagicLinkEmail(input: { email: string; url: string }): TransactionalEmail {
  return {
    to: input.email,
    subject: "Your BrandMyItem admin login",
    text: `Use this one-time admin login link. It expires in 15 minutes: ${input.url}`,
    html: wrap("Admin login", `Use this one-time admin login link. It expires in 15 minutes: <a href="${input.url}">Open admin</a>.`),
  };
}

export function ownerCampaignFundedEmail(input: {
  email: string;
  itemDisplayName: string;
  campaignId: string;
  totalCents: number;
}): TransactionalEmail {
  const itemDisplayName = escapeHtml(input.itemDisplayName);
  const total = `$${(input.totalCents / 100).toFixed(2)}`;
  return {
    to: input.email,
    subject: `Your BrandMyItem listing is fully funded`,
    text: `Your ${input.itemDisplayName} listing is fully funded. All reserved placements were charged, for a campaign total of ${total}. Listing ID: ${input.campaignId}.`,
    html: wrap(
      "Your listing is fully funded",
      `Your ${itemDisplayName} listing is fully funded. All reserved placements were charged, for a campaign total of ${total}. Listing ID: ${escapeHtml(input.campaignId)}.`,
    ),
  };
}

export function trackingMagicLinkEmail(input: {
  email: string;
  trackingUrl: string;
}): TransactionalEmail {
  return {
    to: input.email,
    subject: "Your BrandMyItem tracking link",
    text: `Use this one-time link to view your BrandMyItem tracking details. It expires in 15 minutes: ${input.trackingUrl}`,
    html: wrap(
      "Your tracking link",
      `Use this one-time link to view your BrandMyItem tracking details. It expires in 15 minutes: <a href="${input.trackingUrl}">View tracking</a>.`,
    ),
  };
}

export function ownerCampaignConfirmationEmail(input: {
  email: string;
  itemDisplayName: string;
  campaignId: string;
  totalCents: number;
}): TransactionalEmail {
  const itemDisplayName = escapeHtml(input.itemDisplayName);
  const total = `$${(input.totalCents / 100).toFixed(2)}`;
  return {
    to: input.email,
    subject: "Your BrandMyItem listing is live",
    text: `Your ${input.itemDisplayName} listing is live. Its campaign total is ${total}. Listing ID: ${input.campaignId}.`,
    html: wrap(
      "Your listing is live",
      `Your ${itemDisplayName} listing is live. Its campaign total is ${total}. Listing ID: ${escapeHtml(input.campaignId)}.`,
    ),
  };
}
