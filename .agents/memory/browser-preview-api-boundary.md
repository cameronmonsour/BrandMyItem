---
name: Browser preview API boundary
description: How to interpret browser checks against the BrandMyItem frontend service.
---

The frontend's direct Vite service port serves the static client but does not mount the API server proxy. Browser checks that need server campaign data must use the managed artifact proxy, or use a controlled local fixture when verifying pure rendering behavior.

**Why:** A direct browser visit to a server-backed demo listing otherwise leaves the client campaign state empty even though the API workflow is healthy.

**How to apply:** Separate API behavior checks from frontend rendering checks. Do not treat a missing direct-port API response as a product failure without checking the managed proxy path.