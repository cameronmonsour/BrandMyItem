---
name: Stripe connector boundary
description: How BrandMyItem must access its connected Stripe account and what that means for reconciliation.
---

Use the installed Stripe connection through `@replit/connectors-sdk` proxy requests. Do not assume the connection exposes a raw Stripe secret key or webhook signing secret.

**Why:** The connector returned a healthy Stripe connection but intentionally omitted raw secret credentials, so secret-key SDK and managed-webhook startup initialization failed.

**How to apply:** Create and retrieve Stripe resources through connector-proxied `/v1/...` API calls. Use scheduled connector-based reconciliation for unattended payment/refund processing unless the connection later gains supported webhook credentials.