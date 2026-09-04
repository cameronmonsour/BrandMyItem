import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Small fixed-window limiter for anonymous, token-bearing endpoints. */
export function rateLimit(prefix: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${prefix}:${req.ip}`;
    const bucket = buckets.get(key);
    const current = !bucket || bucket.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : bucket;
    current.count += 1;
    buckets.set(key, current);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - current.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));
    if (current.count > limit) {
      res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };
}