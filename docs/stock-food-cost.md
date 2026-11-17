# Stock & Food Cost reporting

Open Stock & planning → Stock & Food Cost dashboard as a Super User.
Route: /admin/stock-food-cost.

## Verified Zonal capability and limitation

Authorised live discovery on 6 November 2026 used the existing encrypted
credentials, login cooldown and isolated server-side Playwright worker.

- Login genuinely succeeded.
- Report catalogue links observed: Closing Stock Variance. and Stock Result Summary.
- The exact Stock Result Summary link opened; its Profit Centre control was present.
- Branch 003 food/drink valuations, stocktake dates/periods, opening and closing
  stock, delivery/credit/transfer fields and report totals remain UNVERIFIED.
- No stock amounts or periods were extracted.

Automatic stock extraction is unsupported. Sync Stock from Zonal currently
performs bounded, read-only catalogue/control discovery and records a safe
audit. It does not pretend to retrieve stocktake periods. No report selectors
or stock values were invented. No scheduling or automatic approval is enabled.

Discovery returns only strict metadata: known parameter labels and bounded
catalogue titles. Credentials/session data/raw reports never leave the worker.
No password is requested through chat or terminal. Sessions close and cookies
are destroyed. Existing one-minute login cooldown, running-worker guard,
network policy and challenge detection remain. Stock checks are refused while
a sales batch is running.

To complete automatic extraction: inspect the actual report parameters and
rendered report for the authorised branch; verify costing basis, food/drink
classification, stocktake period IDs, opening/closing boundaries, credits and
transfers; then implement and fixture-test a strict parser. Catalogue access
alone is not verified stock extraction.

## Manual fallback

Choose a completed inclusive business-date period (Europe/London, at most
366 days). Opening food stock is the cost valuation before its first day;
closing food stock is after its last day. Enter food-only stock and transfers
excluding VAT, supported by dated evidence. Explicit zero means no transfers;
blank values remain missing.

Purchases/credits come ONLY from existing Cocotte invoices, scoped by
restaurant, food workspace and accounting date. Confirm these dates represent
actual receipts/credits for the stocktake period.

Select confirmed, nonvoid invoices and allocate verified food amounts. Mixed
invoices need an explicit food portion; the whole invoice is never assumed to
be food. Credit food allocations are positive magnitudes deducted once.
Allocations cannot exceed source amounts. Repeated invoice IDs are rejected.
Zonal deliveries are never added again. Manual transfers exclude invoiced
deliveries.

Confirm period completeness/classification. Unconfirmed food-workspace
invoices block approval. Enter missing purchases through the existing invoice
workflow, never as an additional stock delivery total.

Net food sales can use:
1. Current approved Zonal Food department amounts for every date, matching
   canonical DailySales versions/amounts and the approved report. Drink and
   Specials are excluded because Specials food classification is unverified.
   Missing/stale days produce Incomplete Data.
2. A verified manual food-only net-sales report for exactly this period,
   with an evidence reference and explicit confirmation.

Total restaurant net sales never replace missing net food sales.

## Calculation and quality

Consumption = opening food stock + allocated food purchases + transfers in
minus allocated food credits, transfers out and closing food stock.

Actual Food Cost % = consumption / actual net food sales × 100.

Money uses integer pence; percentages use basis points. Missing evidence,
negative consumption, zero denominator, invalid/incomplete periods and stale
source records block the percentage/approval. Verified zero consumption is
valid.

Preview never approves. New approvals require a reason; corrections require
explicit replacement confirmation and a reason. Sources are checked again
inside the approval transaction. Later invoice or food-sales changes mark an
approved snapshot Incomplete Data until reviewed/corrected, without silently
rewriting its approved stock values.

Charts/KPIs use approved periods only. Previews are separate. There are no
invented chart values. Previous-period dates are shown because lengths differ.

## Database and financial isolation

Migration 20261106000200_food_cost_reporting creates FoodCostPeriod and
FoodCostPreview only, with restrictive restaurant/user FKs and FOOD checks.
It does not alter old tables, seed or reset data.

Unique index FoodCostPeriod_restaurantId_from_to_category_key guarantees one
canonical record per restaurant, exact stocktake period and category.
Restaurant/RestaurantSettings row locks and expected-version updates serialize
approvals. Identical repeats do nothing; changes correct the same record with
an audit of before/after values. Fingerprints normalize invoice/day ordering.

This ledger is never read by financialWeek, calculateFinance, purchasing
budgets or Money Available to Spend. Existing rules remain:
- Budget = projected net sales × purchasing target.
- Money available = budget minus confirmed food purchases.
- Purchasing % = confirmed food purchases / actual total net sales.

Stock affects only separate consumption reporting. Preview/approval never
changes recipes, sales, forecasts, invoices, optional stock counts or credentials.

## Checks

- npm run typecheck; npm run lint; npm test.
- npm run build: environment Turbopack port-binding permission failure.
  npx next build --webpack is the separately verified production path.
- node --conditions=react-server --import tsx scripts/food-cost-check.ts:
  disposable PostgreSQL and test server; synthetic data only. Tests exact
  calculations, allocations, missing data, same-ID corrections, unique index,
  concurrent retries, stale sources/versions, permissions/isolation, historical
  periods, approved Food sales coverage, responsive approval UI and purchasing
  isolation. Never connects to the restaurant database or Zonal.
- npx tsx scripts/runtime-smoke.ts: read-only localhost pages; creates/removes
  only its own temporary session. Before/after hashes check real financial,
  recipe, forecast, stock reporting, user and encrypted connection data.
- node --conditions=react-server --import tsx scripts/zonal/discover-stock.ts:
  explicitly invoked LIVE authorised catalogue discovery, no retry. Creates
  safe audit/connection-test metadata only, never approves stock or sales.
