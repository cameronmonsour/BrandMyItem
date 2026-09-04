---
name: Custom tracer semantics
description: Product rule for how a customer-drawn placement outline behaves in the item editor.
---

The custom tracer creates one placement shape from the polygon the customer draws. Starting a custom trace replaces preset placement boxes, and closing the outline preserves that polygon rather than subdividing it. Placement numbers must use the same normalized color as their outlines.

**Why:** The tracer is for defining a custom shape. Automatically filling its frame with rectangular boxes changes the customer’s drawing into something they did not create. A number in a different color makes the selected placement look internally inconsistent when the outline color changes.

**How to apply:** Any future tracer, pricing, or placement-editor changes must treat a closed trace as one polygon. Additional placements require additional shapes; never infer rectangular partitions from the polygon. Keep the outline and number label sourced from the same tile color.