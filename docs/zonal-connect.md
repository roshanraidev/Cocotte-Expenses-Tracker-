# Zonal Connect: daily sales pilot

## Current status

The dashboard is at **Administration → Integrations → Zonal Connect** (`/admin/integrations/zonal`). Only an authenticated Super User can open it or invoke its actions. Each account is limited to its existing restaurant; there is no cross-restaurant selector.

**Live browser login, connection testing and report extraction have NOT been verified or implemented.** The connection button checks server readiness and records an explicitly unverified result. It never claims authentication succeeded. No credentials were supplied or used. The browser adapter deliberately fails closed; no selectors or private endpoints have been guessed. The public login URL could not be inspected through the available web tool.

The usable pilot is manual Financial Detail report entry, preview and approval. It must use real reports; the November 3 sample exists only in tests. No scheduled jobs, stock imports, purchasing imports or Zonal writes are included.

## Database deployment

Review and back up the database using normal deployment procedures, then run `npm run db:migrate` and `npm run db:generate`. The additive migration `20261104000100_zonal_sales_pilot` creates only `ZonalImport`, indexes and foreign keys. It does not alter sales, forecasts or purchasing tables and has not been applied to any existing database by this implementation. Never run reset or seed for this feature.

## Secure configuration

Set these in the server environment or deployment secret manager (never in `NEXT_PUBLIC_*`, dashboard forms, Git, screenshots or logs):

```
ZONAL_RESTAURANT_ID=<existing Cocotte restaurant id>
ZONAL_BRANCH=<exact branch identity from the Financial Detail report>
ZONAL_USERNAME=<authorised account username>
ZONAL_PASSWORD=<authorised account password>
ZONAL_AUTOMATION_AUTHORISED=true
```

Only restaurant/branch mapping is required for manual entry. Username and password are reserved for future verified browser support and are currently only checked for presence on the server. The browser adapter does not read or submit their values. Set the authorisation flag only after the organisation and Zonal permit automation; this flag alone does not establish provider approval. A single restaurant is mapped in this pilot. Use independent secret mappings before supporting several branches.

## Local workflow

1. Apply the reviewed migration to your local database, generate Prisma, and start `npm run dev`.
2. Sign in as a Super User and open the integration dashboard.
3. Click **Test connection readiness**. Expect an unconfigured or unverified message; this is not a live browser test.
4. Open the Financial Detail report yourself through the authorised Zonal UI. Confirm branch, reporting date and GBP. Enter every monetary field, including actual zero discounts. Leave covers/transactions blank if unavailable.
5. Click **Preview sales import**. Review all figures, report identity and existing Daily Sales. A saved preview does not change financial data.
6. Confirm replacement explicitly if Daily Sales exists, supply a correction/historical-entry reason when required, and approve. Or cancel the preview.
7. Check Daily Sales and weekly reports. The imported net sales uses the existing actual-sales data path; forecast figures and purchasing formulas remain unchanged.

Validation uses integer pence, requires gross less discounts less VAT to equal net, and permits only 1p department-total rounding. The supplied sample sums departments to £1,167.91 against £1,167.92 net. The gross/discount convention is provisional until live report semantics are inspected: reports with a different convention must be reviewed, never forced through. Other departments, negative/refund totals, currencies other than GBP and changed report fields are unsupported and must be resolved manually.

Previews expire after 30 minutes. Approval locks the restaurant, settings and forecast in the established financial lock order, checks the current sales version and finalized status, and writes sales, import status and an append-only audit entry in one transaction. Repeating approval of an approved preview is a no-op. A second matching report is rejected when its figures are already reflected in Daily Sales; subsequent manual edits require a new preview and explicit replacement approval. Database errors are redacted. Connection readiness attempts are audited. Sanitized validation and approval failures are stored in the existing append-only audit log and shown on the dashboard. Database outages may prevent error persistence.

## Before enabling Playwright

Playwright is already available via the repository's development test dependency; a deployed browser worker will require an explicit pinned runtime browser dependency, installed Chromium and appropriate process resources. The adapter contract is `src/lib/zonal/adapter.ts`. Implement a dedicated server worker after inspecting the actual authorised workflow. Do not ship test-only browser dependencies as an assumed production runtime.

Required verification:

- Confirm provider/organisation authorisation, login controls, branch selection and Financial Detail navigation with an authorised operator.
- Observe real UI selectors and exact labels; obtain redacted report fixtures for discounts, refunds, rounding, date ranges, empty trading days and additional departments.
- Verify branch IDs/names, London business-date semantics, currency, discount convention and all department mappings. Reject changes or ambiguity.
- Use an ephemeral browser context, fixed allowlisted HTTPS origin, hard navigation/action/job deadlines, bounded concurrency and no automatic login retries. Close contexts on timeout. Never persist storage state, traces, videos, screenshots or raw exception/page output containing secrets.
- Stop on CAPTCHA, MFA or access restrictions; never bypass them or call undocumented internal endpoints. Do not automate any Zonal modifications.
- Feed extracted data through the same validator and approval transaction; keep manual approval until a monitored pilot establishes reliability.
- Add real browser integration tests, verified connection timestamps, secret rotation and multi-branch mappings before scheduling. Automatic daily synchronisation is not present.

`safeProbe` is a tested timeout/redaction utility for a future adapter. It requires the supplied operation to honour its abort signal; it does not by itself terminate a browser. The future worker must close browser resources explicitly.

## Validation commands

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

`tests/zonal.test.ts` covers fixture parsing, currency, report identities, missing/malformed values, role and restaurant boundaries, duplicate/idempotent imports, existing-sales conflicts, cancellation, expiry, stale versions, finalized weeks, audit data, secret redaction and timeout signalling. Service tests use transaction mocks; live PostgreSQL concurrency and real Zonal UI tests remain prerequisites for automatic imports.
