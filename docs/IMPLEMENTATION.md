# Implementation stages

## Stage 1 — application foundation

Implemented: Next.js App Router, TypeScript, Tailwind, PostgreSQL/Prisma schema and SQL migration, Argon2id password hashing, opaque database sessions, login/logout, persistent account-based login throttling, Chef/Super User server guards, administrator account creation, Chef deactivation with session revocation, account audit log and responsive protected pages. No financial dashboard values are fabricated.

Schema includes all requested entities plus Session, LoginThrottle and ForecastDay. GBP totals use BigInt pence; quantities and unit prices use PostgreSQL decimal. Dates representing a business day use PostgreSQL DATE. Nullable planning stock means unknown. SQL constraints enforce Monday weeks, Sunday stock counts, threshold ranges, unique daily sales and one invoice per order. Audit records cannot be updated/deleted through ordinary SQL. Original forecasts cannot be overwritten. Current catalogue prices are separate from stock-count price snapshots.

Stage 1 originally supplied the authenticated foundation. Stage 2 added sales entry and projections. The subsequent delivery below adds the financial dashboard and workflows. Account password resets, user editing, and administrator deactivation remain for the full user-management stage. There is no public registration or email delivery service.

## Stage 1 validation

Passed: 16 unit/schema tests, ESLint, TypeScript and production build. The isolated browser smoke test also passed against a temporary Prisma development PostgreSQL server, applying the committed migration through Prisma and exercising real sign-in, account creation, auditing, mobile Chef permissions, account deactivation and logout. No external production database has been configured.

## Confirmed business decisions

- Only SUPER_USER may create or edit forecasts. CHEF has read-only forecast access. Confirmed by the user on 19 September 2026.
- Initial next-order allocation: explicit stock-sufficiency confirmation and forecast-weighted demand from the next delivery day until the following delivery; warn when sufficiency is unknown. Confirmed by the user on 19 September 2026.
- Expected closing stock is an explicit nullable planning input, never inferred from opening stock.
- The target at equality is not below target. Negative allowance must remain visible.
- Order commitments belong to the expected delivery week. Confirmed purchases belong to the invoice accounting/delivery week. Received orders are replaced by invoices, never added twice.
- Final actual food cost requires complete sales, confirmed Sunday count and relevant purchase records.

## Stage 2 — sales and forecasts

The interrupted session had already added money/date helpers, sales services, forms, actions and the optimistic-version migration. The continuation connected the missing forecast/sales pages, replaced the foundation dashboard with weekly sales projections, added navigation, and added unit/service and browser workflow coverage. Existing authentication and business services were retained.

Implemented: Super User forecast creation/revision, immutable originals, seven-day week navigation, daily actual sales, reasons for corrections/historical entry, transactional audit entries, stale-form protection and finalized-week guards. Chefs enter only missing current-week sales; future actuals are rejected. Missing actuals retain forecast values and are flagged. Zero actuals replace forecast values correctly.

Validation: 26 automated tests, lint, TypeScript and webpack production build passed. The extended browser smoke test passed against an isolated database, including forecast creation/revision, immutable originals, Chef sales entry, projections, audit and role restrictions. Default Turbopack build is blocked by an environment local-port permission error. Both committed migrations are covered by the database tests.

## Remaining product extensions

Account password reset/editing screens and administrator deactivation remain outside this delivery. Supplier order submission is manual (no external messaging integration). Next-order allocation is limited to the selected accounting week; cross-week deliveries are supported for orders and invoice accounting, but planning budgets must be managed per week. VAT is excluded consistently. Stock transfers/adjustments beyond physical count corrections are not yet exposed as a separate workflow.

Each delivered stage is verified with relevant tests, lint, type checking and a production build. The sections below record the expanded requirements and delivery evidence.

## Expanded delivery plan — September 2026

Preserve all existing accounts and business records. Deliver and verify in this order:

1. Weekly target management: Super User settings, default history, independent Monday–Sunday overrides before forecasts exist, current/future/historical corrections, original and corrected values, source labels, reasons, immutable audit, Chef read-only display, exact target allowance and isolated recalculation.
2. Purchasing: suppliers, draft/placed/cancelled/received orders, receipt with invoice in one transaction, delivery-week commitments replaced by confirmed invoices, audited invoice corrections and credits.
3. Stock: products, decimal quantities/prices, Sunday counts with price snapshots, confirmation/corrections, explicit opening and expected closing stock, stock sufficiency and audited week close/reopen.
4. Financial engine and reports: real persisted inputs, integer pence/basis points, projected/actual cost, negative allowance, forecast-weighted next-delivery budgets, completeness rules, historical reports and CSV export.
5. UI: forest green/cream/muted gold design system, desktop sidebar and mobile menu, top allowance/next order/target/projected percentage cards, real-data sales/cost/allowance/supplier charts, accessible reduced-motion transitions and loading/success feedback. No fabricated financial metrics.

Confirmed for this continuation: sales and purchases exclude VAT. Round each quantity × unit-price stock line half up to pence; count waste through physical closing stock only. Explicit audited reopening is required before corrections affect finalized weeks. Historical target corrections retain original and corrected targets with actor, timestamp and reason. Default changes apply prospectively from next Monday; current and historical weeks are changed explicitly, never silently. Target changes affect budgets and threshold comparisons, not the underlying projected cost-to-sales ratio. Verify each stage with unit/database tests, role checks, browser workflows, lint, types and production build before declaring it delivered.

### Weekly target stage verification

Delivered settings and Chef read-only target/maximum-cost display. 37 automated tests, lint, type checking, webpack production build and the extended isolated browser smoke test passed. Existing data was backed up before applying the additive migration. Browser tests verified target saves, audit writes, Chef denial and unchanged sales records. Remaining stages below are not yet declared complete.

### Purchasing, stock, calculations and reports

Implemented supplier creation/activation, draft/placed/cancelled orders, atomic receipt/invoice confirmation, direct invoices, audited invoice corrections and credits; catalogue products and price changes; Sunday stock entry/confirmation with immutable line-price snapshots; opening-count carry-forward and explicit planning inputs; purchase completeness, finalized report snapshots and audited reopening; eight-week reports and CSV export. Financial engine uses integer pence, fixed-point quantity/price multiplication and basis-point threshold comparisons. Missing evidence stays unknown; credits and negative allowances remain visible. Allocation currently covers the selected week's next-delivery interval through at most the following Monday.

Validation: 43 automated tests, lint, TypeScript, webpack production build and isolated financial integration tests passed. Integration checks exercise cancelled/draft exclusion, commitments replaced by invoices, cross-week deliveries, duplicate receipts, invoice credits/corrections, rounded counts, historical price preservation, opening carry-forward, isolated target recalculation without sales/purchase/stock changes, finalized-week guards, historical reasons, roles and audit rollback.

### Responsive UI delivery

Implemented forest green, warm cream and muted gold tokens, consistent forms/cards/tables, active desktop navigation and a native mobile menu, financial priority cards, exact animated monetary displays, short chart transitions, loading/success feedback and reduced-motion support. Five Recharts views use database-derived values: forecast versus actual, daily sales performance, food cost versus target, eight-week allowance and supplier spending. Empty inputs remain explicitly unavailable. Financial history and CSV use exact pence; charts use numeric coordinates only for rendering, with exact formatted tooltip values.

Live database checks confirmed record counts unchanged across 11 existing business/account/audit tables after migration and review. Clean-browser review passed for desktop settings/dashboard, seven mobile routes, chart rendering and zero hydration/runtime errors. The development server was restarted after regenerating Prisma to clear the older cached client. QuillBot-related browser mutation guidance remains applicable.

### Final verification for this delivery

46 automated tests, lint, TypeScript, webpack production build, disposable financial integration suite and extended browser smoke suite passed. Browser tests include stock planning and the populated £74.50 allowance derived from test-database sales, purchases and stock, as well as all role/navigation/report flows. Live desktop/mobile review confirmed clean hydration without suppression props. The live database retains all pre-migration account/business/audit record counts; no sample financial records were inserted.
