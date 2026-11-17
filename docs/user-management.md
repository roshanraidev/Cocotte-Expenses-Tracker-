# User Management and RBAC

Open **Administration → User Management** (`/admin/users`). Super Users have the complete permission set. Other accounts need User Management View and the corresponding action permissions. Creation, edits, role/default-policy changes, password resets and activation changes are audited. The activity list shows target accounts and safe before/after permission details; it never includes password hashes, session tokens or reset tokens.

## Roles and compatibility

Seven staff roles are available: Super User, Administrator, Manager, Head Chef, Sous Chef, Kitchen Staff and Viewer. `src/lib/permissions.ts` defines the supported permission catalogue and least-privilege defaults. Super Users can configure each non-Super User role's defaults and apply individual grant/deny overrides. Overrides take precedence; module View access is required for its actions. Super User access cannot be individually revoked.

The existing `User.role` values and passwords are retained. Nullable `accessRole` and `permissionOverrides` add staff roles without rewriting existing accounts. Existing Chef accounts retain their previous access until explicitly reassigned; the interface identifies them as existing-account access. Editing a legacy Chef through the Super User matrix preserves its current permissions using explicit overrides. Configurable role defaults apply to accounts explicitly assigned that staff role. Role policies are scoped by restaurant.

Only supported operations are listed: supplier deactivation replaces a nonexistent supplier-delete permission; inventory counts/catalogue operations replace nonexistent deletion. Daily Sales has separate record/correct permissions. Existing controls for Zonal credentials/sync, stock integration approval, legacy financial tools, week finalization and reopening remain Super User-only. Settings permissions cover planning and purchasing targets. No purchasing, sales or costing formula is changed.

## Enforcement and delegation

Pages and protected file routes call `requirePermission`; server actions and mutation services independently check capabilities. The shared permission provider only controls presentation and is not an authority. Session lookups read current account access from PostgreSQL. Account changes revoke all affected sessions and pending reset links; default-role changes revoke sessions/reset links for accounts assigned that role. Existing accounts cannot be permanently deleted through this interface.

User-management transactions lock the restaurant before re-reading the active acting account. This serializes account/role changes and concurrent Super User removal attempts. They protect the last active Super User, prohibit self role/permission changes and self deactivation, enforce optimistic account-edit versions, and scope target lookups to the authenticated restaurant. Non-Super Users cannot manage/reset an account with broader access, grant permissions beyond their own, create a Super User or edit global role defaults. Granting initial default-role access during account creation is subject to that same permission ceiling; individual customisation needs Manage Permissions.

## Secure password resets

An authorised operator can issue a single-use reset link for an active, manageable account. It expires after 15 minutes. Only its SHA-256 digest is stored; password hashing continues to use Argon2. The link is returned privately once and must be shared securely. No email service is configured or simulated. Its token is in the URL fragment so ordinary HTTP request URLs/referrers do not contain it; submission uses a same-origin Next.js Server Action. Reset attempts are throttled, consumption is transactional, replay/expiry/inactive accounts are rejected, and completion revokes sessions and other tokens. Tokens/passwords are excluded from audit data. The fragment is removed after successful reset. Production should use HTTPS, as required by the existing secure session cookies.

Last-login timestamps and sign-in audit events are recorded on subsequent successful sign-ins. Historical login times are displayed as **Not recorded** rather than backfilled with fictional values.

## Migration and verification

`20261112000200_staff_permissions` adds the staff-role enum, three nullable User columns, AccessRolePolicy and PasswordReset tables with keys/indexes/foreign keys. It does not update existing account rows, reset databases or change stored financial data. Deploy using `npm run db:migrate` and regenerate the client with `npm run db:generate`.

Checks:
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build -- --webpack`
- `node --conditions=react-server --import tsx scripts/user-rbac-check.ts`: native disposable PostgreSQL and production-browser checks covering all roles, actual UI account/role/checkbox changes, route denials, delegation ceilings, account status, defaults, audit/last-login data, session revocation, reset token hashing/expiry/replay, concurrent Super User protection and 390/768/1440px. It never uses real accounts or writes real financial records. Build first; local PostgreSQL binaries and Playwright Chromium are required.
