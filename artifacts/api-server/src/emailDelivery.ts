import { ReplitConnectors } from "@replit/connectors-sdk";
import type { TransactionalEmail } from "./emailTemplates";
import { logger } from "./lib/logger.ts";

const connectors = new ReplitConnectors();
const DEFAULT_FROM_ADDRESS = "BrandMyItem <tracking@brandmyitem.com>";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type EmailDeliveryResponse = Pick<Response, "ok" | "status">;

export type EmailDeliveryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  request?: (email: TransactionalEmail) => Promise<EmailDeliveryResponse>;
  sleep?: (delayMs: number) => Promise<void>;
};

type EmailDeliveryError = Error & { status?: number };

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_ADDRESS;
}

export function isRetryableEmailStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableEmailError(error: unknown): boolean {
  const status = errorStatus(error);
  return status === undefined || isRetryableEmailStatus(status);
}

function retryDelay(initialDelayMs: number, attempt: number): number {
  return Math.min(
    MAX_RETRY_DELAY_MS,
    Math.max(0, initialDelayMs) * 2 ** (attempt - 1),
  );
}

async function sendResendEmail(
  email: TransactionalEmail,
): Promise<EmailDeliveryResponse> {
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
    const error = new Error(`Resend request failed (${response.status})`) as EmailDeliveryError;
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  options: EmailDeliveryOptions = {},
): Promise<void> {
  const configuredAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxAttempts = Number.isFinite(configuredAttempts)
    ? Math.min(DEFAULT_MAX_ATTEMPTS, Math.max(1, Math.floor(configuredAttempts)))
    : DEFAULT_MAX_ATTEMPTS;
  const configuredDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const initialDelayMs = Number.isFinite(configuredDelay)
    ? Math.max(0, configuredDelay)
    : DEFAULT_INITIAL_DELAY_MS;
  const request = options.request ?? sendResendEmail;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await request(email);
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableEmailError(error)) {
        throw error;
      }
      const delayMs = retryDelay(initialDelayMs, attempt);
      logger.warn(
        {
          attempt,
          maxAttempts,
          delayMs,
          status: errorStatus(error),
        },
        "Retrying transactional email after transient provider failure",
      );
      await sleep(delayMs);
    }
  }
}