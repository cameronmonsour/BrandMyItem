import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  accessCookieName,
  accessTokenHashesForScope,
  accessTokenMatches,
  createAccessToken,
  hashAccessToken,
  readAccessToken,
  setAccessCookie,
} from "./accessControl.ts";

function requestWithCookies(cookieHeader: string): Request {
  return {
    get(name: string) {
      return name.toLowerCase() === "cookie" ? cookieHeader : undefined;
    },
  } as Request;
}

test("access cookies are scoped to their resource and hashed for storage", () => {
  const token = createAccessToken();
  const campaignCookie = accessCookieName("campaign", "campaign-1");
  const checkoutCookie = accessCookieName("checkout", "order-1");
  const request = requestWithCookies(
    `${campaignCookie}=${encodeURIComponent(token)}; ${checkoutCookie}=other-token`,
  );

  assert.equal(readAccessToken(request, "campaign", "campaign-1"), token);
  assert.equal(readAccessToken(request, "campaign", "campaign-2"), null);
  assert.deepEqual(accessTokenHashesForScope(request, "campaign"), [
    hashAccessToken(token),
  ]);
  assert.equal(
    accessTokenMatches(hashAccessToken(token), token),
    true,
  );
  assert.equal(accessTokenMatches(hashAccessToken(token), "wrong-token"), false);
});

test("issued access cookies are HttpOnly, same-site, and API-scoped", () => {
  const cookies: Array<{ name: string; value: string; options: unknown }> = [];
  const response = {
    cookie(name: string, value: string, options: unknown) {
      cookies.push({ name, value, options });
    },
  } as unknown as Response;

  setAccessCookie(response, "checkout", "order-1", "secret-token");

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, accessCookieName("checkout", "order-1"));
  assert.equal(cookies[0].value, "secret-token");
  assert.deepEqual(cookies[0].options, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
});