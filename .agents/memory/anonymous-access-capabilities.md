---
name: Anonymous access capabilities
description: Security boundary for BrandMyItem's anonymous checkout and tracking flows.
---

Anonymous checkout and tracking use server-stored hashes of opaque, HttpOnly, same-site capabilities. Email addresses, campaign IDs, and Stripe session IDs are identifiers only, never authorization.

**Why:** The public marketplace must allow checkout without accounts, but email-only and session-ID-only reads exposed private orders and active payment sessions.

**How to apply:** Issue a capability only when the caller creates the related campaign or order, require its cookie for retries and private reads, keep legacy records without a capability inaccessible, and do not return Stripe session IDs or buyer fields from status responses unless the authorized client needs them.