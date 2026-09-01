---
name: Playwright assertion compatibility
description: Keep browser regression tests compatible with the workspace's installed Playwright matcher set.
---

Use built-in Playwright assertions or plain JavaScript assertions in browser tests; do not assume optional matcher extensions are installed.

**Why:** The BrandMyItem workspace runs the declared Playwright package without extra matcher plugins, so an otherwise valid browser flow can fail before reaching its assertions when it uses an unavailable matcher.

**How to apply:** Prefer `toBe`, `toHaveText`, `toBeLessThanOrEqual`, and related built-in matchers for UI checks, and use regular `expect` comparisons for evaluated values.

When a component nests interactive HTML summaries, scope each click to its semantic class or exact label instead of locating every `summary` descendant.

**Why:** Track order cards contain both a card summary and an Advanced details summary; an unscoped locator is ambiguous and fails in strict mode.

**How to apply:** Use the outer component’s class for expansion, then target the nested summary by its exact visible label.