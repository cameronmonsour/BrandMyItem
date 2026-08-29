---
name: Catalog photo replacement
description: Why catalog-wide image swaps must handle persisted listing photos and cached asset URLs.
---

Keep two deliberate product-photo treatments: Apple-style outlined cutouts are only for the opening hero, while campaign cards, listings, and the editor use untouched source photos fitted proportionally in a consistent frame.

**Why:** Reusing hero cutouts in campaign surfaces makes products look oversized and adds an unwanted sticker border. Saved listing-level values and reused filenames can also bypass replacements or preserve stale images.

**How to apply:** Maintain separate hero and campaign asset maps. Normalize non-custom persisted records to the campaign originals, preserve user uploads, and use proportional contain sizing for campaign, listing, editor, tracking, and sharing surfaces.