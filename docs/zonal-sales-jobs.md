# Durable Zonal sales jobs

## User workflow

The Dashboard retains Weekly Available to Spend, weekly sales and the always-visible historical chart. **Import All Historical Sales** queues the complete verified historical range with one click. There are no retrieval date fields, saved-plan buttons, or manual next-batch buttons. The worker discovers the latest completed Zonal date, handles internal seven-date sessions automatically, and classifies every requested date as staged, skipped, failed or unavailable. Progress distinguishes these outcomes from **approved/imported** sales. Pause, resume and explicit failed-date retry are available. Failed dates do not prevent subsequent dates from being fetched.

**Review & bulk approve** shows the eligible count, exact GBP total, dates and a separate exception list. One confirmation and historical reason authorizes eligible non-conflicting dates together. Approval is itself durable background work, with a transaction and audit entry per day. Conflicts, changed approved reports, missing/incomplete forecasts and finalized weeks remain exceptions. The existing audited reopening/correction workflows apply; no forecasts are invented. The service does not auto-approve reports merely because extraction succeeded.

The chart uses canonical DailySales immediately, independently of import status. After approval its default timeline and available year choices extend automatically. A deliberately selected custom chart range is retained. Missing dates/detail remain unavailable, never zero.

## Durable execution and deployment

There was no durable worker infrastructure or remote deployment in this repository. This implementation adds a PostgreSQL-backed queue plus a separate Node worker compatible with the documented persistent Node/PostgreSQL host. It does not use `next/server after()`, a browser loop or a long-running HTTP request for these jobs.

Run on the same trusted server/release as the web application:

```sh
npm run db:migrate
npm run db:generate
npm run worker:sales
```

The worker needs private `DATABASE_URL` and the same `ZONAL_CREDENTIALS_KEY`, full project dependencies including `tsx` and Playwright, installed Chromium, and access to the existing encrypted connection. No credentials are copied into jobs. Keep the worker running under a restart supervisor. `ops/cocotte-sales-worker.service` is a Linux systemd template; adjust its user, Node/npm paths, working directory and private environment-file location before deploying. Do not upload `.env` or credentials.

For this local Mac, `scripts/workers/install-local-sales.ts` installs a per-user `com.cocotte.sales-worker` LaunchAgent using the actual Node executable and project directory. It is an explicit setup command, never run during a build or Dashboard request. It refuses to overwrite an existing LaunchAgent. The agent runs at login and restarts after process failures. It reads the existing private project `.env`; the plist contains no credentials. On this Mac it can be installed with:

```sh
node --conditions=react-server --import tsx scripts/workers/install-local-sales.ts
```

A Mac must be awake and PostgreSQL available; no local worker runs while the computer is shut down. On waking/restarting the supervised worker resumes durable work. No remote worker deployment is claimed.

The Dashboard enables queueing only with a recent worker heartbeat. A job may continue when the browser closes. After an abrupt worker exit, a replacement reclaims the expired 120-second database lease and reconciles already-persisted source-batch results before continuing. A live lease prevents concurrent claims. Lease tokens fence writes by stale workers. The browser child cleans up its session when its worker parent disconnects. Source timeouts, one-minute login cooldowns, bounded sessions and existing read-only policies remain in force. Authentication rejection/security challenges pause work for operator intervention; there is no unbounded login retry loop.

No jobs are created by worker installation or startup. Only an authenticated Super User's explicit Dashboard action queues retrieval. Approval requires a separate explicit summary confirmation.

## Data safety

Migration `20261113000100_durable_sales_jobs` adds only `ZonalSalesJob`, `ZonalSalesJobDay`, `ZonalSalesWorker`, their indexes/checks and references. It does not alter sales, forecasts, users, purchases or credentials. Queue indexes allow one queued/running/paused job of each kind per restaurant, and only one running job overall per restaurant. Daily requests therefore remain independent of history, while source sessions stay serialized. `(jobId,date)` is unique; canonical DailySales retains its existing `(restaurantId,date)` unique constraint.

Durable staged reports retain their original `ZonalImport.createdAt` and validated fingerprint. Only job-linked, server-created snapshots in an explicitly authorized approval job may use durable review rather than the normal 30-minute interactive-preview expiry. Bulk approval revalidates the report and fingerprint, branch/date/currency/totals, active Super User, lease, canonical sales version, forecast completeness and finalized-week locks inside the established financial transaction. Ordinary interactive previews still expire normally. Bulk approval never authorizes overwriting an existing sales record.

A crash after financial commit but before job bookkeeping is safe: replay sees the already-approved import and records completion without another financial write. Every imported day retains its source and per-day audit entry; the bulk consent and reason are recorded separately. No purchases, stock or delivery integration are changed.

## Daily incremental sync

**Sync Zonal Sales** queues missing dates since the last verified reporting boundary and rechecks a recent correction window. `ZONAL_SALES_RECHECK_DAYS` defaults to 7 and is bounded to 1–31. Unresolved failed dates are included, but older failures that were subsequently retrieved successfully are not repeatedly downloaded. The whole historical period is not fetched again. Unchanged approved reports skip safely. Changed/manual conflicts enter the exception queue. New clean reports still require the existing explicit approval workflow. No unattended scheduled daily sync is enabled.

## Verification

Live Financial Detail endpoint verification remains **2022-11-19** and **2026-11-12**, with latest-completed-date selection also verified for 2026-11-12. Every intervening date must be independently fetched and validated. No real historical sales were imported or approved during implementation tests.

`scripts/sales-jobs-check.ts` creates a disposable PostgreSQL cluster and uses a strictly test-only report provider. It verifies concurrent queueing/claiming, process termination after two persisted dates, restart/recovery, automatic batch continuation, failed-date retry, pause/resume, durable staging beyond 30 minutes, concurrent explicit bulk approval, missing forecast/finalized/correction exceptions, incremental windows, audit and canonical uniqueness. Its child fixture worker refuses any database other than the disposable test database.

`scripts/sales-history-ui-check.ts` uses a second disposable database and production browser. It checks chart availability before import, mobile/tablet/desktop layouts, offline-worker gating, one-click queueing, closing the page during processing, bulk review/confirmation, preservation of a conflicting manual sale, and chart refresh after eligible approvals. These fixtures are never production defaults.

### Local supervisor verification result

On this Mac the LaunchAgent was created, but macOS denied the launchd process access to the project on Desktop: Node exited with `EPERM: operation not permitted, uv_cwd`. The failing agent was unloaded to stop its restart loop. A worker was instead started through the authorised terminal with `npm run worker:sales`; its live PostgreSQL heartbeat can be checked with `node --conditions=react-server --import tsx scripts/workers/sales-status.ts`. Installation/startup did not queue an import.

Browser closure does not stop this separate terminal worker, and PostgreSQL checkpoints survive process termination. Automatic restart/login startup on this Mac is **not verified or enabled** until the OS permits that LaunchAgent's Node process to read the Desktop project, or the application/worker is intentionally deployed to an appropriate service location. Do not bypass macOS security restrictions. The retained plist is `~/Library/LaunchAgents/com.cocotte.sales-worker.plist`; after the owner resolves OS access, bootstrap that plist and verify the heartbeat before relying on unattended restart. A foreground terminal process alone does not guarantee restart after logout/reboot. The Linux service template provides the corresponding supervised-host setup; no remote deployment has been performed.


## Separate Dashboard actions (17 November 2026)

The original `dailySalesSync` action and button were retained, but the shared header and global busy flag disabled daily sync whenever history was queued, running or paused. The backend also returned any active job regardless of kind. Both controls are now permanently rendered in separate **Daily Sales** and **Historical Sales** sections. The historical button remains visible after its one-time job exists; its progress and resume/retry controls remain below it. Only an active job of the same kind disables its corresponding start button.

Migration `20261117000100_separate_sales_job_queues` changes queue indexes only. Replacement unique indexes are created before dropping the over-broad old index: one active job per `(restaurantId,kind)` and one running job per restaurant. Claiming uses a short PostgreSQL advisory transaction lock, recovers expired leases first, then prioritizes explicit approvals and daily jobs ahead of subsequent historical batches. A daily request waits for the current bounded batch rather than opening a concurrent Zonal login. Authentication, report validation, approvals, canonical uniqueness and purchasing calculations are unchanged. The existing worker must be restarted with this code after the queue-index migration; checkpoints are preserved.

## Selected-week Dashboard control

The Dashboard now presents **Sync Weekly Net Sales** immediately beneath Weekly Available to Spend, alongside the separate daily and historical features. It receives the Dashboard navigator's Monday explicitly. A historical Monday–Sunday week fetches seven completed days; the current week fetches Monday through yesterday; future weeks and a Monday with no completed days show a clear empty state. All date keys use the existing Europe/London rules.

Inspection of the available Git history (`339d4d8` batch integration, `4c300f0` weekly overview) found the original weekly/current/custom-range workflow intact in the integration `BatchPanel`, backed by `syncBatch`, `startBatch`, `runBatch` and the existing explicit approval actions. A separately named weekly Dashboard button could not be located in the available committed Dashboard revisions. The restored Dashboard entry point delegates to that original action; it does not add another queue, authentication path, importer or approval implementation. The review link targets the existing `#batch-sync` panel. The original concurrent-batch/cooldown protection remains; an already-running source batch returns its normal actionable error rather than opening a concurrent login.

Weekly approval still revalidates Dashboard, Daily Sales, Reports and planning. The canonical overview, food/drink evidence and financial calculations update through their existing data source; projected purchasing budgets and confirmed-purchase deductions are unchanged. No migration or financial-data changes are needed for this control.

## Simplified sales controls and failure investigation (17 November 2026)

This supersedes the earlier three-control Dashboard layout. **Sync Weekly Net Sales** is the primary daily-use action: it requests the selected completed Monday–Sunday dates plus a bounded recent correction window. It passes an explicit deduplicated list (maximum 31 dates) to the existing batch reservation/browser/validation/approval pipeline. It does not fetch intervening years when the selected week is historical. The recent window defaults to seven days; if a disjoint selected week plus a larger configured window exceeds the batch limit, the closest recent dates are retained and the selected week is preserved. The redundant Daily Sales section is removed. Its backend compatibility action and persisted job/error records remain; the old retry backlog is paused and visible under compact diagnostics. Historical failures are no longer automatically injected into daily-use requests.

Historical Sales remains a compact one-time import section, with preserved progress and expandable review/recovery controls. The chart remains independent of import completion and reads approved canonical sales only.

### Verified causes

The original source errors were stored generically as `REPORT_INVALID`. At the investigation checkpoint, history contained 1,318 staged reports, 77 failed dates, nine skipped dates and 51 pending dates. The daily job had pulled historical failures into its date list, so its first processed dates were failed historical dates, not newly missing daily sales. It reached 31 failures before the audited checkpoint pause completed. No job, report or error record was deleted.

Authorised read-only inspection reproduced a fourth **Miscellaneous** department on 2025-05-13 and 2026-02-08. The old parser rejected every additional department. The observed Miscellaneous net value was explicitly zero; the fixed parser accepts only an explicitly zero-net Miscellaneous row whose financial fields reconcile. Nonzero Miscellaneous amounts remain blocked with `REPORT_UNCLASSIFIED_DEPARTMENT`; they are not assigned to food/drink. A header-only report on 2022-12-24 has no sales summary. It remains blocked as `REPORT_SUMMARY_MISSING`; missing figures never become zero. Both formerly failing trading dates then validated through the real worker, while the header-only report retained the precise failure. No report values were printed or financial records written by diagnostic sessions.

The inspected sessions authenticated successfully and produced no 401/403/429 responses. Rate limiting was not observed in these failing samples. Existing one-minute login cooldowns and per-batch session reuse remain. The scattered historical retry backlog had caused many tiny sessions; the weekly/recent action now uses one explicit bounded date list in one session. This is not a claim that all 77 old failures have been individually reverified.

Both jobs displayed queued between bounded batches, including the cooldown shared through the existing connection. That was raw scheduling state despite earlier progress, not evidence that nothing had run. Display states now distinguish running, waiting (including next-attempt time/worker availability), paused, completed retrieval awaiting approval, and failed. Parser reasons are allowlisted across the child-process boundary, persisted per date and shown safely. Empty report detection waits for the report footer rather than waiting for a summary field that never exists. Authentication/layout failures or repeated all-invalid batches pause for inspection rather than blindly advancing through failures.

The staged-report preservation digest was checked twice: `ad56071690f8189640f4f9532fac777e01e116bec6076de15eeddabde3d2b863` for all 1,318 original staged rows. The existing history job was resumed only for pending dates after the fixed worker restarted. Its 77 failures were not reset, and no replacement history job was created. The legacy daily job remains paused. Official sales and purchasing records were not changed.
