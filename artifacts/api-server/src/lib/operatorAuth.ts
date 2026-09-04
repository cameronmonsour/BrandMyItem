import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export function operatorIdentity(req: Request): string | null {
  const configured = process.env.BRANDMYITEM_OPERATOR_TOKEN;
  const header = req.get("authorization");
  if (!configured || !header?.startsWith("Bearer ")) return null;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(configured);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return "configured-operator";
}