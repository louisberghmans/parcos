# ParcOS Recipe Catalogue — Editorial & Operator Guide

This directory documents the independent, portable v1 recipe catalogue pipeline and modular cookbook components built on branch `feature/recipe-catalogue`.

Software code remains under **GPL-3.0-or-later**. Recipe text and photographs are licensed **per record and per media item**; no blanket license is applied to imported content.

## 1. Expected Cuisine Libre export format

Live `https://www.cuisine-libre.org/` returned HTTP `404 Not Found` on 27 November 2026. Do not scrape unavailable or restricted pages. Once an authorized export is obtained from the maintainer (Romy Duhem-Verdière), place raw files inside the Git-ignored `catalogues/recipes/raw/` or `catalogues/recipes/staging/` directory and run the import adapter.

### Supported input formats

1. **JSON** (array of recipe objects or `{ "recipes": [...] }`), see [cuisine-libre-export.sample.json](../../catalogues/recipes/fixtures/cuisine-libre-export.sample.json):
   - Identity & provenance: `upstreamId`, `slug`, `sourceUrl` (canonical Cuisine Libre page), `archiveUrl` (optional), `sourceLocale` (`fr`/`nl`/`en`), `sourceRevision`, `author`, `textLicenseId` (e.g. `CC-BY-SA-4.0`, `CC-BY-4.0`, `CC0-1.0`, `UNKNOWN`), `textLicenseUrl`, `rightsEvidence`.
   - Content: `title`, `summary`, `steps` (array of concise strings), `baseServings`, `prepMinutes`, `cookMinutes`, `restMinutes`, `seasons` (`spring`/`summer`/`autumn`/`winter`), `category`, `tags`, `dietary`, `foodSafetyNote` (optional).
   - Ingredients: `ingredientKey` (canonical culinary key, never localized), `originalText`, `quantity`, `quantityMax` (optional range), `unit`, `ediblePart`, `role` (`garden`/`pantry`/`optional`/`unknown`), `required` (boolean).
   - Media (independent per-image rights): `mediaKey`, `localAsset` (safe relative `.jpg`/`.png`/`.webp`/`.avif`), `sourceUrl`, `licenseId`, `licenseUrl`, `credit`, `alt`.

2. **CSV**, see [cuisine-libre-export.sample.csv](../../catalogues/recipes/fixtures/cuisine-libre-export.sample.csv):
   - Pipe-separated lists (`|`) for `steps`, `seasons`, `tags`, `dietary`, and `ingredients` (`key;qty;unit;role;required;ediblePart;originalText`).

### Rights clearance rules

- **Cleared for automatic import/adaptation:** `CC0-1.0`, `PDM-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `CC-BY-SA-2.0-FR`, `CC-BY-SA-3.0`, `CC-BY-SA-4.0` (retaining attribution and share-alike where applicable).
- **Quarantined as link-only:** `UNKNOWN` or missing text license — zero prose, ingredients, or images are copied; only title, canonical link, and provenance remain.
- **Excluded from automatic import:** `CC-BY-NC-*`, `CC-BY-ND-*`, `ALL-RIGHTS-RESERVED`, or unrecognized licenses.
- **Images checked independently:** an uncleared or unknown image license excludes the image (UI displays a neutral placeholder) even when the recipe text is cleared.

## 2. CLI command reference

All commands run with native Node.js (`>=24.22.3`) and zero extra dependencies.

### Dry-run import & curation report

```bash
node tools/recipes/cli.mjs import \
  --input catalogues/recipes/fixtures/cuisine-libre-export.sample.json \
  --crosswalk catalogues/recipes/crosswalk/crop-crosswalk.v1.json \
  --dry-run
```

### Full import (bundle + rights manifest + Markdown report)

```bash
node tools/recipes/cli.mjs import \
  --input catalogues/recipes/fixtures/cuisine-libre-export.sample.json \
  --crosswalk catalogues/recipes/crosswalk/crop-crosswalk.v1.json \
  --existing catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json \
  --out catalogues/recipes/staging/cookbook.v1.bundle.json \
  --manifest catalogues/recipes/staging/rights-manifest.v1.json \
  --report-md catalogues/recipes/staging/curation-report.md \
  --version 0.2.0-draft
```

Re-running with `--existing` is idempotent: unchanged revisions are kept as-is, locally edited records (`editorial.localEditsProtected = true`) receive upstream changes under `editorial.pendingUpstreamUpdate` without overwrite, and non-edited upstream updates archive the prior revision in `editorial.priorRevisions`.

### Validate a bundle

```bash
node tools/recipes/cli.mjs validate \
  --bundle catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json
```

### Deterministic portion scaling & planning readiness check

```bash
node tools/recipes/cli.mjs scale \
  --bundle catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json \
  --recipe synthetic:veloute-courgettes-potager \
  --servings 6
```

### Provider-neutral FR / Belgian NL / EN translation round trip

Export missing or stale fields together with the Belgian culinary glossary (`catalogues/recipes/glossary/culinary-glossary.v1.json`) and zero personal/account data:

```bash
node tools/recipes/cli.mjs translate-export \
  --bundle catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json \
  --glossary catalogues/recipes/glossary/culinary-glossary.v1.json \
  --out catalogues/recipes/staging/translations-out.json
```

Translate offline or via an approved external tool (keeping numbers, temperatures, step counts, and `sourceRevision` intact), then dry-run and import:

```bash
node tools/recipes/cli.mjs translate-import \
  --bundle catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json \
  --translations catalogues/recipes/staging/translations-in.json \
  --out catalogues/recipes/staging/cookbook-translated.v1.bundle.json \
  --dry-run
```

Imported translations default to `reviewStatus: "machine_unreviewed"` unless `--reviewed` is explicitly passed after human editorial review. Stale revisions, missing steps, unknown fields, and mutated quantities are rejected automatically.

### Public rights-cleared export (strict opt-in, zero PII)

```bash
node tools/recipes/cli.mjs export-public \
  --bundle catalogues/recipes/staging/cookbook.v1.bundle.json \
  --out catalogues/recipes/staging/cookbook-public.v1.bundle.json
```

Excludes pending/draft/unapproved records, `LOCAL-COMMUNITY-ONLY` or restricted licenses, any community contribution lacking explicit `rights.publicExportOptIn.granted === true`, and strips internal member/reviewer identifiers.

## 3. Local-only UI preview (throwaway harness)

To preview Browse, Detail, Servings Scaling, Contribute, and Coordinator Review in FR/NL/EN with synthetic data (never connected to a live database):

```bash
node tools/recipes/preview-server.mjs
# Open http://127.0.0.1:4179/
```
