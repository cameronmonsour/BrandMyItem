---
name: Scanner coordinate source
description: Constraint for deterministic catalog surface coordinates and image asset matching.
---

Every placement surface must be locked against the intrinsic dimensions of the exact image it overlays. Bento cutouts may use the archive's bento-specific locked coordinates; never apply those coordinates to campaign images.

**Why:** The bento assets and campaign assets use different pixel dimensions, aspect ratios, crops, and product framing. Reusing their coordinates would create placement drift despite otherwise deterministic rendering.

**How to apply:** Store each surface with its expected intrinsic image size. Bento tiles split only their matching bento surface data; catalog campaigns use separate campaign-image surfaces. Refuse locked results when dimensions differ, with browser detection only for custom uploads or mismatched replacement assets.