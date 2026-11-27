export const SUPPORTED_LOCALES = Object.freeze(["fr", "nl", "en"]);
export const LOCALE_TAGS = Object.freeze({ fr: "fr-BE", nl: "nl-BE", en: "en-GB" });

export function tr(locale, fr, nl, en) {
  if (locale === "nl") return nl;
  if (locale === "en") return en;
  return fr;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeExternalHref(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function seasonLabel(season, locale = "fr") {
  const map = {
    spring: tr(locale, "Printemps", "Lente", "Spring"),
    summer: tr(locale, "Été", "Zomer", "Summer"),
    autumn: tr(locale, "Automne", "Herfst", "Autumn"),
    winter: tr(locale, "Hiver", "Winter", "Winter"),
  };
  return map[season] || season;
}

export function categoryLabel(category, locale = "fr") {
  const map = {
    soup: tr(locale, "Soupe & velouté", "Soep", "Soup"),
    salad: tr(locale, "Salade", "Salade", "Salad"),
    tart_savory: tr(locale, "Tarte salée", "Hartige taart", "Savory tart"),
    gratin: tr(locale, "Gratin", "Gratin", "Gratin"),
    main: tr(locale, "Plat principal", "Hoofdgerecht", "Main dish"),
    side: tr(locale, "Accompagnement", "Bijgerecht", "Side dish"),
    spread_condiment: tr(locale, "Tartinade & condiment", "Smeersel & condiment", "Spread & condiment"),
    preserve_safe: tr(locale, "Conserve simple", "Eenvoudige bereiding", "Simple preserve"),
    other: tr(locale, "Autre", "Andere", "Other"),
  };
  return map[category] || category || "";
}

export function dietaryLabel(flag, locale = "fr") {
  const map = {
    vegetarian: tr(locale, "Végétarien", "Vegetarisch", "Vegetarian"),
    vegan: tr(locale, "Végétalien", "Plantaardig", "Vegan"),
    gluten_free: tr(locale, "Sans gluten", "Glutenvrij", "Gluten-free"),
    dairy_free: tr(locale, "Sans produits laitiers", "Zuivelvrij", "Dairy-free"),
  };
  return map[flag] || flag;
}

export function workflowStatusLabel(status, locale = "fr") {
  const map = {
    draft: tr(locale, "Brouillon privé", "Privéconcept", "Private draft"),
    submitted: tr(locale, "En attente de relecture", "Wacht op nakijken", "Pending review"),
    changes_requested: tr(locale, "Modifications demandées", "Aanpassingen gevraagd", "Changes requested"),
    approved: tr(locale, "Publié", "Gepubliceerd", "Published"),
    rejected: tr(locale, "Refusé", "Afgewezen", "Rejected"),
    withdrawn: tr(locale, "Retiré", "Ingetrokken", "Withdrawn"),
    archived: tr(locale, "Archivé", "Gearchiveerd", "Archived"),
  };
  return map[status] || status;
}

export function translationStatusLabel(status, locale = "fr") {
  const map = {
    source: tr(locale, "Texte original", "Originele tekst", "Original text"),
    reviewed: tr(locale, "Traduction relue", "Nagekeken vertaling", "Reviewed translation"),
    machine_unreviewed: tr(locale, "Traduction à relire", "Vertaling nog na te kijken", "Unreviewed translation"),
    stale: tr(locale, "Traduction obsolète (original affiché)", "Verouderde vertaling (origineel getoond)", "Stale translation (showing original)"),
    missing: tr(locale, "Original affiché (traduction manquante)", "Origineel getoond (vertaling ontbreekt)", "Showing original (translation pending)"),
  };
  return map[status] || status;
}

export function unitLabel(unit, quantity, locale = "fr") {
  const plural = typeof quantity === "number" && quantity > 1;
  const map = {
    g: "g",
    kg: "kg",
    ml: "ml",
    cl: "cl",
    dl: "dl",
    l: "l",
    piece: tr(locale, plural ? "pièces" : "pièce", plural ? "stuks" : "stuk", plural ? "pieces" : "piece"),
    clove: tr(locale, plural ? "gousses" : "gousse", plural ? "teentjes" : "teentje", plural ? "cloves" : "clove"),
    stalk: tr(locale, plural ? "branches" : "branche", plural ? "stengels" : "stengel", plural ? "stalks" : "stalk"),
    leaf: tr(locale, plural ? "feuilles" : "feuille", plural ? "bladeren" : "blad", plural ? "leaves" : "leaf"),
    head: tr(locale, plural ? "têtes" : "tête", plural ? "kroppen" : "krop", plural ? "heads" : "head"),
    bunch: tr(locale, plural ? "bouquets" : "bouquet", plural ? "bossen" : "bos", plural ? "bunches" : "bunch"),
    sprig: tr(locale, plural ? "brins" : "brin", plural ? "takjes" : "takje", plural ? "sprigs" : "sprig"),
    tbsp: tr(locale, "c. à s.", "el", "tbsp"),
    tsp: tr(locale, "c. à c.", "kl", "tsp"),
    pinch: tr(locale, "pincée", "snuifje", "pinch"),
    to_taste: tr(locale, "selon goût", "naar smaak", "to taste"),
  };
  return map[unit] || unit || "";
}

export function formatNumber(value, locale = "fr") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(LOCALE_TAGS[locale] || "fr-BE", { maximumFractionDigits: 2 }).format(value);
}

export function resolveRecipeText(recipe, locale = "fr") {
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

function roundMetric(n) {
  return Math.round(n * 1000) / 1000;
}

function normalizeDisplayMetric(qty, unit) {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return { quantity: null, unit };
  if (unit === "g" && qty >= 1000) return { quantity: roundMetric(qty / 1000), unit: "kg" };
  if (unit === "kg" && qty > 0 && qty < 1) return { quantity: roundMetric(qty * 1000), unit: "g" };
  if (unit === "ml" && qty >= 1000) return { quantity: roundMetric(qty / 1000), unit: "l" };
  if (unit === "l" && qty > 0 && qty < 1) return { quantity: roundMetric(qty * 1000), unit: "ml" };
  return { quantity: roundMetric(qty), unit };
}

export function scaleIngredientsForUi(recipe, targetServings) {
  const baseServings = recipe.content?.baseServings;
  const validBase = typeof baseServings === "number" && Number.isFinite(baseServings) && baseServings > 0;
  const safeTarget =
    typeof targetServings === "number" && Number.isFinite(targetServings) && targetServings > 0
      ? targetServings
      : validBase
        ? baseServings
        : null;
  const factor = validBase && safeTarget ? safeTarget / baseServings : 1;

  return (recipe.ingredients || []).map((ing) => {
    const hasQty = typeof ing.quantity === "number" && Number.isFinite(ing.quantity);
    const hasMax = typeof ing.quantityMax === "number" && Number.isFinite(ing.quantityMax);
    let scaledQuantity = hasQty ? roundMetric(ing.quantity * factor) : null;
    let scaledQuantityMax = hasMax ? roundMetric(ing.quantityMax * factor) : null;
    let scaledUnit = ing.unit || null;

    if (hasQty && !hasMax && (scaledUnit === "g" || scaledUnit === "kg" || scaledUnit === "ml" || scaledUnit === "l")) {
      const m = normalizeDisplayMetric(scaledQuantity, scaledUnit);
      scaledQuantity = m.quantity;
      scaledUnit = m.unit;
    } else if (hasQty && hasMax && scaledUnit === "g" && scaledQuantity >= 1000) {
      scaledQuantity = roundMetric(scaledQuantity / 1000);
      scaledQuantityMax = roundMetric(scaledQuantityMax / 1000);
      scaledUnit = "kg";
    }

    return {
      ...ing,
      scaledQuantity,
      scaledQuantityMax,
      scaledUnit,
    };
  });
}

export function formatScaledAmount(ing, locale = "fr") {
  if (ing.scaledQuantity === null || ing.scaledQuantity === undefined) {
    if (ing.unit === "to_taste" || ing.unit === "pinch") {
      return unitLabel(ing.unit, 1, locale);
    }
    return tr(locale, "Quantité à préciser", "Hoeveelheid nog onbekend", "Amount not specified");
  }
  const unitText = ing.scaledUnit ? ` ${unitLabel(ing.scaledUnit, ing.scaledQuantityMax ?? ing.scaledQuantity, locale)}` : "";
  if (ing.scaledQuantityMax !== null && ing.scaledQuantityMax !== undefined) {
    return `${formatNumber(ing.scaledQuantity, locale)}–${formatNumber(ing.scaledQuantityMax, locale)}${unitText}`;
  }
  return `${formatNumber(ing.scaledQuantity, locale)}${unitText}`;
}

export function ingredientDisplayName(ingredientKey, ingredientRefs = [], locale = "fr", fallbackText = "") {
  const ref = ingredientRefs.find((r) => r.ingredientKey === ingredientKey);
  if (ref?.names?.[locale]) return ref.names[locale];
  if (fallbackText) return fallbackText;
  return ingredientKey.replaceAll("_", " ");
}

export function filterRecipes(recipes, { collection = "all", season = "all", category = "all", produce = "all", search = "", ingredientRefs = [] } = {}) {
  const query = String(search || "").trim().toLowerCase();
  return (recipes || []).filter((recipe) => {
    if (recipe.editorial?.workflowStatus && recipe.editorial.workflowStatus !== "approved") {
      return false;
    }
    if (collection !== "all" && recipe.editorial?.collection !== collection) return false;
    if (season !== "all" && !(recipe.content?.seasons || []).includes(season)) return false;
    if (category !== "all" && recipe.content?.category !== category) return false;
    if (produce !== "all" && !(recipe.ingredients || []).some((i) => i.role === "garden" && i.ingredientKey === produce)) {
      return false;
    }
    if (!query) return true;

    const haystack = [];
    for (const loc of SUPPORTED_LOCALES) {
      const l = recipe.content?.locales?.[loc];
      if (l?.title) haystack.push(l.title);
      if (l?.summary) haystack.push(l.summary);
    }
    for (const tag of recipe.content?.tags || []) haystack.push(tag);
    for (const ing of recipe.ingredients || []) {
      haystack.push(ing.ingredientKey, ing.originalText);
      for (const ck of ing.cropMapping?.cropKeys || []) haystack.push(ck);
      const ref = ingredientRefs.find((r) => r.ingredientKey === ing.ingredientKey);
      if (ref?.names) {
        haystack.push(ref.names.fr || "", ref.names.nl || "", ref.names.en || "");
      }
    }
    return haystack.join(" ").toLowerCase().includes(query);
  });
}

export function getPrimaryLicensedImage(recipe) {
  const list = Array.isArray(recipe.media) ? recipe.media : [];
  return (
    list.find(
      (m) =>
        m &&
        m.type === "image" &&
        m.localAsset &&
        (m.rights?.status === "cleared" || m.rights?.status === "local_only")
    ) || null
  );
}

export function renderBotanicalPlaceholder(locale = "fr", label = "") {
  const caption = label || tr(locale, "Illustration neutre — aucune photo licenciée", "Neutrale illustratie — geen gelicentieerde foto", "Neutral placeholder — no licensed photo yet");
  return `<div class="recipe-placeholder" role="img" aria-label="${escapeHtml(caption)}">
    <svg viewBox="0 0 120 72" aria-hidden="true" focusable="false">
      <path d="M22 56 C40 44, 52 24, 60 12 C68 24, 80 44, 98 56" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M60 14 L60 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M60 36 C48 34, 42 26, 40 20 C48 22, 55 27, 60 36 Z" fill="currentColor" opacity="0.22"/>
      <path d="M60 44 C72 42, 78 34, 80 28 C72 30, 65 35, 60 44 Z" fill="currentColor" opacity="0.22"/>
    </svg>
    <span>${escapeHtml(tr(locale, "Photo à venir", "Foto volgt", "Photo coming soon"))}</span>
  </div>`;
}
