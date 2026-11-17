# Weekly Sales Overview

The main /dashboard displays this section immediately below its greeting and
week selector, before the existing purchasing cards. The Weekly Available to
Spend hero, purchasing tables and cumulative chart remain present.

The selected Monday–Sunday week controls all values. Dates use the existing
Europe/London business-date handling. No schema changes or migrations are
needed, and this feature has no sales/purchasing/forecast write operations.

## Source and duplicate safety

Total Net Sales is the sum of the canonical DailySales rows for the restaurant
and selected dates. Manual sales are included. Unapproved Zonal previews never
contribute. The existing unique restaurant/date index guarantees one official
daily record; the pure overview also fails closed on duplicate canonical dates.

Detail attaches to at most one current approved ZonalImport per date, using the
existing source resolver. Restaurant, date, APPROVED status, completion time,
canonical net amount and sales version must match. An older import cannot
silently become the source after a newer approval or manual correction.
Reports are revalidated before displaying their amounts.

The Financial Detail parser defines Food, Drink and SPECIALS as separate net
departments. Food + Drink + Specials must reconcile to net within the existing
1p per-report rounding tolerance. Specials are not added to Food again.
Gross Sales is Zonal's after-discount gross, and gross minus VAT equals net;
discounts are shown separately and never deducted twice. Cost % is not used.

## Display and incomplete data

The section shows:
- Recorded Total Net Sales and net Food, Drink and Specials.
- Gross Sales, Discounts and VAT.
- Covers, transaction count and net spend per cover.
- Original forecast for recorded dates and their sales variance in GBP/%.
- Original full-week forecast and separate projected weekly net sales.
- A daily actual/forecast trend and department composition chart.
- Expandable seven-date daily breakdown, source indicators and report link.
- Current approved import timestamp and complete/partial recorded-day status.

All weekly detailed totals require detail for every recorded day; missing or
stale details produce Not available rather than fabricated zeros or misleading
partial category totals. Individual valid days remain visible in the breakdown.
Covers and transactions are independently unavailable if their counts are
missing. Average net spend per cover uses total recorded net / total covers,
rounded to the nearest penny; it is unavailable if covers are missing or zero.
Genuinely recorded zero amounts remain zero.

Forecast variance compares the same recorded dates against original forecasts,
rather than comparing a partial week's actuals against a full week's forecast.
The existing projection includes recorded net plus latest saved forecasts for
unrecorded days. No projections are counted as actual sales.

The original purchasing calculation and this overview share a repeatable-read
database snapshot through dashboardWeek. financialWeek, calculateFinance and
projectSales formulas are unchanged. Opening/closing stock never affect Money
Available to Spend. Dashboard copy now reflects this existing rule.

## Verification

- Unit coverage in tests/weekly-sales-overview.test.ts includes sample category
  definitions/rounding, counts/average, preview/repeated-import exclusion,
  manual/stale/corrupt detail, restaurant/date isolation, forecast comparability,
  zero baselines, complete/partial weeks and canonical duplicate rejection.
- scripts/weekly-sales-check.ts uses disposable PostgreSQL, an isolated app and
  synthetic reports. It exercises actual approval services and checks cards,
  charts, daily breakdown, Daily Sales/Reports agreement, week selection,
  incomplete detail, preserved forecasts/purchasing calculations and 320/390px.
  Resize-observer charts are allowed to settle before width checks.
- scripts/runtime-smoke.ts checks the actual localhost pages read-only and
  verifies existing financial records, recipes, forecasts, stock rows, users
  and encrypted credentials remain unchanged.

The browser fixture never connects to Zonal or modifies real restaurant data.
