# BrandMyItem — Master Reference

This is the complete reference for how the app works: the concept, the data model, every user flow, every key function, what's real vs. mocked, and what to know before touching the code. Written for whoever picks this up next — including a future AI agent with no memory of how it was built.

> ⚠️ **This document describes the app as it was originally built (escrow-based, 12-month fixed term, owner identity verification).** After it was written, an extended business/legal discussion led to a **simplified model that replaces several core mechanics** — no escrow state machine, no identity verification, instant per-spot charging, an owner-selectable term length, and a 60-day auto-refund on unsold listings. **`FINAL_BUSINESS_MODEL_DECISIONS.md` is the authoritative source for the current model — read that first.** `REPLIT_SIMPLIFIED_MODEL_PROMPT.md` describes the specific code changes needed to bring this file's actual implementation in line with it (as of this writing, the live code still reflects the *original* escrow-based system described below — the migration hasn't been executed yet). Sections 1, 6B, 6C, 7, and 9 below are the ones most affected; they're left intact rather than silently rewritten so the history of *why* things changed isn't lost, but don't treat them as current truth.

---

## 1. What this is (ORIGINAL MODEL — see notice above)

BrandMyItem is a marketplace concept: a person wants an item (a MacBook, a suit, a cooler), and instead of buying it themselves, they let brands pay for it in exchange for putting a logo on it. The item is divided into "ad spots" — physical zones on the item's surface (the lid, the case back, a jacket panel) — each with its own price. Brands buy spots one at a time, first come first served, until the item is 100% funded. The owner then carries the item for 12 months and periodically proves the logos are still on it.

The platform takes a 20% fee on top of every spot's price.

**Current state: this is a fully interactive front-end prototype, not a production app.** Every flow works end-to-end in the browser, but nothing is connected to a real payment processor, identity verifier, or backend database. Section 9 spells out exactly what's real and what's a mockup — read that before assuming anything is live.

---

## 2. Architecture at a glance

- **One file.** Everything — HTML, CSS, JavaScript, and every product photo (as base64) — lives in a single `.html` file. No build step, no bundler, no package.json.
- **No backend.** All data (listings, claims, check-ins) is stored in the browser's `localStorage` under the key `bmi_db4`. There is a vestigial "cloud sync" scaffold (`CLOUD`, `cloudPush`, `cloudPull`, `HAS_CLOUD`) — `HAS_CLOUD` is set by checking for `window.storage`, which is a Claude-artifact-specific persistence API, **not a standard browser API**. It will always evaluate `false` once this file is hosted anywhere outside Claude (Replit included), so the cloud-sync code paths are effectively permanent dead weight in any normal deployment, not just "currently disabled."
- **Routing** is hash-based (`#home`, `#dashboard`, `#build`, `#item/<id>`, `#track`). See Section 5.
- **One external dependency**: `three.js` r128 is loaded from a CDN. It is **dead weight** — the 3D rendering system it powered has been fully replaced by flat photo-based rendering (see Section 10). Safe to delete if you want a fully offline file, just not yet removed to avoid last-minute breakage risk.

---

## 3. The data model

### `ITEMS` — the catalog (11 items)

A fixed object keyed by item id, e.g. `ITEMS.macbook`. Each entry:

```js
macbook: {
  label: 'MacBook Pro',       // display name — deliberately has NO size/storage in it
  brand: 'Apple',
  color: 'Space Black',       // default/display color
  cat: 'Tech',                 // category, used to suggest default habitats
  retail: 1999,                // base price in USD
  maxSlots: 8,                 // most spots this item can be divided into
  surf: [28, 18],               // ad surface dimensions in cm, for spec display
  specs: [['Chip','Apple M5...'], ['Memory','16 GB unified'], ...]  // shown on item detail page
}
```

The 11 items: `macbook`, `iphone`, `cooler`, `bottle`, `case`, `headphones`, `golfbag`, `weekender`, `paddle`, `suit`, `backpack`.

**Naming convention**: labels intentionally exclude size/storage (e.g. "MacBook Pro" not "MacBook Pro 14""), because those are variant choices, not identity — see `ITEM_VARIANTS` below.

### `ITEM_VARIANTS` — the Finish/Storage configurator

One entry per catalog item, each with:
- `colors`: array of `[name, hexColor]` pairs — real, brand-accurate colorways (e.g. Stanley Quencher has 8 real colors: Cream, Charcoal, Lagoon, Rose Quartz, Fog, Plum, Iris, Cloud Pink)
- `sizeLabel`: what to call the second picker ("Storage", "Size", "Style", "Weight", "Capacity" — varies per item)
- `sizeQ`: the Apple-style question under that label ("How much space do you need?")
- `sizes`: array of `[label, priceDelta]` — e.g. MacBook's `['16"', 400]` adds $400 to the base retail price

Picking a size actually recalculates the item's retail price live (see `renderVariants()` in Section 6). Picking a color is stored but does **not** change the product photo — there's only one real photo per item, not one per colorway. This is a known, intentional simplification (see Section 9).

### `ITEM_PHOTOS`, `HERO_CUTOUTS`

- `ITEM_PHOTOS[type]`: base64 JPEG, full-frame product photo on a white background. Used in the box editor and item detail page.
- `HERO_CUTOUTS[type]`: base64 PNG with the background actually removed (real alpha transparency via flood-fill, not a CSS trick) — used for the homepage floating hero tiles, the item-picker cards, and the auto-share post images. This is the "clean sticker" version of each photo.

Both are populated once per item; there is no multi-angle/multi-photo support currently (see Section 10 — this was deliberately stripped).

### `DB` — the live database (all in `localStorage['bmi_db4']`)

```js
DB = {
  listings: [ /* array of listing objects, see below */ ],
  activity: [ /* recent activity feed entries, {txt, ts} */ ]
}
```

### Listing object (one posted item)

```js
{
  id: 'abc1234',               // from uid()
  type: 'macbook',             // key into ITEMS — omitted if custom:true
  custom: true/false,          // true if the owner uploaded their own photo instead of picking a catalog item
  photo: '...',                // base64, only set if custom
  title: '...',                // only set if custom
  owner: 'Cam',
  mail: 'owner@email.com',
  habs: ['Coffee shops'],      // "Where it lives" tags
  freq: 'Daily',                // "How often" — one of FREQS
  social: '1K–10K',             // self-reported follower tier — one of SOCIALS
  socialLinks: {x:'handle', instagram:'handle', tiktok:'handle'},  // linked (not verified) handles
  slots: 4,                     // number of ad spots
  prices: [500, 500, 500, 499], // price per spot, sums to the retail price
  claims: [null, {...}, null, null],  // one slot per price; null = open, object = sold (see below)
  created: 1234567890,          // timestamp
  fundedAt: 1234567890,         // timestamp when pctOf() first hit 100 — set once, never overwritten
  ownerVerified: false,          // identity verification gate (mocked, see Section 9)
  verifyConfirmId: 'OV-XXXXXX',  // generated when ownerVerified flips true
  checkins: [ {date, photo, receipt, receiptDate, confirmId}, ... ]  // see below
}
```

### Claim object (one sold spot)

```js
{
  brand: 'Acme Corp',
  mail: 'brand@acme.com',
  link: 'https://...',          // optional
  logo: 'data:image/png;...',   // the sponsor's uploaded logo file
  amt: 500,                      // spot price
  fee: 100,                      // 20% platform fee
  escrow: 'held',                // 'held' | 'active' | 'risk' | 'complete' — see Section 7
  purchasedAt: 1234567890,
  subId: 'BMI-XXXXXX',           // shown to the brand at purchase, used for order tracking
  itemId: 'abc1234'
}
```

### Check-in object (one monthly proof submission)

```js
{
  date: 1234567890,              // when submitted
  photo: 'data:image/...',       // the check-in photo
  confirmId: 'CI-XXXXXX',        // generated per submission
  // first check-in only:
  receipt: 'data:image/...',     // uploaded receipt image
  receiptDate: 1234567890        // date the owner typed in, validated against fundedAt
}
```

---

## 4. Other key constants

| Constant | Purpose |
|---|---|
| `HABITATS` | `['Campus','Coffee shops','Gym','Office','Airport','Events']` — the "Where it lives" pill options |
| `FREQS` | `['Daily','Few times a week','Weekly','Occasionally']` — "How often" |
| `SOCIALS` | `['Under 1K','1K–10K','10K–100K','100K+']` — self-reported follower tier |
| `SOCIAL_PLATFORMS` | X, Instagram, TikTok — the "link your accounts" chips |
| `HAB_BY_CAT` | Maps an item's category to default habitat suggestions |
| `ESCROW_LABEL` | Maps escrow enum values to display text: Held / Active / At risk / Complete |
| `AUCTION_DAYS` | `14` — countdown length shown on live listings |
| `SITE_URL` | `'brandmyitem.com'` — used in auto-generated share captions |

---

## 5. Views and routing

`route()` reads `location.hash` and toggles `.on` on the matching `#v-<name>` div. Views: `home`, `dashboard`, `build`, `item`, `track`.

| Hash | View | Purpose |
|---|---|---|
| `#home` | `v-home` | Landing page: hero, floating item tiles, then the item picker + builder inline |
| `#dashboard` | `v-dashboard` | Browse all live listings, filter/sort |
| `#build` | `v-build` | Full builder flow (also embedded into home) |
| `#item/<id>` | `v-item` | One listing's detail page: photo with ad-spot overlay, escrow ledger, owner tools |
| `#track` | `v-track` | "Track my item" — look up submissions by email |

`placeBuilder()` handles a quirk: the same `.builder` DOM node is physically moved between the home page and the dedicated build page depending on which one is active, rather than duplicated. If you're debugging why the builder "disappears," check this function first.

---

## 6. Core user flows (step by step)

### A. Posting an item (owner side)

1. `showBuild()` renders the item picker (`#itemPick`) — a horizontal scrollable row of all 11 catalog cards, Apple-style (photo + brand + name + price, no card border), with round nav arrows at each edge.
2. Clicking a card calls `cuPickTemplate(k)`: loads that item's photo, resets to front-only (no side/back angles — see Section 10), and calls `cuApplyTemplate()` to auto-place ad-spot boxes using `mapTiles()` (which pulls pre-authored positions from `SCANDATA`).
3. `renderVariants(k)` renders the Finish/Storage row beneath the picker. Picking a size updates `document.getElementById('cuRetail').value` and re-runs `cuApplyTemplate()` so spot prices recompute live.
4. The box editor (`#cuCanvas` + toolbar) lets the owner adjust: Undo, Delete, Rectangle, Circle, Add box, Trace a custom shape (freeform, closes into an auto-partitioned set of spots via `cuPartition()`), Color, Save.
5. "Where it lives" / "How often" / "Social following" / "Link your accounts" are filled in (`showBuild()` wires these).
6. `postListing()` builds the listing object and pushes it into `DB.listings`, then navigates to `#item/<id>`.

### B. Buying a spot (brand side) — `openBid(i)` → 3-step modal *(ORIGINAL MODEL — simplified model charges the same way but drops the escrow-explainer step; see `FINAL_BUSINESS_MODEL_DECISIONS.md`)*

- **Step 1** (`#mStep1`): brand name, email, link, logo upload, price breakdown (spot price + 20% fee = total).
- **Step 2** (`#mStep2`): the escrow explainer — funds held, identity verification required, 12 months of check-ins required — then "Continue to Stripe →".
- **Step 3** (`#mStep3`): shown after `mClaim` completes the purchase. Displays a generated Submission ID (`BMI-XXXXXX`) and confirms an email was "sent."

`mClaim`'s click handler is where the claim object actually gets written into `CUR.claims[claimSlot]` and `updateEscrowStatuses()` runs for the first time.

### C. Owner tools (on the item detail page, `renderOwnerTools()`) *(ORIGINAL MODEL — identity verification described here is removed entirely in the simplified model; check-ins become display-only, not gated on verification or funding status)*

Two gated stages, in order:

1. **Identity verification** — a "Start verification →" button. Clicking it sets `ownerVerified=true`, generates `verifyConfirmId`, and immediately shows a confirmation box (ID + "sent to \<email\>"). This does **not** require full funding.
2. **Check-ins** — gated on *both* `ownerVerified` AND the item being 100% funded (`pctOf(CUR) >= 100`). Before both are true, it shows an explanatory message instead of a form (e.g. "Check-ins aren't needed yet — they start once the item is fully funded and shipped. 38% funded so far.").
   - **First check-in only** additionally requires a receipt upload + a manually-entered purchase date. That date is validated against `CUR.fundedAt` — if it's before the campaign funded (minus a day of buffer), submission is blocked with an explanation. This exists specifically to stop someone claiming credit for an item they already owned before running a campaign.
   - Every check-in (first or later) generates a `confirmId` and opens the share modal.

### D. Share modal (`openShare(photo, checkinId)`)

Pops up automatically after any check-in submission. Shows:
- The confirmation number + "sent to \<email\>" banner
- The actual item photo (not the raw check-in snapshot — deliberately, so the shared post looks polished)
- An editable auto-generated caption ("I got my MacBook Pro paid for by brands on brandmyitem.com 🎉")
- Three buttons: **Post to X** (real tweet-intent URL), **Share to Facebook** (real sharer URL), **Copy for Instagram** (copies caption to clipboard, since no platform allows posting from a website — this is stated honestly in the UI, not faked)

### E. Tracking a submission (`#track`)

Single required field: **email**. Submission ID is optional and only narrows results if provided. `showTrack()`'s click handler scans every listing's `claims` for matches, sorts newest-first, and `renderTrackResults()` renders **one card per match** — so one email with five purchases across five different items shows five cards. Each card has the Apple-order-tracker-style vertical timeline (purchased → funded → month 1 through 12) plus a collapsible "Advanced details" section with raw numbers.

---

## 7. The escrow state machine *(ORIGINAL MODEL — fully removed in the simplified model; there is no held/active/risk/complete state anymore, see `FINAL_BUSINESS_MODEL_DECISIONS.md`)*

Lives in `updateEscrowStatuses(l)`, called after every purchase and every check-in. Four states, one-directional (never moves backward):

```
held  →  active  →  complete
              ↘
               risk
```

- **held**: spot purchased, item not yet 100% funded.
- **active**: item fully funded. Transitions here the moment `pctOf(l) >= 100`; that same moment, `l.fundedAt` is stamped (once, never overwritten).
- **risk**: active, but the owner is 2+ months behind on expected check-ins (expected count is estimated from `(now - created) / 30 days`, capped at 12).
- **complete**: 12 check-ins submitted.

Every claim on a listing shares the same computed status (it's a property of the listing/campaign, not the individual claim, even though it's stored per-claim for display convenience).

---

## 8. Design system

- **Fonts**: Inter (body), a serif stack for display type — `--serif: 'ITC Garamond','Apple Garamond','Cormorant Garamond',Georgia,serif` (only the hero wordmark and page titles use it).
- **Color tokens** (CSS custom properties on `:root`): `--bg` (white), `--wash` (#F5F5F7, light gray), `--fg` (#1D1D1F, near-black), `--mfg` (#6E6E73, muted gray), `--border` (#E5E5EA). No blue links, no saturated brand colors anywhere except the platform share buttons (X black, Facebook blue, Instagram gradient) and the escrow status badges (amber/green/gray/red).
- **Radii**: `--r` 12px, `--r-lg` 16px, `--r-xl` 20px.
- **Layout rule**: every top-level section uses either `.wrap` or `.wrap-narrow`, both `max-width:1140px; margin:0 auto; padding:0 22px`. They were made to match on purpose after a real bug where they had different max-widths — **never let a new section use a different max-width or margin scheme**, or content will visibly misalign against everything else on the page. The header bar (`.nav`) is full-width for its background, but its actual content sits in `.nav-inner`, which follows the same 1140px rule.
- **No card/pill backgrounds for pickers**: item cards, in particular, deliberately have no border, no background, no pill shape — just image + text on the page background, matching Apple's own category-picker style. Selected state is a small underline beneath the name, not a filled background.

---

## 9. What's real vs. what's a mockup — read this before promising a client anything *(ORIGINAL MODEL table — identity verification row no longer applies since that feature is removed; everything else still accurate)*

| Feature | Status |
|---|---|
| Stripe checkout | **Mocked.** "Continue to Stripe →" completes the purchase locally. No Stripe API is called, no real card is charged. |
| Escrow holding funds | **Simulated via a status enum**, not real money movement. There is no payment processor integration at all. |
| Identity verification | **Mocked.** One click flips `ownerVerified=true`. No real ID check, no Stripe Identity call. |
| Check-in / receipt validation | **Real client-side date logic**, but does not read the receipt image. Someone could type a fake date next to a real (or fake) receipt photo and it would pass, as long as the typed date is after `fundedAt`. There is no OCR or manual review step. |
| Social account "linking" | **Real handle storage + real link-outs** (clicking a linked account opens the actual profile URL you typed), but **no OAuth, no follower-count verification.** This is intentionally honest in the UI — it does not claim to verify anything. |
| Social sharing (X/Facebook/Instagram) | **Real share intents** for X and Facebook (they open real share dialogs pre-filled with the caption). Instagram has no web posting API at all — the button copies the caption to clipboard, which is disclosed to the user. |
| Submission IDs / confirmation emails | IDs are real and unique (`uid()`-based). "Confirmation sent to \<email\>" is **text only** — no email is actually sent. There is no email-sending capability in this file at all. |
| Multiplayer / cross-device sync | **Not functional.** Everything lives in one browser's `localStorage`. The `CLOUD`/`cloudPush`/`cloudPull` scaffold exists but `HAS_CLOUD=false` disables it. |

If a next step is "make X real," the honest scope is: Stripe Connect (destination charges + delayed transfer for the escrow model), a real database instead of `localStorage`, Stripe Identity for KYC, and a transactional email provider. None of that exists yet.

---

## 10. Dead code and legacy systems — don't get lost in these

The file carries a large amount of code from an earlier architecture that has been fully superseded but not deleted, because ripping it out risked breaking things mid-project. If you're reading unfamiliar code and it looks like a 3D scene graph, **it's almost certainly dead**:

- **`mount3D()`, `makeScene()`, `buildItem()`, `loadMeshes()`, and everything using `THREE.*`** — an entire earlier version of the app rendered items as 3D models with logos placed via raycasting. `renderFinal()` (the actual function used everywhere now) has an unconditional early return before it would ever reach `mount3D()`. This is why `three.js` still loads from a CDN despite doing nothing.
- **`SCANDATA`** — a large embedded object with per-item pixel-grid "scan" data (`cells`, `G`, `x0/x1/y0/y1`) plus (still-used) `tiles` and `prices` sub-objects. Only `.tiles` and `.prices` are read today, by `mapTiles()`. The scan-grid fields are leftovers from the 3D auto-placement system and are not read by any live code path.
- **`ITEM_FACES`** — referenced defensively in a couple of places but **never defined anywhere in the file**. `cuPickTemplate()` was deliberately hard-locked to always use only the front photo (`CU.angles = [['Front', ITEM_PHOTOS[t]]]`) after a bug where multi-angle Front/Back/Left photos appeared unexpectedly. There is currently no working code path that could produce more than one angle — if multi-angle support is wanted later, it needs to be built from scratch, not re-enabled.
- **`renderSpotMap_DEAD`** — name says it all.
- **Cloud sync (`CLOUD`, `slimDB`, `fattenDB`, `mergeDB`, `cloudPush`, `cloudPull`, `cloudLoop`)** — a real, semi-complete scaffold for syncing `DB` to some remote store, gated on `window.storage` existing (see Section 2 — this will not exist on Replit or any standard hosting). Worth reading before building real multiplayer, since some of the shape (slim/fatten for payload size, merge logic) is already thought through, but it needs an actual backend endpoint wired in to do anything.

---

## 11. A few specific bugs that were fixed and why they matter going forward

These are worth knowing so the same class of bug doesn't get reintroduced:

- **Grid column overflow**: the "Pick your item" card once rendered wider than every other section on the page. Root cause: it sat inside a CSS Grid column with the browser default `min-width: auto`, which refuses to shrink a grid track below its content's natural width — even though the content itself (`overflow-x:auto`) was scrollable. Fixed with `min-width:0` on the grid item (`.bstage`). **Any new horizontally-scrolling content placed inside a grid or flex column needs `min-width:0` on its container, every time**, or it will silently blow out the layout width.
- **Header width mismatch**: the nav bar was `width:100%` with no max-width, while every other section respects the shared 1140px rule (Section 8). On wide viewports the logo/links sat further from center than the content below them. Fixed by wrapping nav content in `.nav-inner` with the same 1140px rule.
- **Hero full-bleed trick**: `.bighero` used a negative-margin/padding trick to bleed its background wider than the page's normal content width, which made it visibly wider than the card directly below it. Removed — the hero now obeys the same 1140px rule as everything else.

---

## 12. If you're an AI agent picking this up cold

- Read Section 9 out loud to yourself before writing any code that touches payments, identity, or email — it is very easy to accidentally "complete" a mocked feature by making it *look* more real without actually wiring up the real service, which is worse than leaving it obviously fake.
- Don't trust function names near `THREE`, `mesh`, `scene`, or `mount3D` — check Section 10 first.
- Before adding any new full-width page section, check what `.wrap` / `.wrap-narrow` / `.nav-inner` already look like (Section 8) and match them exactly.
- The single biggest fragility in this codebase is that it's all one file with no tests. Any change should be followed by actually rendering the page (not just reading the diff) before calling it done — several bugs in this project's history existed for multiple rounds specifically because a fix was assumed correct from reading the code rather than verified by rendering it.
