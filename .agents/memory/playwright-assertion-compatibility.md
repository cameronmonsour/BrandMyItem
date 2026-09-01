---
name: Playwright assertion compatibility
description: Keep browser regression tests compatible with the workspace's installed Playwright matcher set.
---

Use built-in Playwright assertions or plain JavaScript assertions in browser tests; do not assume optional matcher extensions are installed.

**Why:** The BrandMyItem workspace runs the declared Playwright package without extra matcher plugins, so an otherwise valid browser flow can fail before reaching its assertions when it uses an unavailable matcher.

**How to apply:** Prefer `toBe`, `toHaveText`, `toBeLessThanOrEqual`, and related built-in matchers for UI checks, and use regular `expect` comparisons for evaluated values.