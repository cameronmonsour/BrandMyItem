---
name: BrandMyItem recovery guardrails
description: Durable rules for recovering campaign state and preventing test cleanup from touching production records.
---

PostgreSQL is the authoritative source for campaign and reservation state. When a lifecycle sweep is run with an incorrect clock, restore the existing rows in place and preserve their IDs, Stripe references, uploaded objects, and durable email markers. Verify public API state and compare a canonical state hash before and after repeated restarts.

**Why:** A future-clock lifecycle sweep can make intact listings appear deleted by transitioning them to `expired` and releasing a reservation. Rebuilding rows would lose relationships and reconciliation history.

**How to apply:** Snapshot the affected tables before repair, use explicit primary-key predicates in a transaction, and document the state transitions. Automated cleanup must require `test = true`, an age cutoff, a dry-run default, per-row logging, and a hard deletion cap.