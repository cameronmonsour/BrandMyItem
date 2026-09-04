---
name: Catalog photo replacement
description: Why catalog-wide image swaps must handle persisted listing photos and cached asset URLs.
---

Campaign cards and Live Items must show the placement tracker directly on each product photo: locked photo-specific geometry, unfilled 1.25px black boundaries, open spot prices, and purchased sponsor logos. The homepage bento uses its separate transparent cutouts and bento-specific 1px geometry. Both suitcase crops use four separately rounded regions inset to their alpha-measured silver shells, with small non-overlapping gaps and a hard stop above the wheels.

**Why:** Photo-only campaign cards hid the product’s purchasable ad map and existing sponsors. The 1.25px card overlay keeps placement boundaries legible without overpowering the product; the price-to-logo swap explains spot state.

**How to apply:** Route every campaign-card product image through the photo-aligned overlay renderer and keep the compact-card stroke at 1.25px. Open placements show their price; purchased placements show the sponsor logo or monogram. For bento diagrams, keep the separate exact-dimension cutouts and 1px locked geometry. Never reuse coordinates across differently cropped assets.