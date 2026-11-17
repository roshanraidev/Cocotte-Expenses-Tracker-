# Weekly Specials and Component Recipes

The existing SUPER_USER role manages both features. CHEF/general users can view active specials and permitted components; normal Recipes remain available regardless of the Specials setting.

## Database update

The additive migration is `20261012120000_recipe_specials_components`. It adds three tables (feature settings, specials, component links), a special-status enum and a composite unique index on existing recipe identity. It does not rewrite existing recipes, photos, ingredients or instructions.

Apply this before serving the updated recipe pages. Confirm `.env` points to the intended database, take your normal database backup, and review pending migrations with:

```sh
npx prisma migrate status
npm run db:migrate
npm run db:generate
```

`db:migrate` runs `prisma migrate deploy`, which applies all pending committed migrations. Review the pending list first if that database is behind. Do not use reset or re-seed commands. Restart the app after applying the migration. The migration has been tested against a disposable database containing an existing recipe and photo; it is not automatically applied to your existing database during development.

## Specials

In Recipes, expand **Add Weekly Special / Manage Specials**. Enable Weekly Specials and save the setting. Choose an existing recipe, optionally select dates, then **Save Draft** or **Publish**. Repeat for any number of specials. Expand a saved entry to edit, publish, unpublish or remove it. Removing a special keeps its original recipe.

Dates are inclusive London calendar dates: a special is active from the beginning of its start date through the end of its end date. Either date can be blank. Without either date it remains active until unpublished. Drafts, scheduled/expired entries, disabled specials and hidden recipes/categories are not shown in the staff Specials section. Staff see no Specials section if nothing is active. Disabling the feature preserves its entries.

Make the recipe and its category visible before publishing. A recipe hidden later immediately disappears from staff specials and recipe detail/image access.

## Reusable components

Edit or create a recipe, search **Add Component Recipe**, choose a recipe and click **Add Component**. Add multiple components; use the arrows to order them or **Remove Component** to unlink. Save the main recipe to persist the links. Ingredients and methods remain in their original recipes, so later component edits are reflected wherever that recipe is used.

For example, link Mushroom Sauce and Potato Purée to Chicken Supreme, then link Chicken Stock inside Mushroom Sauce. Open **Components & Preparations** on Chicken Supreme and expand each component to see its ingredients, method and separately labelled allergens/may-contain information. Nested components can expand in place or open their original recipe page.

Self links, duplicates, cross-restaurant links and indirect circular links are rejected on the server. Component changes and recipe content save in one transaction; rejected links leave the previous recipe unchanged. Graph edits lock the restaurant row so simultaneous changes cannot introduce a circular link.

Staff cannot see hidden recipes or categories, including hidden branches of the component tree. Super Users can inspect these while editing. Hidden components are omitted entirely from staff results, including their names and allergens. An empty allergen field means **None recorded**, not an assurance that a preparation is allergen-free.

Deleting a recipe removes specials that reference it and incoming/outgoing component links, while keeping the other recipes. Deleting a recipe category retains the existing category deletion behavior (deletes its recipes), with their special/component references removed too. The confirmation explains these effects.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The focused recipe tests execute actual server-action/read SQL and the additive migration in disposable in-memory PostgreSQL. They cover simultaneous published specials, drafts, enable/disable, dates and London midnight/DST, nested links, ordering/removal, cycles, ownership, permissions, hidden branches, deletion and preservation of legacy records. They do not alter your configured database.

After a successful production build, an optional real-browser check is available:

```sh
node --import tsx scripts/recipe-features-browser.ts
```

This creates a stateless disposable PostgreSQL test server, initializes only that test database from the migration SQL, and starts the built app on port 3167 with temporary accounts and recipes. It never uses the configured `DATABASE_URL`. It checks desktop creation, nested component allergens, circular-link errors preserving text/uploads, publishing multiple specials, mobile staff access, hidden components and feature disable. The test server and browser close when it finishes.
