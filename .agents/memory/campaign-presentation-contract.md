---
name: Campaign presentation contract
description: Catalog campaign drafts must omit an unavailable optional title rather than serialize it as null.
---

Catalog campaign presentations must omit optional string fields that are unavailable, especially `title`, instead of sending `null`.

**Why:** The server presentation validator accepts bounded strings or omitted fields, and rejects present-but-null values before pricing and publication.

**How to apply:** When building a draft from a catalog item, use an omitted optional title unless the owner supplied a real string. Keep server validation strict.