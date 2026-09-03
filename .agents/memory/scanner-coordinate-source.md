---
name: Scanner coordinate source
description: Constraint for deterministic catalog surface coordinates and image asset matching.
---

Catalog placement surfaces must be locked against the intrinsic dimensions of the actual campaign product images. Never apply coordinates measured from bento or hero cutouts to campaign images.

**Why:** The bento assets and campaign assets use different pixel dimensions, aspect ratios, crops, and product framing. Reusing their coordinates would create placement drift despite otherwise deterministic rendering.

**How to apply:** Store each surface with its expected intrinsic image size and refuse the locked result when the loaded image dimensions differ. Catalog images use stored surfaces; browser detection remains a fallback for custom uploads or mismatched replacement assets.