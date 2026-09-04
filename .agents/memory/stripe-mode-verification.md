---
name: Stripe mode verification
description: How to verify whether the connected Stripe account is operating in test or live mode.
---

Treat Stripe mode as live unless the env-provided secret key starts with `sk_test_` and a safe Stripe read confirms `livemode: false`.

**Why:** The installed Replit Stripe connector was connected to live mode while the app had no raw key access. The server now uses only `STRIPE_SECRET_KEY`, rejects missing or malformed keys, and must still confirm the account mode before card acceptance.

**How to apply:** Before any automated card acceptance flow, check the startup mode and `/api/health`. If either reports live, or the Stripe mode is ambiguous, do not submit test cards or create a Checkout Session.