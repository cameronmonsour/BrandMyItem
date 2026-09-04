import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

const ACCESS_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type AccessScope = "campaign" | "checkout" | "tracking" | "sponsor_reservation";

function cookiePrefix(scope: AccessScope): string {
  return `bmi_${scope}_access_`;
}

export function accessCookieName(scope: AccessScope, resourceId: string): string {
  const resourceKey = createHash("sha256")
    .update(resourceId)
    .digest("hex")
    .slice(0, 32);
  return `${cookiePrefix(scope)}${resourceKey}`;
}

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || !value) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookie values instead of treating them as credentials.
    }
  }
  return cookies;
}

export function readAccessToken(
  req: Request,
  scope: AccessScope,
  resourceId: string,
): string | null {
  return parseCookies(req.get("cookie")).get(accessCookieName(scope, resourceId)) ?? null;
}

export function accessTokenMatches(
  storedHash: string | null | undefined,
  token: string | null,
): boolean {
  return Boolean(token && storedHash && hashAccessToken(token) === storedHash);
}

export function accessTokenHashesForScope(
  req: Request,
  scope: AccessScope,
): string[] {
  const prefix = cookiePrefix(scope);
  return Array.from(parseCookies(req.get("cookie")).entries())
    .filter(([name]) => name.startsWith(prefix))
    .map(([, token]) => hashAccessToken(token));
}

export function setAccessCookie(
  res: Response,
  scope: AccessScope,
  resourceId: string,
  token: string,
): void {
  res.cookie(accessCookieName(scope, resourceId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
  });
}
