---
name: Stripe connector boundary
description: How BrandMyItem must access its connected Stripe account and what that means for reconciliation.
---

Use the installed Stripe connection through `@replit/connectors-sdk` proxy requests. Do not assume the connection exposes a raw Stripe secret key or webhook signing secret.

Never treat refund creation as refund completion. Persist and poll the Stripe refund ID/status; only `succeeded` is final, while pending states remain pollable and failed/canceled states need a new idempotent retry attempt.

Reserve a unique placement order before creating Checkout, persist its idempotency key, and reuse any still-open session. Never replace a payable pending session with a new session ID.

**Why:** The connector returned a healthy Stripe connection but intentionally omitted raw secret credentials, and Stripe may return a non-final status when accepting a refund request.

**How to apply:** Create and retrieve Stripe resources through connector-proxied `/v1/...` API calls. Persist intent before external calls, then use scheduled reconciliation and deterministic idempotency keys unless supported webhooks become available.