# Recipe archive

Super Users can use the existing recipe card **Delete** action to archive a recipe after confirmation. Active Recipes and Archived Recipes are separate collections in `/recipes`; the archive offers category/search/sort controls and Restore Recipe. Success messages follow each action.

`Recipe.archivedAt` is the archive state and timestamp: NULL means active. The additive migration `20261112000100_recipe_archive` adds only this nullable column and a restaurant-scoped index. It does not rewrite existing recipe records. Apply with `npm run db:migrate` and regenerate with `npm run db:generate` when deploying.

Archive and restore update only that timestamp on the existing recipe, inside the same restaurant graph lock used for recipe editing and component changes. They record RECIPE_ARCHIVED / RECIPE_RESTORED audit events. Repeated requests do not change the timestamp or add duplicate audit events. Ingredients, instructions, photos, visibility, ordering, special records and component relationships remain intact. Category deletion is blocked while any active or archived recipe still references the category.

Archived recipes cannot be edited until restored, added as new component links, or newly scheduled/published as weekly specials. Existing component links remain readable and can be retained when editing their parent. Existing special records remain stored, can be unpublished, and are excluded from active specials while the recipe is archived. Restoration retains the original visibility and special publication/date settings; normal existing visibility and date rules apply again. Historical detail and image access keep the existing restaurant/visibility permissions.

Checks:
- `npx vitest run tests/recipes.test.ts` runs actual action/read SQL against disposable in-memory PostgreSQL.
- `npx tsx scripts/recipe-archive-check.ts` creates an isolated local PostgreSQL cluster, applies migrations only there, runs the production application against it, and checks archive/restore, cancellation, filters, permissions, content/image preservation, and persistence across a new browser session and application restart. Build first. Requires local PostgreSQL binaries and Playwright Chromium. No real recipe records are modified.
