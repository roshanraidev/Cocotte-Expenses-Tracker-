# Cocotte: local workflow

Use your Super User account in your normal browser and your Chef account in a private window. Passwords remain in the private `.env.local-accounts` file; they are not included in this guide.

## Safe automated test

The automated workflows use temporary databases and do not insert examples into Cocotte's database:

```sh
npm test
npm run lint
npm run typecheck
npm run build -- --webpack
npm run test:finance
npm run test:smoke
```

The browser test requires Google Chrome. The financial and browser suites create temporary local database servers. Do not run `db:seed` against your existing database.

## Super User: plan the week

1. Open Weekly Planning and select a Monday–Sunday week.
2. Enter and save all seven daily forecasts in GBP excluding VAT. The first saved values remain the original forecast.
3. Save that week's target percentage. Future weeks can have different targets. The settings/history link opens default-target scheduling and the audit trail.
4. Enter opening stock and expected Sunday closing stock. Click **Save stock plan**. Enter zero only when the real amount is zero; do not use zero for missing information.
5. Open Supplier Management. Add or edit a supplier. Deactivation prevents new selection but preserves historical orders and invoices.

## Chef: daily sales and purchasing

1. Open Daily Sales. It defaults to today. Choose an earlier date to record a missed day; historical entries require a reason. Only the Super User can correct existing sales.
2. Return to Dashboard: actual sales replace the original forecast for recorded days. Unrecorded days keep their original forecast.
3. Open Supplier Orders → Create supplier order. Select an active supplier, order date, delivery date, value and status. Draft and Cancelled do not reduce the allowance. Placed uses the estimate.
4. A newly added supplier appears on navigation/reload, on returning to the window, or after the automatic 30-second refresh while no field is focused.
5. If an order exceeds the projected allowance, read the warning and explicitly acknowledge it before saving. The app does not change its amount.
6. When a placed order arrives, choose **Receive delivery & confirm invoice**, enter its reference, actual delivery date and invoice total. The confirmed invoice replaces the estimate; both are never deducted together. Alternatively, register an already received order with its invoice reference/value.
7. The delivery date determines the accounting week. An order placed Sunday for Monday delivery reduces the new week's allowance. If it actually arrives on a different date, its invoice follows the actual delivery date.
8. Corrections to confirmed invoices require the Super User and an audit reason. Contact suppliers separately; saving an order here does not send it to them.

## Reports and week end

1. Open Reports and choose the week. Sales shows daily figures, cumulative figures and a cumulative chart. Blank actual days appear as a dash and have no chart point.
2. Purchasing & Food Cost explains the allowance formula and shows projected versus actual cost. Actual cost is provisional until every completion condition is met.
3. Suppliers supports week/month/supplier filters, confirmed-spending charts, invoice counts and transaction details. Outstanding estimates are shown separately.
4. Weekly History opens previous weekly reports. Export to CSV uses the current report/filter; Print report prints the selected tab.
5. On or after Sunday, the Super User enters actual closing stock in Weekly Planning. No individual-product counts are required.
6. In Purchasing & Food Cost → Week close & audited corrections, confirm all purchases after all invoices are recorded and outstanding orders are received/cancelled.
7. Only after Sunday has ended in Europe/London, with all seven actual sales, opening/actual closing stock and complete purchases, does the report become Final. **Finalize week** locks it and saves the reported snapshot. Reopening requires an explicit reason.

## Check the arithmetic without changing real records

These are examples for understanding or an isolated test database, not suggested entries for Cocotte's live accounts:

- Seven original daily forecasts of £100; one recorded day of £50 → original forecast £700; updated projection £650.
- At 23%, maximum cost of sales is £149.50. Opening £100 and expected closing £50 → purchasing budget £99.50.
- A placed £25 order → available £74.50. Receive it with a £30 invoice → available £69.50, not £44.50.
- Cancel a placed order → its estimate no longer reduces the allowance.
- With seven actual days totalling £700, opening £100, confirmed purchases £30 and actual closing £50: cost of sales £80; food cost 11.42% (displayed to two decimals). It remains provisional until the completion requirements above are satisfied.

All money calculations use exact integer pence. Quantities and unit prices use fixed-point decimals, rounding each stock line half up. No stock, invoice, account or historical record is deleted by the navigation redesign.
