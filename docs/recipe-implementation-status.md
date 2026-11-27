# ParcOS Recipe Catalogue — Implementation Status

- **Date:** 28 November 2026
- **Branch:** `feature/recipe-catalogue`
- **Isolated worktree:** `C:\Users\Louis\Documents\ParcOS-recipes` (Sol's `C:\Users\Louis\Documents\ParcOS` and `.worktrees/m2` were never modified)
- **Verified shared base commit:** `ede023a` (`main`, ParcOS `1.4.2` + PR #14 Agricultural Foundations)
- **Runtime verified:** Node.js `v24.22.3` (zero new npm dependencies added by this branch)

## 1. Exact upstream blocker (Cuisine Libre)

- Direct check on 27 November 2026: `HEAD https://www.cuisine-libre.org/` returned **HTTP 404 Not Found**, confirming the reported late-November 2026 outage.
- No scraping or circumvention was attempted, and no 200 recipes were invented or copied from unverified sources.
- The JSON and CSV Cuisine Libre import adapters (`src/domain/recipes/curation.mjs` + `tools/recipes/cli.mjs`) are ready to ingest an authorized export from Romy Duhem-Verdière once received. Until then, all bundled fixtures are explicitly marked `origin: "synthetic"`.

## 2. Completed work

### Slice A — Portable catalogue contract, curation pipeline & CLI (commit `e395db8`)

- **Schema & constants:** `catalogues/recipes/schema/recipe-bundle.v1.schema.json`, `src/domain/recipes/constants.mjs`.
- **Strict validation & independent rights:** `src/domain/recipes/validator.mjs` — validates schema version, duplicate keys, finite positive numbers, safe HTTP/HTTPS URLs, safe relative image paths (rejects traversal/SVG/symlinks), and independent per-recipe and per-image licenses (CC0/PD, CC BY, CC BY-SA vs NC/ND/UNKNOWN quarantine).
- **Deterministic scaling & planning readiness:** `src/domain/recipes/scaling.mjs` — linear servings scaling, exact intra-dimension conversions (`g`↔`kg`, `ml`↔`l`), pantry exclusion from garden demand, and explicit blocker reporting for unmapped crops or missing unit conversions.
- **Repeatable curation pipeline:** `src/domain/recipes/curation.mjs` — JSON/CSV Cuisine Libre adapters, deduplication, adjustable 6-factor Belgian garden editorial scoring rubric, idempotent merge preserving local edits and archiving prior revisions, deterministic SHA-256 bundle serialization, rights manifest, and Markdown curation report.
- **Provider-neutral FR / Belgian NL / EN translation exchange:** `src/domain/recipes/translation-exchange.mjs` + `catalogues/recipes/glossary/culinary-glossary.v1.json` — exports missing/stale fields with Belgian Dutch culinary glossary and zero PII; rejects stale revisions, step-count mismatches, unknown fields, and numeric drift on import; protects human-reviewed translations and falls back safely to source locale.
- **Workflow & public export sanitizer:** `src/domain/recipes/workflow.mjs` — `draft` / `submitted` / `changes_requested` / `approved` / `rejected` / `withdrawn` / `archived` state machine, object-level draft privacy, no self-approval for ordinary authors, variant vs correction revision trails, moderation takedown preserving historical snapshots, and opt-in public export stripping all internal member/reviewer IDs.
- **M2 contract alignment (`docs/agriculture-recipe-contract.md`):** `src/domain/recipes/agriculture-adapter.mjs` — consumes `GET /api/agriculture/catalogue`, validates 1–80 char opaque `cropId`/`cropKeys`, checks `ediblePart` against `crop.edibleParts`, retains unresolved/archived crop links with explicit review flags, projects `{ ingredientId, cropId, ediblePart, quantity, unit }`, and evaluates overlapping typical local availability months (`1–12`) separately from measured/forecast harvests.
- **Operator CLI & synthetic fixtures:** `tools/recipes/cli.mjs`, `catalogues/recipes/crosswalk/crop-crosswalk.v1.json`, `catalogues/recipes/fixtures/cuisine-libre-export.sample.{json,csv}`, `catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json`, `catalogues/recipes/manifests/{rights-manifest.v1.json,curation-report.sample.md}`, `catalogues/recipes/.gitignore`.

### Slice B — Modular recipe UI components & preview (isolated from Sol's shared files)

- **Browser domain & i18n:** `public/app/recipes/recipe-model.js` (complete FR, Belgian NL, EN labels, XSS escaping, safe URL guard, scaling, multilingual search/filtering, botanical placeholder).
- **Cookbook browse:** `public/app/recipes/recipe-browse.js` (Curated/Community tabs, search, season/produce/category filters, licensed-only photo or neutral placeholder, empty/no-result/loading/error/denied states).
- **Canonical detail:** `public/app/recipes/recipe-detail.js` (servings stepper non-destructively scaling quantities, separated Garden/Pantry checklist, step-by-step instructions, food safety callout, honest M2/M3 pending availability notice, non-misleading M3 food calendar placeholder, per-recipe and per-image attribution links, "I cooked this" and proposal hooks).
- **Member contribution:** `public/app/recipes/recipe-contribute.js` (manual recipe, link-only URL suggestion with no server fetch, correction/translation mode, own-photo EXIF-strip notice, local sharing vs separate explicit `CC-BY-SA-4.0` public export opt-in, private submission tracker).
- **Coordinator review queue:** `public/app/recipes/recipe-review.js` (role-gated, missing-quantity/mapping/rights/duplicate flags, revision diff, approve community / promote curated / request changes / reject).
- **Scoped design-token CSS:** `public/app/recipes/recipes.css` (uses ParcOS `--forest-*`, `--cream`, `--paper`, `--ink`, `--line`, `--berry` tokens; mobile-first 320px–390px and desktop 1280px).
- **Throwaway local preview:** `tools/recipes/preview-server.mjs` (`127.0.0.1:4179`, synthetic data only, NOT integrated into `server.mjs`).

### Documentation & integration contract

- `docs/recipes/README.md` — editorial & CLI guide.
- `docs/recipes/integration-contract.md` — M1/M2/M3 contract, proposed additive SQLite schema, API/auth matrix, backup/PWA integration checklist.
- `docs/recipe-implementation-status.md` — this status report.

## 3. Verification evidence

- **Syntax & unit/integration test suite (Node `v24.22.3`):**
  - All baseline + M2 syntax checks (`server.mjs`, `backup.mjs`, `restore.mjs`, `src/services/push-notifications.mjs`, `public/app.js`, `public/sw.js`) + all new recipe `.mjs`/`.js` syntax checks: **passed**.
  - `node --test tests/*.test.mjs`: **32 / 32 tests passed** (19 existing `main` baseline + M2 agriculture tests + 9 `tests/recipe-catalogue.test.mjs` + 4 `tests/recipe-ui.test.mjs`).
- **`git diff --check origin/main..HEAD`:** passed cleanly.
- **Headless Microsoft Edge browser verification against `http://127.0.0.1:4179/` (disposable profile, synthetic data):**
  - Zero JavaScript console errors and zero page errors.
  - Desktop `1280×900`: Browse FR (8 cards), Detail FR scaled 4 → 6 servings (`1,2 kg` courgettes verified, Garden & Pantry separated, honest pending availability shown), Detail NL (Belgian Dutch: *"Fluwelige courgettesoep uit de moestuin"*, *"Uit de moestuin"*, *"Voorraadkast"*, *"Ajuin"*), Coordinator Review Queue EN (`turnip` unmapped-crop flag verified) — zero horizontal overflow.
  - Mobile `375×812`: Browse FR (`minButtonHeight: 44px`), Detail FR, Contribute EN (explicit CC BY-SA 4.0 opt-in verified) — zero horizontal overflow (`scrollWidth === 375`).
  - Narrow mobile `320×740`: Browse, Detail, Contribute — zero horizontal overflow (`scrollWidth === 320`).
  - Keyboard Tab focus moved visibly onto interactive controls.
  - Visual screenshot inspection caught tight uppercase `"PRÉPARATION"` wrapping inside `.recipe-facts-grid` at 375px; fixed by widening tile minimum from `92px` to `112px`.

## 4. Limitations & items intentionally deferred to Slice C / D

- **No shared core files modified:** `server.mjs`, `public/app.js`, `public/styles.css`, `public/sw.js`, `backup.mjs`, `restore.mjs`, `package.json`, and canonical docs remain untouched to avoid conflicts with Sol's in-progress M1/M2 work.
- **No SQLite migration allocated yet:** Migrations 5–8 are now owned by agriculture on `main` (`ede023a`); Slice C will allocate the next unused migration (**Migration 9+**) after rechecking the migration ledger.
- **No Docker build/smoke run:** WSL2 virtualization is disabled on this Windows host (same host limitation documented in `docs/implementation-reconciliation.md`); run Docker build/smoke in CI before release.
- **Not WCAG certification:** Automated focus, labels, contrast tokens, and 44px touch targets were checked, but no real screen-reader or outdoor volunteer study was performed.
- **Synthetic content only:** 7 synthetic pipeline fixtures + 2 preview community records; real curation toward ~200 recipes requires the authorized Cuisine Libre export and owner editorial review.

## 5. Open owner decisions

1. Acquisition & rights confirmation for the Cuisine Libre export (with Romy Duhem-Verdière) or approval of any secondary open-licensed source.
2. Separate `parcos-recipes` content repository vs keeping `catalogues/recipes/` in the main repo.
3. Public open-license default (`CC-BY-SA-4.0` proposed) for explicitly opted-in community contributions.
4. Final M2 `cropKey` alignment & M1 route mounting coordinates with Sol before Slice C integration.
5. Exact portion/cutoff/allocation rules (already tracked in full specification D03) and external AI free-text policy (D10).

## 6. Next commands after Sol's M1/M2 baseline stabilizes

```bash
# 1. Rebase/merge feature/recipe-catalogue onto the agreed merged baseline
# 2. Allocate next unused SQLite migration version and implement Slice C HTTP routes,
#    localizedEntities registration, EXIF-stripped private media upload, backup/restore coverage, and SW shell bump
# 3. Run complete validation suite:
npm run check
git diff --check
```
