---
name: Bento product text clearance
description: Protect the rotating Real items product label from tall artwork.
---

Keep the rotating product name and retail/spot line in a dedicated text band above the artwork. Constrain each product and its SVG overlay inside one shared frame that uses the source image's actual aspect ratio.

**Why:** Intrinsic portrait artwork can otherwise grow above a max-height-only wrapper, causing tall handles and headphones to overlap the dynamic product label.

**How to apply:** When changing bento product sizing, preserve the text band's minimum height, the stage's clipped top boundary, and the source-dimension aspect ratio applied to the shared image/overlay wrapper. Do not fix individual products with one-off vertical offsets.