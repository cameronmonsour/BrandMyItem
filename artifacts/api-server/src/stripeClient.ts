const STRIPE_API_BASE_URL = "https://api.stripe.com";

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

function getStripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || !/^sk_(test|live)_/.test(secretKey)) {
    throw new Error(
      "STRIPE_SECRET_KEY must be configured with a Stripe test or live secret key",
    );
  }
  return secretKey;
}

export function getConfiguredStripeMode(): "test" | "live" {
  return getStripeSecretKey().startsWith("sk_test_") ? "test" : "live";
}

export async function stripeRequest<T>(
  path: string,
  options?: {
    method?: string;
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStripeSecretKey()}`,
  };
  if (options?.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body?.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const responseText = await response.text();
  let data: T & StripeErrorResponse;
  try {
    data = JSON.parse(responseText) as T & StripeErrorResponse;
  } catch {
    throw new Error(`Stripe request failed (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(
      data.error?.message || `Stripe request failed (${response.status})`,
    );
  }
  return data;
}
