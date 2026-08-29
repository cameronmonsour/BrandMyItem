# BrandMyItem

BrandMyItem is a client-side marketplace concept where brands fund everyday items by buying logo spots.

## Run & Operate

- `pnpm --filter @workspace/brandmyitem run dev` — run the static BrandMyItem web app
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/brandmyitem/index.html` — source of truth for the single-file HTML app, including inline CSS, base64 product photos, and vanilla JavaScript
- `artifacts/brandmyitem/vite.config.ts` — static Vite preview/build configuration
- `artifacts/brandmyitem/public/` — favicon and crawler metadata
- `artifacts/api-server/` — shared API scaffold; BrandMyItem currently runs local-only and does not depend on it

## Architecture decisions

- Preserve the supplied single-file HTML implementation unchanged so its hash routing, embedded assets, vanilla JS, and localStorage behavior remain intact.
- Keep this first version static and client-side; payment checkout, identity verification, social connections, and escrow state changes are explicitly demos.
- Use Vite only as the local preview/build wrapper; do not introduce a backend or database until real marketplace operations are requested.

## Product

- Home page with owner/brand entry points and product education
- Build-your-item flow with 11 real products, variants, habits, social reach, and ad-spot editing
- Live items marketplace with seeded listings, filters, activity, spot purchase flow, 20% platform fee, and submission IDs
- Local escrow ledger demo, owner identity/check-in tools, social share copy, and email/submission tracking timeline

## User preferences

_No project-specific preferences recorded._

## Gotchas

- This app intentionally has no real Stripe checkout, KYC, OAuth/social connection, backend persistence, or multi-user synchronization.
- LocalStorage is the persistence layer for the demo; clearing site data resets local listings, claims, and check-ins.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
