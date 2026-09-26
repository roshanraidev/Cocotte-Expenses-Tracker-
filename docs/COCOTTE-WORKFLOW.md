# Cocotte: simple purchases and browser review

Use your existing Super User account in your Mac browser and Chef account on your phone or in a private window. Passwords remain private; no account reset is needed. All saved data lives in the shared PostgreSQL database.

## Start on your Mac

```sh
cd ~/Desktop/restaurant-cost-tracker
brew services start postgresql@17
npm run dev -- --webpack --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. If the app is already running, just refresh. After applying schema changes, restart the old dev server with Control-C before starting again. The additive purchase migration has already been applied locally. Do not reset or reseed.

For phone access, see [the local-network instructions](HOSTING.md#phone-preview-on-the-macs-local-network). Both devices connect to the same application and database; the phone needs no database installation.

## Super User: plan and suppliers

1. Open **Weekly Planning** and select a Monday–Sunday week. Enter the seven daily net-sales forecasts and that week's target.
2. The **Optional stock planning** card keeps opening stock, expected Sunday closing stock and actual Sunday closing stock together. Enter opening and expected closing values, then **Save stock plan**. Actual closing stock is available on or after Sunday. Blank actual closing means unknown; zero means a genuine zero valuation.
3. Opening stock is manual and is never replaced by a previous count. No product entry or daily stock counts are required.
4. Add or edit a supplier in **Supplier Management**. On the Chef device, return to the window, reload, or focus the supplier dropdown. The new active supplier appears from the shared database.

## Chef or Super User: one purchase form

1. Open **Supplier Purchases**. **Record Supplier Purchase** has exactly four required fields: supplier name, order date, delivery date and total amount EXCLUDING VAT.
2. Enter the actual net amount supplied by your records. The app does not calculate, add or remove VAT.
3. Click **Save Purchase** once. The record is confirmed immediately. There is no status selection, invoice reference or second confirmation step.
4. Repeated requests with the same submission key create only one database record. The button is disabled while saving; supplier/amount fields clear after success so an accidental second click does not repeat the purchase.
5. Reload the page to confirm the purchase remains in the recent-purchases table. Use the delivery-week selector or the **View delivery week** link if the purchase belongs to another week.
6. An order dated Sunday with a Monday delivery is allocated entirely to the new Monday week. Future delivery dates are allowed; the recorded net purchase is confirmed in that delivery week, not the order week.
7. Open **Dashboard** for that delivery week. Available to spend is maximum purchasing budget minus confirmed, non-void purchases. Estimates from historical orders are not deducted. The largest card is labelled PROJECTED.

## Corrections and voids

1. As Super User, find the purchase and expand **Corrections & audit** below the table.
2. Change supplier/dates/amount as necessary, provide a reason, and **Save correction**. Moving the delivery date updates both affected weeks. Saved forms detect concurrent edits.
3. To undo an erroneous purchase, provide a reason and click **Void purchase**. It remains visible as Voided, with its audit history, but no longer reduces allowances or appears as confirmed supplier spending.
4. Refresh the Chef's dashboard/reports to see the same corrected figures. Visible pages also refresh periodically (30 seconds) and on window focus while no form is being edited.
5. Chef accounts cannot correct or void purchases. Finalized weeks must be reopened by a Super User with a reason before changes are allowed.

## Reports and week-end

- **Sales:** original forecast versus actual, cumulative actuals and a chart. Unrecorded days remain blank; the live projection uses the latest saved forecasts for those days.
- **Food Purchasing:** purchasing budget = projected net sales × weekly target. Available to spend = that budget − confirmed food purchases. Final purchasing percentage = confirmed food purchases ÷ actual weekly net sales. Stock values do not affect these figures.
- **Suppliers:** confirmed spending chart, numerical table, week/month/supplier filters and underlying purchase details. Voids are excluded; historical credits remain included once.
- **Weekly History:** previous Monday–Sunday weeks with links to detailed reports. CSV and print use the selected report.

Stock values may still be saved for separate stock records, but they are optional for purchasing control. Once the week has ended in London and all seven sales are present, the purchasing report can be Final. New purchases are already confirmed; there is no extra confirmation button. If old unconfirmed records exist, the report explains the reconciliation needed. **Finalize week** remains an optional Super User lock that preserves a reported snapshot; reopening is explicitly audited.

## Safe automated verification

Use these tests to try example data without entering fabricated records in your real restaurant database:

```sh
npm test
npm run lint
npm run typecheck
npm run build -- --webpack
npm run test:finance
npm run test:smoke
```

Integration/browser tests use disposable PostgreSQL-compatible databases. They cover exact net amounts, delivery allocation, simultaneous duplicate requests, corrections, voids, audit/history, week-end stock, cross-device visibility, page reload and screen widths from 320px to 1440px. The browser test needs installed Chrome (`CHROME_PATH` can override its location).

Example: projected net sales £650 × 23% = £149.50 purchasing budget. Saving a £25 confirmed food purchase leaves £124.50. Correcting it to £30 leaves £119.50. Voiding it restores £149.50. The real app uses your actual database figures.

## Packaging & Chemicals (second workspace)

Use the Workspace switcher below the logo. Roshan and Dewan keep their existing accounts and roles across both workspaces. No new account or password is needed.

- **Upload first:** Upload Invoice opens a large chooser/drop area immediately. PDF/JPG/JPEG/PNG files have a local preview before upload; no supplier selection is required. Upload & review invoice stores the original securely, then attempts scanning. Enter invoice manually is also available.
- **Quick review:** check the supplier and the three product columns: name, quantity, total price excluding VAT. Correct/add/remove rows and check the invoice net total. No catalogue, category, unit-price or VAT form is required in the main workflow. A Super User can create/enable suppliers under Supplier options; a Chef can save a draft awaiting assignment.
- **Dates:** absent order/delivery dates and order numbers show Not found. Optional details lets you enter them if known. An invoice date is not used as an order/delivery date. Saved invoices without a delivery date are available in the Undated report filter.
- **Save:** SAVE INVOICE confirms reviewed net spending; Save draft keeps it out of reports. Net product totals must equal the invoice net total. Duplicate and accounting discrepancy checks still apply. Original files remain available across devices.
- **Catalogue:** matching is a later Super User task. Unclassified products are included separately in reports. Linking compatible supplier descriptions preserves original invoice descriptions and audits changes. Effective prices are calculated from reviewed net totals and quantities; unknown units/dates prevent misleading unit-price comparisons.
- **Reports:** select week/month/custom delivery range and optional supplier/category/product. Click a product for chronological order/delivery history, supplier, quantities, net unit prices/line totals and original invoice links. Two lines for the same product on one invoice count once in invoice frequency. Prices/quantities are aggregated only for comparable, known units. Average price is weighted net spending divided by quantity; change compares first/last prices within the selected period.
- **Mistakes after confirmation:** Super User can void with a reason. The original record remains visible and is excluded from spending. For a replacement record, use the supplier's corrected invoice reference or a clearly marked correction reference; the original supplier/number remains reserved to prevent accidental duplicates.

On a phone use the same shared-server URL described in HOSTING.md. Choose Take Photo/Photo Library when selecting a file; save photos as JPG/PNG because HEIC is unsupported. Confirmed packaging spending must change only the packaging dashboard/reports, never the Food Weekly Available to Spend figure.
