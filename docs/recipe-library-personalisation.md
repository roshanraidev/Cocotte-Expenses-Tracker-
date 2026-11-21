# Recipe Library personalisation

This feature extends the existing Recipe Library. It does not modify recipe content, photographs, costing, permissions or financial data.

## Using the library

- Active recipe cards always have a subtle drag handle. Drag with mouse/touch, or focus a handle and press Space, arrow keys, then Space. A completed drop saves automatically to PostgreSQL; there is no ordering mode, Save/Cancel toolbar or personal/default ordering selector.
- Inline drops save only the signed-in user's personal arrangement, including when the user is a Super User. Existing restaurant defaults are retained as the fallback for users without a personal arrangement; dragging never changes colleagues' arrangements.
- Search/category filters remain active. Reordering replaces only the visible recipes' slots in the full ordered collection. Non-matching recipes retain their positions and are never omitted from the saved order.
- Normal recipe links and edit/archive actions remain available. Only the handle initiates dragging, so touch scrolling and card navigation keep working.
- Save failures retain the arrangement and show Retry/Reload feedback. Overlapping drops are blocked while saving. Navigation/filter changes wait for pending order saves; unsaved failures are not silently discarded.
- Category, search, active/archive tab and archive sorting remain stored per user. Search waits 500 ms of inactivity. Nothing is stored in browser local storage.
- Archived recipes keep their existing table, sorting and restore workflow, without drag handles. No schema change was required for inline autosaving.

## Storage and concurrency

Reviewed migration: `prisma/migrations/20261121000100_recipe_library_preferences/migration.sql`.

It only creates `RestaurantRecipeLibrary`, `UserRecipeLibrary`, their indexes/FKs, and a redundant-but-required composite unique index on existing User ID/restaurant ID. Existing primary-key uniqueness already guarantees this index can be created without merging users. No UPDATE, DELETE, DROP, seed or data rewrite occurs.

One default row per restaurant; one personal/filter row per user. Composite user/restaurant ownership is enforced by a foreign key. No workspace dimension is added because the existing Recipe Library is restaurant-wide and shared across purchasing workspaces.

Shared ordering changes use the existing restaurant recipe-graph lock, serializing with recipe creation/edit/archive. User preference writes use a transaction-scoped advisory lock. Separate order/filter revision numbers reject stale writes, including concurrent first saves. Reset increments the order revision rather than deleting concurrency history. Order changes and resets are audited.

Saving an order requires exactly the complete authorized active collection, with unique, restaurant-owned IDs. A concurrent collection change requires reloading rather than silently accepting a partial list. Saved references to archived/hidden recipes are retained as a tail for restoration; deleted references are ignored when displaying. New recipes follow existing stable ordering after ranked recipes. Restaurant defaults never replace personal overrides.

## Migration and verification

This release requires `20261121000100_recipe_library_preferences`. Back up the target database and review pending migration SQL before applying it with the normal Prisma deployment workflow. Never reset or seed. The migration only adds display-preference storage and supporting indexes; it does not rewrite recipes or financial data. Until installed, existing GET browsing/filtering remains available with a setup notice.

To test the complete feature without changing any existing database:

```sh
npm ci
npm run typecheck
npm test
npm run build:production
node --conditions=react-server --import tsx scripts/recipe-personalisation-check.ts
```

The browser check requires local PostgreSQL CLI tools (`initdb`, `pg_ctl`) and installed Playwright Chromium. It starts an isolated temporary database on 51949 and a local production server on 3185, applies migrations only to that temporary database, creates synthetic users/recipes, and removes it when finished. No Zonal login occurs. It verifies concurrency, authorization, ownership, ordering reset, real keyboard/touch interaction, saved filters after session replacement, detail navigation, archive filtering and unchanged recipe content. Review PNGs are saved under `/private/tmp/cocotte-recipes-personalisation-review`.

For manual local testing: run `npm run dev`, sign in and open `/recipes`. Drag a handle to another card, wait for the automatic save and refresh. Select a category and drag within it, then clear the category to confirm other recipes retained their positions. Sign in with another staff account to verify independent arrangements. Search/category persistence and archive/restore remain unchanged.

Dependency check: npm audit reports three existing high-severity findings in the Prisma CLI/config dependency chain (`prisma`, `@prisma/config`, `effect`). The added dnd-kit dependencies are not implicated. No forced or unrelated dependency upgrades were made.

## Files changed for this feature

- `src/app/(protected)/recipes/page.tsx`
- `src/app/(protected)/recipes/library-filters.tsx` (new)
- `src/app/(protected)/recipes/library-order.tsx` (new)
- `src/app/(protected)/recipes/preference-actions.ts` (new)
- `src/app/(protected)/recipes/personalisation.css` (new)
- `src/lib/recipe-library-preferences.ts` (new)
- `src/lib/recipe-library-service.ts` (new)
- `prisma/schema.prisma` (additive recipe preference storage)
- `prisma/migrations/20261121000100_recipe_library_preferences/migration.sql` (new)
- `package.json`, `package-lock.json` (dnd-kit dependencies)
- `tests/recipe-library.test.ts` (new)
- `tests/recipes.test.ts` (existing page-test router/preference fixtures updated)
- `scripts/recipe-personalisation-check.ts` (new, disposable database/browser regression)
- `docs/recipe-library-personalisation.md` (new)
