import { createHash } from "node:crypto";
import {
  BELGIAN_PRIORITY_INGREDIENTS,
  DEFAULT_SCORING_WEIGHTS,
  RECIPE_BUNDLE_SCHEMA_VERSION,
  RIGHTS_MANIFEST_FORMAT,
  SEASONAL_EDITORIAL_GUIDE,
  SEASONS,
  SUPPORTED_LOCALES,
} from "./constants.mjs";
import { evaluatePlanningReadiness, normalizeExactUnit } from "./scaling.mjs";
import { evaluateLicense, isSafeHttpUrl, isSafeRelativeAssetPath, validateRecipeRecord } from "./validator.mjs";

export function canonicalJsonStringify(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

export function computeBundleChecksum(bundleWithoutChecksum) {
  const clone = { ...bundleWithoutChecksum, checksumSha256: null };
  return createHash("sha256").update(canonicalJsonStringify(clone)).digest("hex");
}

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

function normalizeTextForDedup(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Minimal RFC-4180 CSV parser (handles quoted fields, escaped quotes, CRLF/LF).
 */
export function parseCsvRecords(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && csvText[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
}

/**
 * Parse a Cuisine Libre JSON or CSV export into normalized source rows.
 */
export function parseCuisineLibreInput(rawText, format = "json") {
  if (format === "csv") {
    const rows = parseCsvRecords(rawText);
    return rows.map((row, idx) => {
      const parsePipeList = (val) =>
        String(val || "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
      const parseIngredients = (val) =>
        parsePipeList(val).map((line) => {
          // Format: key:qty:unit:role:required:ediblePart:originalText
          const [key, qtyStr, unit, role, reqStr, ediblePart, ...rest] = line.split(";");
          const qty = qtyStr ? Number(qtyStr) : null;
          return {
            ingredientKey: (key || "").trim(),
            quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
            unit: (unit || "").trim() || null,
            role: (role || "unknown").trim(),
            required: reqStr !== "false",
            ediblePart: (ediblePart || "").trim() || null,
            originalText: rest.join(";").trim() || line,
          };
        });

      return {
        rowNumber: idx + 2,
        upstreamId: row.upstream_id || row.id || null,
        slug: row.slug || null,
        sourceUrl: row.source_url || null,
        archiveUrl: row.archive_url || null,
        sourceLocale: row.source_locale || "fr",
        sourceRevision: row.source_revision || row.updated_at || "1",
        origin: row.origin || "upstream",
        author: row.author || null,
        textLicenseId: row.text_license_id || "UNKNOWN",
        textLicenseUrl: row.text_license_url || null,
        rightsEvidence: row.rights_evidence || "",
        title: row.title || "",
        summary: row.summary || "",
        steps: parsePipeList(row.steps),
        baseServings: row.base_servings ? Number(row.base_servings) : null,
        prepMinutes: row.prep_minutes ? Number(row.prep_minutes) : null,
        cookMinutes: row.cook_minutes ? Number(row.cook_minutes) : null,
        restMinutes: row.rest_minutes ? Number(row.rest_minutes) : null,
        seasons: parsePipeList(row.seasons),
        category: row.category || "main",
        tags: parsePipeList(row.tags),
        dietary: parsePipeList(row.dietary),
        ingredients: parseIngredients(row.ingredients),
        media: row.image_license_id
          ? [
              {
                mediaKey: row.image_key || `photo-${idx + 1}`,
                localAsset: row.image_local_asset || null,
                sourceUrl: row.image_source_url || null,
                licenseId: row.image_license_id,
                licenseUrl: row.image_license_url || null,
                credit: row.image_credit || null,
                alt: row.image_alt ? { [row.source_locale || "fr"]: row.image_alt } : {},
              },
            ]
          : [],
      };
    });
  }

  const parsed = JSON.parse(rawText);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.recipes) ? parsed.recipes : null;
  if (!items) {
    throw new Error("Expected a JSON array or an object with a 'recipes' array");
  }
  return items.map((item, idx) => ({ rowNumber: idx + 1, ...item }));
}

function applyCrosswalk(ingredient, crosswalkMap) {
  const key = String(ingredient.ingredientKey || "").trim().toLowerCase();
  const entry = crosswalkMap.get(key);
  if (ingredient.role === "pantry") {
    return {
      status: "not_applicable",
      cropKeys: [],
      ediblePart: ingredient.ediblePart ?? null,
      conversion: null,
      note: "Pantry ingredient does not drive garden cultivation demand",
    };
  }
  if (!entry) {
    return {
      status: "unresolved",
      cropKeys: [],
      ediblePart: ingredient.ediblePart ?? null,
      conversion: null,
      note: "Awaiting reviewed M2 crop crosswalk entry",
    };
  }
  const conv =
    ingredient.unit && entry.unitConversions && entry.unitConversions[ingredient.unit]
      ? {
          unit: ingredient.unit,
          factorToGrams: entry.unitConversions[ingredient.unit].factorToGrams,
          reviewed: Boolean(entry.unitConversions[ingredient.unit].reviewed),
          evidence: entry.unitConversions[ingredient.unit].evidence || null,
        }
      : null;
  return {
    status: entry.mappingStatus || "unresolved",
    cropKeys: Array.isArray(entry.cropKeys) ? [...entry.cropKeys] : [],
    ediblePart: ingredient.ediblePart || entry.ediblePart || null,
    conversion: conv,
    note: entry.note || null,
  };
}

/**
 * Score a rights-cleared candidate using the adjustable editorial rubric.
 * Explicitly NOT objective culinary truth and NEVER fabricates ratings or taste claims.
 */
export function scoreRecipeCandidate(recipe, { weights = DEFAULT_SCORING_WEIGHTS, seasonCounts = {} } = {}) {
  const flags = [];
  const reasons = [];

  // 1. Culinary appeal & coherence (structural completeness: summary, steps, times, clear ingredients)
  const srcContent = recipe.content?.locales?.[recipe.sourceLocale] || {};
  const stepCount = Array.isArray(srcContent.steps) ? srcContent.steps.length : 0;
  let culinaryScore = 0.4;
  if (stepCount >= 3 && stepCount <= 10) {
    culinaryScore += 0.35;
    reasons.push("concise structured steps");
  } else if (stepCount > 0) {
    culinaryScore += 0.2;
  }
  if (srcContent.summary && srcContent.summary.length >= 20 && srcContent.summary.length <= 240) {
    culinaryScore += 0.15;
  }
  if (recipe.content?.prepMinutes != null || recipe.content?.cookMinutes != null) {
    culinaryScore += 0.1;
  }
  culinaryScore = Math.min(1, culinaryScore);

  // 2. Belgian garden crop relevance
  const gardenIngs = (recipe.ingredients || []).filter((i) => i.role === "garden");
  const priorityMatches = gardenIngs.filter((i) => BELGIAN_PRIORITY_INGREDIENTS.has(i.ingredientKey));
  const belgianScore =
    gardenIngs.length === 0 ? 0 : Math.min(1, 0.35 + (priorityMatches.length / Math.max(1, gardenIngs.length)) * 0.45 + Math.min(priorityMatches.length, 3) * 0.08);
  if (priorityMatches.length > 0) {
    reasons.push(`Belgian garden produce (${priorityMatches.map((i) => i.ingredientKey).join(", ")})`);
  } else {
    flags.push("no_priority_belgian_crop");
  }

  // 3. Meaningful quantities of garden produce (not garnish-only)
  let totalGardenGrams = 0;
  let hasUnquantifiedGarden = false;
  for (const ing of gardenIngs) {
    if (typeof ing.quantity === "number" && Number.isFinite(ing.quantity) && ing.unit) {
      const exact = normalizeExactUnit(ing.quantity, ing.unit);
      if (exact.exact && exact.normalizedUnit === "g") {
        totalGardenGrams += exact.normalizedQuantity;
      } else if (ing.cropMapping?.conversion?.reviewed && ing.cropMapping.conversion.factorToGrams) {
        totalGardenGrams += ing.quantity * ing.cropMapping.conversion.factorToGrams;
      } else {
        hasUnquantifiedGarden = true;
      }
    } else {
      hasUnquantifiedGarden = true;
    }
  }
  const servings = recipe.content?.baseServings || 4;
  const gramsPerServing = totalGardenGrams / servings;
  let quantityScore = 0.2;
  if (gramsPerServing >= 200) {
    quantityScore = 1.0;
    reasons.push(`substantial produce (~${Math.round(gramsPerServing)} g/serving)`);
  } else if (gramsPerServing >= 120) {
    quantityScore = 0.75;
    reasons.push(`good produce share (~${Math.round(gramsPerServing)} g/serving)`);
  } else if (gramsPerServing >= 50) {
    quantityScore = 0.45;
  } else {
    flags.push("low_or_unmeasured_produce_volume");
  }
  if (hasUnquantifiedGarden) {
    flags.push("has_unconverted_or_missing_garden_quantity");
  }

  // 4. Family appeal (servings >= 4, approachable category/tags)
  let familyScore = 0.5;
  if (servings >= 4) familyScore += 0.25;
  const tags = new Set((recipe.content?.tags || []).map((t) => t.toLowerCase()));
  if (tags.has("family") || tags.has("weekday") || tags.has("comfort")) {
    familyScore += 0.25;
    reasons.push("family/weekday friendly");
  }
  familyScore = Math.min(1, familyScore);

  // 5. Accessibility & simplicity (<= 10 ingredients, total time <= 60 min)
  const totalMinutes = (recipe.content?.prepMinutes || 0) + (recipe.content?.cookMinutes || 0);
  let simplicityScore = 0.5;
  if ((recipe.ingredients || []).length <= 10) simplicityScore += 0.25;
  if (totalMinutes > 0 && totalMinutes <= 50) {
    simplicityScore += 0.25;
    reasons.push(`accessible timing (${totalMinutes} min)`);
  } else if (totalMinutes > 90) {
    flags.push("long_cook_or_prep_time");
  }
  simplicityScore = Math.min(1, simplicityScore);

  // 6. Seasonal diversity (boost underrepresented seasons relative to editorial guide)
  const recipeSeasons = recipe.content?.seasons || [];
  let seasonalScore = 0.5;
  if (recipeSeasons.length > 0) {
    const pressures = recipeSeasons.map((s) => {
      const target = SEASONAL_EDITORIAL_GUIDE[s] || 50;
      const current = seasonCounts[s] || 0;
      return Math.max(0, 1 - current / target);
    });
    seasonalScore = Math.min(1, 0.4 + Math.max(...pressures) * 0.6);
  } else {
    flags.push("missing_season_tags");
  }

  const totalScore = Math.round(
    (culinaryScore * weights.culinaryAppeal +
      belgianScore * weights.belgianGardenRelevance +
      quantityScore * weights.produceQuantityImpact +
      familyScore * weights.familyAppeal +
      simplicityScore * weights.accessibilitySimplicity +
      seasonalScore * weights.seasonalDiversity) *
      100
  );

  return {
    totalScore,
    breakdown: {
      culinaryAppeal: Math.round(culinaryScore * 100),
      belgianGardenRelevance: Math.round(belgianScore * 100),
      produceQuantityImpact: Math.round(quantityScore * 100),
      familyAppeal: Math.round(familyScore * 100),
      accessibilitySimplicity: Math.round(simplicityScore * 100),
      seasonalDiversity: Math.round(seasonalScore * 100),
    },
    rationale: reasons.length ? reasons.join("; ") : "Pending editorial review",
    flags,
    rubricNote: "Adjustable editorial shortlist aid; not a taste-test rating or popularity score",
  };
}

/**
 * Repeatable, idempotent curation pipeline:
 * acquire -> validate provenance & license -> normalize -> map ingredients ->
 * deduplicate -> score -> shortlist -> merge non-destructively with existing bundle.
 */
export function runCurationPipeline({
  sourceRows,
  existingBundle = null,
  crosswalk = [],
  sourceInfo = {
    sourceId: "cuisine-libre-export",
    name: "Cuisine Libre authorized export",
    url: "https://www.cuisine-libre.org/",
    method: "local-file-import",
  },
  catalogueVersion = "0.1.0-synthetic",
  shortlistThreshold = 60,
  nowIso = new Date().toISOString(),
}) {
  const crosswalkMap = new Map(crosswalk.map((entry) => [entry.ingredientKey, entry]));
  const existingByKey = new Map((existingBundle?.recipes || []).map((r) => [r.recipeKey, r]));

  const report = {
    generatedAt: nowIso,
    catalogueVersion,
    counts: {
      received: sourceRows.length,
      valid: 0,
      excludedByRights: 0,
      linkOnly: 0,
      missingQuantities: 0,
      duplicates: 0,
      shortlisted: 0,
      approved: 0,
      translatedComplete: 0,
      planningReady: 0,
      preservedLocalEdits: 0,
      newRevisionsCreated: 0,
      errors: 0,
    },
    seasons: { spring: 0, summer: 0, autumn: 0, winter: 0 },
    excluded: [],
    duplicates: [],
    errors: [],
    shortlist: [],
    rightsManifestEntries: [],
  };

  const seenUpstreamIds = new Set();
  const seenSourceUrls = new Set();
  const seenFingerprints = new Set();
  const outputMap = new Map();

  // Preserve existing records first (never silently delete when upstream disappears)
  for (const [key, existing] of existingByKey.entries()) {
    outputMap.set(key, structuredClone(existing));
    if (existing.upstreamId) seenUpstreamIds.add(String(existing.upstreamId));
    if (existing.sourceUrl) seenSourceUrls.add(existing.sourceUrl.trim().toLowerCase());
  }

  for (const row of sourceRows) {
    const rowLabel = `row ${row.rowNumber ?? "?"} (${row.title || row.upstreamId || "untitled"})`;
    const sourceLocale = SUPPORTED_LOCALES.includes(row.sourceLocale) ? row.sourceLocale : "fr";

    // Step 1: Rights evaluation (text license evaluated independently from media)
    const textLic = evaluateLicense(row.textLicenseId);
    const origin = row.origin || "upstream";

    if (textLic.status === "excluded" || textLic.status === "review_required") {
      report.counts.excludedByRights += 1;
      report.excluded.push({
        rowNumber: row.rowNumber,
        upstreamId: row.upstreamId ?? null,
        title: row.title ?? "",
        licenseId: textLic.licenseId,
        reason: textLic.reason,
      });
      continue;
    }

    // Step 2: Deduplication check
    const normalizedUrl = row.sourceUrl ? String(row.sourceUrl).trim().toLowerCase() : null;
    const prefix = origin === "synthetic" ? "synthetic" : origin === "community" ? "community" : "cuisine-libre";
    const keySlug = slugify(row.slug || row.upstreamId || row.title || `item-${row.rowNumber}`);
    const recipeKey = row.recipeKey || `${prefix}:${keySlug}`;
    const existingRecord = existingByKey.get(recipeKey);

    const primaryIngKeys = (row.ingredients || [])
      .filter((i) => i.role === "garden")
      .map((i) => String(i.ingredientKey || "").toLowerCase())
      .sort()
      .slice(0, 4)
      .join(",");
    const fingerprint = `${normalizeTextForDedup(row.title)}::${primaryIngKeys}`;

    const isSameExistingUpdate =
      existingRecord &&
      ((row.upstreamId && String(existingRecord.upstreamId) === String(row.upstreamId)) ||
        (normalizedUrl && existingRecord.sourceUrl?.trim().toLowerCase() === normalizedUrl) ||
        existingRecord.recipeKey === recipeKey);

    if (!isSameExistingUpdate) {
      if (
        (row.upstreamId && seenUpstreamIds.has(String(row.upstreamId))) ||
        (normalizedUrl && seenSourceUrls.has(normalizedUrl)) ||
        (row.title && seenFingerprints.has(fingerprint))
      ) {
        report.counts.duplicates += 1;
        report.duplicates.push({
          rowNumber: row.rowNumber,
          recipeKey,
          title: row.title,
          reason: "Duplicate upstreamId, canonical sourceUrl, or title/ingredient fingerprint",
        });
        continue;
      }
    }

    // Step 3: Normalize media with independent per-image license verification
    const normalizedMedia = [];
    for (const m of row.media || []) {
      const mLic = evaluateLicense(m.licenseId);
      if (mLic.autoImportAllowed || mLic.status === "local_only") {
        normalizedMedia.push({
          mediaKey: m.mediaKey || `photo-${normalizedMedia.length + 1}`,
          type: "image",
          localAsset: m.localAsset && isSafeRelativeAssetPath(m.localAsset) ? m.localAsset : null,
          sourceUrl: m.sourceUrl && isSafeHttpUrl(m.sourceUrl) ? m.sourceUrl : null,
          source: m.source || origin,
          rights: {
            status: mLic.status,
            licenseId: mLic.licenseId,
            licenseUrl: m.licenseUrl || mLic.info.canonicalUrl,
            credit: m.credit || null,
            sourceEvidence: m.sourceEvidence || row.rightsEvidence || "Supplied in source export",
          },
          alt: m.alt || { [sourceLocale]: row.title || "Photo" },
          reviewStatus: m.reviewStatus || "pending_review",
        });
      } else {
        // Quarantined image: do NOT bundle local asset or hotlink restricted photo; record note in manifest
        report.rightsManifestEntries.push({
          recipeKey,
          assetType: "image_excluded",
          mediaKey: m.mediaKey || "photo",
          licenseId: mLic.licenseId,
          reason: `Image excluded (${mLic.reason}); UI will display neutral placeholder`,
        });
      }
    }

    // Step 4: Normalize ingredients & crosswalk
    const isLinkOnly = textLic.status === "link_only";
    const normalizedIngredients = isLinkOnly
      ? []
      : (row.ingredients || []).map((ing) => ({
          ingredientKey: String(ing.ingredientKey || "").trim().toLowerCase(),
          originalText: String(ing.originalText || ing.ingredientKey || "").trim(),
          quantity: typeof ing.quantity === "number" && Number.isFinite(ing.quantity) ? ing.quantity : null,
          quantityMax: typeof ing.quantityMax === "number" && Number.isFinite(ing.quantityMax) ? ing.quantityMax : null,
          unit: ing.unit || null,
          ediblePart: ing.ediblePart || null,
          role: ing.role || "unknown",
          required: ing.required !== false,
          group: ing.group || null,
          preparationNote: ing.preparationNote || null,
          substitutions: Array.isArray(ing.substitutions) ? ing.substitutions : [],
          cropMapping: applyCrosswalk(ing, crosswalkMap),
        }));

    const sourceAttribution =
      row.attribution ||
      (row.author ? `${row.author} — ${sourceInfo.name}` : `${sourceInfo.name} contributor`);

    const localesObj = {
      [sourceLocale]: {
        title: String(row.title || "").trim(),
        summary: String(row.summary || "").trim(),
        steps: isLinkOnly ? [] : Array.isArray(row.steps) ? row.steps.map((s) => String(s).trim()).filter(Boolean) : [],
        conciseAdapted: Boolean(row.conciseAdapted),
        reviewStatus: "source",
        sourceRevision: String(row.sourceRevision || "1"),
      },
    };
    if (row.translations && typeof row.translations === "object") {
      for (const [loc, tData] of Object.entries(row.translations)) {
        if (SUPPORTED_LOCALES.includes(loc) && loc !== sourceLocale && tData?.title) {
          localesObj[loc] = {
            title: String(tData.title).trim(),
            summary: String(tData.summary || "").trim(),
            steps: isLinkOnly ? [] : Array.isArray(tData.steps) ? tData.steps.map((s) => String(s).trim()).filter(Boolean) : [],
            reviewStatus: tData.reviewStatus || "reviewed",
            sourceRevision: String(row.sourceRevision || "1"),
            provenance: tData.provenance || "editorial",
          };
        }
      }
    }

    const candidate = {
      recipeKey,
      upstreamId: row.upstreamId ? String(row.upstreamId) : null,
      sourceUrl: row.sourceUrl || null,
      archiveUrl: row.archiveUrl || null,
      sourceLocale,
      revision: String(row.sourceRevision || "1"),
      parentRevision: null,
      origin,
      authorCredit: row.author || null,
      rights: {
        status: textLic.status,
        licenseId: textLic.licenseId,
        licenseUrl: row.textLicenseUrl || textLic.info.canonicalUrl,
        attribution: sourceAttribution,
        sourceEvidence: row.rightsEvidence || "Documented in authorized source export",
        modifications: row.modifications || (row.conciseAdapted ? "Concise editorial formatting preserving quantities and steps" : null),
        importedAt: nowIso,
        publicExportOptIn: row.publicExportOptIn ?? null,
      },
      content: {
        baseServings: isLinkOnly ? null : row.baseServings ?? null,
        prepMinutes: row.prepMinutes ?? null,
        cookMinutes: row.cookMinutes ?? null,
        restMinutes: row.restMinutes ?? null,
        seasons: Array.isArray(row.seasons) ? row.seasons.filter((s) => SEASONS.includes(s)) : [],
        category: row.category || "main",
        tags: Array.isArray(row.tags) ? row.tags : [],
        dietary: Array.isArray(row.dietary) ? row.dietary : [],
        foodSafetyNote: row.foodSafetyNote || null,
        locales: localesObj,
      },
      ingredients: normalizedIngredients,
      media: isLinkOnly ? [] : normalizedMedia,
      editorial: {
        workflowStatus: row.workflowStatus || (isLinkOnly ? "draft" : "submitted"),
        collection: row.collection || (origin === "community" ? "community" : "curated"),
        cookedVerification: row.cookedVerification || "unverified",
        planningReady: false,
        shortlistScore: null,
        localEditsProtected: false,
        priorRevisions: [],
      },
    };

    // Validate normalized record before accepting
    const validation = validateRecipeRecord(candidate, rowLabel);
    if (!validation.valid) {
      report.counts.errors += 1;
      report.errors.push({
        rowNumber: row.rowNumber,
        recipeKey,
        errors: validation.errors,
      });
      continue;
    }

    const planning = evaluatePlanningReadiness(candidate);
    candidate.editorial.planningReady = planning.planningReady;
    candidate.editorial.planningBlockers = planning.blockers;

    if (isLinkOnly) {
      report.counts.linkOnly += 1;
    } else {
      const score = scoreRecipeCandidate(candidate, { seasonCounts: report.seasons });
      candidate.editorial.shortlistScore = score;
      if (score.totalScore >= shortlistThreshold) {
        report.counts.shortlisted += 1;
        report.shortlist.push({
          recipeKey,
          title: localesObj[sourceLocale].title,
          score: score.totalScore,
          seasons: candidate.content.seasons,
          planningReady: planning.planningReady,
          rationale: score.rationale,
          flags: score.flags,
        });
      }
    }

    // Idempotent merge: do NOT overwrite local edits or destroy prior revisions
    if (existingRecord) {
      if (existingRecord.revision === candidate.revision) {
        // Exact same upstream revision -> keep existing record intact (idempotent!)
        report.counts.preservedLocalEdits += 1;
      } else if (existingRecord.editorial?.localEditsProtected) {
        // Local edits exist: attach incoming update as a pending upstream candidate, never overwrite!
        const updated = structuredClone(existingRecord);
        updated.editorial.pendingUpstreamUpdate = {
          receivedAt: nowIso,
          incomingRevision: candidate.revision,
          candidate,
        };
        outputMap.set(recipeKey, updated);
        report.counts.preservedLocalEdits += 1;
      } else {
        // New upstream revision: archive previous revision in priorRevisions
        const priorSnapshot = {
          revision: existingRecord.revision,
          archivedAt: nowIso,
          content: existingRecord.content,
          ingredients: existingRecord.ingredients,
          rights: existingRecord.rights,
        };
        candidate.parentRevision = existingRecord.revision;
        candidate.editorial.priorRevisions = [
          ...(existingRecord.editorial?.priorRevisions || []),
          priorSnapshot,
        ];
        outputMap.set(recipeKey, candidate);
        report.counts.newRevisionsCreated += 1;
      }
    } else {
      outputMap.set(recipeKey, candidate);
    }

    report.counts.valid += 1;
    if (candidate.upstreamId) seenUpstreamIds.add(candidate.upstreamId);
    if (normalizedUrl) seenSourceUrls.add(normalizedUrl);
    if (row.title) seenFingerprints.add(fingerprint);
  }

  const finalRecipes = Array.from(outputMap.values()).sort((a, b) => a.recipeKey.localeCompare(b.recipeKey));

  // Recount final bundle editorial statistics
  for (const r of finalRecipes) {
    const planning = evaluatePlanningReadiness(r);
    if (planning.planningReady) report.counts.planningReady += 1;
    if (planning.blockers.some((b) => b.code === "missing_required_quantity" || b.code === "missing_unit_conversion")) {
      report.counts.missingQuantities += 1;
    }
    if (r.editorial?.workflowStatus === "approved") report.counts.approved += 1;
    const hasAllLocales = SUPPORTED_LOCALES.every((loc) => Boolean(r.content?.locales?.[loc]?.title));
    if (hasAllLocales) report.counts.translatedComplete += 1;
    for (const s of r.content?.seasons || []) {
      if (report.seasons[s] !== undefined) report.seasons[s] += 1;
    }

    report.rightsManifestEntries.push({
      recipeKey: r.recipeKey,
      revision: r.revision,
      origin: r.origin,
      sourceUrl: r.sourceUrl,
      textLicenseId: r.rights.licenseId,
      textLicenseUrl: r.rights.licenseUrl,
      rightsStatus: r.rights.status,
      attribution: r.rights.attribution,
      sourceEvidence: r.rights.sourceEvidence,
      media: (r.media || []).map((m) => ({
        mediaKey: m.mediaKey,
        localAsset: m.localAsset,
        licenseId: m.rights.licenseId,
        credit: m.rights.credit,
      })),
    });
  }

  // Ingredient references table (non-localized keys + names + crosswalk status)
  const ingRefMap = new Map();
  for (const r of finalRecipes) {
    for (const ing of r.ingredients || []) {
      if (!ingRefMap.has(ing.ingredientKey)) {
        const cw = crosswalkMap.get(ing.ingredientKey);
        ingRefMap.set(ing.ingredientKey, {
          ingredientKey: ing.ingredientKey,
          names: cw?.names || { fr: ing.ingredientKey, nl: ing.ingredientKey, en: ing.ingredientKey },
          cropKeys: ing.cropMapping?.cropKeys || [],
          mappingStatus: ing.cropMapping?.status || "unresolved",
        });
      }
    }
  }

  const bundle = {
    schemaVersion: RECIPE_BUNDLE_SCHEMA_VERSION,
    catalogueVersion,
    createdAt: existingBundle?.createdAt || nowIso,
    checksumSha256: null,
    sourceManifest: {
      softwareLicense: "GPL-3.0-or-later",
      contentLicensingNote:
        "Software is licensed under GPL-3.0-or-later. Recipe texts and images carry individual per-record licenses documented in each record and in the rights manifest.",
      sources: [
        {
          sourceId: sourceInfo.sourceId,
          name: sourceInfo.name,
          url: sourceInfo.url ?? null,
          acquiredAt: sourceInfo.acquiredAt || nowIso,
          method: sourceInfo.method || "local-file-import",
          notes: sourceInfo.notes || "",
        },
      ],
    },
    ingredientReferences: Array.from(ingRefMap.values()).sort((a, b) => a.ingredientKey.localeCompare(b.ingredientKey)),
    recipes: finalRecipes,
  };
  bundle.checksumSha256 = computeBundleChecksum(bundle);

  const rightsManifest = {
    format: RIGHTS_MANIFEST_FORMAT,
    catalogueVersion,
    generatedAt: nowIso,
    softwareLicense: "GPL-3.0-or-later",
    contentPolicy:
      "Per-recipe and per-image rights are tracked independently. No blanket license is applied to imported content.",
    includedRecords: report.rightsManifestEntries,
    excludedRecords: report.excluded,
  };

  return { bundle, rightsManifest, report };
}

export function formatCurationReportMarkdown(report) {
  const c = report.counts;
  const lines = [
    `# ParcOS Recipe Curation Report — ${report.catalogueVersion}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary counts",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Received | ${c.received} |`,
    `| Valid normalized | ${c.valid} |`,
    `| Excluded by rights (NC/ND/restricted) | ${c.excludedByRights} |`,
    `| Quarantined link-only (unknown license) | ${c.linkOnly} |`,
    `| Duplicates skipped | ${c.duplicates} |`,
    `| Validation errors | ${c.errors} |`,
    `| Missing quantities / unit conversions | ${c.missingQuantities} |`,
    `| Shortlisted (editorial aid) | ${c.shortlisted} |`,
    `| Approved | ${c.approved} |`,
    `| Trilingual (FR/NL/EN titles present) | ${c.translatedComplete} |`,
    `| Planning-ready | ${c.planningReady} |`,
    `| Local edits preserved | ${c.preservedLocalEdits} |`,
    `| New revisions archived | ${c.newRevisionsCreated} |`,
    "",
    "## Seasonal coverage (flexible editorial guide: 40 / 65 / 55 / 40)",
    "",
    `- Spring: ${report.seasons.spring}`,
    `- Summer: ${report.seasons.summer}`,
    `- Autumn: ${report.seasons.autumn}`,
    `- Winter: ${report.seasons.winter}`,
    "",
  ];

  if (report.shortlist.length > 0) {
    lines.push("## Shortlist candidates", "", "| Recipe | Score | Seasons | Planning-ready | Rationale / flags |", "| --- | ---: | --- | --- | --- |");
    for (const item of report.shortlist) {
      const flagText = item.flags.length ? ` [flags: ${item.flags.join(", ")}]` : "";
      lines.push(
        `| \`${item.recipeKey}\` — ${item.title} | ${item.score} | ${item.seasons.join(", ")} | ${item.planningReady ? "yes" : "no"} | ${item.rationale}${flagText} |`
      );
    }
    lines.push("");
  }

  if (report.excluded.length > 0) {
    lines.push("## Excluded by rights", "");
    for (const ex of report.excluded) {
      lines.push(`- Row ${ex.rowNumber} (${ex.title || ex.upstreamId}): \`${ex.licenseId}\` — ${ex.reason}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
