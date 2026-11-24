# Kitchen navigation and notifications — local implementation

**The new migration has NOT been applied to the Mac or AWS database.** The user requested that it remain unapplied. No real recipes, users, sales or purchases were changed for this feature. The migration and browser checks run only against disposable test databases.

## What is included

- Shared left navigation: Recipes → Weekly Specials (published names/count) → Notifications. Mobile More uses the same links; the header bell is available on mobile and desktop.
- Persistent recipe publication/update, ingredient/allergen/component change, special publication/change/removal and important announcement events. Events are generated inside the source database transaction; rollback means no event. Existing records are not backfilled into notifications.
- Notification centre with read/unread controls, separate in-app/push category preferences and Super User announcement publishing. Read state and preferences propagate to other sessions.
- Only Super Users can mutate recipes, categories, archives/restores, specials or announcements. Recipe access remains required. Personal card arrangements remain available to all authorised recipe viewers.
- Current recipe/category visibility, archive state, user activity, permissions and restaurant ownership are checked for feeds, notification links and push delivery. Old links cannot open unpublished content. Notifications predating account creation are excluded.
- PostgreSQL LISTEN/NOTIFY → authenticated SSE. Only restaurant identifiers travel in change signals; content is re-read using the current authenticated actor. One shared client connection drives the navigation, bell and notification centre.
- Durable Web Push queue with database row locks, expiring leases, unique event/subscription identity, bounded retry and expired subscription removal. Encryption is AES-256-GCM with a separate server key. Browser endpoint allowlists prevent arbitrary server-side requests. Maximum five endpoints per account.
- Generic OS push text only, without recipe names, ingredients, allergen details or announcement contents. Clicks open an authenticated, freshly authorised server route. Service worker caches no pages or API responses.

## Migration (requires separate approval)

`prisma/migrations/20261122000100_kitchen_notifications/migration.sql` adds six tables, foreign keys/indexes, transactional event triggers and notification functions. It does not change existing recipe/financial rows, drop tables, seed data or replay historical updates. The Prisma schema includes matching models.

Back up and inspect **all pending migrations first**. This workspace also contains a separate pending Mac-to-AWS agent migration. Do not blindly apply every pending migration. Apply only the explicitly approved, reviewed migration using the project's scoped migration procedure, then regenerate Prisma and restart the web process. Production has not been touched or authorised for this migration.

Custom trigger functions and partial indexes must be retained in future migration reviews; Prisma's declarative schema does not describe triggers.

Until migration approval, the centre shows a database setup message and keeps write controls disabled. Recipe browsing and the existing Specials snapshot continue to work. Live database updates will only become active after the triggers are installed.

## Environment and worker setup

Set these on the web server and notification worker using a private environment file or secret manager, never Git or NEXT_PUBLIC variables:

- `DATABASE_URL`: existing production database URL, unchanged.
- `KITCHEN_EVENTS_DATABASE_URL`: optional **direct/session** PostgreSQL connection for LISTEN. Required if DATABASE_URL uses transaction pooling. Use the provider's verified TLS settings, not a TLS verification bypass.
- `WEB_PUSH_VAPID_PUBLIC_KEY`: VAPID public key (the only push key intentionally sent to the browser).
- `WEB_PUSH_VAPID_PRIVATE_KEY`: private VAPID signing key, server only.
- `WEB_PUSH_VAPID_SUBJECT`: operator contact, e.g. a valid `mailto:` contact.
- `NOTIFICATIONS_ENCRYPTION_KEY`: independent random 32-byte key encoded as 64 hexadecimal characters. It must remain stable across restarts and be backed up separately. Losing it requires users to resubscribe; rotating it requires re-encrypting subscriptions first.

Use `web-push.generateVAPIDKeys()` and Node `crypto.randomBytes(32).toString('hex')` in a provisioning script that writes directly to a private file with mode 0600; do not print keys into chat, terminal logs, CI output or screenshots. `.env.*` is ignored by Git. Configure the web and worker with identical keys. No keys have been generated or installed in the real environment by this change.

After approved database setup, run `npm run worker:notifications` as a persistent service. `ops/cocotte-notifications-worker.service` is an **uninstalled template**; adjust user, working directory, Node path and private EnvironmentFile. It is separate from Zonal workers and uses no Zonal credentials. The queue survives restarts; UI/in-app notifications do not require this worker.

For SSE behind a proxy: disable buffering on `/api/kitchen/events`, allow at least 65 seconds upstream read time and preserve cookies. Connections intentionally renew every 55 seconds. There is no external pub/sub service to purchase for a small deployment.

## Browser opt-in and limits

Open Notifications → Notification preferences → Enable browser notifications. Permission is requested only following this click. Disable removes the user's stored subscriptions and unsubscribes the current browser. Re-enabling explicitly registers the browser account binding again. Category choices for in-app and push are independent.

Background push requires HTTPS (localhost is allowed for development), a supported browser and operating system. iPhone/iPad typically require installation to the Home Screen and supported iOS. A standalone manifest is included. OS/browser policy can still suppress or defer delivery; delivery cannot be guaranteed if the browser/OS disables it. Renewal is handled by `pushsubscriptionchange` where supported; re-enabling also repairs/replaces a subscription. HTTP 404/410 removes expired endpoints.

Retries are at-least-once transport; a provider can accept a message and lose its response. Unique queue rows, acknowledgement, stable Web Push Topic and service-worker notification tag suppress ordinary duplicate retries, but external transport cannot offer mathematically exactly-once delivery.

The centre shows the latest 100 accessible, opted-in updates. The unread counter covers all accessible opted-in updates. Event records persist in PostgreSQL; no retention/deletion job has been introduced.

## Verification

```
npm run typecheck
npm run lint
npm test
npm run build:production
node --conditions=react-server --import tsx scripts/kitchen-notifications-check.ts
node --conditions=react-server --import tsx scripts/recipe-personalisation-check.ts
```

The browser test creates an isolated PostgreSQL cluster (port 51959), fixture accounts/recipes and Next production server (3193). It verifies real LISTEN/NOTIFY propagation, publishing/editing/unpublishing, two-session read state, real concurrent push queue claims with mocked transport, preference persistence, CSRF/permissions, old-link protection and 375/390/768/1440px layouts. It never connects to real account data. Screenshots: `/private/tmp/cocotte-kitchen-notifications-review`.

Push encryption, queue claiming, authorization rechecks, transient retry and expired subscriptions are tested with mocked push transport. **Actual delivery to Apple/Google/Mozilla or a real device has not been verified.** That requires migration approval, provisioned production keys, a running worker and an opted-in test device.

## Local verification results

- TypeScript: passed.
- Full automated suite: 505 tests passed; the final focused notification/navigation/recipe run also passed (60 tests).
- ESLint: no errors; three existing recipe `<img>` warnings remain.
- Webpack production build: passed.
- Multi-user browser/SSE and concurrent queue checks: passed, using disposable PostgreSQL and synthetic accounts. Latest observed publish-to-render time: 3.36 seconds, including database operations and event-stream reconnection.
- Whole-card mouse/touch/keyboard ordering, normal clicks/menus, global filtered ordering, failed-save retry and filter persistence browser regression: passed.
- Missing notification schema: explicitly verified, without a crash. The real local database was inspected with a read-only query only; no migration was applied.
- npm audit reports three existing high-severity entries in the Prisma → @prisma/config → effect chain. No advisory was reported for web-push. No forced downgrade or unrelated dependency changes were made.

Applying triggers requires an appropriate database migration role that owns the source recipe tables. Ensure the runtime web/worker role receives only the required privileges on the new tables and functions; do not broaden access to unrelated financial/user tables just to install this feature.

## Files involved

Shared shell/navigation: `src/components/application-shell.tsx`, `src/components/navigation.tsx`, `src/lib/navigation.ts`.

Recipe presentation/security: `src/app/(protected)/recipes/page.tsx`, `recipes/actions.ts`, `recipes/edit/page.tsx`, `recipes/[id]/page.tsx`; the former `weekly-specials-sidebar.tsx` and CSS were removed. Existing Super User Specials forms remain.

New notification implementation: `src/lib/kitchen/*`, `src/components/kitchen/*`, `src/app/api/kitchen/*`, `src/app/(protected)/notifications/*`, `src/app/manifest.ts`, `public/kitchen-sw.js`, `scripts/workers/notifications.ts`.

Storage/configuration: `prisma/schema.prisma`, the reviewed migration, `package.json`/lockfile, `ops/cocotte-notifications-worker.service`, `ops/notifications.env.example`.

Verification: `tests/kitchen-notifications.test.ts`, `tests/kitchen-worker.test.ts`, `tests/navigation.test.ts`, `tests/recipes.test.ts`, `scripts/kitchen-notifications-check.ts`, and the legacy sidebar test entry point. Unrelated pre-existing Dashboard, login and Zonal work was preserved.
