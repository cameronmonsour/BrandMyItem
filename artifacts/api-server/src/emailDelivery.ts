import type { TransactionalEmail } from "./emailTemplates.ts";
import { logger } from "./lib/logger.ts";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_REPLY_TO = "support@brandmyitem.com";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type EmailDeliveryResponse = Pick<Response, "ok" | "status"> & {
  messageId?: string;
};

export type EmailDeliveryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  request?: (email: TransactionalEmail) => Promise<EmailDeliveryResponse>;
  sleep?: (delayMs: number) => Promise<void>;
};

type EmailDeliveryError = Error & { status?: number };

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function resendFrom(): string {
  const value = process.env.RESEND_FROM?.trim();
  if (!value) {
    throw new Error("RESEND_FROM is not configured");
  }
  return value;
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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      reply_to: RESEND_REPLY_TO,
    }),
  });

  const payload = await response.json().catch(() => null) as
    | { id?: unknown; message?: unknown }
    | null;
  if (!response.ok) {
    const error = new Error(`Resend request failed (${response.status})`) as EmailDeliveryError;
    error.status = response.status;
    throw error;
  }
  return {
    ok: response.ok,
    status: response.status,
    messageId: typeof payload?.id === "string" ? payload.id : undefined,
  };
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  options: EmailDeliveryOptions = {},
): Promise<{ messageId?: string }> {
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
      const response = await request(email);
      return { messageId: response.messageId };
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
  throw new Error("Transactional email delivery exhausted its retry attempts");
}