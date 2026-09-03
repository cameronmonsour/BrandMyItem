---
name: Catalog photo replacement
description: Why catalog-wide image swaps must handle persisted listing photos and cached asset URLs.
---

Keep campaign cards and listing details on clean, untouched product photos. The homepage bento is the deliberate exception: use transparent cutouts derived from the exact campaign photos at unchanged dimensions, with the tracker’s locked geometry drawn as unfilled 1px black boundaries. Available spots show transparent price text; the transparent BrandMyItem mark replaces it when purchased. Both suitcase crops use four separately rounded regions inset to their alpha-measured silver shells, with small non-overlapping gaps and a hard stop above the wheels.

**Why:** White photo panels, opaque price/logo badges, and overlapping shared edges made the bento look crude. Transparent exact-dimension cutouts, label layers, and single-pass boundaries preserve clarity and alignment; the price-to-logo swap explains spot state.

**How to apply:** Preserve clean campaign/listing photos and explicit spot selectors. For bento diagrams, remove the campaign photo background without resizing or recropping, then use the locked tracker placements: MacBook 10, iPhone 5, AirPods Max 2 contours, and suitcase 4. The lead and rotating suitcase assets have separate alpha-measured shell bounds; each uses a 2×2 set of individually rounded boxes inset from the white halo, separated by a small transparent gap, and ending above the wheel assembly. Other shared boundaries remain deduplicated and render once as persistent unfilled 1px black lines. Center price text directly on the product with no box, fill, or backdrop; replace only the text with the BrandMyItem mark after purchase. Never reuse coordinates across differently cropped assets.