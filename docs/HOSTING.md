# Server hosting readiness

No deployment has been performed. Production builds and committed migrations are exercised by the isolated browser/integration suites on this Mac; an actual remote host still needs provisioning and verification.

## Already implemented

- Next.js server with React/TypeScript, Prisma and PostgreSQL. Runtime application code has no Mac-specific paths or fixed database host. All business reads/writes go through the server-side Prisma client using `DATABASE_URL`.
- Accounts, roles, sessions, forecasts, targets, sales, suppliers, purchases, stock values, audit records and finalized snapshots reside in PostgreSQL. There is no localStorage, sessionStorage, IndexedDB or local JSON business-data store. React form state is temporary and unsaved. CSV exports are generated from queries rather than saved as local business files.
- Every action authenticates server-side. Planning, target changes, supplier changes and purchase corrections/voids require the Super User. Purchases validate supplier tenancy, active status, dates, money and the week lock; retries are deduplicated by a unique database submission key and a transaction.
- Money uses exact integer pence; the net amount entered is never VAT-adjusted. The purchase delivery date determines its week. Weekly totals are read in a consistent database transaction.
- Migrations are additive; migration deployment does not reset or seed data. PostgreSQL retains original purchases and append-only audit entries after correction or voiding.
- Pages read current database data. Saves revalidate dashboard/report routes. Other open devices refresh when returning to the window or every 30 seconds while not editing. Supplier dropdown focus also queries active suppliers. Reload/sign-in from another device queries the shared database.
- Production session cookies are Secure, HttpOnly, SameSite=Lax, with the `__Host-` prefix. Login throttling is database-backed. Responses include baseline security headers; financial CSV responses are private/no-store.
- `.env`, private account files, database backups and exports are ignored by Git. The local `.env.example` contains placeholders only and remains ignored under the existing repository policy.

## Configure before deployment

1. Provision a persistent PostgreSQL database and take a verified backup of the existing restaurant database. Migrate/restore existing data to the hosted database; do not seed a replacement database containing existing accounts. Test restoration before switching users.
2. Configure the host's private `DATABASE_URL`, including its required TLS settings. Never prefix database secrets with `NEXT_PUBLIC_`. Choose `DATABASE_POOL_SIZE` for the database connection limit and replica count (default 10 per application process). The runtime account needs business-table permissions; migrations require a separate appropriately privileged connection/account where practical.
3. Choose a host capable of running the Node.js server and native argon2 dependency. Use Node 24 (minimum declared version: 22.18), install from the lockfile, and retain Prisma CLI availability for migrations. Example build/release commands:

   ```sh
   npm ci
   npm run db:generate
   npm run db:migrate
   npm run build -- --webpack
   npm start -- --hostname 0.0.0.0 --port 3000
   ```

   Supply environment variables privately. Run migrations once per release against the intended hosted database, before serving code requiring new fields. Do not run `db:dev`, reset, or reseed in production. Use the same built artifact across replicas.
4. Configure a domain and HTTPS reverse proxy/platform ingress. Preserve the request host/protocol headers and permit same-origin Server Actions. Production login needs HTTPS; do not turn off Secure cookies to work around missing HTTPS. Keep PostgreSQL private and allow application connections only.
5. Configure restart policy, health monitoring, backup retention/restore tests, error monitoring and database maintenance (including expired sessions). Keep backups in durable restricted storage independent of the application container. The `.next` build/cache is not a source of restaurant records.
6. If running multiple Next.js instances, configure consistent Server Action encryption/build settings and deployment coordination per the bundled Next.js self-hosting guide. Authenticated pages are dynamic/private; any proxy/CDN must respect private/no-store responses.
7. Verify production migrations, logins for both roles, a purchase/correction/void workflow in a staging database, HTTPS cookies, CSV export and cross-device refresh before enabling live use.

## Phone preview on the Mac's local network

This is local development preview, not deployment. Use a trusted Wi-Fi network shared by the Mac and phone.

1. In macOS System Settings → Wi-Fi → Details → TCP/IP, find the Mac's IPv4 address.
2. Stop the old dev server using Control-C. Replace `YOUR_MAC_WIFI_IP` below with that address:

   ```sh
   DEV_ALLOWED_ORIGINS=YOUR_MAC_WIFI_IP npm run dev -- --webpack --hostname 0.0.0.0
   ```

3. On the Mac use `http://localhost:3000`; on the phone use `http://YOUR_MAC_WIFI_IP:3000`. Keep the Mac awake and the Terminal running. If macOS asks about incoming Node connections, allow them on your trusted network. Networks with client isolation may prevent phones reaching the Mac.
4. Both devices use the same PostgreSQL database running on the Mac. The phone does not need a database installation. The address can change when Wi-Fi changes. Production uses the hosted server/domain instead.

## Packaging documents and scanning

Packaging invoices, product lines, catalogue aliases and original invoice bytes live in separate PostgreSQL tables. Files are limited to 8 MB each and served only through an authenticated, restaurant-scoped download route with private/no-store headers. Database backups must include `PackagingDocument`; restore-test both invoice metadata and file downloads. Storage/backup capacity grows with invoice uploads. No local upload directory, public URL bucket, API key or paid OCR account is required.

Server extraction uses PDF.js and Tesseract.js, English language data bundled as a dependency, and native `@napi-rs/canvas`. Choose a Node server/container with supported native binaries, adequate CPU/RAM and at least a 120-second request allowance; a restrictive Edge runtime or short serverless timeout is unsuitable for the current synchronous scanner. Keep all dependencies installed, including OCR language/worker assets. Reverse proxies must allow the 10 MB Server Action request body (individual document limit 8 MB). Test real photo uploads on the chosen host. Scans are bounded to five pages / 20 megapixels and one concurrent scan per process, with a 90-second timeout and manual-entry fallback. For larger volumes, add a durable background-job queue and authenticated object storage through an additive migration; do not replace the database source of truth with local files.

Supplier workspace flags default to Food-only for existing records. Packaging changes are audited and never write food invoices, forecasts, stock or target tables. Both roles may register/review packaging invoices; only Super Users manage supplier associations/catalogue aliases or void confirmed invoices. Normal reports exclude unreviewed and voided invoices. Paid extraction providers have not been selected or configured.


### File-first upload update

Migration `20260923000100_file_first_invoices` makes only the packaging invoice supplier relation nullable. A database check forbids confirmed invoices without a supplier; existing records remain unchanged. Uploaded drafts and originals persist in PostgreSQL before extraction starts, including when the supplier is unknown. Super Users create/enable suppliers in the review transaction with audit records; Chef requests to create/enable are rejected server-side. Drafts can be resumed on another device, and corrected delivery dates determine the eventual spending period.

Browser `blob:` URLs are temporary previews of the selected, unsaved file only. They are revoked when replaced/unmounted and are never stored as the invoice reference. The permanent original is the authenticated PostgreSQL document record. The free PDF/OCR scanner is operational locally and exercised by integration/browser tests. No external scanning key or object-storage account is missing. Production still requires a persistent backed-up PostgreSQL database, supported Node/native dependencies and bundled OCR assets, HTTPS, sufficient CPU/RAM, and proxy request sizes/timeouts described above. No remote deployment has been performed or verified.
