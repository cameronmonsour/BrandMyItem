---
name: Checkout popup session state
description: Browser sessionStorage behavior that affects Stripe Checkout returns opened in a popup.
---

When Checkout opens in a new window, reservation return state written after `window.open()` must also be written directly into that popup's session storage before it leaves the app origin.

**Why:** A popup receives a one-time clone of the opener's session storage when it is created. Later writes in the opener do not propagate. Stripe can therefore succeed but return to a popup that cannot resolve the reservation.

**How to apply:** For popup-based external flows that return to the app, persist the finalized pending state in both browsing contexts before navigating the popup away. Keep the return handler dependent on the popup-local copy.