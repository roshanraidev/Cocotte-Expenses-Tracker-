# Production hosting: www.mrcocotte.com

Prepared 17 November 2026. Updated 18 November: historical import functionality retired; existing historical job/report records are retained. See [daily sales jobs](zonal-sales-jobs.md). **Nothing has been deployed, purchased, migrated or changed in GoDaddy.** This is the current production runbook; older HOSTING.md describes general Node hosting and must not be treated as a Vercel launch checklist.

## Decision and outstanding launch blockers

The preferred architecture is Vercel for the Next.js website, managed PostgreSQL (for example Neon), and a persistent Linux browser worker (for example Render Background Worker). Keep all three in nearby European regions and configure provider-required TLS. `vercel.json` currently chooses Frankfurt (`fra1`); align the database and worker before release.

The application is **not yet ready for an unrestricted Vercel launch**:

| Finding in the current code | Required before launch |
| --- | --- |
| Daily incremental imports retain PostgreSQL jobs, leases, checkpoints and a separate worker. Historical backfill is disabled. Weekly batches still use Next `after()` and delivery previews spawn a browser in the web process. | Extend the existing durable queue to those browser operations, preserving validation, approval and idempotency. Vercel requests should enqueue/poll; they must not own long-running Chromium processes. The supplied worker image currently runs daily sales jobs only. |
| Zonal admin route declares `maxDuration=900`; browser batches can take 15 minutes. | Offload them. Standard Pro Functions allow up to 800 seconds; extended duration is a separate beta, not a durability solution. Do not shorten financial operations just to satisfy deployment validation. |
| Recipe uploads permit 5 MiB; invoice uploads permit 8 MiB; the application permits 10 MB Server Actions. Authenticated downloads return whole database files. | Vercel's normal Function payload ceiling is 4.5 MB. Implement private direct-to-object-storage upload/download transport (for example private Blob/S3), or an authenticated persistent upload service. Preserve existing images/documents and permissions. Raising Next's limit does not raise Vercel's limit. |
| PDF/OCR uses native canvas, PDF.js and Tesseract, with up to 90 seconds of work. | Test assets/native libraries on the target Linux runtime, memory and bundle size. Move scanning into the worker if necessary; preserve the manual fallback. |
| Worker container prepared but Docker is unavailable on this Mac. | Build and test the actual Linux image, heartbeat, graceful termination and interrupted-job recovery before enabling it. A Mac build does not prove Linux browser compatibility. |

The worker queue requires no Redis today. Do not add a second sales database or competing spending calculations. A persistent Node web server is an alternative with fewer transport changes, but switching the preferred architecture needs a separate decision.

Official constraints: [Vercel Functions limits](https://vercel.com/docs/functions/limitations), [Render background workers](https://render.com/docs/background-workers), [Playwright Docker guidance](https://playwright.dev/docs/docker). Vercel also offers [Daemons in public beta](https://vercel.com/docs/daemons); that could host a persistent container after validation, but is not configured here.

## What has been prepared

- Node 24 pinned in package engines, `.nvmrc` and `.node-version`.
- Locked dependency security updates; no forced major upgrades. The running local processes have not had their dependencies replaced.
- Vercel installs with `npm ci --include=dev`, builds with `npm run build:production` (Prisma generation plus Webpack), and does **not** run migrations or seed data during builds.
- `next.config.ts` permanently redirects only the apex host to `https://www.mrcocotte.com`, preserving paths/query strings. Localhost and preview hosts are unaffected.
- `ops/Dockerfile.worker`: Node 24 Debian, locked Chromium installation, unprivileged runtime, existing sales worker command, database heartbeat health check. `.dockerignore` excludes local secrets, backups, exports and dependencies.
- Public `GET /api/health` reports process liveness only. It discloses no database, account, job or environment details and is not a readiness test.
- Secret-name template: `ops/production.env.example`. Do not enter real values in that file or Git.

## Environment variables

Enter secrets in each host's private environment/secret settings, never in URLs, build arguments, chat, Git or `NEXT_PUBLIC_*` variables.

| Name | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Web runtime and worker | Provider-issued PostgreSQL URL with TLS; use an appropriate pooled runtime endpoint. Separate staging/preview databases from production. |
| `ZONAL_CREDENTIALS_KEY` | Web and worker | Securely transfer the **existing** base64 32-byte key so restored encrypted Zonal credentials remain readable. Replacing it breaks decryption. Keep a restricted recovery copy separately from the database. |
| `NODE_ENV=production` | Worker; Vercel sets it for production builds/runtime | Enables Secure, `__Host-` session cookies and production request checks. |
| `DATABASE_POOL_SIZE=5` | Web and worker, initial example | Maximum per process, not per deployment. Size against total provider connections, number of web replicas and worker count; reserve migration/admin headroom. |
| `ZONAL_SALES_RECHECK_DAYS=7` | Worker/web as applicable | Existing correction window, valid range 1–31. Does not enable scheduling. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Optional, web build | A separate base64 AES key when coordinating independently built/self-hosted replicas. Do not reuse the Zonal key. Vercel normally manages build coordination. |
| `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` | Worker image sets it | Chromium installation location. |

There is no NextAuth/Auth.js installation requiring `NEXTAUTH_SECRET` or `AUTH_URL`. No application URL variable is currently consumed: the canonical host is configured in Vercel/domain redirect. Password-reset links use the request origin, so verify their HTTPS host in staging. Existing saved encrypted connections do not require legacy `ZONAL_USERNAME`, `ZONAL_PASSWORD`, `ZONAL_BRANCH`, `ZONAL_RESTAURANT_ID` or `ZONAL_AUTOMATION_AUTHORISED` environment fallback variables. Do not set `ZONAL_BROWSER_CHANNEL=chrome` in the Chromium worker image. `DEV_ALLOWED_ORIGINS`, `CHROME_PATH` and diagnostic test variables are local/test-only.

Keep web, worker and release migration credentials separate where feasible. Use a dedicated migration role; the normal app role should not be a PostgreSQL superuser. Never disable TLS certificate validation. Restrict database network access where supported.

## Database backup, review and transfer — requires later approval

Current source is local PostgreSQL 17. Existing financial records, uploaded binaries, users, sessions, audit triggers, forecast protections, unique constraints, Prisma migration history, import previews and job checkpoints are in PostgreSQL. This makes transfer feasible; no transfer has been performed or restore verified on a managed host.

1. Decide what data is approved for production transfer. Do not assume the local database is production-ready. Review test accounts/data, restaurant scope, historical staging and pending jobs without deleting anything automatically.
2. Choose managed PostgreSQL compatible with the source version, TLS, required functions/triggers, connection pooling, backups and point-in-time recovery. Provision an empty **staging** destination first.
3. Have an authorized operator use PostgreSQL 17-compatible tools and protected connection profiles/password files, not passwords pasted in shell commands. Create a full custom-format `pg_dump` including binary columns and schema. Encrypt the archive; keep it outside the repository on restricted independent storage. Record a checksum and backup timestamp. A dump alone is not a tested backup.
4. Restore with `pg_restore --no-owner --no-privileges --exit-on-error` into that empty staging database under a suitable owner. Map roles/grants explicitly. **Do not use `--clean`, reset, seed or overwrite an existing database.** Preserve `_prisma_migrations`, triggers, indexes and all job/import identities.
5. Compare table counts, approved sales/purchasing totals by restaurant/date, constraints, append-only audit behavior, forecasts, invoice/photo byte hashes and encrypted connection availability. Test restoration and access before accepting the backup. Existing session rows should be invalidated on the destination during an approved security cutover, rather than carrying all old logins into production; do not delete source accounts/data.
6. Keep staging workers **off**: restoring a queued job plus live credentials must not cause staging and local workers to fetch Zonal concurrently. Test with isolated fixtures or explicitly authorized read-only checks. Use restricted access for any copy containing personal/financial data.
7. Inspect `prisma migrate status` and every pending SQL file on the restored destination. If a safe pending migration is required, run `npm run db:migrate` **once**, using the direct migration connection as `DATABASE_URL`, after backup and approval. No `DIRECT_URL` variable is currently wired into Prisma config. Do not run `db:dev`, `db:seed`, `db push` or reset in production. No schema migration is introduced by this preparation.
8. At an approved cutover, pause/drain source workers and writes, take a final verified snapshot, restore to the empty production target, repeat reconciliation, then switch web/worker connections together. Keep the old database intact and inaccessible to new writes until rollback risk passes. Do not run local/cloud workers simultaneously against separate copies of the same source jobs.

Managed pooling must be tested with the existing `pg` adapter, transactions and advisory locks. Use a direct connection for schema changes. Budget total connections across all Vercel instances plus the worker; a singleton inside one process does not create a global connection cap.

Reference: [PostgreSQL logical backup and restore](https://www.postgresql.org/docs/current/backup-dump.html). Schedule encrypted backups/PITR and regular restore drills with defined retention and recovery objectives.

## Worker setup — after blockers and staging tests

For the Vercel deployment, **all Playwright entry points** need a persistent worker boundary, including ordinary sales and delivery operations:

| Operation | Current implementation | Vercel preparation still needed |
| --- | --- | --- |
| Queued daily incremental sales jobs | `scripts/workers/sales.ts`, `src/lib/sales-sync/job-worker.ts` | Existing durable consumer; deploy/test the Linux image and shared database safely. |
| Selected-week/date batches | `batch-actions.ts` uses `after()` to call `runBatch` | Enqueue into the persistent worker instead of completing the browser batch inside a web Function. |
| Connection verification, single-day report fetch and latest-date discovery | `src/lib/zonal/worker.ts` spawns `scripts/zonal/worker.mjs` | Add authenticated, restaurant-scoped job request/results; retain cooldowns and approval checks. Saving encrypted credentials does not verify login. |
| Supplier delivery previews | `src/lib/zonal/delivery-preview.ts` spawns `scripts/zonal/delivery-worker.mjs` | Offload the existing reader and return its verified preview; keep purchase registration gated and duplicate-safe. |
| Stock report discovery | The same browser worker invokes stock discovery | Offload read-only discovery; do not imply stock extraction is verified. |

The current Dockerfile does not implement these missing handoffs. Merely setting a worker URL or installing Chromium in a Vercel Function will not connect them. No worker API secret/URL variable is currently consumed, so do not invent one in Vercel settings.

1. Create one persistent Background Worker, with repository-root build context and `ops/Dockerfile.worker`. Do not create it yet. Start with approximately 1 CPU / 2 GB RAM; measure Chromium memory before increasing concurrency.
2. Set production secrets at runtime. Do not bake `.env`, a database dump or credentials into an image. Container build needs no live database or Zonal login. The image runs `npm run worker:sales`; it has no public HTTP port.
3. Configure automatic restart, monitoring and enough shutdown grace for current leases/checkpoints. The health command checks a recent database heartbeat for the initial single-worker setup. Do not let a probe execute a Zonal login.
4. Test process termination/resume, lease expiry, cooldown/rate limiting, credential decryption and partial failures using disposable data. Never reinitialize historical job progress or replace staged reports. Daily jobs can resume after verification; retained historical jobs must never be resumed.
5. Enable a single production consumer only at approved cutover. Monitor stale leases, failed dates, pending approval and last successful report access. Keep import approval explicit. No scheduled daily sync is enabled by these files.

Daily incremental jobs can run without an open browser because PostgreSQL stores their progress; this does **not** yet apply to every weekly/delivery web action. A separate worker deployment must use the same compatible source release and schema as the web app.

## Authentication and production verification

The existing system uses Argon2id passwords, hashed random database session tokens, 12-hour sessions, database-backed login throttling, server-side effective permissions and restaurant scoping. Production cookies use `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and the `__Host-` prefix. Account/permission changes revoke sessions; the last active Super User is protected. Do not replace this authentication or weaken checks for hosting.

This code review is not an independent security audit. On the actual HTTPS staging host verify login/logout, password resets, Secure cookie flags, same-origin credential actions through the platform proxy, permission changes and restaurant isolation. Never whitelist arbitrary origins to solve a proxy issue. Server Actions rely on their built-in origin checks; credential operations additionally enforce HTTPS/same-origin and throttling. Private financial/file responses must not become public CDN cache entries. Default error pages should show safe messages while restricted server logs retain diagnostics without passwords, cookies, tokens or invoice contents. Configure log retention and alerting with the provider; no external error service has been installed.

## Vercel steps — do not deploy yet

Use these exact build settings when deployment is later authorized:

| Vercel field | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Repository root (`./`) |
| Node.js Version | 24.x |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build:production` |
| Output Directory | Leave the Next.js default; do not enter `out` or enable static export |
| Function Region | Frankfurt (`fra1`), matching the prepared config; place database/worker nearby |
| Production Branch | Explicitly select a reviewed release branch; current local branch is `feature/purchasing-percent-of-sales` |

The preparation files are currently **local/uncommitted**. Importing the existing GitHub repository will not include them until a separately approved commit/push. Do not click Deploy yet: the current instruction permits preparation only, and importing a project can trigger a build/deployment.

1. After code review and explicit permission to commit/push, import the existing GitHub repository `roshanraidev/Cocotte-Expenses-Tracker-`. Choose the intended reviewed production branch; do not assume the current feature branch should automatically be production.
2. Choose Next.js, repository root, Node 24, install `npm ci --include=dev`, build `npm run build:production`, default Next.js output directory. `vercel.json` already supplies these commands. Do not add a database migration/seed to the build.
3. Configure separate Production and Preview secrets. Never connect untrusted preview builds to production data or permit previews to run unattended Zonal jobs. Protect staging/preview access; disable or isolate their workers.
4. Resolve the browser/upload blockers above, then make an approved staging deployment. Verify native dependencies, function limits and bundle size on Vercel itself. A successful local build does not establish Vercel compatibility.
5. In Project → Settings → Domains, add `www.mrcocotte.com` as the serving domain and `mrcocotte.com` as a redirect to it. Preserve path/query. Do not configure www to redirect back to apex. Copy the exact DNS/verification records Vercel shows; none are invented in this guide.
6. Only after explicit deployment/DNS approval, connect the reviewed release and production database and perform the checklist below. Adding a GitHub integration can trigger automatic builds: do not start project import until deployment is authorized.

## GoDaddy and HTTPS — later, with approval

1. Export or record the current DNS zone and existing website configuration. Confirm whether the apex/www already serves another site; replacing it is a separate cutover decision.
2. GoDaddy → My Products → the domain → DNS → Manage DNS. Keep GoDaddy as registrar; a transfer/nameserver change is not required just to host on Vercel.
3. Create/update the **www CNAME** with the exact target Vercel provides. Create/update the **apex (@) record** using the type/value Vercel provides. Add ownership TXT records only with the exact names/values Vercel requests. Do not substitute a remembered Vercel IP or generic CNAME.
4. Review only conflicting records for `@` and `www`; preserve mail MX/SPF/DKIM/DMARC, other subdomains and unrelated records. Do not combine GoDaddy forwarding with a conflicting Vercel redirect.
5. Wait for both domains to show valid DNS and automatically issued HTTPS certificates in Vercel. Resolve any CAA restrictions using the issuer instructions Vercel supplies. Test `https://www.mrcocotte.com`, apex redirect with a path/query, and HTTP-to-HTTPS. Check for loops and certificate warnings on both names before announcing launch.

Reference: [Vercel custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## File storage

Recipe photographs and invoice originals currently live as PostgreSQL binary columns, not an uploads directory. A correct full database backup includes them; ephemeral web/container disks are not their source of truth. Preserve these bytes during transfer. Database storage/backups will grow with images and documents.

For Vercel's large-file transport fix, use private object storage with authenticated, short-lived upload/download authorization and restaurant ownership checks. Do not expose an invoice bucket publicly or move/delete existing binaries before a verified copy and approved rollout. No storage API key is required by the current database-backed implementation; future object storage requires separately configured credentials and implementation.

## Indicative monthly budget

Planning estimate in USD, before tax and variable traffic; not a quote or purchase:

| Component | Allowance |
| --- | --- |
| Vercel Pro website | From $20/month plus usage/additional seats |
| Persistent browser worker | Around $25/month for a 1 CPU / 2 GB instance; confirm current provider compute/workspace fees |
| Managed PostgreSQL | Budget $20–40+ initially, depending on continuous compute, backups and storage |
| Future private object storage | Allow $0–10+ initially, dependent on traffic/retention |
| Overall planning range | Approximately $65–100+ per month, before any extra backend service/workspace fees |

The worker polls the database frequently, so a serverless database may stay awake; Neon's advertised $15 typical intermittent workload is **not** a reliable cost estimate for this application. Existing domain renewal remains separate. Set spending alerts and inspect actual usage before scaling. Prices checked 17 November 2026: [Vercel](https://vercel.com/pricing), [Neon](https://neon.com/pricing), [Render](https://render.com/pricing).

## Release checks and rollback

Local preparation verification (17 November 2026): a clean temporary source copy, without the restaurant `.env`, passed `npm ci --include=dev`, Prisma generation, `npm run typecheck`, all **420 tests**, and `npm run build:production` using Next 16.4.6. Lint passed with three pre-existing recipe `<img>` warnings. Installation reported zero dependency advisories; a separate production-dependency audit also reported zero. The existing ESLint 9 package emitted an upstream end-of-support warning; an eventual major tooling upgrade should be tested separately. No claim is made that an audit proves the absence of every vulnerability.

`node scripts/production-host-check.mjs` passed against the built server: apex 308 redirect preserves path/query; www/local/preview hosts are unaffected; health responses are no-store with security headers; unauthenticated Dashboard access redirects to login. The existing `scripts/adaptive-navigation-check.ts` browser suite also passed using a disposable PostgreSQL cluster: Super User, recipe-only Guest, multiple-permission users, permission refresh, protected routes/actions, recipe images and 390/768/1440px layouts. It did not touch the configured restaurant database.

A separate **read-only** metadata check found PostgreSQL 17.11, 20 recorded migrations with none unfinished, zero duplicate restaurant/date sales, 31 canonical sales records, 13 recipes, four stored recipe photographs, four user triggers and one saved encrypted Zonal connection with its key present. Pending historical previews remain stored (1,371 at the check; the existing local worker can continue changing that count). No local migrations, data transfer or financial imports were run by this preparation. The installed dependencies used by the existing local app/worker remain unchanged; restart/update them only in a controlled maintenance step. The new Linux container and remote Vercel/managed-database behavior remain unverified.

Before launch, verify on isolated staging data:

- Clean locked install, Prisma generation, TypeScript, lint, tests, production build and target Linux worker build.
- Dashboard, sales, reports, recipes/photos, suppliers/purchases/documents, user management and permission-based landing pages.
- Approved totals match the source by restaurant/date; no previews enter financial totals; forecasts, purchasing budgets and deductions unchanged.
- Weekly and daily/incremental Zonal workflows keep duplicate/correction/approval protections; historical backfill stays disabled. Delivery sync remains matched-supplier-only and cannot import uncertain invoices. Use read-only live verification only when authorized; do not import real purchases as a deployment test.
- Verify retained historical jobs are never claimed or resumed; no overlapping legacy source/cloud worker. Charts use approved data and refresh after isolated test approval.
- Large upload/download transport, OCR fallback, credential update/test and expiry behavior on the real platform.
- HTTPS, www/apex behavior, cookie security, cross-restaurant denial, Guest/Viewer limitations, Super User access and no secret leakage.
- Provider backup/PITR, restore drill, alerts for web errors/worker heartbeat/database capacity, and rollback owner identified.

For a code-only regression, stop new jobs, retain queued/checkpoint data, and promote the previous compatible Vercel deployment plus matching worker image. Do not automatically reverse migrations or restore an old database over new financial entries. If schema/data recovery is required, stop writes under an approved incident plan, restore to a **separate** database, reconcile post-backup transactions and obtain approval before switching connections. Keep the original database and encrypted key recoverable. DNS rollback uses the saved zone values only if required and approved.

No current preparation authorizes a production launch, DNS edit, data transfer, schema migration, financial import or Git commit/push.
