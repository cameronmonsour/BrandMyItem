---
name: Test listing isolation
description: Automated campaign records are persisted with an explicit test flag and excluded from every public listing and tracking surface.
---

Automated listings must set `test: true` at creation time. Public campaign queries, tracking lookup, local hydration, dashboard cards, direct listing routes, and activity feeds must exclude records with that flag.

**Why:** Automated fixtures can contain synthetic names, brands, and payment state. A single unfiltered path can expose test data in the marketplace or let it affect public activity.

**How to apply:** Keep the database flag non-null with a false default, filter at the API boundary, and retain client-side filtering as defense in depth. Automated tests should remove their records in `finally` blocks.