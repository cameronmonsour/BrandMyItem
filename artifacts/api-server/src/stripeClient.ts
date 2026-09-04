const STRIPE_API_BASE_URL = "https://api.stripe.com";

type StripeErrorResponse = {
  error?: {
    message?: string;
  };
};

type StripeConfiguration = {
  secretKey: string;
  publishableKey: string;
  mode: "test" | "live";
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

function getStripePublishableKey(): string {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) {
    throw new Error(
      "STRIPE_PUBLISHABLE_KEY must be configured with a Stripe test or live publishable key",
    );
  }
  return publishableKey;
}

function readStripeConfiguration(): StripeConfiguration {
  const secretKey = getStripeSecretKey();
  const publishableKey = getStripePublishableKey();
  const mode = secretKey.startsWith("sk_test_") ? "test" : "live";
  const publishableMode = publishableKey.startsWith("pk_test_") ? "test" : "live";
  if (mode !== publishableMode) {
    throw new Error("Stripe secret and publishable keys must use the same mode");
  }
  return { secretKey, publishableKey, mode };
}

export function getConfiguredStripeMode(): "test" | "live" {
  return readStripeConfiguration().mode;
}

export function getConfiguredStripeDiagnostics(): {
  mode: "test" | "live";
  secretKeyPrefix: string;
  publishableKeyPrefix: string;
} {
  const configuration = readStripeConfiguration();
  return {
    mode: configuration.mode,
    secretKeyPrefix: configuration.secretKey.slice(0, 8),
    publishableKeyPrefix: configuration.publishableKey.slice(0, 8),
  };
}

export async function stripeRequest<T>(
  path: string,
  options?: {
    method?: string;
    body?: URLSearchParams;
    idempotencyKey?: string;
  },
): Promise<T> {
  const { secretKey } = readStripeConfiguration();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
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
