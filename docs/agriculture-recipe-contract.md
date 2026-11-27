# Agricultural catalogue contract for recipes

Use the private, authenticated `GET /api/agriculture/catalogue` endpoint. Its
`crop` array contains the current reviewed crops and `variety` contains their
reviewed cultivars. A valid member session is sufficient. Search with `?q=`
matches scientific names, common names, localized synonyms and cultivar aliases
across French, Belgian Dutch and English. Optional `?month=5` matches crops with
reviewed typical availability that includes May. Archived or draft entries are absent
from the member response. Persist the stable crop ID when a link is confirmed,
and retain unresolved and archived links with a review flag.

A recipe ingredient mapping can be represented as:

```json
{
  "ingredientId": "ingredient-112",
  "cropId": "curly-kale",
  "ediblePart": "leaf",
  "quantity": 250,
  "unit": "g"
}
```

The illustrative crop record below uses the shape of the API. The identifiers
are examples and the response omits no missing-data state for the shown values.

```json
{
  "id": "curly-kale",
  "taxonId": "brassica-oleracea",
  "names": {"fr": "Chou frisé", "nl": "Boerenkool", "en": "Curly kale"},
  "synonyms": {"fr": ["Kale"], "nl": [], "en": ["Scots kale"]},
  "category": "leafy-vegetable",
  "edibleParts": ["leaf"],
  "availability": null,
  "review": "reviewed",
  "revision": 2
}
```

- Store the crop ID as an opaque identifier. The API accepts 1–80 lowercase
  letters, digits, hyphens or underscores, starting with a letter or digit.
  Botanical taxonomy is a separate identity, so kale, broccoli and cauliflower
  can share a taxon while retaining separate ingredient mappings.
- If specified, the edible-part code must exist in the linked crop's
  `edibleParts`. Absent mapping uses `cropId: null`. Absent known edible part
  uses `ediblePart: null`. Resolve uncertain synonyms with human review.
- `quantityUnits` advertises `g`, `kg`, `piece`, `bunch`, `ml` and `l`.
  Quantities must be positive finite numbers. Do not convert between mass,
  volume and count without a reviewed conversion for the ingredient.
- A crop link can be satisfied by multiple varieties belonging to that crop.
  Recipes have no dependency on seed suppliers or cultivation batches.
- The recipe workstream’s `cropKeys` array can contain the IDs returned as
  `crop.id`. Keep alternative crop choices in that crosswalk and select an
  individual `cropId` when resolving a specific mapping. No provisional
  crosswalk key implies a corresponding installed crop.
- `availability: null` means unknown. When supplied it contains `months`
  (unique integers 1–12), `context` (region/climate) and `source`. It describes
  typical local availability and is separate from measured and forecast
  harvests. Null names and empty synonym/part arrays denote missing coverage.
- Catalogue CSV is UTF-8 with header `type,record` and a quoted JSON object in
  the record column. JSON uses `{"records":[{"type":"crop","record":{...}}]}`.
  Imports are limited to 500 records and support a transactional preview.
  Import the taxon and crop together or use an existing taxon ID. Existing IDs
  must be identical on import. Use the revision-aware editor for changes.

Migrations 5–8 are reserved for agriculture. Agricultural HTTP routes live
under `/api/agriculture/`. Member crop and batch details use
`/#/crops/<id>` and `/#/batches/<id>`. Exported crop descriptions use
`agricultural_crop` in the existing translation exchange. Workspace links
are in `public/app.js`, with agricultural route detection in
`public/app/agriculture/workspaces.js`. Recheck the migration ledger before
assigning the first recipe migration or merging shared shell changes.
