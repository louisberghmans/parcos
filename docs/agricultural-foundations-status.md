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

Next checkpoint: templates and tasks, label printing, occupancy and production
views, and supplier imports under explicit reviewer control.

