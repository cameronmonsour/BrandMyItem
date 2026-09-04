---
name: Campaign financial immutability
description: Why public campaign presentation updates cannot alter campaign identity or spot prices.
---

Once a campaign is created, later presentation backfills or refreshes must not change its identity, owner, item type, or authoritative spot prices.

**Why:** Paid claims are indexed by placement and refund eligibility depends on the original campaign economics. Rewriting prices or slot counts can hide purchased claims and change financial outcomes.

**How to apply:** Treat campaign creation as the financial boundary. Any later update path should be owner-authorized and limited to non-financial presentation fields while preserving placement indexes.