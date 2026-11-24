# Mac → AWS Zonal sales transfer

Implemented, **disabled until explicitly configured**. No live AWS upload, production migration,
credential provisioning, launchd installation or Zonal login is performed by installation/build/tests.
Only ordinary validated browser fetches enqueue reports: single-day, weekly/batch and daily jobs
that use the existing staging services. Manual report entry, login/discovery diagnostics and old
stored previews are not swept up. There is no historical backfill and no automatic approval.

## Architecture and safety

1. The existing Mac browser worker remains unchanged. It still receives its Zonal credentials
   privately and returns only validated report fields.
2. `fetchAndPreview` / `runBatch` insert an immutable `ZonalAgentOutbox` row in their local
   preview transaction, including when that report is already approved locally. A transaction
   failure rolls back both operations. With transfer disabled, these hooks do nothing.
3. The Mac upload-only process reads Keychain and sends one report per request over HTTPS.
   Its PostgreSQL connection must be loopback/local. Never use the AWS database URL or a
   tunnel to production on this Mac. The uploader never launches a browser.
4. The AWS endpoint independently validates the branch, completed London business date,
   exact decimal amounts, GBP and financial reconciliation. Unknown payload fields (including
   local role, restaurant, sales-version and approval flags) are rejected.
5. A production `ZonalAgentReceipt` and any production preview commit together under the
   existing restaurant financial lock. The server computes its own current sales version,
   previous value and approval requirements. It never calls the approval service.
6. A Super User opens `/admin/integrations/zonal`, reviews the normal preview and explicitly
   approves. Missing forecasts, finalized weeks, historical reasons, manual conflicts and stale
   versions keep their existing protections. Reports/Dashboard continue using approved
   canonical Daily Sales only. Mac receipt status is **delivery status, not approval status**.

Receipts uniquely constrain `(agentId, transferId)` and `(agentId, sequence)`. Replayed IDs with
changed contents are rejected; identical retries return the original acknowledgement, even if
approval or cancellation has happened since. Higher source sequences/newer production
previews prevent delayed older reports superseding newer values. Matching approved sales
are skipped; matching fresh pending previews are reused without changing their creation date.
Existing `DailySales(restaurantId,date)` uniqueness and approval transactions remain untouched.

The original capture time becomes the remote preview's creation time. The existing **30-minute
expiry is retained**: delayed reports can be stored as `EXPIRED_REVIEW`, but are not approvable
without a fresh source fetch. Neither retries nor `--retry-blocked` renew freshness. A fresh local
fetch is a new capture with a new transfer ID; do not manually edit the outbox. Keep Mac/AWS
clocks synchronized. More than two minutes of future clock skew is rejected.

## Before enabling (requires deployment/migration approval)

- Back up the existing databases and inspect migration status separately on Mac and AWS.
- Review `prisma/migrations/20261120000100_zonal_agent_transfer/migration.sql`: it only creates
  the two tables/indexes/checks and restrictive foreign keys; it does not update any old rows.
- Apply approved pending additive migrations on each host, using that host's existing database
  configuration. `npx prisma migrate status` first; do not blindly apply unrelated pending work.
  `npm run db:migrate` is the existing deploy command, **not reset/db push/seed**.
- Run `npm run db:generate` and build/restart the appropriate application after approval.
- Establish the production restaurant ID, an active production Super User ID, and its existing
  mapping to `003 – Parsons Green`. Do not copy local user IDs or assume IDs differ/match.
  The receiver needs the branch mapping; it does not need a Zonal password to receive reports.
- Confirm the canonical host for `https://mrcocotte.com`. If it redirects to `www`, use
  `https://www.mrcocotte.com` everywhere below. Requests **never follow redirects**.
- Ensure the reverse proxy preserves the correct public HTTPS host/protocol, rejects direct
  insecure access, limits request bodies (32 KiB) and body read time, and rate-limits this route.
  Do not whitelist arbitrary Origin headers or relax TLS/CSRF/session protections.

## 1. Provision the dedicated credential on the Mac

Run from the project, under the Mac user who will run uploads, with the login Keychain unlocked:

```sh
npm run agent:credential -- cocotte-upload-v1
```

This uses the macOS Security framework and CryptoKit (Apple command-line Swift tools required).
It generates 32 random bytes and stores the bearer credential directly in **macOS Keychain**:
service `com.cocotte.zonal-upload`, account `cocotte-upload-v1`.
It prints **only a SHA-256 verification hash**, never the credential. Do not run a separate
`security ... -w` command or paste passwords/tokens into chat or a terminal command.
An existing account is not overwritten; use a new account suffix for rotation.

Choose one stable agent ID, for example `mac-parsons-green-v1`, unique to this Mac/database.
Keep it stable through ordinary restarts and credential rotation. If the Mac database is restored
or replaced such that sequences can roll back, stop uploads and provision a new agent ID on both
hosts after reconciling the old queue; never delete receipts or reset sequences to force delivery.

## 2. AWS server configuration (server-only, not NEXT_PUBLIC)

Configure through the existing restricted AWS service environment/secret management process:

```text
ZONAL_AGENT_ID=mac-parsons-green-v1
ZONAL_AGENT_TOKEN_SHA256=<verification hash printed by the Mac helper>
ZONAL_AGENT_RESTAURANT_ID=<existing production restaurant ID>
ZONAL_AGENT_ACTOR_ID=<existing active production Super User ID>
ZONAL_AGENT_RECEIVER_ORIGIN=https://www.mrcocotte.com
# For a private Node listener behind your reviewed HTTPS reverse proxy only:
ZONAL_AGENT_TRUST_PROXY=true
```

`ZONAL_AGENT_TRUST_PROXY` defaults to false. Next.js may expose its internal origin behind
Nginx. Enable this endpoint-local option **only after verifying** that Node's HTTP listener is
loopback/private and inaccessible from the public internet, and that the HTTPS proxy overwrites
`Host` with the public host and `X-Forwarded-Proto` with `https` (not an appended list). The receiver
requires both exact values; it ignores `X-Forwarded-Host`. Direct TLS deployments whose request
URL already has the canonical origin can leave the option off. This does not alter staff login
or global proxy trust. Do not expose the Node port publicly to make this test pass.

Do **not** set `ZONAL_AGENT_UPLOAD_ENABLED=true` on AWS. Missing/invalid receiver configuration
fails closed. Restart the AWS service only after deployment approval. Keep the existing Zonal
credentials, credential-encryption key and PostgreSQL configuration unchanged.

The hash cannot be used as the bearer credential. The endpoint accepts only the dedicated
Authorization header over the exact configured HTTPS origin/path, never staff cookies or browser
Origin requests. Authorization is bound to one restaurant/branch and checked against the sponsor's
current active Super User status on every request, including retries. Disabling that account,
removing the hash, or rotating it revokes upload access; the credential cannot approve or export.
There is a bounded process request limiter plus a transactional 60-new-receipts/minute quota;
configure proxy throttling as well for unauthenticated floods and multiple web processes. Never enable logging of Authorization headers or report bodies at the proxy, application or monitoring layer.

## 3. Mac configuration

Preserve all existing `.env` values. Add these **non-secret** settings locally:

```text
ZONAL_AGENT_UPLOAD_ENABLED=true
ZONAL_AGENT_ID=mac-parsons-green-v1
ZONAL_AGENT_LOCAL_RESTAURANT_ID=<existing local restaurant ID>
ZONAL_AGENT_KEYCHAIN_ACCOUNT=cocotte-upload-v1
ZONAL_AGENT_UPLOAD_URL=https://www.mrcocotte.com/api/zonal/agent/sales
```

`DATABASE_URL` remains the existing **local loopback** PostgreSQL URL. Do not copy the production
URL onto this Mac. Do not put the upload token, AWS hash, or new Zonal passwords into `.env`.
Existing locally encrypted Zonal credentials and `ZONAL_CREDENTIALS_KEY` remain in their existing
secure locations. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Restart the local application/worker so new source fetches see the opt-in settings. Enable only
after the local tables exist. If enabled but outbox persistence fails, the preview transaction fails
safely rather than silently losing the transfer. Nothing already stored is automatically exported.

## 4. Run and inspect the uploader

```sh
npm run agent:upload -- --status
npm run agent:upload -- --watch
```

The watch process checks the durable queue every five seconds. Without `--watch`, it drains
currently due reports and exits. It obtains the credential privately from Keychain; logs contain
fixed outcome codes/counts (and blocker codes in --status) only, not report contents, passwords, cookies, request headers or URLs.
Concurrent uploaders are serialized using a PostgreSQL advisory transaction lock and a two-minute
leased row. Crashed transfers become reclaimable. An acknowledgement lost after AWS commits is
safe to resend with the same immutable ID and payload.

Network/5xx/429 errors retry with exponential backoff/jitter, honoring numeric Retry-After up to
one day, with at most ten automatic attempts. Exhausted/invalid/conflicting/redirected records
become `BLOCKED`. A 401/403 blocks pending reports and stops the watch process: fix authorization
before restarting; do not repeatedly retry a rejected credential. Other dates can continue after
an individual invalid-report rejection. Acknowledged reports remain in the outbox for audit.

After reviewing/fixing a blocker:

```sh
npm run agent:upload -- --retry-blocked --watch
```

This resets transport attempts, **not timestamps, report contents, receipt IDs or approval**.
It does not log into Zonal. An expired report requires the ordinary local Zonal fetch again.

## 5. Start automatically at Mac login (optional, install manually after approval)

Use a **LaunchAgent**, not the legacy daily/historical sales-worker installation. It only transports
queued reports. Create `~/Library/LaunchAgents/com.cocotte.zonal-upload.plist` with your actual
absolute Node binary and project paths (obtain Node with `command -v node`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>com.cocotte.zonal-upload</string>
 <key>WorkingDirectory</key><string>/ABSOLUTE/PATH/restaurant-cost-tracker</string>
 <key>ProgramArguments</key><array>
  <string>/ABSOLUTE/PATH/node</string><string>--conditions=react-server</string>
  <string>--import</string><string>tsx</string><string>scripts/zonal/upload-sales.ts</string><string>--watch</string>
 </array>
 <key>RunAtLoad</key><true/>
 <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
 <key>ThrottleInterval</key><integer>300</integer>
</dict></plist>
```

Validate with `plutil -lint ~/Library/LaunchAgents/com.cocotte.zonal-upload.plist`, then load with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cocotte.zonal-upload.plist`.
After fixing a stopped/revoked credential, explicitly restart with
`launchctl kickstart gui/$(id -u)/com.cocotte.zonal-upload`.
No secrets go in the plist. Do not install/start this during development tests.

The Mac must be awake, its local PostgreSQL running, its user logged in and Keychain accessible.
Sleep/offline periods delay delivery; the queue survives restart, but old captures still expire.
This does not schedule Zonal logins, enable historical workers or require production DB access.

## 6. Approved first live pilot and rollback

Once code/migrations/configuration are approved, fetch **one completed day** locally, run one
upload, and confirm the production preview's date/branch/figures and local receipt. Verify that
Daily Sales totals remain unchanged. Explicitly approve in production only when ready. Then
repeat a transfer and verify that neither previews nor sales duplicate. Test wrong/revoked
credentials in staging, not against production. Backups must cover the new outbox/receipts.

Rotate using a new Keychain account; replace only the AWS verification hash, restart AWS,
update the Mac account setting, then resume blocked transfers. Pending payloads/IDs remain
unchanged. Revoke by removing the AWS hash and stopping the LaunchAgent. To disable local
queuing, set `ZONAL_AGENT_UPLOAD_ENABLED=false` and restart local processes; keep all queue,
receipt, preview and sales rows intact. Roll back code without dropping the additive tables.

## Verification commands (isolated test databases only)

```sh
npm run typecheck
npm test
npm run lint
npm run build:production
node --conditions=react-server --import tsx scripts/zonal/agent-transfer-check.ts
```

The last script creates **two new disposable PostgreSQL databases** on a separate temporary
cluster/port 51947. It applies migrations only there, simulates authenticated HTTP in memory,
and tests lost acknowledgements, leases/concurrency, approval/manual protection, expiry and
isolation. It never connects to AWS or Zonal or uses an existing database. The new credential
helper should be typechecked with `swiftc -typecheck` without running it during tests.
