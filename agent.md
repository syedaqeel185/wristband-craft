You are a senior full-stack architect and engineer. Your task is to transform the existing EU Wristband web application into a production-ready commercial platform.

First, analyze the complete existing codebase before making changes:
- Understand current frontend architecture
- Understand current backend/API structure
- Understand existing database/models
- Identify bugs, missing features, poor architecture, duplicated logic, and UX issues
- Do not rewrite working parts unnecessarily
- Improve the current system professionally

The final application must be production-ready, scalable, maintainable, secure, and follow enterprise development practices.

## Product Overview

This platform is for wristband suppliers and customers.

Suppliers should be able to:
- Create and manage supplier accounts
- Manage company profile
- Add/edit/remove wristband products
- Configure pricing
- Manage wristband types
- Manage design pricing
- Manage QR pricing
- Manage trademark/branding options
- Manage orders
- View customer requests
- Manage inventory if required

Customers should be able to:
- Browse wristband types
- Customize wristbands
- Create multiple custom wristbands
- Add multiple customized wristbands to cart
- Review pricing dynamically
- Place orders

---

# Core Business Logic

## Wristband Products

Products are wristband types.

Examples:
- Silicone wristbands
- Fabric wristbands
- Tyvek wristbands
- Vinyl wristbands
- Event wristbands

Each product should have:

- Name
- Description
- Images
- Base price
- Minimum quantity
- Available sizes
- Available colors
- Material
- Supplier
- Status

---

# Dynamic Pricing Engine

Pricing must not be hardcoded.

Create a flexible pricing system.

Final price should be calculated based on:

Base wristband price

+

Design charges

+

QR code charges (if enabled)

+

Trademark charges (if enabled)

+

Quantity rules

+

Additional customization options


Example:

Base wristband:
€0.20

Custom design:
+ €50

QR code:
+ €0.05 per wristband

Trademark:
+ €20


The pricing engine should be extendable for future options.

---

# Design Studio Improvements

The current design studio needs major improvements.

Create a professional wristband customization experience.

Requirements:

User should be able to:

- Upload design
- Add text
- Add logo/image
- Adjust position
- Resize elements
- Rotate elements
- Change colors
- Preview wristband
- Save design
- Edit saved design
- Duplicate design

The editor should maintain correct positioning.

The generated preview should represent the actual wristband.

Make the design studio modular so new tools can be added later.

---

# QR Code Logic

QR code is an optional customization.

If customer enables QR:

- Generate QR preview
- Add QR pricing automatically
- Allow QR placement adjustment

Important:

Trademark placement rule:

If QR is enabled:
Trademark must ALWAYS appear immediately after QR code.

The order must be:

Design elements

→ QR Code

→ Trademark


This rule should be enforced automatically.

User should not be able to place trademark before QR.

---

# Cart System

A customer should be able to create multiple customized wristbands.

Example:

Cart:

Item 1:
Blue silicone wristband
Custom design A
QR enabled
Trademark enabled
Quantity 500

Item 2:
Black fabric wristband
Custom design B
No QR
Quantity 200


Each cart item must preserve:

- Product
- Custom design data
- Uploaded assets
- Pricing snapshot
- Quantity
- Options selected


Do not overwrite designs.

---

# Database

Choose the best database solution.

Preferred:
PostgreSQL

Use a proper ORM.

Recommended:
Prisma ORM

Design production-quality schema.

Include:

Users

Suppliers

Customers

Products

ProductVariants

PricingRules

Designs

DesignElements

Assets

QRCodeSettings

TrademarkSettings

Cart

CartItems

Orders

OrderItems

Payments (future ready)

Audit logs


Use proper relations, indexes, constraints.

---

# Backend Requirements

Backend:

Node.js

Use a professional architecture.

Recommended:

NestJS or Express with clean architecture.

Requirements:

- Authentication
- Authorization
- Role based access control

Roles:

ADMIN
SUPPLIER
CUSTOMER


Implement:

- Validation
- Error handling
- Logging
- Secure APIs
- Environment configuration
- Database migrations
- API documentation


---

# Frontend Requirements

Improve current UI.

Requirements:

- Modern responsive design
- Good UX
- Loading states
- Error states
- Proper form validation
- Clean component structure


The design studio should feel like a real SaaS product.

---

# Supplier Dashboard

Create a complete supplier dashboard:

Features:

Profile management

Product management

Pricing management

Orders

Customer designs

Analytics

Settings


---

# Security

Implement:

- Secure authentication
- Password hashing
- JWT/session handling
- Input validation
- File upload security
- Permission checks
- Protection against common vulnerabilities


---

# Code Quality Requirements

Follow senior engineering standards.

Rules:

- Clean architecture
- SOLID principles
- Reusable components
- No duplicated logic
- No temporary hacks
- No unnecessary dependencies
- Production error handling

Before finishing:

Run:

- Tests
- Build
- Linting
- Database migration checks


---

# Development Approach

Work module by module.

Before coding:

1. Analyze current system
2. Create implementation plan
3. Identify risks
4. Execute changes

After every major module:

Explain:
- What was changed
- Why
- How it works
- Any remaining improvements


Do not create fake/mock functionality.

Everything implemented must work end-to-end.

The final result should be a production-ready EU Wristband SaaS platform.


Please update this file when for each module. You can ask me question if anything needed. 

---

# Module Log

> Running record of completed modules. Each entry documents **what** changed, **why**, **how it works**, and **remaining improvements**, per the Development Approach above.

## 2026-06-28 — Infrastructure: PostgreSQL migration

**What**
- Switched the datasource from SQLite to **PostgreSQL** (`server/prisma/schema.prisma`).
- `PrismaService` now connects via the `@prisma/adapter-pg` driver adapter (Prisma 7 requirement); removed `better-sqlite3` + `@prisma/adapter-better-sqlite3`.
- Added `docker-compose.yml` running `postgres:16-alpine` (DB/user/pass all `wristband`).
- Reset the SQLite migration history and generated a fresh Postgres baseline migration (`init`).
- Updated `server/.env` / `.env.example` to a Postgres `DATABASE_URL`; added `PORT`.
- Excluded `prisma.config.ts` from the Nest build so output stays at `dist/main.js` (matches `start:prod`).

**Why**
- The spec prefers PostgreSQL; SQLite (with JSON-as-string columns and no concurrency) is not production-grade.

**How it works / how to run**
- Local DB: `docker compose up -d` (exposes Postgres on host port **5433** — 5432 is taken by a pre-existing native Postgres on this machine).
- `cd server && npx prisma migrate dev` applies migrations; `npm run start:dev` boots the API on :3000.
- Verified: app boots, connects, `prisma migrate status` = up to date, unit tests pass.

**Remaining improvements**
- Dev data from the old `dev.db` was **not** migrated (fresh schema). Reseed dev data if needed.
- Many JSON-string columns (`imageUrls`, `availableSizes`, order snapshots, `canvasJson`) could become native `Json` columns now that we're on Postgres.

## 2026-06-28 — Module: Dynamic Pricing Engine + Products catalog

**What**
- Added per-currency add-on price fields to `Product`: `designSetupFee{Usd,Eur,Gbp}` (flat), `qrCodePrice{Usd,Eur,Gbp}` (per unit), `trademarkFee{Usd,Eur,Gbp}` (flat).
- New **`PricingModule`** (`server/src/modules/pricing/`): `POST /pricing/quote` returns an authoritative, itemised price breakdown.
- New public **`ProductsModule`** (`server/src/modules/products/`): `GET /products` (catalog with `?wristbandType=&supplierId=&search=`) and `GET /products/:id` (active products only, with public supplier info).
- Hardened supplier product writes in `SuppliersService` with an explicit field allowlist (`pick(...)`) — blocks mass-assignment of `id`/`supplierId`/timestamps and lets the new pricing fields through. Pricing tiers are sanitised the same way.
- Client: typed helpers `getProducts`, `getProduct`, `getQuote` + interfaces in `client/src/lib/api.ts`.

**Why**
- Pricing was hardcoded/scattered (product fields + `PricingConfig`) with no QR/trademark/design charges and no single computation path. The spec requires a flexible, extensible engine.
- There was no public catalog — products were only reachable per-supplier.

**How it works**
- `PricingService.quote()` composes a `PriceComponent[]`: base unit price (quantity-tier aware, falls back to product base), per-unit add-ons (print, logo, QR), and flat fees (design setup, trademark). `unitPrice × qty + flat fees = total`. Per-currency values fall back to USD when a currency override isn't set. Adding a new option = one more block appended to `components` — no other code changes.
- Validated end-to-end against live Postgres: supplier register → create product (with tiers + add-ons) → browse → quote. Example (qty 1000, EUR, colour print + QR + custom design + trademark) returned total **€360** with a correct line-by-line breakdown; below-min-qty correctly 400s; injected `id`/`supplierId` were ignored.

**Remaining improvements / known limitations**
- **Order pricing is still client-trusted**: `OrdersService.create` accepts `totalPrice`/`unitPrice` from the request. The next integration step should make `PricingService` authoritative for order totals (recompute server-side). This is a security/business-logic fix and should land with the Cart module.
- `printExtra`/`colorPrintExtra`/`logoExtra` remain **USD-only** columns; for non-USD currencies the USD amount is applied as-is (no FX). Add per-currency columns or an FX layer when needed.
- `suppliers.service.ts` carries pre-existing `dto: any` lint debt (type-aware `no-unsafe-*` rules); new code in pricing/products modules is lint-clean. Tighten supplier DTOs during the Security/RBAC hardening module.
- No automated tests yet for `PricingService` — add unit tests covering tier selection, currency fallback, and each add-on.

## 2026-06-28 — Bug fixes (supplier dashboard)

**What / why**
- **Products added but not listed** — root cause was a route-ordering bug in `suppliers.controller.ts`: `@Get(':id/products')` was declared before `@Get('me/products')`, so `GET /suppliers/me/products` matched the parametric route with `id="me"` and queried `supplierId="me"` (always empty). Reordered so all static `me/*` routes precede parametric `:id/*` routes; also removed a duplicate `:id/pricing` route. Verified `getMyProducts` now returns the supplier's products.
- **"Manage Pricing" blank page** — `SupplierPricing.tsx` referenced `WRISTBAND_TYPES` and `DEFAULT_CONFIG` that were never defined, throwing a ReferenceError on render. Added both constants.
- **No way to set add-on prices** — `SupplierProducts.tsx` only had base price + quantity tiers. Added a "Customization Add-on Pricing" section (black/colour print, logo, QR per-unit, design setup, trademark) wired to the new `Product` columns the pricing engine reads, plus a summary line on each product card. Backend already allowlists these fields.

**Verified:** server build + restart, `getMyProducts` returns products with add-on fields persisted, client `tsc --noEmit` clean.

## 2026-06-28 — Module: Design Studio overhaul + production exports

**What**
- **Pricing**: the studio now calls the authoritative `POST /pricing/quote` engine instead of doing client-side math against the legacy `PricingConfig`. Selecting a product shows its **initial price immediately**; the order summary renders the engine's itemised breakdown (base, print, logo, QR/unit, design setup, trademark). Order totals are submitted from the quote.
- **Layout (QR → Trademark → Design)**: rewrote the canvas as named zones — QR at the far-left white zone, the **trademark as vertical text in a strip immediately to the right of the QR**, then the printable design area, then the closing/adhesive zone. Logos/custom text are clipped to the design area. Enforces the spec's "trademark immediately after QR" rule by construction.
- **Print-ready look** (matched to a real Tyvek reference): band rendered at true 255×25mm proportions (1200×118px) **at 1:1 with horizontal scroll** (no shrinking/rounding). QR sits on a white tab at the left edge; the **vertical trademark sits 5px to the right of the QR in the same left area with no border/strip**; the rest is the printable area. Straight rectangular band (no rounded sides). Dashed **die-cut guide lines run along the top & bottom** (a few px inset). Logo upload limit raised to 15MB and auto-fits into the print area instead of rejecting.
- **HTTP 413 fix**: a saved design's `canvasJson` embeds the logo as base64, which exceeded Express's default 100kb JSON limit on `POST /designs` and `/orders`. Raised `json`/`urlencoded` body limits to 30mb in `server/src/main.ts`. (Follow-up: upload logos as separate assets and store URLs to keep payloads small.)
- **Trademark on white**: the left white tab now spans the QR **and** the vertical trademark (5px gap, no border), so the trademark never sits on the coloured print area. Print area begins after it.
- **Print-gated uploads + background**: the logo upload only appears after "Add Print" is enabled, alongside a new **wristband background image** upload (full-bleed `canvas.backgroundImage`, stretched across the band; the white QR/trademark tab stays on top). `Clear Canvas` resets the background too.

## 2026-06-28 — Module: Supplier order management + delivery

**What**
- **Supplier sees only their own orders** — `findVisibleOrders` (supplier branch) now queries `where supplierId = me AND status != DRAFT` (DRAFTs are customers' carts). Removed the old "browse all platform orders / anonymized" behaviour.
- **Rebuilt `AdminDashboard`** as a real order-management console: status badges + **action buttons driven by the server state machine** (PLACED→ACCEPTED→IN_PRODUCTION→SHIPPED→DELIVERED, with Cancel). The old dropdown used statuses (`approved`/`processing`/…) that didn't match the backend and silently failed validation.
- **Delivery system**: each order shows the **shipping address**; a shipment form (courier, tracking number, tracking URL, est. delivery) posts to `PATCH /orders/:id/shipment`, which marks the order SHIPPED. Tracking summary shown once set.
- **Production downloads** per order: Mockup PNG · Logo(s) · Text · Spec PDF · **full-length Wristband PDF** (`downloadWristbandPdf` in `lib/production.ts` — landscape A4, artwork sized to the band's aspect ratio). Fixed stat cards to compute from the visible orders.

**Why**
- Suppliers were shown every order on the platform and couldn't actually advance status (status names mismatched the backend); there was no address display or shipment capture, and no full-length wristband export for production.

**Verified:** server build + client `tsc` + full `vite build` clean. E2E: supplier sees only their PLACED order (DRAFT hidden), and PLACED→ACCEPTED→IN_PRODUCTION→shipment(SHIPPED)→DELIVERED all return 200.

## 2026-06-28 — Module: Text styling + Stripe payments

**Text styling (DesignStudio)**
- Custom text: a style toolbar (font family, size, **B**/*I*, colour) that applies to newly-added text **and live-restyles the selected text** (`styleActiveText`).
- Trademark: font family + bold/italic added (alongside the white/black colour). Styles persist in `metaJson` and restore with the design.

**Stripe payments (test mode)**
- New `payments` module: `POST /payments/checkout` creates a Stripe **Checkout** session for the user's orders and returns the hosted URL; `GET /payments/confirm?session_id=` reconciles after the success redirect — if Stripe reports the session `paid`, the order is marked `paymentStatus=paid` **and advanced to `ACCEPTED` (ready for production)** with a status-history entry (idempotent).
- Flow: Address page saves the order `PLACED` (+ address) → `createCheckout` → redirect to Stripe → success returns to `/payment-success?session_id=…` → `confirmPayment` verifies server-side. The supplier dashboard then shows the order as ready to produce.
- Keys live in `server/.env` (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `CLIENT_URL`). Test card: `4242 4242 4242 4242`, any future expiry/CVC.
- **Verified:** live test-mode session creation returns a real `checkout.stripe.com` URL; confirm returns `paid:false` until Stripe confirms.

### Switching to LIVE Stripe later
1. In the Stripe Dashboard, toggle to **live mode** and copy the live keys (`sk_live_…`, `pk_live_…`).
2. Set them in the production environment's `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` (never commit; rotate the test keys that were shared in chat).
3. Set `CLIENT_URL` to the production domain (HTTPS) so redirects resolve.
4. **Add a webhook for robustness** (the current redirect-confirm misses payments if the user closes the tab): create a webhook endpoint for `checkout.session.completed`, set `STRIPE_WEBHOOK_SECRET`, and reconcile there too. The webhook needs the **raw** request body — register it before the global `json()` parser (e.g. a `body-parser.raw` route or `rawBody: true` on a dedicated controller) and verify with `stripe.webhooks.constructEvent`.
5. Keep amounts authoritative: compute the charge from `PricingService` server-side rather than the client-supplied `totalPrice` (see pricing-integrity follow-up).

## 2026-06-28 — Module: Email notifications (Resend)

**What**
- New global `EmailModule` / `EmailService` (Resend wrapper, branded HTML layout, all sends best-effort/never throw). Templates: order-confirmation request, production-started, shipped (with tracking), delivered.
- **Lifecycle wiring:**
  - Stripe payment confirmed → `EmailService.orderConfirmationRequest` with a **signed, tokenized confirm link** (`${CLIENT_URL}/confirm-order?token=…`, JWT, 14-day expiry).
  - Customer clicks the link → public `POST /orders/confirm-production` (token-authenticated, no login) verifies the token and advances **ACCEPTED → IN_PRODUCTION**, then sends the production-started email. New `OrdersPublicController` sits outside the JWT guard.
  - Supplier saves shipment → SHIPPED → shipped email (courier/tracking/ETA). Status → DELIVERED → delivered email.
- Client: `ConfirmOrder` page + `/confirm-order` route + `confirmProduction()` API helper.
- Env: `RESEND_API_KEY` (new key) + `EMAIL_FROM`.

**Verified:** server build + client `tsc` clean. E2E: order ACCEPTED → `confirm-production` → IN_PRODUCTION (201); invalid token → 400; EmailService confirmed calling Resend (got Resend's `validation_error` 403 — see below).

### Email transport: nodemailer / SMTP (provider-agnostic, since 2026-06-29)
`EmailService` sends via **nodemailer over SMTP**, so it works with *any* provider — just set the `SMTP_*` env vars (Gmail, your own domain, Brevo/Mailgun/SES relay, …). The `from` is whatever `EMAIL_FROM` says. (Replaced the earlier Resend→Brevo API integrations; both removed.)
- **Config:** `SMTP_HOST`, `SMTP_PORT` (587 default), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (true for 465), `EMAIL_FROM`.
- **Dev fallback:** if `SMTP_HOST` is blank, it creates an **Ethereal** test inbox — mail isn't delivered but a **preview URL is logged** per send, so the whole flow is testable with zero credentials.
- Transport is lazy-initialised and cached; all sends are best-effort (never throw).

**Verified live:** build clean; the full lifecycle (accepted / in-production / supplier-confirmed) all sent through Ethereal SMTP with preview URLs. For production, point `SMTP_*` at a real relay and ensure the `EMAIL_FROM` domain has SPF/DKIM for inbox delivery.

## 2026-06-28 — Email expansion + Homepage suppliers & reviews

**Email/flow fixes**
- `CLIENT_URL` corrected to `http://localhost:8081` (was 5173) — fixes Stripe success/cancel redirects **and** the confirm-order email link.
- `PaymentSuccess` now shows a prominent "**check your email to confirm your order**" message (production starts on confirm).
- **Supplier notifications added**: supplier emailed on a new paid order (payment confirmed) and again when the customer confirms (begin production). **Customer notifications expanded**: emails on accepted, in-production, shipped, delivered (the supplier dashboard's status actions now trigger the matching customer email).

**Homepage suppliers + reviews**
- Schema: new `Review` model (rating 1–5, comment, optional orderId) + `Supplier.reviewCount`; migration `add_reviews`.
- Backend (suppliers module): `GET /suppliers/directory` (public — company, location, rating, reviewCount, services = distinct active product types, productCount); `GET /suppliers/:id/reviews` (public); `GET /suppliers/:id/can-review` + `POST /suppliers/:id/reviews` (auth). **Review eligibility: the user must have a DELIVERED order from that supplier**; one review per user/supplier (upserts); supplier `rating`/`reviewCount` recomputed on each review.
- Frontend: `SuppliersShowcase` on the homepage — supplier cards with rating stars, services badges, a reviews dialog (list + review form when eligible), and **"Design with this supplier"** which stashes the choice in `localStorage` (survives the auth redirect) and opens the Design Studio with that supplier preselected. Existing studio flow unchanged.

**Verified:** server build + client `tsc` + full `vite build` clean. E2E: directory lists services; review blocked (403) without a delivered order and `can-review=false`; after the full lifecycle to DELIVERED, `can-review=true`, review posts (201), and the directory rating/count update (4.0, 1).

## 2026-06-29 — Pricing integrity · Supplier dashboard · Review popup

**Pricing integrity (security fix)**
- `OrdersService.create` now **recomputes the authoritative price server-side via `PricingService`** whenever the order has a `productId` — the client-supplied `totalPrice`/`unitPrice` are ignored. Options are read from `printType` + the saved `customizationNotes` snapshot (qr/trademark/print/logo). The full quote is stored in `pricingSnapshotJson`. Added `productId` to `CreateOrderDto` (it was previously stripped and never persisted!). `OrdersModule` imports `PricingModule`.
- Verified: a request claiming `totalPrice=1` for a 1000-qty order with QR+trademark was **overridden to €220** (0.15×1000 + 0.05×1000 + 20). Orders without a product still fall back to the client total (logged) — fully closed once everything goes through products/cart.

**Supplier dashboard (richer)** — `AdminDashboard` now has 6 KPI cards (orders, revenue, paid revenue, avg order value, in-pipeline, delivered), two **recharts** charts (orders-by-status, revenue last 6 months), and an **order history** with status filter + search (by order # / customer). Supplier still sees only their own orders.

**Reviews moved to a delivered-order popup** — removed the suppliers section from the homepage. New `GET /suppliers/pending-reviews` (auth) returns suppliers that delivered an order to the user but aren't reviewed yet. App-level `ReviewPrompt` (mounted in `App.tsx`) shows a star+comment dialog on the next visit after delivery; dismissible per session, reappears until reviewed. Eligibility still enforced server-side (delivered order required).

**Verified:** server build + client `tsc` + full `vite build` clean. E2E: tampered price overridden to €220; `pending-reviews` empty before delivery, returns the supplier after DELIVERED.

## 2026-06-29 — Module: Cart

**What** — replaced the new-tab / DRAFT-order pseudo-cart with a real cart.
- Schema: `Cart` (one per user) + `CartItem` (designId, productId, supplierId, quantity, currency, `optionsJson`, `priceSnapshot`); `Profile.cart`, `Design.cartItems`. Migration `add_cart`.
- `CartModule`: `GET /cart` (items with **live server-recomputed** prices + subtotal), `POST /cart/items`, `PATCH /cart/items/:id` (qty), `DELETE /cart/items/:id`, `DELETE /cart`, `POST /cart/checkout`. Checkout turns each item into a **PLACED, server-priced order** via `OrdersService.create` (so the pricing-integrity recompute applies), attaches the shipping address, then empties the cart and returns `orderIds`.
- Client: `addToCart`/`getCart`/`updateCartItem`/`removeCartItem`/`checkoutCart` in `api.ts`. **Design Studio** now adds to the cart (both "Continue to Summary" and the new-tab "Add to Cart") instead of creating DRAFT orders. **OrderSummary** is now the cart view (live items, qty edit, remove, totals). **Address** loads the cart, and on submit calls `/cart/checkout` → `createCheckout(orderIds)` → Stripe (legacy `orderIds` path kept as fallback). Dashboard header has a **Cart button with a live count badge**.

**Verified:** server build + client `tsc` + full `vite build` clean. E2E: 2 items → subtotal €370 (270+100); qty update → €470; remove → €200; checkout → 1 PLACED order at server price €200, cart emptied.

## Remaining roadmap
- **Stripe webhook** — production payment robustness (see the Stripe "switching to LIVE" notes above).
- **Cleanup**: retire the legacy DRAFT-order checkout path now that the cart is the entry point.

> Homepage suppliers showcase is shown to **customers and signed-out visitors**, and **hidden for signed-in suppliers** (they go straight to their dashboard) — gated by `!isSupplier` in `Index.tsx`.

> **Customer dashboard suppliers** (`DashboardSuppliers`): a "Choose a Supplier" section with **Recently ordered** / **All suppliers** tabs. `GET /suppliers/recent` (auth) returns suppliers the user has ordered from, most-recent first. Supplier cards were extracted into a reusable `SupplierGrid` (shared by the homepage `SuppliersShowcase` and the dashboard). "Design with this supplier" preselects them in the studio.
- **Google / social auth** — deferred by request (email auth covers login).
- **Saved-mockup restore (was broken)**: root cause was Fabric v6 — `loadFromJSON(json, cb)` treats `cb` as a per-object *reviver*, not a completion handler, so restore resolved before images loaded. Now uses the awaited promise. Restores all toggle states from `metaJson`. Structural objects are **never persisted** (tagged `zone`, filtered out on save) and always rebuilt from state, eliminating the old duplicate-element bugs. `MyDesigns` "Order" now forwards `canvasJson`/`metaJson` so restore works from there too.
- **Supplier production exports**: new `client/src/lib/production.ts` extracts each uploaded logo and every text element out of `canvasJson` and builds a print spec PDF (jsPDF). `SupplierDesigns` shows the full spec (type, qty, colour, print, QR, trademark text, logo/text counts) and offers **separate downloads: Mockup PNG · Logo(s) · Text(.txt) · Production PDF**. Rewrote the previously-broken `ProductionDownload` (used in AdminDashboard) to the current API shape using the same lib.
- **Backend**: added `Design.metaJson` (full customization snapshot) — migration `add_design_meta_json`; DTO + service wired; returned by `/designs/mine` and `/designs/platform`.

**Why**
- Pricing was disconnected from the engine and often blank; trademark sat on the wrong edge; restore silently failed; suppliers had no way to get raw production assets (logo/text/PDF) — the old `ProductionDownload` referenced Supabase-era field names and was dead against the NestJS API.

**Verified:** prisma migrate applied; server build clean; client `tsc --noEmit` + full `vite build` clean; API round-trip confirms `metaJson`+`canvasJson` persist and return via `/designs/mine`.

**Remaining improvements**
- Order pricing trust (still client-supplied `totalPrice`) — recompute via `PricingService` server-side; planned with the Cart module.
- Logos are extracted from the embedded canvas (base64). Consider uploading each logo as its own asset (the `DesignImage` table already exists) for higher-fidelity production files.
- Per-currency print/logo extras are still USD-only (see pricing module note).

## 2026-07-07 — Module: SaaS foundation (subscriptions, RBAC, admin, countries) — Phase 1

**What**
- **Schema** (`server/prisma/schema.prisma`, migration `saas_foundation`): new models `SubscriptionPlan`, `Subscription`, `SubscriptionPayment`, `SupplierPaymentMethod`, `PaymentTransaction`, `Country`, `AuditLog`. `Supplier` gained `countryCode` (FK→Country), `state`, `status` (ACTIVE|SUSPENDED). String-status convention (no Prisma enums), `@map` snake_case. Seeds: `prisma/seed.ts` (60 countries + `starter` plan w/ 30-day trial + backfills a TRIALING subscription for every existing supplier) and `prisma/seed-admin.ts` (owner account from `OWNER_EMAIL`/`OWNER_PASSWORD`). Run seeds with `npx ts-node prisma/seed.ts` — they're excluded from the Nest build (`tsconfig.build.json` excludes `prisma`) so `dist` output is unaffected.
- **Security layer** (`server/src/common/`): `@Roles()` + `RolesGuard` (first real RBAC — used with `AuthGuard('jwt')`); `crypto.util.ts` (AES-256-GCM, keyed by `APP_ENCRYPTION_KEY`) for encrypting supplier payment config; global `AuditService`/`AuditModule`. Fixed `PATCH /orders/bulk` — it was authenticated but unscoped (any user could mutate any orders); now `@Roles('admin','supplier')` + scoped to the supplier's own orders via `updateMany`.
- **Subscriptions** (`modules/subscriptions/`): trial auto-created in the register transaction. `getUsableState()` reconciles lazily on read (no cron): schema mode auto-renews (rolls period + records a PAID `SubscriptionPayment`); Stripe mode → PAST_DUE for webhooks to resolve; cancel-at-period-end → EXPIRED. `assertActive()` gates `SuppliersService.createProduct` and `OrdersService.create` (PLACED w/ supplier) — reads never gated, throws 403 `code:'SUBSCRIPTION_INACTIVE'`. Supplier endpoints: `GET /subscriptions/me`, `/me/payments`, `/plans`, `POST /me/cancel|resume|plan`. Live Stripe Billing (`stripe-billing.service.ts` + `POST /webhooks/stripe`, raw-body via `rawBody:true` in main.ts) is inert unless `BILLING_PROVIDER=stripe`.
- **Admin/owner** (`modules/admin/`, `@Roles('admin')`): `GET /admin/overview` (supplier/subscription/revenue/customer/order stats), supplier mgmt (`/admin/suppliers` search+country+status, suspend/activate/delete), subscription list + manual override, plan CRUD.
- **Countries** (`GET /countries`, public) + **payment-methods** (`modules/payment-methods/`, supplier-owned CRUD, config encrypted, secrets never returned — only `maskedConfig`).
- **Frontend**: `SupplierSignup` now collects Country (required)/State/City; `lib/api.ts` gained countries/subscription/payment-method/admin helpers and now surfaces error `code`; new `SubscriptionBanner` (mounted on supplier dashboard), `SupplierBilling` page (`/admin/billing`), and `PlatformDashboard` (`/platform`, admin-gated, KPIs + orders chart + supplier table). Admin users route to `/platform` on login.

**Why**
- No subscription/gating, no per-supplier payment abstraction, no real RBAC, no platform-owner admin, and suppliers had no country. This is the foundation the rest of the SaaS spec (Stripe Connect checkout, country-aware discovery, revenue analytics) builds on.

**Decisions**
- Customer→supplier payments will use **Stripe Connect** (Phase 2) — schema laid now, no raw gateway secret keys stored. Subscription billing is **schema-driven now**, live Stripe Billing behind `BILLING_PROVIDER`. Expiry/renewal is **lazy on read** (no cron infra).

**Env added:** `APP_ENCRYPTION_KEY` (32-byte base64/hex, required for payment methods), `BILLING_PROVIDER` (none|stripe), `OWNER_EMAIL`/`OWNER_PASSWORD`. See `.env.example`.

**Verified:** migrate applied + seeds ran (60 countries, starter plan, 17 trials); server build + client `tsc` + `vite build` clean. E2E (curl): register supplier (DE) → `/subscriptions/me` TRIALING 30d → product create 201 → expire period → read auto-renews to ACTIVE + €29 PAID recorded → admin suspend → product create **403**, product read **200** → activate → create **201**; cancel/resume OK; payment-method config **encrypted in DB (no plaintext IBAN), masked in API**; `/orders/bulk` **403** (customer) / **401** (anon). Browser: signup shows country/state/city; `/platform` renders all KPIs + supplier table; `/admin/billing` shows plan/next-billing/payment history — no console errors.

**Remaining (later phases):** Stripe Connect onboarding + destination charges + supplier payment-method UI (Phase 2); country-aware supplier discovery (Phase 3); revenue analytics depth, coupons/taxes (Phase 4); UI polish + rename supplier `/admin`→`/supplier` (Phase 5).

## 2026-07-07 — Module: Per-supplier payments & checkout routing — Phase 2

**What**
- **Stripe Connect onboarding** (`modules/payment-methods/stripe-connect.service.ts`): create Express account, onboarding account-link, and status refresh. `POST /payment-methods/stripe/connect` + `GET /payment-methods/stripe/status`. Fully gated — if the platform Stripe account hasn't enabled Connect, onboarding returns a clear 400 pointing to dashboard.stripe.com/connect.
- **Checkout routing** (`PaymentsService.createCheckoutSession` rewritten): groups the customer's orders **by supplier** and routes each to that supplier's default payment method — **Stripe Connect** → a Checkout Session per supplier with a **destination charge** (`payment_intent_data.transfer_data.destination`, optional `application_fee_amount` via `PLATFORM_FEE_PERCENT`); **manual/bank/wallet** → orders marked `awaiting_payment` and the supplier's instructions returned; **no method** → reported `unavailable`. Returns `{ routes[], url }` (`url` = first Stripe session for single-supplier back-compat). Money goes to the supplier, not the platform.
- **Manual confirmation**: `POST /payments/orders/:id/mark-paid` (supplier/admin) marks an offline-paid order `paid` + `ACCEPTED`. Both Stripe confirm and manual mark-paid now write a **`PaymentTransaction`** ledger row (customer→supplier, with platform fee).
- **Frontend**: new `SupplierPayments` page (`/admin/payments`) — Stripe Connect card (connect/continue/status) + bank/wallet CRUD (BANK_TRANSFER/JAZZCASH/EASYPAISA/PAYPAL/MANUAL) with masked config; `PaymentSuccess` renders per-supplier manual instructions; `Address` checkout follows Stripe URL or shows manual instructions; `AdminDashboard` order cards gained a **Mark paid** action for `awaiting_payment` orders + a Payments nav link.

**Why**
- Spec #2/#3: every customer payment previously went to one platform Stripe key. Now each supplier manages their own methods and receives payment directly.

**Decisions / limits**
- **Stripe Connect can't be E2E-tested here** — the test key's account hasn't enabled Connect. The Connect path is built + correct + gracefully gated; enabling Connect in the Stripe dashboard activates it live. The **manual/bank path is the fully-verified route** and lets suppliers accept money immediately without Connect.
- One Checkout Session per supplier (destination charges can't span connected accounts); multi-supplier carts return multiple routes — the UI follows the first Stripe URL and shows manual instructions for the rest.

**Env added:** `PLATFORM_FEE_PERCENT` (optional marketplace fee, default 0).

**Verified:** server build + client `tsc` + `vite build` clean. E2E (curl): supplier adds BANK_TRANSFER (default) → customer order (server-priced €100, tampered total overridden) → checkout returns **manual** route + instructions, order `awaiting_payment` → supplier **mark-paid** → `paid`/`ACCEPTED` + **`PaymentTransaction`** row (BANK_TRANSFER €100 PAID) → Stripe connect start returns graceful 400. Browser: `/admin/payments` shows Connect card + masked bank methods + add form — no console errors.

## 2026-07-07 — Module: Country-aware supplier discovery — Phase 3

**What**
- **Customer country**: added `Profile.countryCode` (migration `profile_country`). `POST /auth/register` accepts optional `countryCode`; `GET /auth/me` returns it; new `PATCH /auth/me/country` lets a customer set it later.
- **Directory query API**: `GET /suppliers/directory` now takes `country`, `category` (wristband type), `minRating`, `sort` (rating|newest|popular), and `near` (customer country). When `near` is set and no explicit `country` filter, local suppliers float to the top (`isLocal` flag), preserving the chosen sort within each group. Suspended suppliers are excluded. Entries gained `countryCode`, `totalOrders`, `createdAt`.
- **Frontend**: reusable `SupplierDirectory` component (filter bar: country / category / rating / sort) — defaults to **"My country first"** when the customer's country is known, else "All countries". Extracted `SupplierGrid` into its own module (`SupplierGrid.tsx`) to break the import cycle; it now renders a **Local** badge. Wired into the customer dashboard ("All suppliers" tab) and the homepage showcase. Customer signup (`Auth.tsx`) gained an optional Country select.

**Why**
- Spec #6: suppliers were listed without localization. Customers now see nearby suppliers first and can filter by country/category/rating/popularity.

**Verified:** server build + client `tsc` + `vite build` clean. E2E (curl): `country=DE` → 2 DE suppliers; `near=DE` → DE-first with `isLocal=true`; `sort=newest` → newest first; `category=silicone` → all offer silicone; `minRating=4` → all ≥4; register with `countryCode` → `/auth/me` returns it, `PATCH /auth/me/country fr` → normalized `FR`. Browser (logged-in DE customer): dashboard directory defaults to "My country first", the 2 DE suppliers sort first **with Local badges**, 4 filter selects render — no console errors.

## 2026-07-08 — Module: Revenue analytics + coupons & taxes — Phase 4

**What**
- **Schema** (migration `coupons_taxes`): `Coupon` (code, percent/fixed, value, active, expiry, max/timesRedeemed), `TaxRate` (per-country %, active), `Subscription.couponId`, and `SubscriptionPayment.discountAmount`/`taxAmount`.
- **Effective pricing** (`SubscriptionsService`): `computeCharge()` = plan price − coupon discount + country tax; surfaced in `getUsableState().pricing` (+ `coupon`), and applied when `autoRenew()` records a payment (stores discount/tax/total). `POST /subscriptions/me/coupon` (validate active/expiry/redemption-limit, attach, increment redemptions) + `DELETE /subscriptions/me/coupon`.
- **Admin** (`@Roles('admin')`): `GET /admin/revenue` (MRR run-rate, month/year/all-time revenue, tax collected, discounts given, 6-month trend, failed payments, upcoming renewals ≤30d, cancelled list); coupon CRUD (`GET/POST/PATCH /admin/coupons`); tax-rate upsert (`GET/POST /admin/tax-rates`).
- **Frontend**: `PlatformDashboard` gained a **Revenue** section (KPIs + 6-month trend bar chart + failed/upcoming/cancelled mini-lists) and a **Coupons & Taxes** manager (create coupon, enable/disable, upsert per-country tax). `SupplierBilling` shows the **price breakdown** (plan − discount + tax = total) and a **coupon apply/remove** field.

**Why**
- Spec #4 Revenue + Subscription Management: MRR/annual revenue, failed payments, upcoming renewals, and the (previously "future-ready") discounts/coupons/taxes — now functional end-to-end, not stubs.

**Verified:** server build + client `tsc` + `vite build` clean. E2E (curl): admin creates DE VAT 19% + coupon SAVE20 (20%) → supplier applies it → `pricing` = base €29 − €5.80 = €23.20 taxable + €4.41 VAT = **€27.61**; period expiry → auto-renew records a payment (amount €27.61, discount €5.80, tax €4.41); `GET /admin/revenue` returns month/year/total €56.61, tax €4.41, discounts €5.80, 6-month trend, 19 upcoming renewals; coupon `timesRedeemed`=1. Browser: `/platform` renders Revenue KPIs + trend + coupons/taxes manager (SAVE20, DE VAT); `/admin/billing` shows the breakdown + applied coupon + €27.61 in history — no console errors.

**Roadmap remaining:** Phase 5 — UI/UX polish pass (empty/loading/error states, responsive, notifications) + rename supplier `/admin`→`/supplier`. Stripe Connect still needs a Connect-enabled Stripe account to go live (Phase 2 note).

## 2026-07-08 — Module: Supplier route rename + UI polish — Phase 5

**What**
- **Renamed the supplier console `/admin/*` → `/supplier/*`** (`/supplier`, `/supplier/products|pricing|designs|billing|payments|reset-password`) to remove the naming overlap with the platform-owner dashboard at `/platform`. Updated every client `navigate()` call and the `ProtectedRoute` redirect/guard logic; `ProtectedRoute` now sends admins to `/platform` and suppliers to `/supplier` (`homePath`), and treats both `/supplier` and `/platform` as console areas. Added **back-compat redirects** so old `/admin/*` links resolve to the new paths. The backend admin API prefix (`/admin/*` in `lib/api.ts`) is unchanged — those are the owner's server routes, not client paths.
- The app already carries consistent loading spinners, empty states, `sonner` toasts, and error handling built across Phases 1–4 (billing, payments, platform, directory pages); Phase 5 kept those and focused on the structural route clarity.

**Why**
- `/admin` was historically the *supplier* console (confusing now that a real platform-owner dashboard exists at `/platform`). Suppliers now have a clearly-named home.

**Verified:** client `tsc` + `vite build` clean; grep confirms zero stray client `/admin` navigate/guard refs. Browser routing (no backend needed — `ProtectedRoute` redirects deterministically without a token): `/supplier/billing` resolves (→ `/auth`, not 404); old `/admin/products` back-compat-redirects (→ `/auth`, not 404); unknown path → 404. Responsive: no horizontal overflow at 375px on signup/auth.

> **Env note (2026-07-08):** Docker Desktop (local Postgres on :5433) was stopped this session, so the DB-backed backend couldn't run for a full click-through — this is an environment issue, not a code one; the dev data is intact in the Docker volume and returns once Docker is running (`docker compose up -d`). All prior phases' backend E2E passed against this DB.

## 2026-07-13 — Module: Product photos · Supplier storefront · Price sort · Per-supplier delivery · Map picker

**What**
- **Product photos** — the supplier product dialog (`SupplierProducts.tsx`) now uploads photos to Vercel Blob via the existing authenticated `POST /designs/upload` (new `uploadImage()` in `lib/api.ts`; never base64). Photos are stored as the existing `Product.imageUrls` JSON string (first = primary), shown on the supplier's own cards, the public catalog, and the storefront/product detail.
- **Public supplier storefront** (`/suppliers/:id`, `SupplierProfile.tsx`) — new public `GET /suppliers/:id/profile` composes company info + active products (with parsed image galleries + pricing tiers + add-ons) + reviews + delivery couriers + aggregate stats (products, orders fulfilled, rating, member since). **Privacy: only aggregate order counts are exposed, never other customers' order data.** New `ProductDetailDialog.tsx` (image gallery, volume pricing, add-ons, "Customize this product" → studio via `preferred_product` localStorage). `SupplierGrid` cards now link to the storefront ("View store" + clickable name) and show a "From €x" price. `DesignStudio` honours `preferred_product`.
- **Sort by price** — `directory()` supports `price_asc | price_desc` (by each supplier's min product price, sorted in-memory since it's a relation aggregate; no-product suppliers last) + `rating_asc` ("Lowest rated"). Surfaced in `SupplierDirectory` sort dropdown.
- **Per-supplier delivery** — new `ShippingRate` + `ShippingRateTier` models (migration `shipping_rates`, purely additive) + `modules/shipping` (`ShippingService`: allowlisted CRUD, `computeShipping()` = default active courier → free-over-qty → quantity tier, **DHL fallback** when unconfigured so shipping is never silently €0). Supplier routes `GET/POST /suppliers/me/shipping` + `PATCH/DELETE /me/shipping/:id`, public `GET /suppliers/:id/shipping`. New `SupplierShipping.tsx` (`/supplier/shipping`, "Delivery" nav link) CRUDs couriers with tiers/free-over/est-days/default. **Authoritative checkout**: `CartService.checkout` groups items by supplier, computes shipping server-side, folds into each supplier's first order `extraCharges.shipping`+`shippingCourier` (client-supplied shipping ignored); `getCart()` returns a per-supplier shipping breakdown. `Address.tsx` displays the server breakdown (courier + cost) instead of the client-side DHL calc (kept only for the legacy DRAFT path).
- **Location picker** — new `LocationPicker.tsx` (Leaflet + OpenStreetMap tiles + **free Nominatim** geocode/reverse, draggable pin, "My location" via `navigator.geolocation`) on the checkout Address page; selection auto-fills the (still-editable) address fields. **No API key / no billing.** `leaflet` + `react-leaflet@4` (React 18) added to the client.

**Why**
- Spec: richer product listings with photos, a pro-ecommerce supplier storefront (products/reviews/pricing/stats), price sorting, supplier-owned couriers/rates, and a map-based address picker.

**Verified** (E2E against local Postgres + browser preview): product created with `imageUrls` → persisted + returned by `/products/:id` and `/suppliers/:id/profile`; storefront renders header/stats/products/reviews/delivery + product gallery + "Customize"; `directory?sort=price_asc/desc` orders correctly; supplier courier CRUD → `/suppliers/:id/shipping`; cart shipping breakdown = FedEx €30 for 6000 pcs; **checkout ignored a tampered `shipping:999` and folded the authoritative €30 + €19 express (total €1249)**; Address page shows "Delivery (DHL) €20.00" + a working Leaflet map; Nominatim search "Brandenburg Gate, Berlin" auto-filled Pariser Platz 1 / Berlin / 10117 / Germany. Server build + client `tsc` + `vite build` clean. Migration `shipping_rates` applied to **production Neon** (additive: 2 tables).

**Decisions / notes**
- Map provider is **free OpenStreetMap/Leaflet** (chosen over Google Maps to avoid an API key + billing). Nominatim is fine for low checkout volume (debounced, attributed); for scale, self-host Nominatim or use a paid geocoder — the picker is provider-swappable.
- "Sort by rates" interpreted as **price** (highest-rating already = "Top rated").
- `react-leaflet` pinned to **v4** (v5 requires React 19; project is React 18).