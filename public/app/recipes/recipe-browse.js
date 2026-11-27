import {
  categoryLabel,
  escapeHtml,
  filterRecipes,
  getPrimaryLicensedImage,
  ingredientDisplayName,
  renderBotanicalPlaceholder,
  resolveRecipeText,
  seasonLabel,
  tr,
} from "./recipe-model.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const CATEGORIES = ["soup", "salad", "tart_savory", "gratin", "main", "side"];

export function renderRecipeBrowse({
  recipes = [],
  ingredientRefs = [],
  locale = "fr",
  state = "ready", // "ready" | "loading" | "error" | "denied"
  errorMessage = "",
  filters = {},
  canContribute = true,
  canReview = false,
  pendingReviewCount = 0,
  mediaBasePath = "/media/recipes/",
} = {}) {
  const collection = filters.collection || "all";
  const season = filters.season || "all";
  const category = filters.category || "all";
  const produce = filters.produce || "all";
  const search = filters.search || "";

  if (state === "denied") {
    return `<section class="recipe-view recipe-state-card" aria-live="polite">
      <p class="eyebrow">${escapeHtml(tr(locale, "Accès restreint", "Beperkte toegang", "Restricted access"))}</p>
      <h2>${escapeHtml(tr(locale, "Carnet de recettes réservé aux membres", "Receptenboek enkel voor leden", "Member cookbook access required"))}</h2>
      <p class="muted">${escapeHtml(tr(locale, "Connectez-vous avec votre compte ParcOS pour consulter les recettes et proposer vos plats.", "Meld je aan met je ParcOS-account om recepten te bekijken en zelf recepten voor te stellen.", "Sign in with your ParcOS account to browse the cookbook and contribute recipes."))}</p>
    </section>`;
  }

  if (state === "loading") {
    return `<section class="recipe-view recipe-state-card" aria-busy="true" aria-live="polite">
      <p class="eyebrow">${escapeHtml(tr(locale, "Carnet de recettes", "Receptenboek", "Cookbook"))}</p>
      <h2>${escapeHtml(tr(locale, "Chargement du carnet saisonnier…", "Seizoensrecepten laden…", "Loading seasonal cookbook…"))}</h2>
      <p class="muted">${escapeHtml(tr(locale, "Préparation des recettes et des légumes de saison.", "Recepten en seizoensgroenten worden klaargezet.", "Preparing seasonal recipes and garden produce."))}</p>
    </section>`;
  }

  if (state === "error") {
    return `<section class="recipe-view recipe-state-card recipe-state-error" role="alert">
      <p class="eyebrow">${escapeHtml(tr(locale, "Erreur", "Fout", "Error"))}</p>
      <h2>${escapeHtml(tr(locale, "Impossible de charger les recettes", "Kan de recepten niet laden", "Unable to load recipes"))}</h2>
      <p>${escapeHtml(errorMessage || tr(locale, "Vérifiez votre connexion puis réessayez.", "Controleer je verbinding en probeer opnieuw.", "Check your connection and try again."))}</p>
      <button type="button" class="button secondary" data-recipe-action="retry">${escapeHtml(tr(locale, "Réessayer", "Opnieuw proberen", "Try again"))}</button>
    </section>`;
  }

  // Distinct garden produce options from approved recipes
  const approvedRecipes = recipes.filter((r) => !r.editorial?.workflowStatus || r.editorial.workflowStatus === "approved");
  const produceKeys = Array.from(
    new Set(
      approvedRecipes.flatMap((r) => (r.ingredients || []).filter((i) => i.role === "garden").map((i) => i.ingredientKey))
    )
  ).sort((a, b) => ingredientDisplayName(a, ingredientRefs, locale).localeCompare(ingredientDisplayName(b, ingredientRefs, locale)));

  const filtered = filterRecipes(approvedRecipes, { collection, season, category, produce, search, ingredientRefs });
  const curatedCount = approvedRecipes.filter((r) => r.editorial?.collection === "curated").length;
  const communityCount = approvedRecipes.filter((r) => r.editorial?.collection === "community").length;
  const hasActiveFilter = collection !== "all" || season !== "all" || category !== "all" || produce !== "all" || Boolean(search.trim());

  const headerHtml = `<header class="recipe-header">
    <div>
      <p class="eyebrow">${escapeHtml(tr(locale, "Communauté · Carnet saisonnier", "Gemeenschap · Seizoenskookboek", "Community · Seasonal Cookbook"))}</p>
      <h1>${escapeHtml(tr(locale, "Recettes du potager", "Recepten uit de moestuin", "Garden Cookbook"))}</h1>
      <p class="lede">${escapeHtml(tr(
        locale,
        "Des recettes concises et de saison pour cuisiner les récoltes du parc, liées à leur source originale.",
        "Beknopte seizoensrecepten om de oogst van het park te koken, met duidelijke bronvermelding.",
        "Concise, seasonal recipes tailored to park harvests, always linked to their original source."
      ))}</p>
    </div>
    <div class="recipe-header-actions">
      ${canContribute ? `<button type="button" class="button primary" data-recipe-nav="contribute">${escapeHtml(tr(locale, "Proposer une recette", "Recept voorstellen", "Contribute a recipe"))}</button>` : ""}
      ${canReview ? `<button type="button" class="button secondary" data-recipe-nav="review">${escapeHtml(tr(locale, "File de relecture", "Nakijkwachtrij", "Review queue"))}${pendingReviewCount > 0 ? ` <span class="recipe-count-badge">${pendingReviewCount}</span>` : ""}</button>` : ""}
    </div>
  </header>`;

  const tabsHtml = `<nav class="recipe-collection-tabs" aria-label="${escapeHtml(tr(locale, "Collections de recettes", "Receptencollecties", "Recipe collections"))}">
    <button type="button" class="recipe-tab ${collection === "all" ? "active" : ""}" data-recipe-filter="collection" data-value="all" aria-pressed="${collection === "all"}">${escapeHtml(tr(locale, "Toutes", "Alle", "All"))} <span>${approvedRecipes.length}</span></button>
    <button type="button" class="recipe-tab ${collection === "curated" ? "active" : ""}" data-recipe-filter="collection" data-value="curated" aria-pressed="${collection === "curated"}">${escapeHtml(tr(locale, "Sélection du carnet", "Geselecteerd kookboek", "Curated cookbook"))} <span>${curatedCount}</span></button>
    <button type="button" class="recipe-tab ${collection === "community" ? "active" : ""}" data-recipe-filter="collection" data-value="community" aria-pressed="${collection === "community"}">${escapeHtml(tr(locale, "Recettes des membres", "Recepten van leden", "Community recipes"))} <span>${communityCount}</span></button>
  </nav>`;

  const filtersHtml = `<form class="recipe-filters" data-recipe-filter-form="true" role="search" aria-label="${escapeHtml(tr(locale, "Filtrer les recettes", "Recepten filteren", "Filter recipes"))}">
    <label class="recipe-search-field">
      <span>${escapeHtml(tr(locale, "Rechercher", "Zoeken", "Search"))}</span>
      <input type="search" name="search" value="${escapeHtml(search)}" placeholder="${escapeHtml(tr(locale, "Titre, légume (ex. courgette, prei, kale)…", "Titel, groente (bv. courgette, prei, koolrabi)…", "Title, vegetable (e.g. zucchini, leek, chard)…"))}" />
    </label>
    <label>
      <span>${escapeHtml(tr(locale, "Saison", "Seizoen", "Season"))}</span>
      <select name="season">
        <option value="all">${escapeHtml(tr(locale, "Toutes les saisons", "Alle seizoenen", "All seasons"))}</option>
        ${SEASONS.map((s) => `<option value="${s}" ${season === s ? "selected" : ""}>${escapeHtml(seasonLabel(s, locale))}</option>`).join("")}
      </select>
    </label>
    <label>
      <span>${escapeHtml(tr(locale, "Légume du potager", "Groente uit de tuin", "Garden produce"))}</span>
      <select name="produce">
        <option value="all">${escapeHtml(tr(locale, "Tous les légumes", "Alle groenten", "All produce"))}</option>
        ${produceKeys.map((k) => `<option value="${escapeHtml(k)}" ${produce === k ? "selected" : ""}>${escapeHtml(ingredientDisplayName(k, ingredientRefs, locale))}</option>`).join("")}
      </select>
    </label>
    <label>
      <span>${escapeHtml(tr(locale, "Catégorie", "Categorie", "Category"))}</span>
      <select name="category">
        <option value="all">${escapeHtml(tr(locale, "Toutes", "Alle", "All"))}</option>
        ${CATEGORIES.map((c) => `<option value="${c}" ${category === c ? "selected" : ""}>${escapeHtml(categoryLabel(c, locale))}</option>`).join("")}
      </select>
    </label>
    ${hasActiveFilter ? `<button type="button" class="button ghost recipe-reset-btn" data-recipe-action="reset-filters">${escapeHtml(tr(locale, "Réinitialiser", "Wissen", "Reset"))}</button>` : ""}
  </form>`;

  let bodyHtml = "";
  if (approvedRecipes.length === 0) {
    bodyHtml = `<div class="recipe-state-card">
      <h3>${escapeHtml(tr(locale, "Aucune recette publiée pour le moment", "Nog geen gepubliceerde recepten", "No published recipes yet"))}</h3>
      <p class="muted">${escapeHtml(tr(locale, "Importez un catalogue vérifié ou proposez une première recette de la communauté.", "Importeer een gecontroleerde catalogus of stel een eerste gemeenschapsrecept voor.", "Import a verified catalogue or submit the first community recipe."))}</p>
    </div>`;
  } else if (filtered.length === 0) {
    bodyHtml = `<div class="recipe-state-card" role="status">
      <h3>${escapeHtml(tr(locale, "Aucun résultat pour ces filtres", "Geen recepten gevonden voor deze filters", "No recipes match these filters"))}</h3>
      <p class="muted">${escapeHtml(tr(locale, "Essayez une autre saison, un autre légume ou effacez la recherche.", "Probeer een ander seizoen, een andere groente of wis de zoekopdracht.", "Try another season, vegetable, or clear your search."))}</p>
      <button type="button" class="button secondary" data-recipe-action="reset-filters">${escapeHtml(tr(locale, "Afficher toutes les recettes", "Toon alle recepten", "Show all recipes"))}</button>
    </div>`;
  } else {
    bodyHtml = `<p class="recipe-results-count" role="status">${escapeHtml(
      tr(
        locale,
        `${filtered.length} recette${filtered.length > 1 ? "s" : ""} affichée${filtered.length > 1 ? "s" : ""}`,
        `${filtered.length} recept${filtered.length > 1 ? "en" : ""} getoond`,
        `Showing ${filtered.length} recipe${filtered.length === 1 ? "" : "s"}`
      )
    )}</p>
    <div class="recipe-grid">
      ${filtered.map((recipe) => renderRecipeCard(recipe, { locale, ingredientRefs, mediaBasePath })).join("")}
    </div>`;
  }

  return `<section class="recipe-view recipe-browse-view">
    ${headerHtml}
    ${tabsHtml}
    ${filtersHtml}
    ${bodyHtml}
  </section>`;
}

function renderRecipeCard(recipe, { locale, ingredientRefs, mediaBasePath }) {
  const text = resolveRecipeText(recipe, locale);
  const photo = getPrimaryLicensedImage(recipe);
  const totalMinutes = (recipe.content?.prepMinutes || 0) + (recipe.content?.cookMinutes || 0);
  const keyProduce = (recipe.ingredients || [])
    .filter((i) => i.role === "garden")
    .slice(0, 3)
    .map((i) => ingredientDisplayName(i.ingredientKey, ingredientRefs, locale));
  const isLinkOnly = recipe.rights?.status === "link_only";

  const mediaHtml = photo
    ? `<img class="recipe-card-img" src="${escapeHtml(`${mediaBasePath}${photo.localAsset}`)}" alt="${escapeHtml(photo.alt?.[locale] || photo.alt?.[recipe.sourceLocale] || text.title)}" loading="lazy" />`
    : renderBotanicalPlaceholder(locale, text.title);

  const seasonsText = (recipe.content?.seasons || []).map((s) => seasonLabel(s, locale)).join(" · ");
  const collectionBadge =
    recipe.editorial?.collection === "community"
      ? tr(locale, "Membre", "Lid", "Community")
      : tr(locale, "Sélection", "Selectie", "Curated");

  return `<article class="recipe-card">
    <button type="button" class="recipe-card-trigger" data-recipe-open="${escapeHtml(recipe.recipeKey)}">
      <div class="recipe-card-media">
        ${mediaHtml}
        <span class="recipe-card-collection">${escapeHtml(collectionBadge)}</span>
        ${isLinkOnly ? `<span class="recipe-card-flag">${escapeHtml(tr(locale, "Lien seul", "Enkel link", "Link only"))}</span>` : ""}
      </div>
      <div class="recipe-card-body">
        <div class="recipe-card-meta">
          ${seasonsText ? `<span class="recipe-season-tag">${escapeHtml(seasonsText)}</span>` : ""}
          ${recipe.content?.baseServings ? `<span>${escapeHtml(tr(locale, `${recipe.content.baseServings} pers.`, `${recipe.content.baseServings} pers.`, `${recipe.content.baseServings} serv.`))}</span>` : ""}
          ${totalMinutes > 0 ? `<span>${totalMinutes} min</span>` : ""}
        </div>
        <h3>${escapeHtml(text.title)}</h3>
        ${text.summary ? `<p class="recipe-card-summary">${escapeHtml(text.summary)}</p>` : ""}
        ${keyProduce.length > 0 ? `<ul class="recipe-produce-chips" aria-label="${escapeHtml(tr(locale, "Légumes clés", "Hoofdgroenten", "Key garden produce"))}">${keyProduce.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : ""}
        <div class="recipe-card-footer">
          <span class="recipe-credit-hint">${escapeHtml(recipe.rights?.attribution || recipe.authorCredit || "")}</span>
          ${recipe.origin === "synthetic" ? `<span class="recipe-synthetic-tag">${escapeHtml(tr(locale, "Exemple synthétique", "Synthetisch voorbeeld", "Synthetic fixture"))}</span>` : ""}
        </div>
      </div>
    </button>
  </article>`;
}
