# Agricultural foundations delivery status

Branch `feature/m2-agricultural-foundations`, based on ParcOS 1.4.2.

## A. Catalogue checkpoint

Members can search and browse reviewed crops by FR/NL/EN name, synonym or
cultivar. Coordinators can edit records, review or archive them, and preview
and confirm CSV/JSON uploads. Botanical taxa, crops and cultivars have distinct
IDs. Profile changes create immutable revisions and missing agronomic claims
remain unknown. Workspace selection is manual and uses the prototype's role
matrix. Existing navigation remains available.

Migration 5 is additive. It was exercised against a version-4 database and
covered by a backup/restore round trip. The complete check suite passed 14
tests. No data or review decisions were preloaded.

The [recipe contract](agriculture-recipe-contract.md) defines authenticated
reads, ingredient mapping, units and missing-data semantics. Coordinate future
migration numbers when integrating the recipe branch.

## B. Physical garden checkpoint

Migration 6 adds physical measurements, geometry revisions and garden
facilities keyed to existing beds and areas. Areas can contain nursery,
bench, tray, greenhouse and other facilities, with optional capacity. The
plan provides a keyboard-accessible garden map and bed list, including
unmapped beds. Measurements can remain incomplete and record approximation
and provenance.

Coordinators can preview and confirm a JSON plan. The shape is
`{"validFrom":"2026-01-01","source":{"title":"Survey"},"sourceRevision":"1","features":[{"bedCode":"BED-01","points":[[0,0],[1,0],[1,1],[0,1]]}]}`.
Use normalized coordinates in the same area frame for all polygons, with
origin at the top left. Convert SVG-derived points to this frame before
import. New revisions take effect on their validity start date. Existing
measurements and bed records retain their original identity.

All 15 tests passed, including schema upgrade, version boundaries, preview,
legacy field preservation and restricted area reads. Actual measurements and
polygons remain to be entered by the garden.

## C. Cultivation lifecycle checkpoint

Migration 7 adds stable batches tied to a cultivation profile revision,
coordinator-owned spatial reservations, append-only actual operations, and
measured harvests linked to the existing harvest records. A footprint is a
lengthwise bed interval with an optional explicit area and an exclusive end
date. Adjacent and successive reservations coexist. Reviewed combinations
reuse one footprint across distinct component crops. An explicit release can
shorten a reserved interval and retains the previously planned end date.

Members with access can record actual work and measured harvests. A batch with
any restricted location is visible to coordinators and admins. The original
bed crop and variety text remains available for review. The garden's legacy
harvest path continues to accept free text and photos.

All 16 tests passed. Coverage includes sowing and partial transfers, retry
protection for cultivation operations, conservation of viable plant counts,
private area checks, overlap and release rules, profile linkage, measured
harvests and backup/restore. Real growing dates and quantities are entered by
garden contributors.

## D. Operations and supplier checkpoint

Migration 8 adds revisioned operation templates, references from the existing
task system, supplier staging and publication history, measured harvest retry
keys, and crop description support in the existing translation exchange.
Templates model dependencies, relative timing, inputs, setup and variable
labour, triggers, instructions, completion evidence and safety. Coordinators
explicitly schedule a task for a batch. Volunteers use the existing claim and
completion workflow. Task completion and observed cultivation remain distinct.

Batch labels use browser printing, with two- or three-column sheets, copy count,
and a tray selector. The QR encodes the authenticated `/#/batches/<id>` URL.
The encoder is a pinned dependency-free library so ParcOS can produce QR codes
locally using a tested implementation. The printed batch code also supports
manual lookup. Configure `PARCOS_BASE_URL` with the permanent installation URL
for durable links behind a proxy. Verify label stock and scanning at the garden.

The occupancy view reports a selected date, confirmed versus reserved space,
measured-area coverage, and repeated harvests grouped by crop and unit. Shared
intervals contribute their area once. Percentages use beds with both geometry
and an explicit usable area, and are unavailable for incomplete footprint
areas or conflicting measurements. No yield or missing area is inferred.

The supplier workflow accepts JSON `{"products":[...]}` or CSV with these
columns in order:

```text
supplier,sku,name,sourceUrl,retrievedOn,availability,seedCount,packetWeightG,cropHint,varietyHint
```

Provide dates as `YYYY-MM-DD`. Availability is `available`, `unavailable`,
`discontinued` or `unknown`. Quantities and matching hints are optional. Preview
validates a batch of up to 500 rows. Stage, check the proposed crop and cultivar,
then approve or reject each offer. A changed reimport is staged separately and
preserves previously reviewed data until publication. Published revisions and
historical source metadata are retained.

Supplier data remains pending. Semailles publishes a downloadable catalogue
and offers a route to request a professional catalogue. A reusable structured
feed and redistribution permission were not verified. Vreeken publishes product
pages and expressly restricts large-scale automated collection. Obtain a
supplier-authorized export or approval before bulk ingestion. The repository
ships no supplier descriptions, photos, offers or prices.
[Semailles catalogue](https://www.semaille.com/nl/info/Semailles-catalogus-2022)
[Semailles professional catalogue request](https://www.semaille.com/fr/info/demande-de-catalogue-pro)
[Vreeken’s terms](https://www.vreeken.nl/policies/terms-of-service)

## Verification and handoff

- `npm run check` passed 19 tests on Node 24.22.3. Coverage includes schema
  upgrade, role/CSRF checks, FR/NL/EN lookup, stale translation rejection,
  geometry history, nursery count conservation, overlap rules, measured harvest
  replay, task privacy, supplier review, and complete backup and restoration.
- Local Edge browser verification used disposable fixtures at 320 and 1280 CSS
  pixels. It covered language switching, keyboard map selection, measurement
  edits, harvest entry around local midnight, a nine-label print handoff, task
  creation, supplier review, and the occupancy report.
- Application files are under `public/app/agriculture` and
  `src/domain/agriculture`, with narrow integration in the existing server,
  client shell, service worker and task/harvest paths.
- Migrations 5–8 belong to agriculture. The recipe workstream can consume the
  [crosswalk contract](agriculture-recipe-contract.md) and assign its first
  migration after verifying the integration base. Existing recipe changes
  are on the separate `feature/recipe-catalogue` worktree.
- Next steps are to review the PR, agree a small lawful crop and supplier
  dataset, survey representative beds and nursery capacity, and confirm the
  label layout on the intended printer. Use that reviewed subset for the first
  seasonal recipe-to-production journey. Production planning and deployment
  are separate owner decisions.
