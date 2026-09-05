---
name: BrandMyItem admin direct route
description: Direct URL routing for the authenticated admin surface in the Vite-hosted BrandMyItem artifact.
---

The BrandMyItem Vite server uses a custom real-404 middleware instead of automatically treating every unknown path as an SPA route. Direct `/admin` navigation must therefore be allowlisted in that middleware, while the client route still handles the admin view and authentication.

**Why:** A client-side pathname check alone rendered correctly for hash navigation but direct `/admin` requests were intercepted by the custom 404 page.

**How to apply:** When adding another direct URL surface, update the Vite not-found allowlist and verify the actual proxied path with an app preview screenshot.