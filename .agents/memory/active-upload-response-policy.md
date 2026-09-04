---
name: Active upload response policy
description: Security boundary for public user-uploaded files and previously cached active content.
---

Only verified raster image formats may be served inline. SVG and any unknown or mismatched content type must be returned as generic bytes with attachment disposition, MIME sniffing disabled, document sandboxing, frame denial, and no-store caching.

**Why:** A public upload can become stored same-origin script execution when active content is served as an inline document. Tightening future responses does not rewrite old browser cache entries, so application-generated object URLs also need a versioned cache key when this policy changes.

**How to apply:** Keep upload contracts, post-upload verification, response headers, and client object-URL versioning aligned whenever accepted media types or object-serving behavior changes.