---
name: Reusable upload capabilities
description: Why capability digests may repeat across independently bound upload intents.
---

An authenticated owner capability may authorize multiple sequential uploads. Upload safety comes from each intent's purpose, resource binding, status version, expiry, and one-time consumption, not from making the capability digest unique across the table.

**Why:** Real owner journeys upload a check-in image, wear evidence, and a police report in one authenticated session. A globally unique capability digest allows only the first intent and makes later uploads fail.

**How to apply:** Permit repeated capability digests across different upload intents. Preserve one-time transitions and validate actor, campaign, purpose, resource, expiry, and intent status whenever finalizing or consuming an upload.