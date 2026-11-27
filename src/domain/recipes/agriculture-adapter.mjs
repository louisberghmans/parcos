/**
 * Adapter conforming to docs/agriculture-recipe-contract.md (merged in PR #14, ede023a).
 * Consumes the authenticated GET /api/agriculture/catalogue payload ({ crop, variety })
 * without assuming provisional crosswalk keys exist in an installation.
 */

export const AGRICULTURE_QUANTITY_UNITS = Object.freeze(["g", "kg", "piece", "bunch", "ml", "l"]);
export const AGRICULTURE_CROP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/**
 * Resolve a recipe ingredient against a live GET /api/agriculture/catalogue payload.
 * - Persists confirmed stable cropId (opaque 1-80 char ID) or sets cropId: null when absent.
 * - Validates ediblePart against crop.edibleParts when both are known; flags mismatches for review.
 * - Retains archived or missing linked crop IDs with a reviewFlag instead of silently erasing them.
 */
export function resolveIngredientAgainstCatalogue(ingredient, agriculturalCatalogue) {
  const crops = Array.isArray(agriculturalCatalogue?.crop) ? agriculturalCatalogue.crop : [];
  const cropsById = new Map(crops.map((c) => [c.id, c]));

  const declaredCropId = ingredient?.cropMapping?.cropId ?? null;
  const candidateKeys = Array.isArray(ingredient?.cropMapping?.cropKeys) ? ingredient.cropMapping.cropKeys : [];
  const ediblePart = ingredient?.ediblePart ?? ingredient?.cropMapping?.ediblePart ?? null;

  if (ingredient?.role === "pantry") {
    return {
      ingredientKey: ingredient.ingredientKey,
      cropId: null,
      ediblePart: null,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit ?? null,
      status: "not_applicable",
      reviewFlag: null,
      crop: null,
    };
  }

  let matchedCrop = null;
  let retainedCropId = declaredCropId;

  if (declaredCropId) {
    matchedCrop = cropsById.get(declaredCropId) || null;
  } else {
    for (const candidate of candidateKeys) {
      const found = cropsById.get(candidate);
      if (found) {
        matchedCrop = found;
        retainedCropId = found.id;
        break;
      }
    }
  }

  // Case 1: Declared or candidate crop is not present in reviewed member catalogue (unresolved or archived)
  if (!matchedCrop) {
    const hadReference = Boolean(declaredCropId || candidateKeys.length > 0);
    return {
      ingredientKey: ingredient?.ingredientKey ?? null,
      cropId: declaredCropId, // retain confirmed link if previously set, else null
      ediblePart,
      quantity: ingredient?.quantity ?? null,
      unit: ingredient?.unit ?? null,
      status: hadReference ? "archived_or_missing_crop" : "unresolved",
      reviewFlag: hadReference
        ? `Linked crop (${declaredCropId || candidateKeys.join(", ")}) not found in reviewed /api/agriculture/catalogue (archived or not yet installed)`
        : "No crop link assigned; review required",
      crop: null,
    };
  }

  // Case 2: Crop exists, verify ediblePart against crop.edibleParts when specified
  const allowedParts = Array.isArray(matchedCrop.edibleParts) ? matchedCrop.edibleParts : [];
  if (ediblePart !== null && allowedParts.length > 0 && !allowedParts.includes(ediblePart)) {
    return {
      ingredientKey: ingredient.ingredientKey,
      cropId: matchedCrop.id,
      ediblePart,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit ?? null,
      status: "edible_part_mismatch",
      reviewFlag: `Edible part "${ediblePart}" is not in crop "${matchedCrop.id}" edibleParts [${allowedParts.join(", ")}]`,
      crop: matchedCrop,
    };
  }

  // Case 3: Check unit compatibility with advertised agriculture quantityUnits
  const unitCompatible = ingredient.unit ? AGRICULTURE_QUANTITY_UNITS.includes(ingredient.unit) : false;

  return {
    ingredientKey: ingredient.ingredientKey,
    cropId: matchedCrop.id,
    ediblePart,
    quantity: ingredient.quantity ?? null,
    unit: ingredient.unit ?? null,
    status: "resolved",
    reviewFlag: unitCompatible ? null : `Unit "${ingredient.unit ?? "none"}" requires a reviewed conversion to [${AGRICULTURE_QUANTITY_UNITS.join(", ")}]`,
    crop: matchedCrop,
  };
}

/**
 * Project a resolved ingredient to the exact M2 contract mapping shape.
 */
export function toAgricultureIngredientMapping(ingredientId, resolved) {
  return {
    ingredientId: String(ingredientId),
    cropId: resolved.cropId ?? null,
    ediblePart: resolved.ediblePart ?? null,
    quantity: resolved.quantity ?? null,
    unit: resolved.unit ?? null,
  };
}

/**
 * Compute typical local availability months (1..12) from M2 crop.availability records.
 * Strictly separates typical local availability from measured and forecast harvests.
 * Returns status "unknown" if any required garden ingredient is unresolved or has availability === null.
 */
export function evaluateRecipeTypicalAvailability(recipe, agriculturalCatalogue) {
  const requiredGarden = (recipe?.ingredients || []).filter((i) => i.role === "garden" && i.required);
  if (requiredGarden.length === 0) {
    return {
      kind: "typical_local_availability",
      status: "unknown",
      months: [],
      contexts: [],
      missingIngredients: [],
      note: "No required garden ingredients to evaluate",
    };
  }

  let overlappingMonths = null;
  const contexts = new Set();
  const missingIngredients = [];

  for (const ing of requiredGarden) {
    const resolved = resolveIngredientAgainstCatalogue(ing, agriculturalCatalogue);
    if (resolved.status !== "resolved" || !resolved.crop?.availability?.months?.length) {
      missingIngredients.push({
        ingredientKey: ing.ingredientKey,
        reason: resolved.reviewFlag || "Crop typical availability is unknown (availability: null)",
      });
      continue;
    }
    const monthsSet = new Set(resolved.crop.availability.months);
    if (resolved.crop.availability.context) contexts.add(resolved.crop.availability.context);
    if (overlappingMonths === null) {
      overlappingMonths = monthsSet;
    } else {
      overlappingMonths = new Set([...overlappingMonths].filter((m) => monthsSet.has(m)));
    }
  }

  if (missingIngredients.length > 0 || overlappingMonths === null) {
    return {
      kind: "typical_local_availability",
      status: "unknown",
      months: [],
      contexts: [...contexts],
      missingIngredients,
      note: "Typical local availability cannot be fully determined until all required garden crops have reviewed availability windows; separate from measured and forecast harvests.",
    };
  }

  const months = [...overlappingMonths].sort((a, b) => a - b);
  return {
    kind: "typical_local_availability",
    status: months.length > 0 ? "available" : "no_overlap",
    months,
    contexts: [...contexts],
    missingIngredients: [],
    note: "Typical local availability derived from reviewed M2 crop profiles; not a measured harvest or forecast guarantee.",
  };
}
