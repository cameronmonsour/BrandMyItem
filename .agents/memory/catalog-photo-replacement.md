---
name: Catalog photo replacement
description: Why catalog-wide image swaps must handle persisted listing photos and cached asset URLs.
---

Campaign cards, Live Items, and opened campaign detail pages must show the placement tracker directly on each product photo: locked photo-specific geometry, unfilled black boundaries, open spot prices, and purchased sponsor logos. Compact cards use 1.25px boundaries. The homepage bento uses separate transparent cutouts and bento-specific 1px geometry. Apply one white block outline only. The lead suitcase and rotating Rimowa cutouts already include their own white edges and must not receive the shared CSS outline.

**Why:** Photo-only campaign cards hid the product’s purchasable ad map and existing sponsors. The 1.25px card overlay keeps placement boundaries legible without overpowering the product; the price-to-logo swap explains spot state.

**How to apply:** Route campaign cards and campaign detail heroes through the photo-aligned overlay renderer; never use the photo-only renderer for these surfaces. Keep compact cards at 1.25px. Open placements show their price; purchased placements show the sponsor logo or monogram. For bento diagrams, keep separate exact-dimension cutouts and 1px locked geometry. Apply the bento white block outline to product cutouts, phone artwork, and proof photos, but remove that shared class from the lead suitcase, rotating Rimowa, and any future asset with a baked-in white edge. Never apply two outline layers. Never reuse coordinates across differently cropped assets.