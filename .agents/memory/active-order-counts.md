---
name: Active order counts
description: Funding completion and notification logic must ignore historical cancelled or expired orders.
---

Funding, completion, and lifecycle email decisions must count only active funded or funding states, never every order row for a campaign.

**Why:** BrandMyItem retains cancelled and expired reservation history. Counting those rows can block the final funded state or keep completion emails in partial-funding language even when every live spot is funded.

**How to apply:** When checking campaign funding thresholds or deciding whether brand and owner completion emails are due, filter to reserved, funding, payment_failed, and funded orders first, then compare that active set with the campaign's spot count.