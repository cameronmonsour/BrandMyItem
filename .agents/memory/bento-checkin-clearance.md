---
name: Bento check-in clearance
description: Keep the animated check-in phone separate from cycle thumbnails and captions.
---

Position the check-in phone from a measured top boundary below the complete proof row, including captions, with a safety gap.

**Why:** Bottom anchoring lets the phone rise into the Cycle 1 thumbnail and caption when responsive tile dimensions change.

**How to apply:** Recalculate the phone top from the proof row's rendered offset and height after fonts load and on viewport resize. Preserve at least a 16px gap in every animation phase; do not restore fixed bottom positioning.