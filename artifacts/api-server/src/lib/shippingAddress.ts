export type UsShippingAddress = {
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

// Postal addressing variants are deliberately normalized before matching so
// "P. O. Box", "POB", and unit labels cannot bypass fulfillment policy.
const PO_BOX = /\b(?:p\s*\.?\s*o\s*\.?\s*(?:box|b\b)|post(?:al)?\s+office\s+box|pobox)\b/i;

export function isDeliverableUsStreetAddress(address: UsShippingAddress): boolean {
  const lines = `${address.line1} ${address.line2 ?? ""}`.replace(/\s+/g, " ").trim();
  return (
    address.country === "US" &&
    /^[A-Z]{2}$/.test(address.state) &&
    /^\d{5}(?:-\d{4})?$/.test(address.postalCode) &&
    !PO_BOX.test(lines) &&
    /\d/.test(address.line1)
  );
}