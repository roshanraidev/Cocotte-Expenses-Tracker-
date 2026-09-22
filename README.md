# Restaurant Food Cost Tracker

A Next.js / React / TypeScript application with Tailwind CSS, PostgreSQL, Prisma and secure email/password authentication. Currency: GBP. Business timezone: Europe/London.

**Current implementation:** Secure Chef/Super User accounts; weekly forecasts and sales; default and weekly food-cost targets with scheduling and audit history; immediate confirmed supplier purchases with audited corrections/voids; manual weekly stock planning and preserved historical order/count tools; exact food-cost calculations, finalized reports and CSV export; responsive forest-green/cream/gold allowance dashboard and detailed four-tab real-data reports and reduced-motion support. See [implementation status and business rules](docs/IMPLEMENTATION.md).

## Run your existing Cocotte installation on your Mac

Your accounts and database already exist. Do not copy over `.env`, reset the database, or run the seed again.

```sh
cd ~/Desktop/restaurant-cost-tracker
brew services start postgresql@17
npm run db:generate
npm run db:migrate
npm run dev -- --webpack --hostname 127.0.0.1
```

If an older development server is running, stop it with Control-C before starting it again. Open http://127.0.0.1:3000. Sign in with your existing Super User or Chef email address and private password. To open the private local account file without displaying it in Terminal:

```sh
open -a TextEdit .env.local-accounts
```

For the full role-by-role workflow, see [the Cocotte walkthrough](docs/COCOTTE-WORKFLOW.md).

## First installation only


Requirements: Node.js 22.18+ (Node 24 recommended), npm and a PostgreSQL 16+ database. PostgreSQL can run via a local installation, Docker, or a hosted service. PostgreSQL and Docker are not bundled.

1. Install dependencies and configure your local environment:

   ```sh
   npm ci
   touch .env
   ```

2. Create an empty PostgreSQL database and a database user. Put its actual connection string in `DATABASE_URL` in `.env`. Create your private `.env` locally; environment files are not included in this repository. For hosted PostgreSQL, use the provider's TLS connection settings.

   Optional Docker setup, if Docker is installed:

   ```sh
   # Choose a strong password for this local database before running this command.
   docker run --name restaurant-postgres \
     -e POSTGRES_USER=restaurant \
     -e POSTGRES_PASSWORD=YOUR_CHOSEN_PASSWORD \
     -e POSTGRES_DB=restaurant_cost_tracker \
     -p 127.0.0.1:5432:5432 \
     -v restaurant_pgdata:/var/lib/postgresql/data \
     -d postgres:17
   ```

3. Set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (12–128 characters), `SEED_ADMIN_NAME` and `RESTAURANT_NAME` in `.env`. There are no built-in login credentials.

4. Generate the client, apply the committed migration and provision the initial administrator:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

5. Open [localhost:3000](http://localhost:3000), sign in using your seeded account, and open Administration → Manage users to create Chef accounts. Remove the seed password from `.env` after initial provisioning. The seed refuses to overwrite existing accounts.

The database must be running for authenticated requests. An unconfigured database does not trigger a demo login or mock dataset.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build -- --webpack
npm run test:finance
npm run test:smoke
```

Tests cover password hashing, input validation, session expiry and revocation, server role guards, and the SQL migration's important constraints. Migration tests run against PGlite, an embedded PostgreSQL engine; they do not require an external server. An additional browser smoke test applies the real Prisma migration, seeds an administrator and exercises the production app through a temporary PostgreSQL-compatible Prisma development server. Sales tests cover exact pence, London dates, lower/higher/zero actuals, validation, permissions, stale edits, finalized weeks and audit writes.

Optional full browser check (run the build first):

```sh
npm run test:smoke
```

This starts an isolated, temporary Prisma development database and web server, then tests administrator sign-in, account creation, forecast creation/revision, original-value preservation, Chef sales entry, projections, audit writing, mobile Chef sign-in, denied admin access, deactivation and logout. It never uses your configured `DATABASE_URL`. It uses installed Google Chrome on macOS; set `CHROME_PATH` for another Chrome location or install Playwright Chromium with `npx playwright install chromium`. Ports 3137 and 51383–51386 must be available. The temporary database is destroyed after the test.

Current verification: 51 automated tests, the financial integration suite, the extended browser smoke test, lint, TypeScript checking and production build (`npm run build -- --webpack`) passed. The default Turbopack build encountered an environment local-port permission error; webpack is a verified alternative. The previous Stage 1 dependency audit reported zero vulnerabilities; it was not rerun in this continuation. An external production PostgreSQL deployment has not been provisioned or tested.

Production: `npm run build` then `npm start`, behind HTTPS. Production cookies are Secure, HttpOnly, SameSite=Lax and use the `__Host-` prefix. Plain HTTP production sign-in will not persist its cookie. Development uses an HTTP-compatible cookie on localhost.

## Security and data design

- Argon2id password hashes; no passwords or password hashes in UI responses/audit payloads.
- Random 256-bit opaque sessions, only SHA-256 digests stored in PostgreSQL, 12-hour expiry.
- Session lookup checks current account status and role on every protected request/action.
- Database-backed account throttling: eight sign-in attempts per 15-minute window, shared across server processes. Deploy behind a proxy with request-rate limits for broader denial-of-service protection.
- Next.js Server Actions provide same-origin mutation checks. Every administrator action independently checks the authenticated role.
- User creation/deactivation and associated audit entries are transactional.
- Audit entries are append-only at database level. Production application credentials should not own schema/trigger modification permissions.
- Single restaurant, unique normalized emails and unique daily sales; explicit historical price and forecast snapshots.
- Integer minor-unit totals and decimal quantity/unit price fields. No floating-point financial arithmetic is implemented.
- Periodically delete expired Session rows and LoginThrottle rows older than a day in deployment maintenance. Never delete audit history.

The authentication boundary follows the [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication) and [Server Action data-security guidance](https://nextjs.org/docs/app/guides/data-security).

Two transitive Prisma CLI dependencies (`deepmerge-ts` and `mysql2`) are pinned to patched release ranges via npm overrides. Keep these overrides under review when upgrading Prisma.

## Stage 2 local walkthrough

After signing in as a Super User:

1. Open Administration → Manage forecasts, select this week and enter all seven daily forecasts (for example, £100 each).
2. Open Daily sales and record £50 for today. The dashboard projection should be £650, with the original forecast remaining £700.
3. Revise today's forecast to £200 and supply a reason. The projection remains £650 because recorded actual sales replace that day's forecast. Original values remain unchanged.
4. Sign in as a Chef: forecasts are read-only; missing sales can be entered, including historical days with a reason. Saved sales corrections require a Super User and a reason.
5. Try a future sales date, a stale form in a second tab, and a prior week to verify the restrictions. Review Administration for audit entries.

For this environment, use `npm run build -- --webpack` before `npm run test:smoke`. If development also encounters the Turbopack port restriction, use `npm run dev -- --webpack`.

Existing installations: preserve `.env` and your database, and run `npm run db:generate` followed by `npm run db:migrate` to apply the sales-version migration. Do not seed again if an administrator already exists.

## Browser hydration warning from QuillBot

If React reports extra `suppresshydrationwarning="true"` and `data-qb-installed="true"` attributes on `<html>`, check the QuillBot browser extension. The installed QuillBot version inspected during troubleshooting adds these attributes, including a special rule for `localhost` and `127.0.0.1`. The application's root layout renders only `<html lang="en-GB">`.

In Chrome, open `chrome://extensions`, find QuillBot and temporarily switch it off, then reload the login page. Alternatively, test in a Guest profile without extensions. If QuillBot offers site exclusions, exclude both `localhost` and `127.0.0.1` before re-enabling it. No database restart or account reset is needed.

Do not add React suppression props to conceal this warning. The login page was verified in an extension-free Chrome session with no hydration warnings; injecting the two reported attributes reproduces the warning. If it persists with extensions disabled, investigate that separately as a possible application mismatch.

## Simple purchasing, stock and reports

The normal **Record Supplier Purchase** form requires only active supplier, order date, delivery date and net amount. Save Purchase records the amount directly as confirmed, without VAT conversion or separate invoice confirmation. Database-backed submission keys prevent retry duplicates. Super Users can correct or void purchases with reasons and an audit trail; records are never deleted.

Weekly Planning is Super User-only and groups manual opening stock, expected Sunday closing stock and actual Sunday closing stock in one card. Actual stock is entered at week-end. No daily or product stock counts are required; legacy catalogue/count records remain available under optional historical tools.

Updated projected sales use actual sales for recorded days and original forecasts for unrecorded days. Maximum cost of sales is projected sales × the week's target, floored to pence. Purchasing budget is maximum cost − manual opening stock + expected closing stock. Available to spend is purchasing budget − confirmed, non-void net purchases allocated by delivery date. Legacy order estimates are excluded. Missing planning values stay unknown; negative allowances remain visible.

Reports retain Sales, Purchasing & Food Cost, Suppliers and Weekly History, with real-data charts, exact-value tables, CSV and print. Final actual cost uses opening + confirmed purchases − actual closing, divided by actual weekly sales for the percentage. The week must have ended with all seven sales and required stock data; any old unconfirmed records must be reconciled. New purchases need no additional confirmation step. Finalization locks the week and preserves a reported snapshot; reopening requires a Super User reason.

See [the full account workflow](docs/COCOTTE-WORKFLOW.md) and [hosting requirements / phone preview](docs/HOSTING.md). Business data is stored only in server-side PostgreSQL; production configuration uses private environment variables. No deployment has been performed. The local placeholder `.env.example` remains ignored, along with private credentials and backups.

## Packaging & Chemicals workspace

Use the **Workspace** selector beneath the Cocotte logo to switch workspaces with the same login. Food calculations are unchanged: packaging invoices use separate database tables and never reduce food allowance or food cost.

1. As a Super User, open Supplier Management and assign a supplier to **Packaging & Chemicals** or **Both workspaces**. Existing suppliers remain Food-only until you explicitly change them.
2. As either role, open Packaging & Chemicals → Invoices → **Upload & review invoice**. Select supplier, order date and delivery date. Upload PDF/JPG/PNG or leave the file blank for manual entry.
3. Review every suggestion against the original. Choose Packaging/Chemical for each line; enter units and pack sizes accurately. Net, VAT and gross are separate. Unknown quantities/prices can stay blank; net line amounts and net invoice total are required. Lines must sum to net; explain and acknowledge any quantity/price or VAT discrepancies.
4. Tick the explicit **EXCLUDE VAT** confirmation and confirm the invoice. Unconfirmed reviews do not affect spending. Duplicate supplier/invoice numbers are blocked; possible duplicates without a number require an explanation. Open the same invoice on another device to verify persistence.
5. View Dashboard and Reports, filter by delivery week/month/custom dates, supplier/category/product, and click a product for invoice history, prices and quantities. Distinct invoices and order dates measure purchases, not consumption. Unknown or incompatible units suppress aggregate quantity/price comparisons.
6. Super Users can create standard products and link exact supplier aliases with matching category/unit/pack. Links also group matching historical lines while preserving their original descriptions and audit records. Confirmed invoices can be voided with an audit reason; records/files remain retained.

Scanning runs on the server using bundled English Tesseract.js and PDF.js, without paid APIs or third-party document transfer. It is conservative and is not a universal invoice-layout parser: uncertain layouts require manual entry. Limits: 8 MB, five PDF pages, 20-megapixel images, one scan at a time per server process, 90-second scan timeout. HEIC is not supported; use JPEG/PNG. Original files are authenticated PostgreSQL binary records, not public files or browser storage. See [hosting requirements](docs/HOSTING.md).

After updating an existing installation: `npm run db:generate`, `npm run db:migrate`, then restart the development server. **Do not reset or reseed.** Test with `npm test`, `npm run lint`, `npm run typecheck`, `npm run build -- --webpack`, `npm run test:finance`, and `npm run test:smoke`. The integration/browser suites create disposable databases; they do not use the restaurant database for test records.
