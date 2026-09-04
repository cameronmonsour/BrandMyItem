import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function stripeRequest<T>(
  path: string,
  options?: { method?: string; body?: URLSearchParams },
): Promise<T> {
  const response = await connectors.proxy("stripe", path, {
    method: options?.method,
    headers: options?.body
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : undefined,
    body: options?.body?.toString(),
  });
  const data = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      data.error?.message || `Stripe request failed (${response.status})`,
    );
  }
  return data;
}
