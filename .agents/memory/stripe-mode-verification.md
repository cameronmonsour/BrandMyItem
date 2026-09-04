---
name: Stripe mode verification
description: How to verify whether the connected Stripe account is operating in test or live mode.
---

Treat Stripe mode as live unless the connector itself returns `livemode: false` from a safe read such as the balance endpoint.

**Why:** Replit’s Stripe connector can create live Checkout Sessions while raw Stripe environment keys are intentionally absent. Environment-key inference once reported test mode for a live connector and allowed a test-card attempt against live Checkout.

**How to apply:** Before any automated card acceptance flow, read mode through the connector. If that probe fails or is ambiguous, fail safe to live and do not submit test cards.