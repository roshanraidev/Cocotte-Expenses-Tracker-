# Daily Zonal sales jobs — historical imports retired

Historical sales backfill, discovery, retry/resume and historical bulk-approval actions have been removed. Existing HISTORY jobs, staged reports, audit records and approved Daily Sales remain stored unchanged. No schema migration or data cleanup is required.

## Supported workflows

- **Sync Weekly Net Sales** uses the selected completed Monday–Sunday dates plus the configured recent correction window and existing preview/approval pipeline.
- **Sync Zonal Sales** queues daily incremental work in PostgreSQL. First use checks the recent window; subsequent use catches missing dates in jobs capped at 31 dates. It does not require historical discovery metadata. Reports require explicit Super User approval; conflicts, finalized weeks and missing forecasts stay blocked.
- The approved-data Sales Performance chart, normal reports and purchasing calculations remain unchanged.

`src/lib/sales-sync` contains the daily queue, lease/recovery logic and explicit daily approval processing. Claiming, ownership, review and durable financial approval all require `kind=DAILY`. Existing HISTORY jobs cannot be resumed, claimed or approved through this pipeline. There is no scheduled sync or automatic approval.

## Daily worker

Run `npm run worker:sales` under a restart supervisor using the same release, encrypted credential key and database as the web app. The existing worker container and systemd template now apply to daily jobs only. Chromium is still needed for normal sales and deliveries; these dependencies are shared and are retained.

## Release safety

The AWS workflow checks for known legacy sales-worker processes, ubuntu/root cron entries and Cocotte historical timers **before** replacing server files. It fails deployment rather than stopping processes, deleting checkpoints or changing database jobs automatically. If blocked, an authorized operator must inspect and stop the legacy process/schedule before retrying. Do not leave an old checkout/container running: old loaded code cannot acquire the new guards until restarted.

No automatic job-table pause/update is performed. A retained HISTORY row in RUNNING state can continue blocking the database's running-job uniqueness protection; resolve that only through a separately authorized operational review, never by deleting financial history. Existing staged previews can still be inspected in the normal Zonal audit/preview screen, but no historical bulk approval remains.

## Verification

`npm test`, `npm run typecheck`, `npm run build`, `scripts/sales-jobs-check.ts` (disposable PostgreSQL + mocked Zonal provider), and `scripts/sales-history-ui-check.ts` (approved-data chart/UI regression checks) cover the retained workflows. Tests must never use the real restaurant database or import live financial data.
