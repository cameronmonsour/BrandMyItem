---
name: Check-in email cycle ledger
description: Durable idempotency rule for recurring check-in email templates.
---

Each recurring check-in email is claimed in a durable ledger keyed by listing, due date, and template before delivery. Mutable timestamps on the listing are useful for current status, but are not the authoritative idempotency boundary.

**Why:** A completed cycle resets listing-level reminder timestamps so the next cycle can run. Without a per-due-date ledger, retries or later sweeps can resend an earlier cycle's message.

**How to apply:** Use the composite cycle key for pre-due, due, and missed templates. Only the process that creates the claim may send. Remove the claim after a definite delivery failure so a later sweep can retry.