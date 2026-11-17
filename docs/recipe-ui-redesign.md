# Recipes: contemporary restaurant menu presentation

This is a visual-only layer over the existing recipe implementation.

## Latest premium library and sheet

The current header is Recipe Library, with the subtitle Recipes, components &
preparations, Search recipes, All categories, existing specials access and
permission-gated New Recipe / Recipe types controls. Four equal grid columns are
retained at 375, 390, 768, 1024 and 1440px. Small cards show a square photo and
two-line name; larger cards add the real category and allergen/suitability text.
Missing prep/yield/cost metadata is omitted from cards because these fields are
not present in the current recipe model. Existing images and authenticated image
routes remain unchanged. Hover lifts 4px over 200ms, with 1.03 image zoom, gold
border, arrow movement, keyboard focus, touch feedback and reduced-motion support.

The premium detail sheet retains the approved header-side desktop allergens,
45/55 ingredient/method panels, green table header, alternating ivory rows and
gold circular original step numbers. Smaller screens place allergens below the
identity, with ingredients before method on phones. Panels end at their natural
height. No unsupported notes or approval badges are shown.

All older presentation descriptions below are historical and superseded by this
section. Browser scripts verify search, filtering, role controls, photos, editing,
exact stored ingredients/method content and unchanged financial/recipe hashes.

## Files

- Recipes layout.tsx wraps only recipe routes with recipe-library and imports recipes.css.
- recipes.css contains recipe-scoped editorial styling; no global design tokens,
  shared dashboard CSS, navigation or financial components are changed.
- page.tsx presents existing search/type filters, counts and recipe entries.
  Specials remain reachable through a compact Weekly specials link and their
  existing management panel; category management remains available.
- recipe-card.tsx uses small existing image thumbnails, category/name and real
  allergen text, with accessible native details for existing Edit/Delete actions.
- [id]/page.tsx presents compact identity/photo, exact ingredient quantities/units,
  existing method text, allergen/suitability fields and linked component details.
- edit/page.tsx changes only its editorial header/presentation. Existing form
  fields, actions, validation, upload widget and component selector are unchanged.
- scripts/recipe-ui-check.ts and recipe-ui-local-check.ts verify isolated workflows
  and read-only localhost data preservation.

## Data limitations

The existing Recipe model has no structured prep-time, yield, recipe cost or
recipe-approval fields. These are not derived from method text, visibility,
ingredient quantities or specials status. Prep/yield/cost placeholders explicitly
mean not recorded/not available. No invented timings, servings, costs or approval
badges are shown. Existing costing logic is not modified or introduced.

Category, name, ingredients, allergen/may-contain/suitability text and stored
photographs use the original queries and permissions. Native authenticated
image URLs, cache behavior and version query strings are retained; no optimizer
or stock photography replaces actual images.

Methods preserve legacy Before Service / On Order handling through the existing
preparationMethod helper. Browser CRLF-to-LF normalization is accounted for only
in the read-only display test; stored text is unchanged.

## Responsiveness and workflows

Earlier presentation (superseded below): phone entries used 56×60 thumbnails and a compact single column; typical fixture
phones show four complete entries at 390×844 and five at 430×932, including
existing app chrome. Longer names, active content and smaller screens can show
fewer. Tablet/desktop use a two-column menu with thin row dividers. Inputs retain
mobile-friendly text sizing; action menus retain 44px touch targets.

Detail ingredients, declarations, methods and nested preparations wrap without
horizontal page overflow. Admin create/edit, photo keep/replace/remove, component
selection/cycle errors, specials publishing, visibility and delete confirmation
are preserved. No database schema, API, permissions or recipe action is changed.

## Verification

- Full unit suite includes recipe persistence/photo/permission/component tests.
- Typecheck and lint run; existing native-img warnings are reported.
- Standard Turbopack build is blocked by this environment's port-binding
  permission failure. Webpack production build is verified separately.
- Isolated PostgreSQL/browser check uses synthetic records only, never the user's
  database. It verifies library/search/category/empty states, ingredient/method/
  allergen preservation, create/edit, image retention/replacement/removal, circular
  component validation preserving unsaved text/photo, specials publishing, hidden
  recipes/photo permissions, delete cancellation, 320–1440px layouts and unchanged
  dashboard computed styles. No costing formula is changed.
- Read-only localhost check creates/removes only its own temporary session. Hashes
  verify existing recipe/image/relationship/allergen, account, encrypted connection,
  forecast and purchasing/sales data remain unchanged. Existing images are compared
  byte-for-byte. It never saves an existing recipe or uploads/replaces a real photo.

No production migrations, seeds, data deletion, commits or pushes are performed.

## Current card-library update

The current library supersedes the earlier menu-row presentation with full-link
cards. library-cards.css is loaded after the existing recipe styles and changes
only the card/grid layer. Detail pages and recipe actions remain unchanged.

Each card retains its authenticated existing photo, rounded landscape crop,
recipe name, category, honest metadata placeholders and recorded allergen/dietary
text. The arrow indicates navigation. Admin Edit/Delete disclosure remains a
separate sibling control, avoiding nested links/buttons. There is no inferred
recipe-approval badge: the current Recipe model has no approval-status field.
Actual hidden visibility can be shown to administrators.

Earlier card presentation (superseded below): content-width container queries selected two columns on tested phones, three on
tablets, and four with at least 950px of available content. Extremely narrow
content below 280px uses one column. The desktop fixture displays eight complete
cards in the first viewport. Tested phone viewports display four full cards with
the next row appearing as space allows; readability takes priority over forcing
an odd count in a two-column grid. All existing results remain scrollable.

Fine-pointer hover uses 220ms cubic-bezier(.22,.61,.36,1) transitions: -5px lift,
soft deeper shadow, muted-gold border, image scale 1.03, arrow +4px and forest-green
title. Coarse/touch pointers use a subtle 1px pressed state rather than hover.
Focus-visible outlines are 3px. Reduced motion removes all translation/zoom and
transitions. No JavaScript animation library is added.

The isolated browser test verifies grid columns, eight complete desktop cards,
hover matrices, keyboard focus/Enter, reduced-motion transforms, mobile pressed
state/tap navigation and the existing recipe workflows. Live read-only checks
confirm all original recipe/image/relationship/allergen and financial hashes
remain unchanged. No schema, API, costing, permission or integration logic changed.

## Current approved requirement: four columns at every width

The latest implementation keeps four equal columns at all viewport widths,
including 375, 390, 768 and 1440px. Phone cards use square photographs, two-line
names and minimal category text. Metadata is hidden on small cards and remains
available on the detail page. Existing photographs are retained; missing images
use a restrained placeholder. Desktop hover transitions are 200ms, with keyboard
focus, touch pressed feedback and reduced-motion support.

The recipe sheet now uses a compact photo/header, concise horizontal metadata,
ingredient rows, dietary reference panel and formatted method lines. Existing
step numbers and method text are preserved exactly; no steps are invented or
renumbered. Mobile panels fill the available width. Styling is confined to recipe
routes through library-cards.css and recipe-sheet.css. The new
method-presentation.tsx changes presentation only.

Browser checks inspect all four required sizes, navigation, search/filtering,
photo workflows, editing, roles and unchanged stored data. Synthetic photographs
in isolated test screenshots are test fixtures, not replacements for real photos.
