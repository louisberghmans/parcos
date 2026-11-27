import { SUPPORTED_LOCALES, TRANSLATION_EXCHANGE_FORMAT } from "./constants.mjs";

const ALLOWED_TRANSLATION_FIELDS = new Set(["title", "summary", "steps", "foodSafetyNote"]);

/**
 * Extract numeric tokens (quantities, temperatures, times) from text to detect
 * accidental quantity drops or numeric drift during AI/external translation.
 */
export function extractNumericTokens(text) {
  if (typeof text !== "string") return [];
  const matches = text.match(/\d+(?:[.,]\d+)?/g) || [];
  return matches.map((token) => Number(token.replace(",", "."))).filter((n) => Number.isFinite(n));
}

function numericTokensMatch(sourceText, translatedText) {
  const srcNums = extractNumericTokens(sourceText);
  if (srcNums.length === 0) return true;
  const tgtNums = extractNumericTokens(translatedText);
  if (srcNums.length !== tgtNums.length) return false;
  const sortedSrc = [...srcNums].sort((a, b) => a - b);
  const sortedTgt = [...tgtNums].sort((a, b) => a - b);
  return sortedSrc.every((val, idx) => Math.abs(val - sortedTgt[idx]) < 1e-6);
}

/**
 * Provider-neutral export of missing or stale recipe translations.
 * NEVER includes usernames, member IDs, private drafts, or credentials.
 */
export function exportRecipeTranslations(bundle, { glossary = [], targetLocales = SUPPORTED_LOCALES, exportedAt = new Date().toISOString() } = {}) {
  const items = [];
  const relevantIngredientKeys = new Set();

  for (const recipe of bundle.recipes || []) {
    // Never export private drafts or unapproved community drafts to external AI tools by default
    if (recipe.origin === "community" && recipe.editorial?.workflowStatus !== "approved") {
      continue;
    }
    if (recipe.rights?.status === "excluded" || recipe.rights?.status === "review_required") {
      continue;
    }

    const sourceLocale = recipe.sourceLocale;
    const sourceContent = recipe.content?.locales?.[sourceLocale];
    if (!sourceContent) continue;

    for (const ing of recipe.ingredients || []) {
      relevantIngredientKeys.add(ing.ingredientKey);
    }

    const targets = targetLocales.filter((loc) => SUPPORTED_LOCALES.includes(loc) && loc !== sourceLocale);
    for (const targetLocale of targets) {
      const existing = recipe.content?.locales?.[targetLocale];
      const isStale = existing && existing.sourceRevision && existing.sourceRevision !== recipe.revision;
      const status = !existing ? "missing" : isStale ? "stale" : null;
      if (!status) continue;

      items.push({
        recipeKey: recipe.recipeKey,
        sourceRevision: recipe.revision,
        sourceLocale,
        targetLocale,
        field: "title",
        status,
        sourceText: sourceContent.title,
        translation: "",
      });

      if (sourceContent.summary) {
        items.push({
          recipeKey: recipe.recipeKey,
          sourceRevision: recipe.revision,
          sourceLocale,
          targetLocale,
          field: "summary",
          status,
          sourceText: sourceContent.summary,
          translation: "",
        });
      }

      if (Array.isArray(sourceContent.steps) && sourceContent.steps.length > 0) {
        items.push({
          recipeKey: recipe.recipeKey,
          sourceRevision: recipe.revision,
          sourceLocale,
          targetLocale,
          field: "steps",
          status,
          sourceSteps: sourceContent.steps,
          translatedSteps: [],
        });
      }

      const safetySource = recipe.content?.foodSafetyNote?.[sourceLocale];
      if (safetySource) {
        items.push({
          recipeKey: recipe.recipeKey,
          sourceRevision: recipe.revision,
          sourceLocale,
          targetLocale,
          field: "foodSafetyNote",
          status,
          sourceText: safetySource,
          translation: "",
        });
      }
    }
  }

  const scopedGlossary = glossary.filter(
    (entry) => entry.alwaysInclude || relevantIngredientKeys.has(entry.key)
  );

  return {
    format: TRANSLATION_EXCHANGE_FORMAT,
    exportedAt,
    catalogueVersion: bundle.catalogueVersion,
    localePolicy: {
      fr: "French (natural culinary phrasing)",
      nl: "Belgian Dutch / Vlaams (e.g. courgette, prei, snijbiet, knolselder, prinsessenboon, eetlepel, koffielepel)",
      en: "English (clear metric kitchen language)",
    },
    instructions:
      "Translate only the requested fields from sourceLocale to targetLocale. Keep all numbers, temperatures, durations, step counts, IDs, and sourceRevision unchanged. Do not add or remove items.",
    glossary: scopedGlossary,
    items,
  };
}

/**
 * Import validated translation results into a bundle.
 * Rejects stale revisions, unknown fields, missing/extra steps, mutated numerical tokens,
 * and protects human-reviewed translations unless overwriteReviewed=true.
 */
export function importRecipeTranslations(
  bundle,
  payload,
  {
    provenance = "external_batch_import",
    markAsReviewed = false,
    overwriteReviewed = false,
    importedAt = new Date().toISOString(),
  } = {}
) {
  if (!payload || payload.format !== TRANSLATION_EXCHANGE_FORMAT || !Array.isArray(payload.items)) {
    throw new Error(`Invalid translation payload: expected format "${TRANSLATION_EXCHANGE_FORMAT}" with items array`);
  }

  const nextBundle = structuredClone(bundle);
  const recipesByKey = new Map(nextBundle.recipes.map((r) => [r.recipeKey, r]));

  const summary = {
    imported: 0,
    skippedEmpty: 0,
    rejectedStale: 0,
    rejectedUnknownRecipe: 0,
    rejectedUnknownField: 0,
    rejectedStepMismatch: 0,
    rejectedNumericDrift: 0,
    protectedReviewed: 0,
    discrepancies: [],
  };

  for (const item of payload.items) {
    if (!item || typeof item !== "object") continue;

    if (!ALLOWED_TRANSLATION_FIELDS.has(item.field)) {
      summary.rejectedUnknownField += 1;
      summary.discrepancies.push({
        recipeKey: item.recipeKey,
        field: item.field,
        code: "unknown_field",
        message: `Unknown translatable field "${item.field}"`,
      });
      continue;
    }

    if (!SUPPORTED_LOCALES.includes(item.targetLocale)) {
      summary.rejectedUnknownField += 1;
      summary.discrepancies.push({
        recipeKey: item.recipeKey,
        field: item.field,
        code: "unsupported_locale",
        message: `Unsupported targetLocale "${item.targetLocale}"`,
      });
      continue;
    }

    const recipe = recipesByKey.get(item.recipeKey);
    if (!recipe) {
      summary.rejectedUnknownRecipe += 1;
      summary.discrepancies.push({
        recipeKey: item.recipeKey,
        field: item.field,
        code: "unknown_recipe",
        message: `Recipe "${item.recipeKey}" not found in bundle`,
      });
      continue;
    }

    if (item.sourceRevision !== recipe.revision || item.sourceLocale !== recipe.sourceLocale) {
      summary.rejectedStale += 1;
      summary.discrepancies.push({
        recipeKey: item.recipeKey,
        field: item.field,
        targetLocale: item.targetLocale,
        code: "stale_revision",
        message: `Stale sourceRevision "${item.sourceRevision}" (current is "${recipe.revision}")`,
      });
      continue;
    }

    const currentLocaleObj = recipe.content.locales[item.targetLocale];
    if (currentLocaleObj?.reviewStatus === "reviewed" && !overwriteReviewed && currentLocaleObj.sourceRevision === recipe.revision) {
      summary.protectedReviewed += 1;
      continue;
    }

    const sourceContent = recipe.content.locales[recipe.sourceLocale];
    const targetReviewStatus = markAsReviewed ? "reviewed" : "machine_unreviewed";

    if (item.field === "steps") {
      if (!Array.isArray(item.translatedSteps) || item.translatedSteps.length === 0) {
        summary.skippedEmpty += 1;
        continue;
      }
      const expectedSteps = sourceContent?.steps || [];
      if (item.translatedSteps.length !== expectedSteps.length || item.translatedSteps.some((s) => typeof s !== "string" || !s.trim())) {
        summary.rejectedStepMismatch += 1;
        summary.discrepancies.push({
          recipeKey: item.recipeKey,
          field: "steps",
          targetLocale: item.targetLocale,
          code: "step_count_mismatch",
          message: `Expected ${expectedSteps.length} non-empty steps, received ${item.translatedSteps.length}`,
        });
        continue;
      }
      let driftFound = false;
      for (let i = 0; i < expectedSteps.length; i += 1) {
        if (!numericTokensMatch(expectedSteps[i], item.translatedSteps[i])) {
          driftFound = true;
          summary.rejectedNumericDrift += 1;
          summary.discrepancies.push({
            recipeKey: item.recipeKey,
            field: `steps[${i}]`,
            targetLocale: item.targetLocale,
            code: "numeric_drift",
            message: `Numeric values in step ${i + 1} changed during translation (source: [${extractNumericTokens(expectedSteps[i]).join(", ")}], translated: [${extractNumericTokens(item.translatedSteps[i]).join(", ")}])`,
          });
          break;
        }
      }
      if (driftFound) continue;

      recipe.content.locales[item.targetLocale] = {
        ...(recipe.content.locales[item.targetLocale] || { title: sourceContent.title, summary: "" }),
        steps: item.translatedSteps.map((s) => s.trim()),
        sourceRevision: recipe.revision,
        reviewStatus: targetReviewStatus,
        provenance,
        translatedAt: importedAt,
      };
      summary.imported += 1;
      continue;
    }

    if (typeof item.translation !== "string" || !item.translation.trim()) {
      summary.skippedEmpty += 1;
      continue;
    }

    const sourceText =
      item.field === "foodSafetyNote"
        ? recipe.content.foodSafetyNote?.[recipe.sourceLocale] || ""
        : sourceContent?.[item.field] || "";

    if (!numericTokensMatch(sourceText, item.translation)) {
      summary.rejectedNumericDrift += 1;
      summary.discrepancies.push({
        recipeKey: item.recipeKey,
        field: item.field,
        targetLocale: item.targetLocale,
        code: "numeric_drift",
        message: `Numeric values in "${item.field}" changed during translation`,
      });
      continue;
    }

    if (item.field === "foodSafetyNote") {
      recipe.content.foodSafetyNote = {
        ...(recipe.content.foodSafetyNote || {}),
        [item.targetLocale]: item.translation.trim(),
      };
      summary.imported += 1;
      continue;
    }

    recipe.content.locales[item.targetLocale] = {
      ...(recipe.content.locales[item.targetLocale] || { title: sourceContent.title, summary: "", steps: [] }),
      [item.field]: item.translation.trim(),
      sourceRevision: recipe.revision,
      reviewStatus: targetReviewStatus,
      provenance,
      translatedAt: importedAt,
    };
    summary.imported += 1;
  }

  return { bundle: nextBundle, summary };
}

/**
 * Resolve localized recipe content with safe fallback to sourceLocale when missing or stale.
 */
export function resolveLocalizedRecipeContent(recipe, locale = "fr") {
  const sourceLocale = recipe.sourceLocale || "fr";
  const source = recipe.content?.locales?.[sourceLocale] || { title: recipe.recipeKey, summary: "", steps: [] };
  if (locale === sourceLocale) {
    return {
      ...source,
      displayedLocale: sourceLocale,
      fallbackUsed: false,
      reviewStatus: "source",
    };
  }
  const localized = recipe.content?.locales?.[locale];
  const isCurrent = localized && (!localized.sourceRevision || localized.sourceRevision === recipe.revision);
  if (isCurrent && localized.title) {
    return {
      title: localized.title,
      summary: localized.summary || source.summary || "",
      steps: Array.isArray(localized.steps) && localized.steps.length > 0 ? localized.steps : source.steps || [],
      displayedLocale: locale,
      fallbackUsed: !(Array.isArray(localized.steps) && localized.steps.length > 0) && (source.steps || []).length > 0,
      reviewStatus: localized.reviewStatus || "machine_unreviewed",
    };
  }
  return {
    ...source,
    displayedLocale: sourceLocale,
    fallbackUsed: true,
    reviewStatus: localized ? "stale" : "missing",
  };
}
