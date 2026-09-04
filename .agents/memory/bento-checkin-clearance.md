---
name: Bento check-in clearance
description: Keep the animated check-in phone separate from cycle thumbnails and captions.
---

Position the check-in phone from a measured top boundary below the complete proof row, including captions, with a safety gap. The proof row contains four real framed images, including the slot labeled Next, and each image uses the same phone-to-thumbnail flight animation.

**Why:** Bottom anchoring lets the phone rise into the Cycle 1 thumbnail and caption when responsive tile dimensions change. A placeholder or static fourth image breaks the visual explanation that each phone photo becomes a scheduled proof.

**How to apply:** Recalculate the phone top from the proof row's rendered offset and height after fonts load and on viewport resize. Preserve at least a 16px gap in every animation phase; do not restore fixed bottom positioning. When proof slots change, update the desktop and mobile image selectors, flight images, target selector, staggered delays, and phase duration together so every flight can finish.