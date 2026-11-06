# Zonal Connect: secure connection and daily-sales pilot

## Current status

Open **Administration → Integrations → Zonal Connect** (`/admin/integrations/zonal`). The dashboard, credential operations and import approval are restricted to authenticated Super Users and their existing restaurant.

**Implemented:** encrypted dashboard setup, real server-side Playwright login attempts, safe login/discovery outcomes, credential replacement, connection testing and disconnect. The public login controls were inspected in a real browser on 4 November 2026. Live login was genuinely verified on 5 November 2026 using the stored encrypted credentials. No password was requested or displayed.

**Live Financial Detail navigation and extraction verified:** branch **003 – Parsons Green**, reporting date **3 November 2026**, through the production browser worker on 6 November 2026. All nine requested figures were validated and stored in a `ZONAL_BROWSER` review-only preview. The existing Daily Sales amount and version were unchanged. Automatic scheduling remains unimplemented. Manual report entry is preserved as an expandable fallback.

## One-time encryption-key setup

Credentials are encrypted with AES-256-GCM using a random 96-bit nonce, a 128-bit authentication tag and authenticated restaurant identity. The single `encryptedCredentials` envelope contains both username and password. The key is never stored in the database or Git. Missing or invalid keys disable saving/testing; there is no plaintext fallback.

For local development, run:

```
node scripts/zonal/create-local-key.mjs
```

This generates a random 32-byte key directly into ignored `.env`, restricts file permissions, never prints the key and never replaces an existing key. **Restart the development server afterward.** The helper is optional and has not been run automatically. Without this setup the dashboard deliberately disables credential saving and explains why.

For deployment, have the administrator generate and install a cryptographically random 32-byte key encoded in canonical base64 as **ZONAL_CREDENTIALS_KEY** in the server secret manager. All app instances need the same key. Never use a `NEXT_PUBLIC_*` variable, paste the key into the dashboard, put it in Git or include it in logs/backups alongside the database. Back it up securely in the secret manager. Key loss prevents decryption; reconnect with new credentials if the original key cannot be recovered. Rotation currently requires replacing the key and updating each connection through the dashboard; transparent envelope re-encryption is not implemented.

The server also needs the pinned runtime Playwright dependency and installed Chromium:

```
npx playwright install chromium
```

Install OS browser dependencies as appropriate for your deployment. Alternatively, an installed Chrome can be selected with server-only `ZONAL_BROWSER_CHANNEL=chrome`. The worker needs a normal Node host capable of spawning child processes; it is not an Edge runtime. Deployment tracing explicitly includes the worker, login module and Playwright packages. Include the browser binary/cache in the deployed runtime separately.

## Connect from the dashboard

1. Sign in as a Super User and click **Connect Zonal**.
2. The responsive connection panel shows your existing Cocotte restaurant, the supported **003 – Parsons Green** branch mapping, username and masked password. Existing decrypted credentials are never prefilled or returned.
3. Confirm authorised read-only access and click **Connect securely**. Only same-origin HTTPS is accepted; HTTP is allowed solely for development on localhost/loopback. Reverse proxies must preserve the public Host. The panel also blocks submission from an insecure remote browser origin.
4. The server encrypts the credentials and immediately attempts **one** authorised login in an isolated browser process. Result states are distinct: **Credentials saved**, **Login verified**, and **Report access verified**. Report access is set only after an actual Financial Detail report passes identity, date, currency and totals validation. Rejected or ambiguous login does not claim Connected.
5. **Test Connection** uses the stored credentials server-side. **Update Credentials** requires re-entry, replaces the encrypted envelope and clears earlier verification. One-minute restaurant-scoped cooldown applies across connection tests and updates, including failed logins, across app instances. There are no automatic login retries.
6. **Disconnect** requires confirmation, removes the encrypted envelope, clears verification, increments the connection revision and cancels an in-process browser job. Cooldown metadata and import/audit history are retained. Disconnect is always available for safety, including when the key is unavailable. No browser session is ever persisted: contexts/cookies are destroyed at job end. Other app instances' already-running ephemeral jobs expire within the bounded worker deadline; their stale results are rejected by the stored revision.

The branch mapping is bound to the restaurant from the authenticated session, never a client-submitted restaurant ID. The local database contains a single existing restaurant, `Cocotte` (`restaurant`). Selecting Parsons Green maps that existing record without renaming it. Unsupported branch mappings are rejected. Legacy `ZONAL_RESTAURANT_ID` / `ZONAL_BRANCH` variables can still provide manual-report mapping when no connection row exists. Username/password environment variables are no longer required or used by dashboard connection setup.

## Security and login/discovery limits

Next.js Server Actions supply POST-only requests, Origin/Host CSRF checks and HTTP-only SameSite session authentication. Credential actions additionally require an explicit exact matching Origin/Host and HTTPS (development loopback exception only). Roles are checked inside every action and service. Credential inputs are never returned in action state, placed in URLs, persisted in browser storage, traced, photographed or copied to audit logs. Form fields are cleared after submission. This feature adds no analytics.

The worker is an ephemeral child process with an allowlisted environment: it does not inherit application/database secrets, DEBUG, PWDEBUG or NODE_OPTIONS. It receives credentials only in its private server environment, not command arguments. stdout/stderr are discarded; only validated result codes, diagnostic enums and the whitelisted requested financial fields return over IPC. No raw page text is returned. Raw Playwright errors, DOM text, URLs, cookies, storage state, screenshots and traces never leave the worker.

Navigation/action deadlines and a 35-second login-worker deadline are enforced. Report fetches have a 90-second worker deadline and a bounded parent cleanup deadline. The parent terminates overdue jobs and their process group if graceful browser cleanup fails. Browser contexts are non-persistent with downloads and service workers disabled. Only same-origin UI traffic and fixed static CDN assets are allowed. Login document POST, observed read-only ReportContent.aspx parameter/View Report postbacks, and a narrow allowlist of observed UI read XHR POSTs are permitted; all unrecognised POSTs and other writes remain blocked. Cocotte does not call these endpoints directly; Zonal’s own page makes its normal UI requests. No Zonal business record is changed. Third-party or SSO/security-control redirects are not followed. CAPTCHA, MFA, access restrictions and rate-limit indicators stop the flow without bypass attempts. If a security-control variant cannot be recognised, the login remains unverified.

Login verification requires disappearance of the login form plus either a visible sign-out control or the live-observed protected `/portal/messages/Dashboard` page with loaded Reports and Dashboard navigation. A redirect or a generic Reports link on the login page is insufficient. The worker may report whether exact Financial Detail/branch labels are visible, but those hints never mark report access verified. The supported report navigation and controls were subsequently inspected and implemented; see the live extraction section below.

For future report variants, an authorised operator must inspect the actual menu path, branch selection controls and stable identifiers, Financial Detail report controls, London business-date semantics, date range/apply controls and report currency/department/total labels. Provide only redacted structural fixtures or screenshots with no credentials, session information or personal data. Do not supply passwords through chat. Once confirmed, implement report navigation and extraction through the same validator and preview service; never enable guessed selectors or undocumented endpoints.

## Manual Financial Detail import

After branch mapping, enter a real Financial Detail report's date, branch, GBP amounts and optional counts. Missing amounts are rejected; unavailable covers/transactions remain null. Preview shows all figures and any existing Daily Sales. Approval requires explicit confirmation to replace sales, plus a correction/historical reason when required. Previews expire after 30 minutes.

Validation uses integer pence and requires the report’s **Gross Sales − VAT = Net Sales**, with a 1p department rounding tolerance. The November 3 sample exists only in tests and sums departments to £1,167.91 against £1,167.92 net. The live report has a separate **Gross Sales Incl Disc** field: the parser additionally checks Gross Sales Incl Disc − Discount = Gross Sales. Gross Sales is already after discounts; subtracting discounts twice is incorrect. Refund totals, extra departments or ambiguous report structures must be reviewed rather than silently coerced. Zonal Cost % never feeds Cocotte purchasing KPIs.

Sales approval preserves existing forecast and finalized-week protections, optimistic revisions, restaurant locks, idempotency and audit records in a single transaction. Imported net sales use existing Daily Sales; purchasing formulas, original/revised forecasts, recipes, users and invoices remain unchanged. Error history contains sanitized messages only.

## Database changes and validation

`20261104000100_zonal_sales_pilot` creates the daily-sales import audit table. `20261104000200_zonal_encrypted_connection` creates only the encrypted connection table with a restaurant foreign key and a disconnected/unverified integrity check. Both were inspected before application. No existing business table/data was altered or reset. The latter has been applied to the local database; business-record counts remain unchanged and Prisma migration status is current.

For deployments, review the SQL, then use normal `npm run db:migrate` and `npm run db:generate` deployment steps. Never reset, seed or recreate an existing database for this feature.

Checks:

```
npm run typecheck
npm run lint
npm test
npm run build
npx tsx scripts/zonal/login-fixture-check.ts
npx tsx scripts/zonal/financial-fixture-check.ts
npx tsx scripts/zonal-dashboard-check.ts
```

The fixture browser check intercepts all traffic and tests synthetic successful/rejected/ambiguous login plus challenge detection; it never uses live credentials. The dashboard smoke check uses a temporary session for an existing Super User, removes only its own session, tests anonymous rejection and mobile widths, and saves local screenshots under `/tmp/cocotte-zonal-*.png`. Those screenshots can contain restaurant financial data.

Tests cover encryption/decryption, nonce uniqueness, tampering, wrong keys, missing keys, CSRF/HTTPS, role and restaurant isolation, login failures, credential updates, cooldowns, disconnect, stale in-flight results, additive migration integrity and existing sales-import controls. Service lifecycle tests inject a fixture login runner. Live production-worker fetch was verified for the date/branch above. Multi-host process tests and wider report/date variants remain outstanding.

## Login verification fix — 5 November 2026

Exact root cause: the previous network policy blocked **every POST except the login form**. Zonal accepted that form with HTTP 302 and entered its dashboard, but its own `LoadLogin`, `GetMenuTabs`, dashboard-read and favourites requests use read-only XHR POSTs. Blocking `GetMenuTabs` prevented the authenticated navigation from appearing. The real request path contains a double slash (`/Portal//Controls/AjaxFunctions.aspx/GetMenuTabs`); policy matching now normalises repeated slashes. The verifier also incorrectly required a named Logout/Sign Out link, which this dashboard does not expose.

The worker now permits only the reviewed, same-origin UI read operations declared in `src/lib/zonal/network-policy.mjs`. It never calls them as a separate API client. Writes and cross-origin authentication navigation remain blocked. Live production-worker verification succeeded with normal headless Chromium, normal browser-managed cookies and the stored credentials. No CAPTCHA/MFA challenge or separate authentication flow was observed; no browser-compatibility workaround was needed. Observation time after the single form submission is now bounded at roughly 12 seconds, within the overall worker deadline.

Diagnostics are enum-validated stage/reason pairs such as `LOGIN_FORM OK`, `LOGIN_SUBMIT STARTED`, `LOGIN_VERIFY AUTHENTICATED` and `CLEANUP OK`. The parent logs only these validated values and stores them in the existing audit JSON. Raw exceptions, URLs, request bodies/headers, credentials, cookies, tokens and report figures are excluded. No migration was required for this fix.

Read-only investigation confirmed **Reports → Financial** in `/reportbrowser/reports/reportframe.aspx`. The catalogue uses additional reviewed list/folder XHR reads. At that stage Financial Detail access was not yet verified. This historical limitation was resolved by the subsequent live extraction work below; no Daily Sales import has been approved automatically.

### Secure local diagnostics and headed discovery

One rate-limited production-worker test using the stored encrypted connection:

```
node --conditions=react-server --import tsx scripts/zonal/diagnose-login.ts
```

Interactive local browser discovery:

```
node --conditions=react-server --import tsx scripts/zonal/discover.ts --headed
```

Run from the trusted local project terminal. No password argument or terminal password prompt exists. The script uses the encrypted connection for the existing `restaurant` record and the same connection-service cooldown/audit protections. It opens a new non-persistent browser, attempts login once and keeps that temporary context alive for at most ten minutes. There is no Inspector, CDP listener, recording or screenshot. Parent diagnostics print only fixed page classifications and booleans for known UI labels; unknown paths and arbitrary DOM values are never printed.

The terminal accepts only `inspect`, `reload`, `verify`, `reports`, `financial`, and `finish`. `reload` will not resubmit a login form. `reports`/`financial` click only exact observed navigation links after genuine login verification. In the visible browser, the authorised operator can complete a required human interaction on the official site and then use `verify`. Unsupported external identity redirects remain blocked pending explicit workflow review; no challenge is solved automatically. Use `finish` to destroy cookies/context/browser. Timeout also closes the context safely and commits only a login result that was actually observed; report access is never inferred from login or catalogue presence.

## Verified Financial Detail fetch — 6 November 2026

The actual catalogue link is **Financial Detail.**, including its trailing full stop. The verified path is **Reports → Financial → Financial Detail.** The rendered report title is **Financial Detail** without the full stop. Its WebForms page is `/ReportBrowser/reports/ReportContent.aspx`.

The adapter opens the observed Profit Centre dropdown, unchecks any other parameter choices and selects only **003 - Parsons Green**. Start Date and End Date are **trading-date select controls**, not text/date inputs; their actual option values are read from the DOM using the requested English date label. Both dates must match the requested single day. Selecting Start Date refreshes End Date options. The worker submits only the scoped ReportViewer View Report control, waits for the rendered branch and Net Sales fields, and then parses the report content. No internal API is called directly.

The parser requires a unique report title, one exact branch header, one exact single-day date range, a single rendered page, strict £ monetary values, the observed summary fields and the Sales Departments table layout. It reads **Gross Sales, Discount, VAT, Net Sales, Food/Drink/SPECIALS net sales, Covers and Transaction Count**. Gross Sales Incl Disc is used only to validate the discount relationship. Department totals must reconcile within 1p. Cost/Cost % are ignored. Missing fields, unfamiliar departments, changed columns, other currencies, negative/refund figures, multiple pages and inconsistent totals fail closed with a manual-entry fallback. GBP is established from £ monetary formatting plus the restaurant’s required GBP configuration and the verified UK branch; the report does not spell out an ISO currency code.

### Dashboard workflow

1. In **Import centre**, choose a completed reporting date under **Fetch from Zonal**.
2. Click **Fetch from Zonal**. The pending state explains that a temporary browser session is reading and validating the report; allow around 90 seconds. There is one login attempt, not a retry loop. The existing restaurant-scoped cooldown applies.
3. On success, **Review fetched sales** links to the saved preview. The review and history identify **Zonal browser** as the source. Manual entry remains available under **Enter report manually**.
4. Review the report date, branch, all amounts/counts and any existing Daily Sales conflict. Only **Approve import** writes Daily Sales. No approval was performed during live verification.

Before creating the browser preview, the server rechecks the encrypted connection revision and restaurant/branch mapping under a restaurant lock. A disconnect or credential update discards stale results. Existing optimistic sales versions, duplicate-import checks, finalized-week locks and explicit replacement approval remain unchanged. Report access verification is distinct from an approved sales import; sales snapshots continue to show approved data only.

No database migration was necessary for live extraction. Existing `ZonalImport.payload`, source and preview status store the requested figures. `ZonalConnection.reportAccessVerifiedAt` records the validated report access.

Local pilot verification (creates **PREVIEW only**, never approves):

```
node --conditions=react-server --import tsx scripts/zonal/fetch-preview.ts 2026-11-03
```

The helper verifies Daily Sales amount/version before and after and prints only preview metadata and field names. It does not print credentials, session data or financial values. The report parser tests use synthetic figures and are never database seeds.

Known scope: one branch, current English single-page layout and non-negative values. Automatic daily synchronisation, scheduling and other Zonal imports remain out of scope. Additional dates/edge cases and future report changes need continued validation; unsupported layouts are rejected rather than guessed.

A login-only Test Connection preserves the previous successful report-access timestamp for unchanged credentials. Updating credentials or disconnecting clears it. A failed login also clears report verification; a failed report validation never fabricates a new verification timestamp.

## Approval readiness and dashboard integration

The original combined error came from approval requiring an existing, open weekly forecast. Read-only diagnosis on 6 November found all real pending previews (2, 3 and 5 November, including two copies for 3 November) belonged to **Monday 2 November–Sunday 8 November 2026**, whose forecast was missing. The older 3 November preview also became expired and superseded. None of these real previews was approved or changed by this work.

`approval.ts` provides a shared readiness assessment used by both the review UI and the approval transaction. Each preview lists **all** applicable issues: missing/incomplete seven-day forecast, finalized week, expiry, invalid report data, future date, duplicate already-imported figures, stale sales revision, existing-sales correction confirmation, and a newer pending preview for the same date. Status is grouped by report date and highlighted as ready, correction, blocked, expired or superseded. Malformed payloads show a validation message rather than attempting to render unreadable figures.

- **Missing forecast:** the action opens `/admin/planning?week=<Monday>` for that precise Monday–Sunday week. Enter real forecast values; the integration never invents or creates forecasts.
- **Finalized week:** the action opens the corresponding purchasing report and its existing **Week close & audited corrections** workflow. Only the existing Super User reopening operation with a reason can reopen it.
- **Expired/stale/invalid:** fetch the same date again. The refresh link preselects the requested date in the Import Centre.
- **Newer preview:** review the latest copy. Older previews are retained and can be cancelled, but are not silently deleted or approved.
- **Existing Daily Sales:** correction approval requires an explicit checkbox, a reason and the same sales revision shown during preview. Duplicate approved figures are blocked; repeated approval of the same approved import remains a no-op.

Approval still locks the restaurant/settings/week, reassesses the current database state and writes the net amount, import completion and audit entry atomically. It never changes original/revised forecasts or purchasing formulas. Successful approval invalidates Dashboard, Daily Sales, Weekly Planning and reports and leaves a persistent confirmation with links to the **correct week/date**, including historical imports. Saving forecasts or changing week status also invalidates integration readiness. Visible pages refresh without interrupting active form entry.

Dashboard and Daily Sales read their monetary values from the existing Daily Sales/financial-week source. The new **Zonal** indicator is metadata from the latest approved import only; its expected post-approval sales revision and net amount must match the current Daily Sales record. A later manual correction suppresses a stale Zonal badge. The badge retains report date, branch and full approval timestamp in accessible metadata, shows a compact approval time, and links Super Users to the retained import history. No badge or dashboard actual is created from an unapproved preview.

No migration is required. Existing import records and audit history provide provenance; no purchasing, stock, recipe, packaging or invoice logic changed.

Read-only diagnosis of current real previews (IDs/dates/status codes only):

```
node --conditions=react-server --import tsx scripts/zonal/approval-readiness.ts
```

### Isolated approval demonstration

```
node --conditions=react-server --import tsx scripts/zonal/approval-dashboard-check.ts
```

Requires a completed production build, installed Chromium, and local `initdb`/`pg_ctl`. The script creates a **new temporary PostgreSQL cluster on 127.0.0.1:51944**, applies migrations only there, and starts a separate app on port 3179 with its database URL explicitly replaced. It never uses the restaurant database. The test cluster is stopped and its own scratch directory removed afterward.

The test creates synthetic £100 net sales, seven original £100 forecasts and seven revised £120 forecasts. It verifies missing-forecast rejection, finalized-week rejection and the real audited reopen operation, superseded/expired previews, explicit approval through the Super User UI, duplicate protection and idempotency. It then follows the persistent confirmation to the selected dashboard week and verifies **£100 + Zonal + approval time** in both Dashboard and Daily Sales. Reports/planning use the same approved data; projected sales become £820 and both forecast versions remain unchanged. A screenshot containing **ISOLATED TEST DATA** is saved to `/tmp/cocotte-zonal-approved-dashboard-test.png`.

The PostgreSQL-compatible disposable emulator was unsuitable for this test because of concurrent unnamed prepared-statement protocol errors. The final successful demonstration uses a real, separate PostgreSQL server instead; no production safeguards were bypassed to accommodate the emulator.

## Manual batch synchronisation (6 November 2026)

**Sync Zonal** is an extension of the existing Financial Detail adapter. No scheduler or automatic approval is enabled. Only authenticated Super Users can start, cancel, read progress or approve a batch.

- Default Current Week uses Europe/London, Monday through yesterday. Monday has no completed days. Custom ranges accept 1–31 completed calendar days, including historical weeks; today and future dates are rejected server-side. Previous Week selects the last Monday–Sunday.
- One temporary Playwright BrowserContext logs in once and reads dates sequentially through the verified report UI, returning to the observed protected dashboard URL between dates. The session is never persisted. A one-second pause separates dates; login is never retried. Each date has a 60-second browser deadline; the process has a 15-minute deadline. Authentication challenges, expired login and 401/403/429 responses stop the job. Individual unavailable/invalid reports do not discard valid dates.
- Strict IPC schemas allow only safe stage/reason enums and whitelisted report fields. Raw HTML, cookies, report bodies and credentials are not persisted or logged. Credentials are decrypted server-side only and given to the isolated child through its allowlisted environment.
- New operational tables ZonalSyncBatch and ZonalSyncDay reference existing ZonalImport previews; they do not duplicate report contents or modify financial models. The inspected additive migration is 20261106000100_zonal_manual_batches. It was applied locally with migrate deploy after confirming it was the only pending migration.
- Restaurant locks plus a partial unique index allow one active batch per restaurant. Connection revision checks discard results after disconnect/update. Heartbeats update every five seconds; after two minutes without a heartbeat, dashboard inspection marks the job interrupted and preserves completed dates. Cancellation also preserves completed previews. Neither cancellation nor interruption approves sales.
- Unchanged means the complete canonical report fingerprint matches the latest approved report AND current DailySales amount/version still matches that import. No new preview or sales write is made. A recent matching pending preview is reused. A manual edit, differing report or changed source requires a fresh correction review.
- The table distinguishes New, Unchanged, Changed, Blocked, Expired, Failed and Approved. Totals are labelled report previews, including unchanged dates, separately from the selected approval total. Expand a date for amounts, counts, existing-versus-new net sales, validation and audit/source details.
- Review & Approve requires explicit date selection and confirmation. Historical imports and corrections require reasons; corrections also require replacement consent. Each date calls the original locked resolveImport transaction, reassessing expiry, version, newest preview, forecast completeness and finalization. One failure does not roll back other successful days. Concurrent/repeated approvals cannot duplicate DailySales or increment a version twice.
- Missing forecasts link to the actual Monday–Sunday Weekly Planning page; finalized weeks link to the existing audited reopening workflow. No forecasts are invented and no week is reopened automatically.
- Approved net sales use the existing canonical DailySales data. Dashboard, Daily Sales, planning and reports are revalidated. Original/revised forecasts and all purchasing formulas remain unchanged; existing source badges identify Zonal approvals.

### Deployment and local verification

This is a manually initiated job using Next.js after(), not cron. Run on a Node server with Playwright/Chromium installed and support for a 900-second route duration. Short-lived hosting that terminates after() early will leave an interrupted batch; it must be refetched manually. Before scheduling later, introduce durable job dispatch appropriate to the deployment, monitoring and an explicit scheduling/approval policy. Do not enable unattended retries.

Existing AES-256-GCM key/credential setup is unchanged. Open /admin/integrations/zonal as a Super User, choose dates and click Sync Zonal. Review the daily readiness, select eligible days, add required reason/consent and confirm approval. Manual entry and individual approval remain available.

Commands:
- npm run typecheck; npm run lint; npm test
- npm run build (Turbopack encounters this environment's port-binding permission failure); npx next build --webpack passes.
- node --conditions=react-server --import tsx scripts/zonal/approval-dashboard-check.ts uses its own disposable PostgreSQL cluster and test server, synthetic reports and a mocked Zonal runner. It tests batch/individual UI approvals, partial results, unchanged repeat sync, correction consent/reason, concurrent locks, missing/finalized weeks, permission/isolation, cancellation, interruption recovery and 320/390px layouts. It never connects to the restaurant database or Zonal.
- node --conditions=react-server --import tsx scripts/zonal/batch-fetch-preview.ts FROM TO is an explicitly invoked AUTHORISED LIVE read-only verification. It creates/reuses previews only and asserts DailySales records are unchanged. Do not run it merely as a routine unit test.

**Live verification:** One authenticated batch session fetched 3 and 4 November 2026 for 003 – Parsons Green. Both validated gross, discounts, VAT, net, food, drink, specials, covers and transactions, and both matched existing approved imports (Unchanged). No real sales were approved or modified during this implementation. Other dates and branches have not been verified by this batch test.
