import { extname } from "node:path";
import {
  CATEGORIES,
  COLLECTIONS,
  COOKED_VERIFICATION_STATUSES,
  DIETARY_FLAGS,
  INGREDIENT_ROLES,
  LICENSE_CATALOG,
  MAPPING_STATUSES,
  ORIGINS,
  RECIPE_BUNDLE_SCHEMA_VERSION,
  RIGHTS_STATUSES,
  SAFE_IMAGE_EXTENSIONS,
  SEASONS,
  SUPPORTED_LOCALES,
  TRANSLATION_REVIEW_STATUSES,
  UNIT_DEFINITIONS,
  WORKFLOW_STATUSES,
} from "./constants.mjs";

const RECIPE_KEY_PATTERN = /^[a-z0-9]+:[a-z0-9][a-z0-9_-]{1,78}$/;
const SIMPLE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REVISION_PATTERN = /^[a-zA-Z0-9._-]{1,40}$/;

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (!parsed.hostname) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isSafeRelativeAssetPath(assetPath) {
  if (typeof assetPath !== "string" || assetPath.length === 0 || assetPath.length > 256) {
    return false;
  }
  if (assetPath.includes("\\") || assetPath.includes("\0") || assetPath.startsWith("/") || assetPath.startsWith(".")) {
    return false;
  }
  const segments = assetPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  const ext = extname(assetPath).toLowerCase();
  if (!SAFE_IMAGE_EXTENSIONS.includes(ext)) {
    return false;
  }
  return /^[a-zA-Z0-9._/-]+$/.test(assetPath);
}

export function evaluateLicense(licenseId) {
  if (typeof licenseId !== "string" || !licenseId.trim()) {
    return {
      licenseId: "UNKNOWN",
      known: false,
      autoImportAllowed: false,
      status: "link_only",
      reason: "Missing license identifier",
      info: LICENSE_CATALOG.UNKNOWN,
    };
  }
  const normalized = licenseId.trim().toUpperCase();
  const info = LICENSE_CATALOG[normalized];
  if (!info) {
    return {
      licenseId: normalized,
      known: false,
      autoImportAllowed: false,
      status: "review_required",
      reason: `Unrecognized license "${normalized}" requires human rights review`,
      info: LICENSE_CATALOG.UNKNOWN,
    };
  }
  if (info.autoImportAllowed) {
    return {
      licenseId: normalized,
      known: true,
      autoImportAllowed: true,
      status: "cleared",
      reason: null,
      info,
    };
  }
  if (normalized === "LOCAL-COMMUNITY-ONLY") {
    return {
      licenseId: normalized,
      known: true,
      autoImportAllowed: false,
      status: "local_only",
      reason: "Local-only community contribution; requires separate explicit open-license opt-in before external export",
      info,
    };
  }
  if (normalized === "UNKNOWN") {
    return {
      licenseId: normalized,
      known: true,
      autoImportAllowed: false,
      status: "link_only",
      reason: "License unknown; quarantine as link-only candidate without copying prose or images",
      info,
    };
  }
  return {
    licenseId: normalized,
    known: true,
    autoImportAllowed: false,
    status: "excluded",
    reason: `License "${normalized}" (${info.category}) is not cleared for automatic import/adaptation`,
    info,
  };
}

function validateFinitePositive(value, path, errors, { allowZero = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ path, code: "nonfinite_number", message: `${path} must be a finite number` });
    return false;
  }
  if (allowZero ? value < 0 : value <= 0) {
    errors.push({
      path,
      code: "invalid_number_range",
      message: `${path} must be ${allowZero ? ">= 0" : "> 0"}`,
    });
    return false;
  }
  return true;
}

export function validateMediaItem(media, path, errors) {
  if (!isPlainObject(media)) {
    errors.push({ path, code: "invalid_type", message: `${path} must be an object` });
    return;
  }
  if (typeof media.mediaKey !== "string" || !SIMPLE_KEY_PATTERN.test(media.mediaKey)) {
    errors.push({ path: `${path}.mediaKey`, code: "invalid_key", message: "mediaKey must match [a-z0-9][a-z0-9_-]{0,63}" });
  }
  if (media.type !== "image") {
    errors.push({ path: `${path}.type`, code: "invalid_media_type", message: "Only image media is supported in v1" });
  }
  if (media.localAsset !== null && media.localAsset !== undefined) {
    if (!isSafeRelativeAssetPath(media.localAsset)) {
      errors.push({
        path: `${path}.localAsset`,
        code: "unsafe_asset_path",
        message: "localAsset must be a safe relative image path (no traversal, no SVG/executable)",
      });
    }
  }
  if (media.sourceUrl !== null && media.sourceUrl !== undefined && !isSafeHttpUrl(media.sourceUrl)) {
    errors.push({ path: `${path}.sourceUrl`, code: "unsafe_url", message: "Media sourceUrl must be a safe HTTP/HTTPS URL" });
  }
  if (!isPlainObject(media.rights)) {
    errors.push({ path: `${path}.rights`, code: "missing_rights", message: "Every media item must declare independent rights metadata" });
  } else {
    const lic = evaluateLicense(media.rights.licenseId);
    if (media.localAsset && !lic.autoImportAllowed && lic.status !== "local_only") {
      errors.push({
        path: `${path}.rights.licenseId`,
        code: "uncleared_media_license",
        message: `Local media asset cannot use uncleared license "${media.rights.licenseId ?? ""}"`,
      });
    }
    if (lic.info.attributionRequired && (!media.rights.credit || !String(media.rights.credit).trim())) {
      errors.push({
        path: `${path}.rights.credit`,
        code: "missing_attribution",
        message: `Media license "${lic.licenseId}" requires explicit author/source credit`,
      });
    }
    if (media.rights.licenseUrl !== null && media.rights.licenseUrl !== undefined && !isSafeHttpUrl(media.rights.licenseUrl)) {
      errors.push({ path: `${path}.rights.licenseUrl`, code: "unsafe_url", message: "Media licenseUrl must be HTTP/HTTPS" });
    }
  }
  if (media.alt && !isPlainObject(media.alt)) {
    errors.push({ path: `${path}.alt`, code: "invalid_type", message: "Media alt must be an object keyed by locale" });
  }
}

export function validateIngredient(ingredient, path, errors) {
  if (!isPlainObject(ingredient)) {
    errors.push({ path, code: "invalid_type", message: `${path} must be an object` });
    return;
  }
  if (typeof ingredient.ingredientKey !== "string" || !SIMPLE_KEY_PATTERN.test(ingredient.ingredientKey)) {
    errors.push({
      path: `${path}.ingredientKey`,
      code: "invalid_key",
      message: "ingredientKey must be a non-localized canonical key ([a-z0-9][a-z0-9_-]*)",
    });
  }
  if (typeof ingredient.originalText !== "string" || !ingredient.originalText.trim()) {
    errors.push({ path: `${path}.originalText`, code: "missing_field", message: "originalText is required" });
  }
  if (!INGREDIENT_ROLES.includes(ingredient.role)) {
    errors.push({ path: `${path}.role`, code: "invalid_enum", message: `role must be one of: ${INGREDIENT_ROLES.join(", ")}` });
  }
  if (typeof ingredient.required !== "boolean") {
    errors.push({ path: `${path}.required`, code: "invalid_type", message: "required must be a boolean" });
  }
  if (ingredient.quantity !== null && ingredient.quantity !== undefined) {
    validateFinitePositive(ingredient.quantity, `${path}.quantity`, errors);
  }
  if (ingredient.quantityMax !== null && ingredient.quantityMax !== undefined) {
    validateFinitePositive(ingredient.quantityMax, `${path}.quantityMax`, errors);
    if (
      typeof ingredient.quantity === "number" &&
      Number.isFinite(ingredient.quantity) &&
      ingredient.quantityMax < ingredient.quantity
    ) {
      errors.push({
        path: `${path}.quantityMax`,
        code: "invalid_range",
        message: "quantityMax must be >= quantity",
      });
    }
  }
  if (ingredient.unit !== null && ingredient.unit !== undefined) {
    if (typeof ingredient.unit !== "string" || !UNIT_DEFINITIONS[ingredient.unit]) {
      errors.push({
        path: `${path}.unit`,
        code: "unsupported_unit",
        message: `Unsupported unit "${ingredient.unit}"`,
      });
    }
  } else if (ingredient.quantity !== null && ingredient.quantity !== undefined) {
    errors.push({
      path: `${path}.unit`,
      code: "missing_unit",
      message: "unit is required when quantity is specified",
    });
  }
  if (ingredient.cropMapping !== null && ingredient.cropMapping !== undefined) {
    if (!isPlainObject(ingredient.cropMapping)) {
      errors.push({ path: `${path}.cropMapping`, code: "invalid_type", message: "cropMapping must be an object" });
    } else {
      if (!MAPPING_STATUSES.includes(ingredient.cropMapping.status)) {
        errors.push({
          path: `${path}.cropMapping.status`,
          code: "invalid_enum",
          message: `cropMapping.status must be one of: ${MAPPING_STATUSES.join(", ")}`,
        });
      }
      if (ingredient.cropMapping.cropKeys !== undefined) {
        if (!Array.isArray(ingredient.cropMapping.cropKeys)) {
          errors.push({ path: `${path}.cropMapping.cropKeys`, code: "invalid_type", message: "cropKeys must be an array" });
        } else {
          for (const key of ingredient.cropMapping.cropKeys) {
            if (typeof key !== "string" || !SIMPLE_KEY_PATTERN.test(key)) {
              errors.push({ path: `${path}.cropMapping.cropKeys`, code: "invalid_key", message: `Invalid cropKey "${key}"` });
            }
          }
        }
      }
      if (ingredient.cropMapping.conversion !== null && ingredient.cropMapping.conversion !== undefined) {
        const conv = ingredient.cropMapping.conversion;
        if (!isPlainObject(conv)) {
          errors.push({ path: `${path}.cropMapping.conversion`, code: "invalid_type", message: "conversion must be an object" });
        } else {
          validateFinitePositive(conv.factorToGrams, `${path}.cropMapping.conversion.factorToGrams`, errors);
          if (typeof conv.reviewed !== "boolean") {
            errors.push({ path: `${path}.cropMapping.conversion.reviewed`, code: "invalid_type", message: "conversion.reviewed must be boolean" });
          }
        }
      }
    }
  }
}

export function validateRecipeRecord(recipe, path = "recipe") {
  const errors = [];
  if (!isPlainObject(recipe)) {
    return { valid: false, errors: [{ path, code: "invalid_type", message: "Recipe record must be an object" }] };
  }

  // Identity
  if (typeof recipe.recipeKey !== "string" || !RECIPE_KEY_PATTERN.test(recipe.recipeKey)) {
    errors.push({
      path: `${path}.recipeKey`,
      code: "invalid_key",
      message: 'recipeKey must be namespaced (e.g. "cuisine-libre:veloute-courgettes" or "synthetic:leek-tart")',
    });
  }
  if (typeof recipe.revision !== "string" || !REVISION_PATTERN.test(recipe.revision)) {
    errors.push({ path: `${path}.revision`, code: "invalid_revision", message: "revision must be a short stable revision identifier" });
  }
  if (!ORIGINS.includes(recipe.origin)) {
    errors.push({ path: `${path}.origin`, code: "invalid_enum", message: `origin must be one of: ${ORIGINS.join(", ")}` });
  }
  if (!SUPPORTED_LOCALES.includes(recipe.sourceLocale)) {
    errors.push({ path: `${path}.sourceLocale`, code: "invalid_locale", message: `sourceLocale must be one of: ${SUPPORTED_LOCALES.join(", ")}` });
  }
  if (recipe.sourceUrl !== null && recipe.sourceUrl !== undefined && !isSafeHttpUrl(recipe.sourceUrl)) {
    errors.push({ path: `${path}.sourceUrl`, code: "unsafe_url", message: "sourceUrl must be a safe HTTP/HTTPS URL" });
  }
  if (recipe.origin === "upstream" && !isSafeHttpUrl(recipe.sourceUrl)) {
    errors.push({ path: `${path}.sourceUrl`, code: "missing_source_url", message: "Upstream recipes must retain their canonical HTTP/HTTPS sourceUrl" });
  }
  if (recipe.archiveUrl !== null && recipe.archiveUrl !== undefined && !isSafeHttpUrl(recipe.archiveUrl)) {
    errors.push({ path: `${path}.archiveUrl`, code: "unsafe_url", message: "archiveUrl must be a safe HTTP/HTTPS URL" });
  }

  // Rights & provenance
  if (!isPlainObject(recipe.rights)) {
    errors.push({ path: `${path}.rights`, code: "missing_rights", message: "rights metadata is mandatory" });
  } else {
    const licEval = evaluateLicense(recipe.rights.licenseId);
    if (!RIGHTS_STATUSES.includes(recipe.rights.status)) {
      errors.push({ path: `${path}.rights.status`, code: "invalid_enum", message: `rights.status must be one of: ${RIGHTS_STATUSES.join(", ")}` });
    }
    if (recipe.rights.licenseUrl !== null && recipe.rights.licenseUrl !== undefined && !isSafeHttpUrl(recipe.rights.licenseUrl)) {
      errors.push({ path: `${path}.rights.licenseUrl`, code: "unsafe_url", message: "rights.licenseUrl must be HTTP/HTTPS" });
    }
    if (recipe.rights.status === "cleared" && !licEval.autoImportAllowed) {
      errors.push({
        path: `${path}.rights.status`,
        code: "invalid_rights_clearance",
        message: `Cannot mark rights.status="cleared" for license "${recipe.rights.licenseId}"`,
      });
    }
    if (licEval.info.attributionRequired && (!recipe.rights.attribution || !String(recipe.rights.attribution).trim())) {
      errors.push({
        path: `${path}.rights.attribution`,
        code: "missing_attribution",
        message: `License "${licEval.licenseId}" requires non-empty attribution text`,
      });
    }
    if (!recipe.rights.sourceEvidence || !String(recipe.rights.sourceEvidence).trim()) {
      errors.push({
        path: `${path}.rights.sourceEvidence`,
        code: "missing_provenance",
        message: "rights.sourceEvidence is required to document how rights were verified",
      });
    }
  }

  // Content
  const isLinkOnly = recipe.rights?.status === "link_only";
  if (!isPlainObject(recipe.content)) {
    errors.push({ path: `${path}.content`, code: "missing_content", message: "content object is required" });
  } else {
    const { content } = recipe;
    if (!isPlainObject(content.locales) || !isPlainObject(content.locales[recipe.sourceLocale])) {
      errors.push({
        path: `${path}.content.locales.${recipe.sourceLocale}`,
        code: "missing_source_locale_content",
        message: "content.locales must include the recipe's sourceLocale entry",
      });
    } else {
      for (const [loc, locData] of Object.entries(content.locales)) {
        if (!SUPPORTED_LOCALES.includes(loc)) {
          errors.push({ path: `${path}.content.locales.${loc}`, code: "unsupported_locale", message: `Unsupported locale "${loc}"` });
          continue;
        }
        if (!isPlainObject(locData) || typeof locData.title !== "string" || !locData.title.trim()) {
          errors.push({ path: `${path}.content.locales.${loc}.title`, code: "missing_title", message: "Localized title is required" });
        }
        if (locData.reviewStatus && !TRANSLATION_REVIEW_STATUSES.includes(locData.reviewStatus)) {
          errors.push({
            path: `${path}.content.locales.${loc}.reviewStatus`,
            code: "invalid_enum",
            message: `Invalid translation reviewStatus "${locData.reviewStatus}"`,
          });
        }
        if (isLinkOnly && Array.isArray(locData.steps) && locData.steps.length > 0) {
          errors.push({
            path: `${path}.content.locales.${loc}.steps`,
            code: "link_only_prose_forbidden",
            message: "Link-only candidates must not store copied recipe instruction prose",
          });
        }
        if (!isLinkOnly && loc === recipe.sourceLocale) {
          if (!Array.isArray(locData.steps) || locData.steps.length === 0) {
            errors.push({
              path: `${path}.content.locales.${loc}.steps`,
              code: "missing_steps",
              message: "Non-link-only recipes must include at least one instruction step in sourceLocale",
            });
          } else if (locData.steps.some((step) => typeof step !== "string" || !step.trim())) {
            errors.push({
              path: `${path}.content.locales.${loc}.steps`,
              code: "invalid_step",
              message: "All instruction steps must be non-empty strings",
            });
          }
        }
      }
    }

    if (content.baseServings !== null && content.baseServings !== undefined) {
      validateFinitePositive(content.baseServings, `${path}.content.baseServings`, errors);
    } else if (!isLinkOnly) {
      errors.push({ path: `${path}.content.baseServings`, code: "missing_servings", message: "baseServings is required for full recipes" });
    }

    for (const timeField of ["prepMinutes", "cookMinutes", "restMinutes"]) {
      if (content[timeField] !== null && content[timeField] !== undefined) {
        validateFinitePositive(content[timeField], `${path}.content.${timeField}`, errors, { allowZero: true });
      }
    }

    if (!Array.isArray(content.seasons) || content.seasons.some((s) => !SEASONS.includes(s))) {
      errors.push({ path: `${path}.content.seasons`, code: "invalid_seasons", message: `seasons must be an array from: ${SEASONS.join(", ")}` });
    }
    if (content.category && !CATEGORIES.includes(content.category)) {
      errors.push({ path: `${path}.content.category`, code: "invalid_category", message: `category must be one of: ${CATEGORIES.join(", ")}` });
    }
    if (content.dietary && (!Array.isArray(content.dietary) || content.dietary.some((d) => !DIETARY_FLAGS.includes(d)))) {
      errors.push({ path: `${path}.content.dietary`, code: "invalid_dietary", message: `dietary flags must be from: ${DIETARY_FLAGS.join(", ")}` });
    }
  }

  // Ingredients
  if (!Array.isArray(recipe.ingredients)) {
    errors.push({ path: `${path}.ingredients`, code: "invalid_type", message: "ingredients must be an array" });
  } else {
    if (!isLinkOnly && recipe.ingredients.length === 0) {
      errors.push({ path: `${path}.ingredients`, code: "missing_ingredients", message: "Non-link-only recipes must list ingredients" });
    }
    recipe.ingredients.forEach((ing, idx) => validateIngredient(ing, `${path}.ingredients[${idx}]`, errors));
  }

  // Media
  if (recipe.media !== undefined) {
    if (!Array.isArray(recipe.media)) {
      errors.push({ path: `${path}.media`, code: "invalid_type", message: "media must be an array" });
    } else {
      const seenMediaKeys = new Set();
      recipe.media.forEach((item, idx) => {
        if (isLinkOnly && item?.localAsset) {
          errors.push({
            path: `${path}.media[${idx}].localAsset`,
            code: "link_only_media_forbidden",
            message: "Link-only candidates must not bundle local copied images",
          });
        }
        validateMediaItem(item, `${path}.media[${idx}]`, errors);
        if (item?.mediaKey) {
          if (seenMediaKeys.has(item.mediaKey)) {
            errors.push({ path: `${path}.media[${idx}].mediaKey`, code: "duplicate_key", message: `Duplicate mediaKey "${item.mediaKey}"` });
          }
          seenMediaKeys.add(item.mediaKey);
        }
      });
    }
  }

  // Editorial state
  if (!isPlainObject(recipe.editorial)) {
    errors.push({ path: `${path}.editorial`, code: "missing_editorial", message: "editorial state object is required" });
  } else {
    if (!WORKFLOW_STATUSES.includes(recipe.editorial.workflowStatus)) {
      errors.push({
        path: `${path}.editorial.workflowStatus`,
        code: "invalid_enum",
        message: `workflowStatus must be one of: ${WORKFLOW_STATUSES.join(", ")}`,
      });
    }
    if (!COLLECTIONS.includes(recipe.editorial.collection)) {
      errors.push({
        path: `${path}.editorial.collection`,
        code: "invalid_enum",
        message: `collection must be one of: ${COLLECTIONS.join(", ")}`,
      });
    }
    if (
      recipe.editorial.cookedVerification &&
      !COOKED_VERIFICATION_STATUSES.includes(recipe.editorial.cookedVerification)
    ) {
      errors.push({
        path: `${path}.editorial.cookedVerification`,
        code: "invalid_enum",
        message: `cookedVerification must be one of: ${COOKED_VERIFICATION_STATUSES.join(", ")}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateRecipeBundle(bundle) {
  const errors = [];
  if (!isPlainObject(bundle)) {
    return { valid: false, errors: [{ path: "bundle", code: "invalid_type", message: "Bundle must be a JSON object" }] };
  }
  if (bundle.schemaVersion !== RECIPE_BUNDLE_SCHEMA_VERSION) {
    errors.push({
      path: "bundle.schemaVersion",
      code: "unsupported_schema_version",
      message: `Expected schemaVersion "${RECIPE_BUNDLE_SCHEMA_VERSION}", received "${bundle.schemaVersion ?? ""}"`,
    });
  }
  if (typeof bundle.catalogueVersion !== "string" || !bundle.catalogueVersion.trim()) {
    errors.push({ path: "bundle.catalogueVersion", code: "missing_field", message: "catalogueVersion is required" });
  }
  if (typeof bundle.createdAt !== "string" || Number.isNaN(Date.parse(bundle.createdAt))) {
    errors.push({ path: "bundle.createdAt", code: "invalid_date", message: "createdAt must be a valid ISO-8601 timestamp" });
  }
  if (!isPlainObject(bundle.sourceManifest)) {
    errors.push({ path: "bundle.sourceManifest", code: "missing_manifest", message: "sourceManifest is required" });
  }
  if (!Array.isArray(bundle.recipes)) {
    errors.push({ path: "bundle.recipes", code: "invalid_type", message: "recipes must be an array" });
  } else {
    const seenKeys = new Set();
    bundle.recipes.forEach((recipe, idx) => {
      const res = validateRecipeRecord(recipe, `bundle.recipes[${idx}]`);
      errors.push(...res.errors);
      if (recipe?.recipeKey) {
        if (seenKeys.has(recipe.recipeKey)) {
          errors.push({
            path: `bundle.recipes[${idx}].recipeKey`,
            code: "duplicate_key",
            message: `Duplicate recipeKey "${recipe.recipeKey}"`,
          });
        }
        seenKeys.add(recipe.recipeKey);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
