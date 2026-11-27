#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import {
  canonicalJsonStringify,
  computeBundleChecksum,
  formatCurationReportMarkdown,
  parseCuisineLibreInput,
  runCurationPipeline,
} from "../../src/domain/recipes/curation.mjs";
import { evaluatePlanningReadiness, scaleRecipeQuantities } from "../../src/domain/recipes/scaling.mjs";
import { exportRecipeTranslations, importRecipeTranslations } from "../../src/domain/recipes/translation-exchange.mjs";
import { validateRecipeBundle } from "../../src/domain/recipes/validator.mjs";
import { sanitizeForPublicExport } from "../../src/domain/recipes/workflow.mjs";

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function readSafeFile(filePath) {
  const resolved = resolve(filePath);
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symlinked input file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Input path is not a regular file: ${filePath}`);
  }
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error(`Input file exceeds 25 MiB safety cap: ${filePath}`);
  }
  return readFileSync(resolved, "utf8");
}

function writeSafeFile(filePath, content) {
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, "utf8");
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    }
  }
  return flags;
}

function printHelp() {
  console.log(`ParcOS Recipe Catalogue CLI (portable v1)

Usage:
  node tools/recipes/cli.mjs <command> [options]

Commands:
  import            Import JSON/CSV export -> validate, deduplicate, score, bundle
                    --input <path> [--format json|csv] [--existing <bundle.json>]
                    [--crosswalk <path>] [--out <bundle.json>] [--manifest <path>]
                    [--report-md <path>] [--report-json <path>] [--version <ver>]
                    [--dry-run]

  validate          Validate a portable v1 recipe bundle
                    --bundle <path>

  scale             Deterministically scale a recipe revision & inspect garden demand
                    --bundle <path> --recipe <recipeKey> --servings <number>

  translate-export  Export missing/stale FR/NL/EN strings with culinary glossary
                    --bundle <path> [--glossary <path>] --out <translations.json>

  translate-import  Validate and import translated strings (rejects stale/drift)
                    --bundle <path> --translations <path> [--out <bundle.json>]
                    [--reviewed] [--dry-run]

  export-public     Export only openly licensed & contributor-opted-in records (no PII)
                    --bundle <path> --out <public-bundle.json>

  report            Generate editorial curation report from an existing bundle
                    --bundle <path> [--out-md <path>]
`);
}

function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }
  const flags = parseFlags(rest);

  if (command === "validate") {
    if (!flags.bundle) throw new Error("--bundle <path> is required");
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const result = validateRecipeBundle(bundle);
    if (!result.valid) {
      console.error(`Validation failed with ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - [${err.code}] ${err.path}: ${err.message}`);
      }
      process.exit(1);
    }
    const planningCount = bundle.recipes.filter((r) => evaluatePlanningReadiness(r).planningReady).length;
    console.log(`VALID: ${bundle.recipes.length} recipes (${planningCount} planning-ready) — ${bundle.catalogueVersion}`);
    process.exit(0);
  }

  if (command === "import") {
    if (!flags.input) throw new Error("--input <path> is required");
    const format = flags.format || (extname(flags.input).toLowerCase() === ".csv" ? "csv" : "json");
    const raw = readSafeFile(flags.input);
    const sourceRows = parseCuisineLibreInput(raw, format);
    const existingBundle = flags.existing ? JSON.parse(readSafeFile(flags.existing)) : null;
    const crosswalk = flags.crosswalk ? JSON.parse(readSafeFile(flags.crosswalk)).entries || [] : [];

    const { bundle, rightsManifest, report } = runCurationPipeline({
      sourceRows,
      existingBundle,
      crosswalk,
      catalogueVersion: flags.version || existingBundle?.catalogueVersion || "0.1.0-synthetic",
      sourceInfo: {
        sourceId: flags["source-id"] || "cuisine-libre-local-export",
        name: flags["source-name"] || "Cuisine Libre authorized export",
        url: "https://www.cuisine-libre.org/",
        method: `local-${format}-import`,
        notes: flags["dry-run"] ? "Dry run" : "Local operator import",
      },
    });

    const validation = validateRecipeBundle(bundle);
    if (!validation.valid) {
      console.error("Output bundle failed validation:", validation.errors);
      process.exit(1);
    }

    if (!flags["dry-run"]) {
      if (flags.out) writeSafeFile(flags.out, canonicalJsonStringify(bundle));
      if (flags.manifest) writeSafeFile(flags.manifest, canonicalJsonStringify(rightsManifest));
      if (flags["report-json"]) writeSafeFile(flags["report-json"], canonicalJsonStringify(report));
      if (flags["report-md"]) writeSafeFile(flags["report-md"], formatCurationReportMarkdown(report));
    }

    console.log(
      JSON.stringify(
        {
          dryRun: Boolean(flags["dry-run"]),
          catalogueVersion: bundle.catalogueVersion,
          counts: report.counts,
          seasons: report.seasons,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  if (command === "scale") {
    if (!flags.bundle || !flags.recipe || !flags.servings) {
      throw new Error("--bundle, --recipe, and --servings are required");
    }
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const recipe = bundle.recipes.find((r) => r.recipeKey === flags.recipe);
    if (!recipe) throw new Error(`Recipe "${flags.recipe}" not found`);
    const servings = Number(flags.servings);
    const scaled = scaleRecipeQuantities(recipe, servings);
    const readiness = evaluatePlanningReadiness(recipe);
    console.log(JSON.stringify({ scaled, planningReadiness: readiness }, null, 2));
    process.exit(0);
  }

  if (command === "translate-export") {
    if (!flags.bundle) throw new Error("--bundle <path> is required");
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const glossary = flags.glossary ? JSON.parse(readSafeFile(flags.glossary)).entries || [] : [];
    const exported = exportRecipeTranslations(bundle, { glossary });
    if (flags.out) {
      writeSafeFile(flags.out, canonicalJsonStringify(exported));
      console.log(`Exported ${exported.items.length} translation item(s) to ${flags.out}`);
    } else {
      console.log(canonicalJsonStringify(exported));
    }
    process.exit(0);
  }

  if (command === "translate-import") {
    if (!flags.bundle || !flags.translations) {
      throw new Error("--bundle and --translations are required");
    }
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const payload = JSON.parse(readSafeFile(flags.translations));
    const { bundle: updated, summary } = importRecipeTranslations(bundle, payload, {
      markAsReviewed: Boolean(flags.reviewed),
    });
    updated.checksumSha256 = computeBundleChecksum(updated);
    if (!flags["dry-run"] && flags.out) {
      writeSafeFile(flags.out, canonicalJsonStringify(updated));
    }
    console.log(JSON.stringify({ dryRun: Boolean(flags["dry-run"]), ...summary }, null, 2));
    process.exit(0);
  }

  if (command === "export-public") {
    if (!flags.bundle) throw new Error("--bundle <path> is required");
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const { exported, excluded } = sanitizeForPublicExport(bundle.recipes);
    const publicBundle = {
      ...bundle,
      catalogueVersion: `${bundle.catalogueVersion}-public`,
      recipes: exported,
      checksumSha256: null,
    };
    publicBundle.checksumSha256 = computeBundleChecksum(publicBundle);
    if (flags.out) {
      writeSafeFile(flags.out, canonicalJsonStringify(publicBundle));
    }
    console.log(JSON.stringify({ exportedCount: exported.length, excludedCount: excluded.length, excluded }, null, 2));
    process.exit(0);
  }

  if (command === "report") {
    if (!flags.bundle) throw new Error("--bundle <path> is required");
    const bundle = JSON.parse(readSafeFile(flags.bundle));
    const { report } = runCurationPipeline({
      sourceRows: [],
      existingBundle: bundle,
      catalogueVersion: bundle.catalogueVersion,
    });
    const md = formatCurationReportMarkdown(report);
    if (flags["out-md"]) {
      writeSafeFile(flags["out-md"], md);
      console.log(`Wrote curation report to ${flags["out-md"]}`);
    } else {
      console.log(md);
    }
    process.exit(0);
  }

  throw new Error(`Unknown command "${command}"`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
