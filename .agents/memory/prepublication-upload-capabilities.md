---
name: Pre-publication upload capabilities
description: Why W-9 and sponsor-logo uploads require drafts before signing or publication.
---

Sensitive pre-publication uploads must be authorized through expiring campaign or reservation drafts. Signed uploads are purpose-bound, resource-bound, actor-bound, finalized after metadata verification, and consumed once by the matching publication or checkout transition.

**Why:** A campaign owner capability does not exist before campaign insertion, and a sponsor capability does not exist before reservation. Free-floating signed URLs or arbitrary object paths would permit storage abuse, cross-resource attachment, and replay.

**How to apply:** Any future upload needed before a durable public record exists must first create a non-public draft capability. Never restore generic unauthenticated signing or accept an object path without consuming its matching finalized intent.