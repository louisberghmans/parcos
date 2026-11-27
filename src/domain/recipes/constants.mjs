export const RECIPE_BUNDLE_SCHEMA_VERSION = "parcos-recipe-bundle-v1";
export const TRANSLATION_EXCHANGE_FORMAT = "parcos-recipe-translations-v1";
export const RIGHTS_MANIFEST_FORMAT = "parcos-recipe-rights-manifest-v1";

export const SUPPORTED_LOCALES = Object.freeze(["fr", "nl", "en"]);
export const LOCALE_TAGS = Object.freeze({
  fr: "fr-BE",
  nl: "nl-BE",
  en: "en-GB",
});

export const SEASONS = Object.freeze(["spring", "summer", "autumn", "winter"]);
export const COLLECTIONS = Object.freeze(["curated", "community"]);
export const ORIGINS = Object.freeze(["upstream", "community", "original", "synthetic"]);

export const CATEGORIES = Object.freeze([
  "soup",
  "salad",
  "tart_savory",
  "gratin",
  "main",
  "side",
  "spread_condiment",
  "preserve_safe",
  "other",
]);

export const DIETARY_FLAGS = Object.freeze([
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
]);

export const INGREDIENT_ROLES = Object.freeze([
  "garden",
  "pantry",
  "optional",
  "unknown",
]);

export const MAPPING_STATUSES = Object.freeze([
  "reviewed",
  "proposed",
  "unresolved",
  "not_applicable",
]);

export const WORKFLOW_STATUSES = Object.freeze([
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
  "archived",
]);

export const RIGHTS_STATUSES = Object.freeze([
  "cleared",
  "link_only",
  "review_required",
  "excluded",
  "local_only",
]);

export const TRANSLATION_REVIEW_STATUSES = Object.freeze([
  "source",
  "missing",
  "stale",
  "machine_unreviewed",
  "reviewed",
]);

export const COOKED_VERIFICATION_STATUSES = Object.freeze([
  "unverified",
  "cooked_feedback",
  "tested_reviewed",
]);

/**
 * Licenses cleared for automatic ingestion / adaptation (with required attribution).
 * NC, ND, ALL-RIGHTS-RESERVED, and UNKNOWN are explicitly NOT cleared for automatic import.
 */
export const LICENSE_CATALOG = Object.freeze({
  "CC0-1.0": {
    category: "public_domain",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: false,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  "PDM-1.0": {
    category: "public_domain",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: false,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  },
  "CC-BY-4.0": {
    category: "cc_by",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  "CC-BY-3.0": {
    category: "cc_by",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/licenses/by/3.0/",
  },
  "CC-BY-SA-4.0": {
    category: "cc_by_sa",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: true,
    shareAlike: true,
    canonicalUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  "CC-BY-SA-3.0": {
    category: "cc_by_sa",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: true,
    shareAlike: true,
    canonicalUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
  },
  "CC-BY-SA-2.0-FR": {
    category: "cc_by_sa",
    autoImportAllowed: true,
    adaptationAllowed: true,
    attributionRequired: true,
    shareAlike: true,
    canonicalUrl: "https://creativecommons.org/licenses/by-sa/2.0/fr/",
  },
  "LOCAL-COMMUNITY-ONLY": {
    category: "local_only",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: null,
  },
  "CC-BY-NC-4.0": {
    category: "restricted_nc",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  "CC-BY-NC-SA-4.0": {
    category: "restricted_nc",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: true,
    canonicalUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  },
  "CC-BY-ND-4.0": {
    category: "restricted_nd",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: "https://creativecommons.org/licenses/by-nd/4.0/",
  },
  "ALL-RIGHTS-RESERVED": {
    category: "proprietary",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: null,
  },
  UNKNOWN: {
    category: "unknown",
    autoImportAllowed: false,
    adaptationAllowed: false,
    attributionRequired: true,
    shareAlike: false,
    canonicalUrl: null,
  },
});

export const SAFE_IMAGE_EXTENSIONS = Object.freeze([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

/**
 * Units supported in structured recipe ingredients.
 * Exact conversions exist ONLY within mass (g <-> kg) and volume (ml <-> cl <-> dl <-> l).
 * Count, bunch, and culinary spoon/pinch units NEVER silently convert to mass.
 */
export const UNIT_DEFINITIONS = Object.freeze({
  g: { dimension: "mass", baseUnit: "g", toBase: 1 },
  kg: { dimension: "mass", baseUnit: "g", toBase: 1000 },
  ml: { dimension: "volume", baseUnit: "ml", toBase: 1 },
  cl: { dimension: "volume", baseUnit: "ml", toBase: 10 },
  dl: { dimension: "volume", baseUnit: "ml", toBase: 100 },
  l: { dimension: "volume", baseUnit: "ml", toBase: 1000 },
  piece: { dimension: "count", baseUnit: "piece", toBase: 1 },
  clove: { dimension: "count", baseUnit: "clove", toBase: 1 },
  stalk: { dimension: "count", baseUnit: "stalk", toBase: 1 },
  leaf: { dimension: "count", baseUnit: "leaf", toBase: 1 },
  head: { dimension: "count", baseUnit: "head", toBase: 1 },
  bunch: { dimension: "bunch", baseUnit: "bunch", toBase: 1 },
  sprig: { dimension: "bunch", baseUnit: "sprig", toBase: 1 },
  tbsp: { dimension: "culinary_volume", baseUnit: "tbsp", toBase: 1 },
  tsp: { dimension: "culinary_volume", baseUnit: "tsp", toBase: 1 },
  pinch: { dimension: "unquantified", baseUnit: "pinch", toBase: null },
  to_taste: { dimension: "unquantified", baseUnit: "to_taste", toBase: null },
});

export const DEFAULT_SCORING_WEIGHTS = Object.freeze({
  culinaryAppeal: 0.30,
  belgianGardenRelevance: 0.25,
  produceQuantityImpact: 0.15,
  familyAppeal: 0.10,
  accessibilitySimplicity: 0.10,
  seasonalDiversity: 0.10,
});

export const BELGIAN_PRIORITY_INGREDIENTS = new Set([
  "tomato",
  "courgette",
  "lettuce",
  "spinach",
  "chard",
  "carrot",
  "beetroot",
  "potato",
  "green_bean",
  "pea",
  "cabbage",
  "kale",
  "kohlrabi",
  "leek",
  "onion",
  "shallot",
  "garlic",
  "aubergine",
  "cucumber",
  "squash",
  "pumpkin",
  "bell_pepper",
  "turnip",
  "celeriac",
  "jerusalem_artichoke",
  "radish",
  "fennel",
  "parsley",
  "basil",
  "chive",
  "thyme",
  "rosemary",
  "mint",
  "coriander",
  "dill",
  "rhubarb",
  "strawberry",
]);

export const SEASONAL_EDITORIAL_GUIDE = Object.freeze({
  spring: 40,
  summer: 65,
  autumn: 55,
  winter: 40,
});
