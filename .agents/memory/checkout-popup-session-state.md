---
name: Checkout popup session state
description: Browser sessionStorage behavior that affects Stripe Checkout returns opened in a popup.
---

When Checkout opens in a new window, reservation return state written after `window.open()` must also be written directly into that popup's session storage before it leaves the app origin.

**Why:** A popup receives a one-time clone of the opener's session storage when it is created. Later writes in the opener do not propagate. Stripe can therefore succeed but return to a popup that cannot resolve the reservation.

**How to apply:** For popup-based external flows that return to the app, persist the finalized pending state in both browsing contexts before navigating the popup away. Keep the return handler dependent on the popup-local copy.

Any route-affecting flags restored with `history.replaceState()` must be recomputed before rendering the return route. Startup hydration and Checkout-return hydration must run in a defined order so an older campaign response cannot overwrite the confirmed reservation view.

**Why:** Return URLs may initially omit demo or route context, and concurrent startup fetches can resolve after confirmation with pre-confirmation data.

**How to apply:** Restore the final URL, synchronize location-derived state, render the campaign route, then open confirmation. Serialize startup work around external return handling, and reconcile the server-confirmed mutation into the visible detail state.

Checkout completion webhooks must treat reservation finalization and confirmation-email delivery as separate outcomes.

**Why:** A valid Stripe completion can be followed by a transient or recipient-specific email provider failure. Returning a webhook error after the reservation is committed causes Stripe retries without undoing the reservation.

**How to apply:** Make the reservation transition idempotent, log email delivery failures separately, and acknowledge the completed Checkout event once the reservation is confirmed.