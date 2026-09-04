import { ReplitConnectors } from "@replit/connectors-sdk";
import type { TransactionalEmail } from "./emailTemplates";

const connectors = new ReplitConnectors();
const DEFAULT_FROM_ADDRESS = "BrandMyItem <tracking@brandmyitem.com>";

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_ADDRESS;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
): Promise<void> {
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend request failed (${response.status})`);
  }
}