import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { adminMagicLinksTable, adminSessionsTable, db } from "@workspace/db";
import { sendTransactionalEmail } from "../emailDelivery.ts";
import { adminMagicLinkEmail } from "../emailTemplates.ts";

const ADMIN_COOKIE = "bmi_admin_session";
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function configuredAdminEmail(): string {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicAppUrl(): string {
  const configured = process.env.BRANDMYITEM_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const domain = process.env.REPLIT_DEV_DOMAIN?.trim();
  return domain ? `https://${domain}` : "https://brandmyitem.com";
}

function cookieValue(req: Request): string | null {
  const header = req.get("cookie") ?? "";
  const match = header.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(ADMIN_COOKIE.length + 1)) : null;
}

export async function readAdminIdentity(req: Request): Promise<string | null> {
  const token = cookieValue(req);
  if (!token) return null;
  const [session] = await db.select().from(adminSessionsTable).where(and(
    eq(adminSessionsTable.tokenHash, hash(token)),
    gt(adminSessionsTable.expiresAt, new Date()),
  )).limit(1);
  return session?.email ?? null;
}

export async function issueAdminMagicLink(
  emailInput: string,
): Promise<{ accepted: boolean; sent: boolean; messageId?: string }> {
  const email = emailInput.trim().toLowerCase();
  if (!email || email !== configuredAdminEmail()) {
    return { accepted: false, sent: false };
  }
  const token = randomBytes(32).toString("hex");
  await db.insert(adminMagicLinksTable).values({
    tokenHash: hash(token),
    email,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  const url = `${publicAppUrl()}/admin?admin_token=${encodeURIComponent(token)}`;
  const delivery = await sendTransactionalEmail(adminMagicLinkEmail({ email, url }));
  return { accepted: true, sent: Boolean(delivery.messageId), messageId: delivery.messageId };
}

export async function consumeAdminMagicLink(
  req: Request,
  res: Response,
  tokenInput: string,
): Promise<string | null> {
  const token = tokenInput.trim();
  if (!token) return null;
  const now = new Date();
  const [link] = await db.update(adminMagicLinksTable).set({ usedAt: now }).where(and(
    eq(adminMagicLinksTable.tokenHash, hash(token)),
    isNull(adminMagicLinksTable.usedAt),
    gt(adminMagicLinksTable.expiresAt, now),
  )).returning();
  if (!link) return null;
  const sessionToken = randomBytes(32).toString("hex");
  await db.insert(adminSessionsTable).values({
    tokenHash: hash(sessionToken),
    email: link.email,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  res.cookie(ADMIN_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  return link.email;
}