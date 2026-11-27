# ParcOS Recipe Integration Contract (M1 / M2 / M3)

- **Status:** Aligned with merged M2 contract [docs/agriculture-recipe-contract.md](../agriculture-recipe-contract.md) on `main` (`ede023a`, PR #14).
- **Scope:** Independent cookbook & contribution slice (`feature/recipe-catalogue`, rebased on `ede023a`). No shared migrations, server routes, or navigation changes have been applied yet.

## 1. Stable identities & immutable revisions

- Every recipe carries a stable, SQLite-independent namespaced `recipeKey` (e.g. `cuisine-libre:veloute-courgettes`, `community:poelee-blettes-ail`, `synthetic:...`) and an immutable `revision` string (`1.0`, `2.0`, etc.).
- Internal SQLite integer primary keys may be used for joins once integrated, but all cross-module contracts (M3 weekly meal selections, demand snapshots, translation exports, and portable catalogue imports) MUST reference `(recipeKey, revision)`.
- Updating a recipe creates a new immutable revision row. Existing M3 weekly meal choices and approved demand snapshots continue pointing to the exact revision the member selected and are never mutated retroactively.
- Moderation takedown marks a recipe `archived` to prevent new meal selections while preserving prior historical demand snapshots.

## 2. Culinary ingredient ↔ M2 crop crosswalk (`docs/agriculture-recipe-contract.md`)

- Consumes the authenticated `GET /api/agriculture/catalogue` endpoint (`crop` and `variety` arrays, `?q=` multilingual search, `?month=` typical availability filter; archived/draft entries excluded from member reads).
- Recipe ingredients use canonical, non-localized culinary `ingredientKey` values (e.g. `tomato`, `courgette`, `green_bean`, `dry_bean`, `chard`, `celeriac`, `jerusalem_artichoke`) with explicit `ediblePart` (`fruit`, `fresh_pod`, `dried_seed`, `leaf_and_stalk`, `root`, `tuber`).
- Crop IDs (`cropId` and elements of `cropKeys`) are opaque 1–80 character lowercase identifiers (`/^[a-z0-9][a-z0-9_-]{0,79}$/`) matching `crop.id` in `GET /api/agriculture/catalogue`.
- Recipe ingredients NEVER couple to supplier SKUs or specific seed varieties; multiple M2 varieties of a crop can satisfy one culinary ingredient.
- Adapter in `src/domain/recipes/agriculture-adapter.mjs` enforces every rule in [docs/agriculture-recipe-contract.md](../agriculture-recipe-contract.md):
  - `resolveIngredientAgainstCatalogue(ingredient, catalogue)`: persists confirmed `cropId` (or `cropId: null` when absent), checks `ediblePart` against `crop.edibleParts` when known (`ediblePart: null` when unknown), validates advertised `quantityUnits` (`g`, `kg`, `piece`, `bunch`, `ml`, `l`), and retains unresolved or archived crop links with an explicit `reviewFlag`.
  - `toAgricultureIngredientMapping(ingredientId, resolved)`: projects to `{ ingredientId, cropId, ediblePart, quantity, unit }`.
  - `evaluateRecipeTypicalAvailability(recipe, catalogue)`: intersects reviewed `crop.availability.months` (1–12) across required garden ingredients, returning `status: "unknown"` whenever any required crop has `availability: null` or is unresolved, while keeping typical local availability strictly separate from measured and forecast harvests.
- Crosswalk fixture (`catalogues/recipes/crosswalk/crop-crosswalk.v1.json`) holds provisional candidate `cropKeys`; per M2 contract, **no provisional crosswalk key implies a corresponding installed crop**.

## 3. Deterministic scaling & demand boundary (M3 consumer API)

Pure domain functions in `src/domain/recipes/scaling.mjs`:

- `scaleRecipeQuantities(recipe, targetServings)`
  - Scales linearly by `targetServings / baseServings` without mutating the recipe.
  - Performs exact conversions ONLY within dimensions (`g`↔`kg`, `ml`↔`cl`↔`dl`↔`l`).
  - Excludes all `role === "pantry"` rows from `gardenDemand` (pantry never drives cultivation demand).
  - Emits `demandGrams` ONLY when the unit is exact mass or has a `reviewed: true` conversion factor.
- `evaluatePlanningReadiness(recipe)`
  - Returns `{ planningReady: boolean, blockers: [...], warnings: [...] }`.
  - Blocks planning when `rights.status` is `link_only`/`excluded`/`review_required`, `baseServings` is missing, or any required garden ingredient lacks a finite quantity, a reviewed mass conversion, or a `reviewed` M2 crop mapping.
  - Non-planning-ready recipes remain browsable in the cookbook with a transparent explanation.

## 4. M2 / M3 availability & food calendar hooks (UI integration)

`public/app/recipes/recipe-detail.js` accepts two optional integration props so the cookbook stays honest when M2/M3 are not yet wired:

1. `availability`: optional `{ summary, earliestFeasibleWeek, status }` supplied by the future authorized M2/M3 feasibility service. When `null`, the UI explicitly displays *"Garden availability: not yet calculated"* and distinguishes editorial season tags from measured harvest dates.
2. `foodCalendarConnected`: boolean (default `false`). When `false`, the UI renders an explicit disabled/pending placeholder (*"Food calendar (M3) — integration pending"*) instead of a misleading button. When `true`, clicking `[data-recipe-action="add-to-food-calendar"]` emits `{ recipeKey, revision, targetServings }` to M3's meal-selection handler.

## 5. Workspace & navigation placement (M1 alignment)

- **Community workspace:** Recipe Browse (`renderRecipeBrowse`), Canonical Recipe Detail (`renderRecipeDetail`), and Member Contribution (`renderRecipeContribute`).
- **Coordination workspace:** Coordinator Review Queue (`renderRecipeReviewQueue`) and editorial planning-readiness audit.
- **Administration workspace:** Trusted catalogue dry-run/import/export and rights manifest audit.
- Do not add a parallel top-level navigation shell; mount these components inside the workspace shell in `public/app.js` alongside agricultural route detection in `public/app/agriculture/workspaces.js` (matching `/#/crops/<id>` and `/#/batches/<id>` with canonical routes such as `/#/recipes`, `/#/recipes/<recipeKey>`, `/#/recipes/contribute`, `/#/coordination/recipes/review`).

## 6. Proposed additive SQLite schema (Migration 9+ in Slice C)

Migrations **5–8** are now owned by agriculture on `main` (`ede023a`). Recheck the migration ledger immediately before Slice C merge and allocate the next unused migration (expected **Migration 9**) with normalized tables:

- `recipes` (`id`, `recipe_key UNIQUE`, `origin`, `upstream_id`, `source_url`, `archive_url`, `source_locale`, `collection`, `workflow_status`, `current_revision_id`, `owner_member_id`, `created_at`, `updated_at`)
- `recipe_revisions` (`id`, `recipe_id`, `revision`, `parent_revision_id`, `base_servings`, `prep_minutes`, `cook_minutes`, `rest_minutes`, `seasons_json`, `category`, `tags_json`, `dietary_json`, `rights_status`, `license_id`, `license_url`, `attribution`, `source_evidence`, `modifications`, `public_export_opt_in_json`, `title`, `summary`, `steps_json`, `food_safety_note`, `cooked_verification`, `created_by`, `created_at`)
- `recipe_ingredients` (`id`, `recipe_revision_id`, `sort_order`, `ingredient_key`, `original_text`, `quantity`, `quantity_max`, `unit`, `edible_part`, `role`, `required`, `group_name`, `preparation_note`, `substitutions_json`)
- `recipe_crop_crosswalk` (`ingredient_key PRIMARY KEY`, `crop_keys_json`, `edible_part`, `mapping_status`, `unit_conversions_json`, `reviewed_by`, `reviewed_at`)
- `recipe_media` (`id`, `recipe_id`, `media_key`, `storage_path`, `mime_type`, `source`, `source_url`, `rights_status`, `license_id`, `license_url`, `credit`, `source_evidence`, `public_export_opt_in_json`, `alt_text`, `review_status`, `uploaded_by`, `created_at`)
- `recipe_review_events` (`id`, `recipe_id`, `recipe_revision_id`, `from_status`, `to_status`, `actor_member_id`, `actor_role`, `reason`, `promoted_to_curated`, `created_at`)
- `recipe_cooked_logs` (`id`, `recipe_id`, `recipe_revision_id`, `member_id`, `note`, `created_at`)

### Reuse of existing ParcOS infrastructure

- **Translations:** Register `recipe_revision` (`title`, `summary`, `steps_json`, `food_safety_note`) and `recipe_media` (`alt_text`) in `server.mjs` `localizedEntities`, reusing `localized_content` and `content_translations` (source revision + stale detection).
- **Auth, CSRF & private media:** Enforce authenticated member access on all recipe reads and recipe media endpoints; CSRF token on all writes; server-side object-level checks via `canMemberViewRecipe` / `canMemberEditDraft` / `transitionRecipeWorkflow`; no public recipe endpoints unless explicitly approved; strip EXIF/GPS on uploaded member photos and reject SVG/executable uploads.
- **Backup & restore:** Add `recipe_media` paths to `backup.mjs` media reference enumeration and `restore.mjs` validation; retain all decompression and entry bounds.
- **PWA shell:** Add `public/app/recipes/*.js` and `public/app/recipes/recipes.css` to `public/sw.js` static shell cache and bump cache version; never cache private recipe API responses in a public cache.

## 7. Proposed narrow roadmap note (for owner review)

Do not edit `docs/roadmap.md` or `docs/ParcOS-Full-Product-Specification.md` without owner approval. Suggested narrow note under M3/M6:

> M3/M6 cookbook preparation progresses in parallel via the portable v1 recipe catalogue contract, Cuisine Libre JSON/CSV curation pipeline, FR/NL/EN translation exchange, and modular browse/detail/contribution/review components, integrating after M1 navigation and M2 crop keys stabilize.
