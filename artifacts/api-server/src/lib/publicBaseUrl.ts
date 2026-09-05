function configuredPublicBaseUrl(): string {
  const value = process.env.PUBLIC_BASE_URL?.trim();
  if (!value) {
    throw new Error("PUBLIC_BASE_URL environment variable is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid absolute URL");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_BASE_URL must be an HTTPS origin without credentials, query, or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("PUBLIC_BASE_URL must not include a path");
  }

  return url.origin;
}

export function publicBaseUrl(): string {
  return configuredPublicBaseUrl();
}

export function publicAppUrl(
  pathname = "/",
  search?: Record<string, string>,
): string {
  const url = new URL(pathname, `${configuredPublicBaseUrl()}/`);
  for (const [key, value] of Object.entries(search ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}