---
name: Placement builder defaults
description: The intended starting state and growth model for item placement boxes.
---

The item builder starts with exactly one placement box, already selected. The visible Copy box action duplicates that selection with a small offset; users may also add a different shape or trace a custom outline. Product color, storage, size, and model changes must preserve the current placement layout.

**Why:** Preloading every available placement overwhelms the product image and makes the campaign structure feel predetermined. Starting with one box makes each additional sponsor spot an intentional choice. Reapplying a template after an option change silently destroys the owner’s box deletions and geometry edits.

**How to apply:** Keep the first box selected after template loading so copy and delete controls are immediately available. Do not repopulate the full catalog placement template when a new item is chosen. Variant controls may update the product details, retail value, and placement prices, but must not replace tiles or reset selection, geometry, shape colors, or sizing state. For multi-face items, display placement labels locally per face while preserving the global saved tile order, use one shared reference geometry when the faces are meant to match, and scale canvas text with source dimensions without a tight cap.