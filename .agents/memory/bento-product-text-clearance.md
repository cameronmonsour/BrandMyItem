---
name: Bento product text clearance
description: Protect the rotating Real items product label from tall artwork.
---

Keep the rotating product name and retail/spot line in a dedicated text band above the artwork. Measure the rendered label block and start the clipped artwork stage below its actual bottom with a safety gap. Constrain each product and its SVG overlay inside one shared frame that uses the source image's actual aspect ratio.

**Why:** Fixed top offsets fail when responsive wrapping changes the label block's height, and intrinsic portrait artwork can then rise behind the dynamic product label.

**How to apply:** Recalculate the stage top from the label block's rendered offset and height after each product change, after fonts load, and on viewport resize. Preserve the clipped stage and source-dimension aspect ratio shared by the image and overlay. Do not use fixed or product-specific vertical offsets.