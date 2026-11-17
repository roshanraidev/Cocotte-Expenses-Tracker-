# Zonal delivery preview and explicit approval

## Operational import policy — 11 November 2026

The owner explicitly confirmed that an exclusive Food Purchasing supplier
assignment certifies whole-delivery food classification unless Zonal exposes
contradictory line data. The classifier now uses that policy: foodWorkspace=true,
packagingWorkspace=false, active unique supplier match and no ancillary/non-food
line contradiction. Mixed and non-food suppliers remain review-only for the food
ledger. A source Unknown adjustment is included once in the verified invoice net,
provided Items + Unknown reconciles to Invoice Amount. Nonzero credits remain in
review until a separate credit-event reconciliation is verified.

Manual receipts do not use the electronic Accept flag. A manual receipt requires
non-electronic DocumentSource=1, non-accrual status, a source stock-movement date
matching the delivery date, and valid positive delivered quantities. The live
manual receipt check passed all five conditions with InvoiceAcceptedYN=false.
Zonal boolean flags may be strings; True/False/0/1 are parsed explicitly and unknown
values fail closed. Electronic invoices still require accepted=true.

Eligibility and the existing button are now conditional, not hard-coded false.
The preview is stored server-side with actor/restaurant ownership and a five-minute
expiry. Import requires an explicit Super User action, an audit reason for older
weeks, a fresh uncached Zonal read, unchanged source fingerprints and current
supplier/manual-purchase/finalized-week checks. The one-minute login cooldown
also applies to the fresh import recheck; after the explicit click, the service
waits outside financial locks for any remaining cooldown before proceeding. No automatic or scheduled import exists.

Migration 20261111000100_zonal_delivery_imports only creates two new tables. The
source ledger uniquely constrains (restaurantId, location, deliveryId),
(restaurantId, supplierId, documentKey) and purchaseId. Import serializes jobs
with a restaurant advisory lock, Restaurant/RestaurantSettings locks and a preview
row lock. Existing manual references are checked conservatively before creating
any purchase. Source changes require review; repeated approved requests replay
without new spending. The original source document is retained in the audit and
preview; the canonical invoice reference follows existing whitespace/case rules.

Canonical PurchaseInvoice records are confirmed net food spending. Existing
purchasing formulas and supplier reports consume those records unchanged. Each
posting, source identity and audit entry is committed in the same transaction;
unexpected storage failures roll back the request. Real imports were NOT clicked
during development. A disposable PostgreSQL regression covers first import,
concurrency/repetition, manual conflicts, source changes, credits, missing VAT,
permissions, isolation and report totals.

The old historical notes below are superseded by this section where they differ.

## Focused performance update — 10 November 2026

No UI redesign or purchase registration changes. The same five-delivery reader
was measured at 14,222ms before and 8,871ms after optimisation. The latter recorded
3,339ms authentication, 1,545ms navigation, 3ms table extraction and 3,097ms detail
reads. External Zonal/development-server latency varies: an initial UI run took
15,059ms. The final UI run retrieved six deliveries / three matched suppliers in
9,989ms; immediate repetition took 86ms. These are samples, not a latency guarantee.

Detail GETs run in pairs, with at most two in flight and a 500ms pause between
pairs. The period remains fixed until the pair finishes. The same authenticated
browser is used throughout. Tables are extracted once per period, documents once
per unique delivery ID. Read correctness and credit/status/classification gates
are unchanged. Selected dates are controlled so React form reset cannot silently
change the repeat request; the existing LiveRefresh dirty-form guard protects
an open sync dialog.

A server-only source-preview cache is capped at eight entries / 30 seconds. Keys
include restaurant, connection revision, range and supplier configuration hash.
Disconnect/branch/role guards run before cache access. Supplier configuration and
purchase references are re-read on each request; cache entries contain no
credentials or browser state. UI messages explicitly identify cached results and
retain the original source fetch time. This is a recent preview, not an unchanged
Zonal revision guarantee. Failed reads are not cached. Timing-only metadata for
authentication, navigation, extraction, details, matching and total duration is
recorded in the scoped preview audit; no invoice contents are logged.

The live five-record status check found zero accepted/electronic flags and no
verified classifications. Cocotte's Product table has no records/categories for
this restaurant; Supplier.foodWorkspace is a routing flag with a true default,
not an authoritative food/non-food category. The final six-record UI check still
had zero eligible imports. Manual submission semantics and a trustworthy Zonal
product-code/classification mapping remain required. No chef per-invoice approval
workaround or unsafe supplier-wide assumption was added.

## Automatic evidence checks — 10 November 2026

The reader now fetches observed DeliveryDetails.aspx HTML documents for registered
supplier-name matches using authenticated GET requests only. It parses embedded
fields in an inert DOMParser document without executing editor JavaScript. This
avoids the observed before-unload Save handler, which remains blocked. Each
request validates the origin/path/delivery ID, permits no redirects or retries,
limits document size, checks supplier/document identity and disposes the response.

The actual localhost modal fetched 112 deliveries across five periods and
verified net amounts on 99 matching detail documents, linked by supplier/document
identity. Six existing suppliers matched; 13 unregistered-supplier deliveries were
skipped. All 99 matched deliveries remain Needs Review; Ready to Import is zero.
Purchasing, supplier, sales and encrypted-credential hashes stayed unchanged.

Live inspection of five current-period records verified the exact label Invoice
Amount (Net), a separate VAT Amount field, SupplierID, InvoiceAcceptedYN,
ElectronicInvoiceYN, accrual flags, product codes and product line counts. All
five were manual/non-electronic with InvoiceAcceptedYN=false. This does not prove
whether a chef submitted the manual delivery: that workflow's semantics remain
unverified. Product rows did not expose a usable food/drink/non-food mapping.
Ancillary versus non-ancillary alone would not separate food from drinks.

Matched rows now display verified net values when label/identity/list/detail
checks pass. Detail checks run inside their original selected period, before the
session picker changes; otherwise historical details may be unavailable. Values
come from the embedded delivery document Zonal uses to populate its initially
empty editor controls, not fabricated defaults from uninitialised input elements.
Needs Review reasons are derived per record: missing detail or VAT,
source changes, invoice acceptance state, accrual, absent item classification,
unknown adjustments, displayed credit reconciliation, inactive/non-food supplier,
or a possible manual duplicate. Supplier Not Registered rows are skipped.
Existing manual references are NOT labelled Already Imported without durable
Zonal source linkage. No import ledger or registration mutation is implemented,
because no source-verified food classification is available. The requested Import
Matched Deliveries button is therefore disabled, not a working registration path.

No new suppliers were created. Only existing Cocotte suppliers can receive
imported deliveries. No historical or current purchases are imported during tests.
The existing buying budget, financial readers and supplier spending reports are
unchanged. Verified net values are previews, not purchasing totals.

Older descriptions below document the prior preview-only implementation and
are superseded by this evidence-check section where they differ.

Supplier Purchases → Sync Zonal Deliveries → Fetch Zonal Deliveries is a
Super User-only, read-only preview. No Supplier or PurchaseInvoice is created,
updated, approved or voided by this workflow. No migration is required.

## Live discovery: 10 November 2026

The existing encrypted account authenticated and opened the observed Stock
navigation, then the exact Deliveries sidebar link. The live list URL is
/stock/deliveries/deliverylist.aspx. It has #parentThisStockPeriods and the
Date / Supplier / Doc Number / Items / Unknown / Invoice Amount / Credit /
Total columns. Four current-period and 28 previous-period rows were observed during discovery.
The actual localhost modal then fetched 112 date-filtered deliveries across five
periods for 12 October–10 November 2026. Five registered suppliers matched
55 deliveries; two unmatched supplier names accounted for 57 skipped deliveries.
No registered document matches were found, and eligible registrations remained zero.
One actual DeliveryDetails.aspx view was opened for inspection. It exposes a VAT
field and internal acceptance fields, but their financial semantics were not
verified. Navigation away from that editable view attempted a Save request;
the restrictive investigation policy BLOCKED it. The production preview reader
never opens the editable detail page.

The old sales-only request policy blocked getChosenPeriodID. The isolated
preview policy adds only that observed getter and the observed setChosenPeriodID
view-selection call, constrained to a numeric chosenPeriodID and no other fields. Picker.js uses an
unquoted ASP.NET object-literal property name; the policy accepts that exact
shape as well as strict JSON, not arbitrary object syntax.
Both were verified through browser-originated requests and Picker.js. These are
session view selection, not delivery modifications. No internal API is invoked
directly. Save/Submit/Approve/Delete calls remain blocked.

## Reader behaviour

The reader verifies branch 003 Parsons Green, parses actual available period
labels, and rejects ranges not completely covered by the visible period selector.
It reads each overlapping period, validates headers and all required cells,
converts signed GBP values to integer pence, deduplicates delivery IDs across
periods and filters actual delivery dates. Changed duplicate identities fail
closed. Missing amounts never become zero. At most 31 days, six periods and
500 unique rows are accepted. No partial range is described as complete.

The server uses the existing encryption/decryption and login helper. A child
browser process receives credentials over IPC, has an allowlisted environment,
disables downloads/service workers and destroys the temporary context. Its
hard timeout is 180 seconds. No browser exceptions, cookies, credential values,
raw HTML, screenshots or invoice data are logged. Safe stage/network codes
are returned on failure. Login rejection/challenges are never automatically retried.

A restaurant advisory transaction lock prevents concurrent delivery previews;
the shared Restaurant row lock serializes connection changes and sales-batch
reservation. The existing connection attempt timestamp enforces a one-minute
cooldown. Audit entries contain counts/date range only. Existing financial data
is read for matching but never changed.

## Matching and registration safety

No explicit Zonal supplier mappings currently exist in the schema. Matching uses
only unique exact Unicode/case/whitespace-normalised names within the actor's
restaurant. Fuzzy aliases are never inferred. Unregistered suppliers are skipped;
ambiguous, inactive and non-food suppliers stay in review. Existing supplier and
normalised document references are checked across all restaurant purchases,
including voided historical records. A matching reference is displayed as Already
registered with a manual-duplicate/correction warning, never reimported.

All records remain ineligible for registration: invoice VAT basis, received status,
credit inclusion, food classification, identity stability and durable source
registration reconciliation still require verification. Displayed invoice/credit/
total figures are shown separately without subtracting credits or treating any
amount as approved food spend. No previews feed the purchasing calculations.

Verification: full suite, TypeScript, lint and Webpack production build are run.
Browser checks cover actual modal fetch, five stock periods, matching/skipping,
mobile/tablet/desktop dialog layout and unchanged purchasing/supplier/sales hashes.
Parser, request policy, ambiguous matching, manual duplicate, expired session,
network failure, concurrent preview guard and empty results also have focused
synthetic tests. These fixtures are not live evidence of financial eligibility.
