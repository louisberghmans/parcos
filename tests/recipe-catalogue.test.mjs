import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  RECIPE_BUNDLE_SCHEMA_VERSION,
  evaluateLicense,
  evaluatePlanningReadiness,
  scaleRecipeQuantities,
  validateRecipeBundle,
  validateRecipeRecord,
} from "../src/domain/recipes/index.mjs";
import {
  formatCurationReportMarkdown,
  parseCuisineLibreInput,
  runCurationPipeline,
} from "../src/domain/recipes/curation.mjs";
import {
  exportRecipeTranslations,
  importRecipeTranslations,
  resolveLocalizedRecipeContent,
} from "../src/domain/recipes/translation-exchange.mjs";
import { sanitizeForPublicExport } from "../src/domain/recipes/workflow.mjs";

const FIXTURES_DIR = resolve("catalogues/recipes/fixtures");
const CROSSWALK_PATH = resolve("catalogues/recipes/crosswalk/crop-crosswalk.v1.json");
const GLOSSARY_PATH = resolve("catalogues/recipes/glossary/culinary-glossary.v1.json");
const CLI_PATH = resolve("tools/recipes/cli.mjs");

function loadCrosswalk() {
  return JSON.parse(readFileSync(CROSSWALK_PATH, "utf8")).entries;
}

function loadGlossary() {
  return JSON.parse(readFileSync(GLOSSARY_PATH, "utf8")).entries;
}

function runSamplePipeline() {
  const raw = readFileSync(join(FIXTURES_DIR, "cuisine-libre-export.sample.json"), "utf8");
  const rows = parseCuisineLibreInput(raw, "json");
  return runCurationPipeline({
    sourceRows: rows,
    crosswalk: loadCrosswalk(),
    catalogueVersion: "0.1.0-synthetic",
    nowIso: "2026-11-27T22:00:00.000Z",
  });
}

test("curation pipeline handles rights, separate image licenses, dedup, link-only quarantine and deterministic output", () => {
  const first = runSamplePipeline();
  const second = runSamplePipeline();

  assert.equal(first.bundle.checksumSha256, second.bundle.checksumSha256, "deterministic serialization checksum");
  assert.equal(validateRecipeBundle(first.bundle).valid, true);

  // Counts check: 9 rows in sample JSON -> 1 NC excluded, 1 duplicate skipped, 1 unknown-license link-only, 6 full cleared
  assert.equal(first.report.counts.received, 9);
  assert.equal(first.report.counts.excludedByRights, 1);
  assert.equal(first.report.counts.duplicates, 1);
  assert.equal(first.report.counts.linkOnly, 1);
  assert.equal(first.report.counts.valid, 7);
  assert.equal(first.bundle.recipes.length, 7);

  // Unknown-license recipe is quarantined as link-only with zero copied steps/ingredients/media
  const linkOnly = first.bundle.recipes.find((r) => r.recipeKey === "synthetic:tarte-tomates-licence-inconnue");
  assert.ok(linkOnly);
  assert.equal(linkOnly.rights.status, "link_only");
  assert.deepEqual(linkOnly.content.locales.fr.steps, []);
  assert.deepEqual(linkOnly.ingredients, []);
  assert.deepEqual(linkOnly.media, []);

  // Text cleared + image unknown -> recipe kept, image quarantined (not bundled!)
  const leekTart = first.bundle.recipes.find((r) => r.recipeKey === "synthetic:tarte-poireaux-bettes");
  assert.ok(leekTart);
  assert.equal(leekTart.rights.status, "cleared");
  assert.equal(leekTart.media.length, 0, "unknown-license image must be excluded independently of text license");
  assert.ok(
    first.rightsManifest.includedRecords.some((entry) => entry.assetType === "image_excluded" && entry.recipeKey === leekTart.recipeKey)
  );

  // Markdown curation report renders cleanly
  const md = formatCurationReportMarkdown(first.report);
  assert.match(md, /Excluded by rights/);
  assert.match(md, /Quarantined link-only/);
});

test("CSV import adapter parses Cuisine Libre CSV rows and excludes NC records", () => {
  const csv = readFileSync(join(FIXTURES_DIR, "cuisine-libre-export.sample.csv"), "utf8");
  const rows = parseCuisineLibreInput(csv, "csv");
  assert.equal(rows.length, 2);
  const { bundle, report } = runCurationPipeline({
    sourceRows: rows,
    crosswalk: loadCrosswalk(),
    catalogueVersion: "0.1.0-csv",
    nowIso: "2026-11-27T22:00:00.000Z",
  });
  assert.equal(report.counts.excludedByRights, 1);
  assert.equal(bundle.recipes.length, 1);
  assert.equal(bundle.recipes[0].recipeKey, "synthetic:soupe-petits-pois-printemps");
  assert.equal(evaluatePlanningReadiness(bundle.recipes[0]).planningReady, true);
});

test("re-importing is idempotent and preserves local edits and prior revisions", () => {
  const initial = runSamplePipeline();
  const baseBundle = structuredClone(initial.bundle);

  // Mark one recipe as locally edited
  const courgette = baseBundle.recipes.find((r) => r.recipeKey === "synthetic:veloute-courgettes-potager");
  courgette.editorial.localEditsProtected = true;
  courgette.content.locales.fr.title = "Velouté de courgettes (édité localement)";

  // Re-run with identical revision -> preserves local edit without duplicating
  const raw = readFileSync(join(FIXTURES_DIR, "cuisine-libre-export.sample.json"), "utf8");
  const rows = parseCuisineLibreInput(raw, "json");
  const rerunSame = runCurationPipeline({
    sourceRows: rows,
    existingBundle: baseBundle,
    crosswalk: loadCrosswalk(),
    nowIso: "2026-11-27T22:05:00.000Z",
  });
  const afterSame = rerunSame.bundle.recipes.find((r) => r.recipeKey === "synthetic:veloute-courgettes-potager");
  assert.equal(afterSame.content.locales.fr.title, "Velouté de courgettes (édité localement)");
  assert.equal(rerunSame.bundle.recipes.length, baseBundle.recipes.length);

  // New upstream revision on locally edited recipe -> stored as pendingUpstreamUpdate, local edit intact
  const updatedRows = rows.map((r) =>
    r.recipeKey === "synthetic:veloute-courgettes-potager" ? { ...r, sourceRevision: "2.0", title: "Nouvelle version upstream" } : r
  );
  const rerunNew = runCurationPipeline({
    sourceRows: updatedRows,
    existingBundle: baseBundle,
    crosswalk: loadCrosswalk(),
    nowIso: "2026-11-27T22:10:00.000Z",
  });
  const afterNew = rerunNew.bundle.recipes.find((r) => r.recipeKey === "synthetic:veloute-courgettes-potager");
  assert.equal(afterNew.content.locales.fr.title, "Velouté de courgettes (édité localement)");
  assert.equal(afterNew.editorial.pendingUpstreamUpdate.incomingRevision, "2.0");

  // New upstream revision on non-edited recipe -> archives prior revision
  const updatedRows2 = rows.map((r) =>
    r.recipeKey === "synthetic:tarte-poireaux-bettes" ? { ...r, sourceRevision: "2.0" } : r
  );
  const rerunArchive = runCurationPipeline({
    sourceRows: updatedRows2,
    existingBundle: baseBundle,
    crosswalk: loadCrosswalk(),
    nowIso: "2026-11-27T22:12:00.000Z",
  });
  const afterArchive = rerunArchive.bundle.recipes.find((r) => r.recipeKey === "synthetic:tarte-poireaux-bettes");
  assert.equal(afterArchive.revision, "2.0");
  assert.equal(afterArchive.parentRevision, "1.0");
  assert.equal(afterArchive.editorial.priorRevisions.length, 1);
  assert.equal(afterArchive.editorial.priorRevisions[0].revision, "1.0");
});

test("validator rejects missing rights, nonfinite quantities, unsafe URLs, path traversal, duplicate keys and bad schema versions", () => {
  const { bundle } = runSamplePipeline();
  const validRecipe = structuredClone(bundle.recipes[0]);

  // Unsupported schema version
  const badVersion = validateRecipeBundle({ ...bundle, schemaVersion: "wrong-v99" });
  assert.equal(badVersion.valid, false);
  assert.ok(badVersion.errors.some((e) => e.code === "unsupported_schema_version"));

  // Duplicate recipeKey
  const dupBundle = validateRecipeBundle({ ...bundle, recipes: [validRecipe, validRecipe] });
  assert.equal(dupBundle.valid, false);
  assert.ok(dupBundle.errors.some((e) => e.code === "duplicate_key"));

  // Missing rights
  const noRights = structuredClone(validRecipe);
  delete noRights.rights;
  assert.ok(validateRecipeRecord(noRights).errors.some((e) => e.code === "missing_rights"));

  // Nonfinite & negative quantities
  const badQty = structuredClone(validRecipe);
  badQty.ingredients[0].quantity = Number.NaN;
  assert.ok(validateRecipeRecord(badQty).errors.some((e) => e.code === "nonfinite_number"));
  badQty.ingredients[0].quantity = -50;
  assert.ok(validateRecipeRecord(badQty).errors.some((e) => e.code === "invalid_number_range"));

  // Unsafe URLs (javascript:, file:, credentials in URL)
  for (const badUrl of ["javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com/a"]) {
    const unsafeUrl = structuredClone(validRecipe);
    unsafeUrl.sourceUrl = badUrl;
    assert.ok(validateRecipeRecord(unsafeUrl).errors.some((e) => e.code === "unsafe_url"), `should reject ${badUrl}`);
  }

  // Unsafe asset path (traversal & SVG)
  for (const badAsset of ["../secret.jpg", "/abs/path.png", "photos/evil.svg", "photos\\win.jpg"]) {
    const unsafeMedia = structuredClone(validRecipe);
    unsafeMedia.media = [
      {
        mediaKey: "bad-media",
        type: "image",
        localAsset: badAsset,
        rights: { status: "cleared", licenseId: "CC-BY-4.0", credit: "Author" },
      },
    ];
    assert.ok(validateRecipeRecord(unsafeMedia).errors.some((e) => e.code === "unsafe_asset_path"), `should reject ${badAsset}`);
  }

  // NC license cannot be marked cleared
  const badClearance = structuredClone(validRecipe);
  badClearance.rights.licenseId = "CC-BY-NC-4.0";
  badClearance.rights.status = "cleared";
  assert.ok(validateRecipeRecord(badClearance).errors.some((e) => e.code === "invalid_rights_clearance"));
  assert.equal(evaluateLicense("CC-BY-ND-4.0").autoImportAllowed, false);
});

test("deterministic scaling: 800 g courgettes for 4 scales to 1.2 kg for 6, pantry excluded, unmapped/unconverted blocks planning", () => {
  const { bundle } = runSamplePipeline();
  const courgetteSoup = bundle.recipes.find((r) => r.recipeKey === "synthetic:veloute-courgettes-potager");
  const scaled = scaleRecipeQuantities(courgetteSoup, 6);

  assert.equal(scaled.scalable, true);
  assert.equal(scaled.factor, 1.5);
  const courgetteRow = scaled.gardenDemand.find((i) => i.ingredientKey === "courgette");
  assert.equal(courgetteRow.scaledQuantity, 1.2);
  assert.equal(courgetteRow.scaledUnit, "kg");
  assert.equal(courgetteRow.demandGrams, 1200);

  // Pantry ingredients never appear in gardenDemand
  assert.equal(scaled.gardenDemand.some((i) => i.ingredientKey === "olive_oil" || i.ingredientKey === "salt"), false);

  // Planning-ready soup passes readiness check
  assert.equal(evaluatePlanningReadiness(courgetteSoup).planningReady, true);

  // Recipe with required basil bunch (unresolved crop mapping + no reviewed bunch->gram conversion) blocks planning
  const beanPan = bundle.recipes.find((r) => r.recipeKey === "synthetic:poelee-haricots-verts-tomates");
  const readiness = evaluatePlanningReadiness(beanPan);
  assert.equal(readiness.planningReady, false);
  assert.ok(readiness.blockers.some((b) => b.code === "missing_unit_conversion" && b.ingredientKey === "basil"));
  assert.ok(readiness.blockers.some((b) => b.code === "unmapped_crop" && b.ingredientKey === "basil"));

  // Link-only recipe blocks planning with explicit reason
  const linkOnly = bundle.recipes.find((r) => r.recipeKey === "synthetic:tarte-tomates-licence-inconnue");
  const linkReadiness = evaluatePlanningReadiness(linkOnly);
  assert.equal(linkReadiness.planningReady, false);
  assert.ok(linkReadiness.blockers.some((b) => b.code === "link_only_recipe"));
});

test("translation export/import validates revision, rejects numeric drift and missing steps, protects reviewed text, and falls back safely", () => {
  const { bundle } = runSamplePipeline();
  const exported = exportRecipeTranslations(bundle, { glossary: loadGlossary(), exportedAt: "2026-11-27T22:20:00.000Z" });

  // poelee-haricots-verts-tomates is missing EN translation
  const enTitleItem = exported.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "title");
  const enStepsItem = exported.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "steps");
  assert.ok(enTitleItem);
  assert.ok(enStepsItem);
  assert.ok(exported.glossary.some((g) => g.key === "green_bean" && g.nl === "prinsessenboon"));

  // Verify fallback before translation import
  const beforeFallback = resolveLocalizedRecipeContent(
    bundle.recipes.find((r) => r.recipeKey === "synthetic:poelee-haricots-verts-tomates"),
    "en"
  );
  assert.equal(beforeFallback.fallbackUsed, true);
  assert.equal(beforeFallback.displayedLocale, "fr");

  // 1. Valid EN translation succeeds as machine_unreviewed by default
  const validPayload = structuredClone(exported);
  validPayload.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "title").translation =
    "Mediterranean Green Bean and Tomato Skillet";
  validPayload.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "steps").translatedSteps = [
    "Trim 600 g of green beans and blanch for 6 minutes in salted boiling water.",
    "Quarter 500 g of ripe tomatoes.",
    "Sauté the beans and tomatoes for 10 minutes in olive oil with fresh basil.",
  ];
  const okImport = importRecipeTranslations(bundle, validPayload);
  assert.equal(okImport.summary.imported, 2);
  const afterResolved = resolveLocalizedRecipeContent(
    okImport.bundle.recipes.find((r) => r.recipeKey === "synthetic:poelee-haricots-verts-tomates"),
    "en"
  );
  assert.equal(afterResolved.fallbackUsed, false);
  assert.equal(afterResolved.reviewStatus, "machine_unreviewed");
  assert.equal(afterResolved.title, "Mediterranean Green Bean and Tomato Skillet");

  // 2. Numeric drift in steps (600 g -> 400 g) MUST be rejected
  const driftPayload = structuredClone(exported);
  driftPayload.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "steps").translatedSteps = [
    "Trim 400 g of green beans and blanch for 6 minutes in salted boiling water.",
    "Quarter 500 g of ripe tomatoes.",
    "Sauté the beans and tomatoes for 10 minutes in olive oil with fresh basil.",
  ];
  const driftResult = importRecipeTranslations(bundle, driftPayload);
  assert.equal(driftResult.summary.rejectedNumericDrift, 1);
  assert.equal(driftResult.summary.imported, 0);

  // 3. Missing step MUST be rejected
  const shortPayload = structuredClone(exported);
  shortPayload.items.find((i) => i.recipeKey === "synthetic:poelee-haricots-verts-tomates" && i.targetLocale === "en" && i.field === "steps").translatedSteps = [
    "Trim 600 g of green beans and blanch for 6 minutes.",
  ];
  const shortResult = importRecipeTranslations(bundle, shortPayload);
  assert.equal(shortResult.summary.rejectedStepMismatch, 1);

  // 4. Stale revision MUST be rejected
  const stalePayload = structuredClone(validPayload);
  stalePayload.items.forEach((i) => {
    i.sourceRevision = "0.9-stale";
  });
  const staleResult = importRecipeTranslations(bundle, stalePayload);
  assert.ok(staleResult.summary.rejectedStale > 0);
  assert.equal(staleResult.summary.imported, 0);
});

test("public export strictly enforces contributor opt-in and strips private account IDs", () => {
  const { bundle } = runSamplePipeline();
  const base = structuredClone(bundle.recipes[0]);

  const localOnlyCommunity = structuredClone(base);
  localOnlyCommunity.recipeKey = "community:grandma-leek-soup";
  localOnlyCommunity.origin = "community";
  localOnlyCommunity.rights = {
    status: "local_only",
    licenseId: "LOCAL-COMMUNITY-ONLY",
    attribution: "Marie",
    sourceEvidence: "Member submission without external export opt-in",
    publicExportOptIn: { granted: false, licenseId: null, creditName: null },
  };
  localOnlyCommunity.contributor = { ownerMemberId: "member-42", publicCredit: "Marie" };

  const optedInCommunity = structuredClone(base);
  optedInCommunity.recipeKey = "community:garden-chard-gratin";
  optedInCommunity.origin = "community";
  optedInCommunity.rights = {
    status: "cleared",
    licenseId: "CC-BY-SA-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Luc (Parc Parmentier)",
    sourceEvidence: "Explicit contributor open-license opt-in",
    publicExportOptIn: { granted: true, licenseId: "CC-BY-SA-4.0", creditName: "Luc", grantedAt: "2026-11-27T22:00:00.000Z" },
  };
  optedInCommunity.contributor = { ownerMemberId: "member-99", publicCredit: "Luc" };
  optedInCommunity.editorial.reviewedBy = "coord-7";

  const { exported, excluded } = sanitizeForPublicExport([localOnlyCommunity, optedInCommunity]);
  assert.equal(exported.length, 1);
  assert.equal(excluded.length, 1);
  assert.equal(exported[0].recipeKey, "community:garden-chard-gratin");
  assert.equal(exported[0].contributor.ownerMemberId, undefined, "internal member ID must be stripped");
  assert.equal(exported[0].editorial.reviewedBy, undefined, "reviewer ID must be stripped");
  assert.equal(exported[0].contributor.publicCredit, "Luc");
});

test("CLI runs dry-run import, validate, scale, translate-export and rejects symlinked input", () => {
  const workDir = mkdtempSync(join(tmpdir(), "parcos-recipe-cli-"));
  try {
    const outBundle = join(workDir, "bundle.json");
    const outManifest = join(workDir, "manifest.json");
    const outReport = join(workDir, "report.md");

    // Dry run succeeds without writing output
    const dryStdout = execFileSync(process.execPath, [
      CLI_PATH,
      "import",
      "--input",
      join(FIXTURES_DIR, "cuisine-libre-export.sample.json"),
      "--crosswalk",
      CROSSWALK_PATH,
      "--dry-run",
    ], { encoding: "utf8" });
    const drySummary = JSON.parse(dryStdout);
    assert.equal(drySummary.dryRun, true);
    assert.equal(drySummary.counts.excludedByRights, 1);

    // Real import writes deterministic bundle + manifest + markdown report
    execFileSync(process.execPath, [
      CLI_PATH,
      "import",
      "--input",
      join(FIXTURES_DIR, "cuisine-libre-export.sample.json"),
      "--crosswalk",
      CROSSWALK_PATH,
      "--out",
      outBundle,
      "--manifest",
      outManifest,
      "--report-md",
      outReport,
    ], { encoding: "utf8" });

    // Validate passes
    const valOut = execFileSync(process.execPath, [CLI_PATH, "validate", "--bundle", outBundle], { encoding: "utf8" });
    assert.match(valOut, /^VALID: 7 recipes/);

    // Scale CLI outputs 1.2 kg courgettes for 6 servings
    const scaleOut = execFileSync(process.execPath, [
      CLI_PATH,
      "scale",
      "--bundle",
      outBundle,
      "--recipe",
      "synthetic:veloute-courgettes-potager",
      "--servings",
      "6",
    ], { encoding: "utf8" });
    const scaleJson = JSON.parse(scaleOut);
    const courgette = scaleJson.scaled.gardenDemand.find((i) => i.ingredientKey === "courgette");
    assert.equal(courgette.scaledQuantity, 1.2);
    assert.equal(courgette.scaledUnit, "kg");

    // Check schema version in written bundle
    const written = JSON.parse(readFileSync(outBundle, "utf8"));
    assert.equal(written.schemaVersion, RECIPE_BUNDLE_SCHEMA_VERSION);

    // Symlink test (best-effort on Windows where symlink creation may require privilege)
    const linkPath = join(workDir, "symlink-bundle.json");
    let symlinkCreated = false;
    try {
      symlinkSync(outBundle, linkPath);
      symlinkCreated = true;
    } catch {
      symlinkCreated = false;
    }
    if (symlinkCreated) {
      assert.throws(() => {
        execFileSync(process.execPath, [CLI_PATH, "validate", "--bundle", linkPath], { stdio: "pipe" });
      });
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
