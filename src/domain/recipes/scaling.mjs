import { LOCALE_TAGS, UNIT_DEFINITIONS } from "./constants.mjs";

/**
 * Exact unit conversion within mass (g <-> kg) or volume (ml <-> cl <-> dl <-> l).
 * NEVER guesses count/bunch/culinary-spoon -> mass conversions without an explicit reviewed factor.
 */
export function normalizeExactUnit(quantity, unit) {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) {
    return { normalizedQuantity: null, normalizedUnit: null, exact: false };
  }
  const def = UNIT_DEFINITIONS[unit];
  if (!def || def.toBase === null) {
    return { normalizedQuantity: null, normalizedUnit: null, exact: false };
  }
  if (def.dimension === "mass" || def.dimension === "volume") {
    return {
      normalizedQuantity: roundMetric(quantity * def.toBase),
      normalizedUnit: def.baseUnit,
      dimension: def.dimension,
      exact: true,
    };
  }
  return {
    normalizedQuantity: roundMetric(quantity),
    normalizedUnit: unit,
    dimension: def.dimension,
    exact: false,
  };
}

export function roundMetric(value) {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1000) / 1000;
}

/**
 * Pick human-friendly metric display unit (e.g. 1200 g -> 1.2 kg, 1500 ml -> 1.5 l)
 * while preserving exact non-convertible units (piece, bunch, clove, etc.).
 */
export function toDisplayMetric(quantity, unit) {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) {
    return { quantity: null, unit: unit ?? null };
  }
  if (unit === "g" && quantity >= 1000) {
    return { quantity: roundMetric(quantity / 1000), unit: "kg" };
  }
  if (unit === "kg" && quantity > 0 && quantity < 1) {
    return { quantity: roundMetric(quantity * 1000), unit: "g" };
  }
  if (unit === "ml" && quantity >= 1000) {
    return { quantity: roundMetric(quantity / 1000), unit: "l" };
  }
  if (unit === "l" && quantity > 0 && quantity < 1) {
    return { quantity: roundMetric(quantity * 1000), unit: "ml" };
  }
  return { quantity: roundMetric(quantity), unit };
}

/**
 * Deterministic quantity scaling for a recipe revision.
 * Does NOT mutate the recipe.
 */
export function scaleRecipeQuantities(recipe, targetServings) {
  if (!recipe || typeof recipe !== "object") {
    throw new Error("Recipe object is required");
  }
  if (typeof targetServings !== "number" || !Number.isFinite(targetServings) || targetServings <= 0) {
    throw new Error("targetServings must be a finite positive number");
  }
  const baseServings = recipe.content?.baseServings;
  if (typeof baseServings !== "number" || !Number.isFinite(baseServings) || baseServings <= 0) {
    return {
      recipeKey: recipe.recipeKey,
      revision: recipe.revision,
      baseServings: null,
      targetServings,
      factor: null,
      scalable: false,
      reason: "missing_base_servings",
      ingredients: [],
      gardenDemand: [],
    };
  }

  const factor = targetServings / baseServings;
  const scaledIngredients = (recipe.ingredients || []).map((ing) => {
    const hasQty = typeof ing.quantity === "number" && Number.isFinite(ing.quantity);
    const hasMax = typeof ing.quantityMax === "number" && Number.isFinite(ing.quantityMax);

    const rawScaled = hasQty ? roundMetric(ing.quantity * factor) : null;
    const rawScaledMax = hasMax ? roundMetric(ing.quantityMax * factor) : null;

    let displayQuantity = rawScaled;
    let displayQuantityMax = rawScaledMax;
    let displayUnit = ing.unit ?? null;

    if (hasQty && !hasMax && (ing.unit === "g" || ing.unit === "kg" || ing.unit === "ml" || ing.unit === "l")) {
      const exact = normalizeExactUnit(rawScaled, ing.unit);
      const friendly = toDisplayMetric(exact.normalizedQuantity, exact.normalizedUnit);
      displayQuantity = friendly.quantity;
      displayUnit = friendly.unit;
    } else if (hasQty && hasMax && (ing.unit === "g" || ing.unit === "kg" || ing.unit === "ml" || ing.unit === "l")) {
      const exactMin = normalizeExactUnit(rawScaled, ing.unit);
      const exactMax = normalizeExactUnit(rawScaledMax, ing.unit);
      if (exactMin.normalizedUnit === "g" && exactMin.normalizedQuantity >= 1000) {
        displayQuantity = roundMetric(exactMin.normalizedQuantity / 1000);
        displayQuantityMax = roundMetric(exactMax.normalizedQuantity / 1000);
        displayUnit = "kg";
      } else if (exactMin.normalizedUnit === "ml" && exactMin.normalizedQuantity >= 1000) {
        displayQuantity = roundMetric(exactMin.normalizedQuantity / 1000);
        displayQuantityMax = roundMetric(exactMax.normalizedQuantity / 1000);
        displayUnit = "l";
      } else {
        displayQuantity = exactMin.normalizedQuantity;
        displayQuantityMax = exactMax.normalizedQuantity;
        displayUnit = exactMin.normalizedUnit;
      }
    }

    // Compute normalized mass in grams ONLY if exact mass unit OR explicit reviewed conversion factor exists.
    let demandGrams = null;
    let demandGramsMax = null;
    let conversionApplied = null;
    const unitDef = ing.unit ? UNIT_DEFINITIONS[ing.unit] : null;
    if (hasQty && unitDef?.dimension === "mass") {
      demandGrams = roundMetric(rawScaled * unitDef.toBase);
      demandGramsMax = hasMax ? roundMetric(rawScaledMax * unitDef.toBase) : null;
      conversionApplied = "exact_mass";
    } else if (
      hasQty &&
      ing.cropMapping?.conversion?.reviewed === true &&
      typeof ing.cropMapping.conversion.factorToGrams === "number" &&
      Number.isFinite(ing.cropMapping.conversion.factorToGrams)
    ) {
      demandGrams = roundMetric(rawScaled * ing.cropMapping.conversion.factorToGrams);
      demandGramsMax = hasMax ? roundMetric(rawScaledMax * ing.cropMapping.conversion.factorToGrams) : null;
      conversionApplied = "reviewed_factor";
    }

    return {
      ingredientKey: ing.ingredientKey,
      originalText: ing.originalText,
      role: ing.role,
      required: Boolean(ing.required),
      ediblePart: ing.ediblePart ?? null,
      group: ing.group ?? null,
      preparationNote: ing.preparationNote ?? null,
      originalQuantity: ing.quantity ?? null,
      originalQuantityMax: ing.quantityMax ?? null,
      originalUnit: ing.unit ?? null,
      scaledQuantity: displayQuantity,
      scaledQuantityMax: displayQuantityMax,
      scaledUnit: displayUnit,
      demandGrams,
      demandGramsMax,
      conversionApplied,
      cropKeys: ing.cropMapping?.cropKeys ?? [],
      mappingStatus: ing.cropMapping?.status ?? "unresolved",
    };
  });

  // Pantry ingredients NEVER create garden demand.
  const gardenDemand = scaledIngredients.filter((item) => item.role === "garden");

  return {
    recipeKey: recipe.recipeKey,
    revision: recipe.revision,
    baseServings,
    targetServings,
    factor: roundMetric(factor),
    scalable: true,
    ingredients: scaledIngredients,
    gardenDemand,
  };
}

/**
 * Evaluate whether a recipe revision is planning-ready for M3 demand aggregation.
 * Display-only or link-only recipes remain browsable with clear reasons why they cannot drive production.
 */
export function evaluatePlanningReadiness(recipe) {
  const blockers = [];
  const warnings = [];

  if (!recipe || typeof recipe !== "object") {
    return { planningReady: false, blockers: [{ code: "invalid_recipe", message: "Invalid recipe record" }], warnings };
  }

  if (recipe.rights?.status === "link_only") {
    blockers.push({
      code: "link_only_recipe",
      message: "Link-only candidate has no structured recipe text or quantities for demand calculation",
    });
  } else if (recipe.rights?.status === "excluded" || recipe.rights?.status === "review_required") {
    blockers.push({
      code: "rights_unverified",
      message: `Rights status "${recipe.rights.status}" blocks planning use`,
    });
  }

  if (typeof recipe.content?.baseServings !== "number" || !Number.isFinite(recipe.content.baseServings) || recipe.content.baseServings <= 0) {
    blockers.push({
      code: "missing_base_servings",
      message: "Base servings must be defined to scale demand",
    });
  }

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const gardenIngredients = ingredients.filter((i) => i.role === "garden");
  if (gardenIngredients.length === 0) {
    blockers.push({
      code: "no_garden_ingredients",
      message: "Recipe has no garden-supplied ingredients to drive cultivation demand",
    });
  }

  for (const ing of ingredients) {
    if (ing.role === "pantry") continue; // Pantry never drives or blocks garden planning
    if (ing.role === "unknown" && ing.required) {
      blockers.push({
        code: "unclassified_required_ingredient",
        ingredientKey: ing.ingredientKey,
        message: `Required ingredient "${ing.ingredientKey}" has unknown garden/pantry classification`,
      });
      continue;
    }
    if (ing.role !== "garden") continue;

    const hasQty = typeof ing.quantity === "number" && Number.isFinite(ing.quantity) && ing.quantity > 0;
    const unitDef = ing.unit ? UNIT_DEFINITIONS[ing.unit] : null;
    const hasMassOrReviewedConversion =
      unitDef?.dimension === "mass" ||
      (ing.cropMapping?.conversion?.reviewed === true &&
        typeof ing.cropMapping.conversion.factorToGrams === "number" &&
        ing.cropMapping.conversion.factorToGrams > 0);
    const hasReviewedCropMapping =
      ing.cropMapping?.status === "reviewed" &&
      Array.isArray(ing.cropMapping.cropKeys) &&
      ing.cropMapping.cropKeys.length > 0;

    if (ing.required) {
      if (!hasQty || !unitDef) {
        blockers.push({
          code: "missing_required_quantity",
          ingredientKey: ing.ingredientKey,
          message: `Required garden ingredient "${ing.ingredientKey}" is missing a finite quantity or supported unit`,
        });
      } else if (!hasMassOrReviewedConversion) {
        blockers.push({
          code: "missing_unit_conversion",
          ingredientKey: ing.ingredientKey,
          unit: ing.unit,
          message: `Required garden ingredient "${ing.ingredientKey}" uses "${ing.unit}" without a reviewed mass conversion factor`,
        });
      }
      if (!hasReviewedCropMapping) {
        blockers.push({
          code: "unmapped_crop",
          ingredientKey: ing.ingredientKey,
          mappingStatus: ing.cropMapping?.status ?? "unresolved",
          message: `Required garden ingredient "${ing.ingredientKey}" lacks a reviewed M2 crop mapping`,
        });
      }
    } else {
      if (!hasQty || !hasReviewedCropMapping) {
        warnings.push({
          code: "optional_garden_ingredient_incomplete",
          ingredientKey: ing.ingredientKey,
          message: `Optional garden ingredient "${ing.ingredientKey}" has incomplete quantity or crop mapping`,
        });
      }
    }
  }

  return {
    planningReady: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function formatLocalizedNumber(value, locale = "fr") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const tag = LOCALE_TAGS[locale] || "fr-BE";
  return new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(value);
}
