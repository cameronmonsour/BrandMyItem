# Threat Model

## Project Overview

BrandMyItem is a TypeScript marketplace application with a browser client and an Express 5 API backed by PostgreSQL/Drizzle. The API also uses Stripe through a Replit connector and Replit private object storage for sponsor logos. Although deployment metadata currently reports no active deployment, `artifacts/api-server` and `artifacts/brandmyitem` are production-capable artifacts and are reviewed as deployable entry points. The mockup sandbox and test files are development-only.

## Assets

- **Marketplace identities and contact data** — campaign-owner and buyer email addresses, names, campaign relationships, and order histories.
- **Campaign and placement state** — listing content, placement prices, active status, brand claims, and checkout/order status.
- **Payments** — Stripe checkout-session identifiers, payment-intent references, refund state, and the integrity of which placement a payment purchases.
- **Uploaded objects** — sponsor logos held under the application's private object-storage directory.
- **Service credentials** — database credentials and delegated Stripe/object-storage access available only to the server.

## Trust Boundaries

- **Browser to API** — all request bodies, path/query parameters, headers, and uploaded object metadata are untrusted. Sensitive reads and mutations require server-side subject establishment and authorization.
- **API to PostgreSQL** — the API can read and alter marketplace/payment records. Queries must be parameterized and scoped to an authenticated, authorized subject.
- **API to Stripe** — the server can create and inspect Stripe checkout sessions. Checkout amounts and state transitions must be derived and reconciled server-side, while session data must not be exposed to unrelated callers.
- **API to private object storage** — the server signs uploads and serves objects. Object paths, content type, size, and active ownership/reference must be constrained.
- **Public to private marketplace data** — public campaign details and paid brand placements are distinct from owner/buyer tracking records, contact details, pending orders, and payment identifiers.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`, and API calls in `artifacts/brandmyitem/index.html`.
- Highest risk: `routes/commerce.ts` (campaigns, tracking, Stripe checkout), `routes/storage.ts`, `lib/objectStorage.ts`, and HTML-rendering functions consuming API/localStorage data.
- Public surface: campaign listing and intended public sponsor imagery. Sensitive surfaces: campaign registration/mutation, email tracking, pending/paid order details, checkout-session lookup, upload signing, and private objects.
- Dev-only by default: `artifacts/mockup-sandbox/` and test files.

## Threat Categories

### Spoofing

The API must establish a trusted user or capability before exposing owner/buyer records or accepting owner actions. Email strings and object/session identifiers supplied by a browser are not proof of identity. Stripe state must be trusted only when fetched through the server connector and bound to the correct local order.

### Tampering

Campaign identity, owner association, listing presentation, prices, and checkout state are valuable state. The server must authorize every mutation and derive prices from trusted campaign records. Concurrent reservation and reconciliation paths must preserve one paid buyer per placement.

### Information Disclosure

Tracking and checkout responses must be limited to the authenticated owner or buyer and return only necessary fields. Private storage paths must not function as bearerless access to unrelated uploads. Stored campaign/order strings must be safely encoded before HTML rendering.

### Denial of Service

Public upload signing, storage, campaign creation, broad listing/tracking queries, and Stripe calls need practical abuse controls and request/record bounds. Report only resource-abuse paths with material production impact.

### Elevation of Privilege

Campaign and order object IDs, email addresses, checkout-session IDs, and object paths are attacker-controlled references. Every endpoint must prove subject-to-object authorization server-side; frontend hiding, knowledge of an email, or possession of a non-secret identifier is insufficient. Database parameterization, path allowlists, and safe HTML rendering must prevent injection and arbitrary access.
