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

Next checkpoint: store physical bed measurements and versioned geometry
against existing bed IDs. Add a garden plan and an accessible list view.

