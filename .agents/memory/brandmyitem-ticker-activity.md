---
name: Ticker activity semantics
description: Product rule for the BrandMyItem live activity strip.
---

The live activity strip should communicate a single bid event: company, bid amount, and the item being sponsored. It should not imply delivery or proof approval unless those are separately supported product events.

**Why:** A rotating status sequence made the public activity strip ambiguous and showed operational states that the demo does not actually verify.

**How to apply:** Keep the ticker copy anchored to the claim record and show the existing product thumbnail/name as the object of the bid.