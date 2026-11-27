import {
  categoryLabel,
  dietaryLabel,
  escapeHtml,
  formatScaledAmount,
  getPrimaryLicensedImage,
  ingredientDisplayName,
  renderBotanicalPlaceholder,
  resolveRecipeText,
  safeExternalHref,
  scaleIngredientsForUi,
  seasonLabel,
  tr,
  translationStatusLabel,
} from "./recipe-model.js";

export function renderRecipeDetail({
  recipe,
  ingredientRefs = [],
  locale = "fr",
  servings = null,
  checkedIngredients = new Set(),
  availability = null, // Optional authorized M2/M3 availability payload; null => honest pending state
  foodCalendarConnected = false,
  cookedCount = 0,
  mediaBasePath = "/media/recipes/",
} = {}) {
  if (!recipe) {
    return `<section class="recipe-view recipe-state-card" role="status">
      <h2>${escapeHtml(tr(locale, "Recette introuvable", "Recept niet gevonden", "Recipe not found"))}</h2>
      <button type="button" class="button secondary" data-recipe-nav="browse">${escapeHtml(tr(locale, "Retour au carnet", "Terug naar het kookboek", "Back to cookbook"))}</button>
    </section>`;
  }

  const text = resolveRecipeText(recipe, locale);
  const baseServings = recipe.content?.baseServings || null;
  const activeServings = servings || baseServings || 4;
  const isLinkOnly = recipe.rights?.status === "link_only";
  const photo = getPrimaryLicensedImage(recipe);

  const scaled = scaleIngredientsForUi(recipe, activeServings);
  const gardenIngredients = scaled.filter((i) => i.role === "garden");
  const pantryIngredients = scaled.filter((i) => i.role === "pantry");
  const otherIngredients = scaled.filter((i) => i.role !== "garden" && i.role !== "pantry");

  const prep = recipe.content?.prepMinutes ?? null;
  const cook = recipe.content?.cookMinutes ?? null;
  const rest = recipe.content?.restMinutes ?? null;
  const totalMinutes = (prep || 0) + (cook || 0) + (rest || 0);

  const sourceHref = safeExternalHref(recipe.sourceUrl);
  const licenseHref = safeExternalHref(recipe.rights?.licenseUrl);
  const imageLicenseHref = safeExternalHref(photo?.rights?.licenseUrl);

  const heroMedia = photo
    ? `<figure class="recipe-detail-figure">
        <img src="${escapeHtml(`${mediaBasePath}${photo.localAsset}`)}" alt="${escapeHtml(photo.alt?.[locale] || photo.alt?.[recipe.sourceLocale] || text.title)}" />
        <figcaption class="recipe-image-credit">
          ${escapeHtml(tr(locale, "Photo :", "Foto:", "Photo:"))} ${escapeHtml(photo.rights?.credit || tr(locale, "Crédit vérifié", "Gecontroleerde bron", "Verified credit"))}
          ${photo.rights?.licenseId ? ` · ${imageLicenseHref ? `<a href="${escapeHtml(imageLicenseHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(photo.rights.licenseId)}</a>` : escapeHtml(photo.rights.licenseId)}` : ""}
        </figcaption>
      </figure>`
    : `<div class="recipe-detail-figure">${renderBotanicalPlaceholder(locale, text.title)}</div>`;

  const availabilityBox = availability
    ? `<div class="recipe-availability-box ready">
        <strong>${escapeHtml(tr(locale, "Disponibilité estimée au potager", "Geschatte beschikbaarheid in de tuin", "Estimated garden availability"))}</strong>
        <p>${escapeHtml(availability.summary || "")}</p>
      </div>`
    : `<div class="recipe-availability-box pending">
        <strong>${escapeHtml(tr(locale, "Disponibilité au potager : non encore calculée", "Beschikbaarheid in de tuin: nog niet berekend", "Garden availability: not yet calculated"))}</strong>
        <p>${escapeHtml(tr(
          locale,
          "Les saisons indiquées sont des repères éditoriaux. Les dates réelles de récolte apparaîtront une fois le planning M2/M3 connecté.",
          "De getoonde seizoenen zijn redactionele richtlijnen. Echte oogstdata verschijnen zodra de M2/M3-planning gekoppeld is.",
          "Season tags are editorial hints, not measured harvest dates. Live feasibility will appear once M2/M3 planning is connected."
        ))}</p>
      </div>`;

  const calendarAction = foodCalendarConnected
    ? `<button type="button" class="button primary" data-recipe-action="add-to-food-calendar" data-recipe-key="${escapeHtml(recipe.recipeKey)}" data-recipe-revision="${escapeHtml(recipe.revision)}">${escapeHtml(tr(locale, "Ajouter au calendrier repas", "Toevoegen aan maaltijdkalender", "Add to food calendar"))}</button>`
    : `<div class="recipe-hook-pending" aria-disabled="true">
        <span>${escapeHtml(tr(locale, "Calendrier repas (M3) — bientôt disponible", "Maaltijdkalender (M3) — binnenkort beschikbaar", "Food calendar (M3) — integration pending"))}</span>
      </div>`;

  const renderIngRow = (ing, idx) => {
    const checkId = `ing-${idx}-${ing.ingredientKey}`;
    const checked = checkedIngredients.has(checkId);
    const labelName = ingredientDisplayName(ing.ingredientKey, ingredientRefs, locale, ing.originalText);
    const amount = formatScaledAmount(ing, locale);
    const flags = [];
    if (!ing.required) flags.push(tr(locale, "facultatif", "optioneel", "optional"));
    if (ing.role === "garden" && ing.cropMapping?.status && ing.cropMapping.status !== "reviewed") {
      flags.push(tr(locale, "lien culture à vérifier", "teeltkoppeling na te kijken", "crop mapping pending"));
    }
    if (ing.role === "garden" && ing.scaledQuantity === null) {
      flags.push(tr(locale, "quantité manquante", "hoeveelheid ontbreekt", "quantity missing"));
    }
    return `<li class="recipe-ingredient-row ${checked ? "checked" : ""}">
      <label for="${escapeHtml(checkId)}">
        <input type="checkbox" id="${escapeHtml(checkId)}" data-recipe-check="${escapeHtml(checkId)}" ${checked ? "checked" : ""} />
        <span class="recipe-ing-amount">${escapeHtml(amount)}</span>
        <span class="recipe-ing-name">${escapeHtml(labelName)}${ing.preparationNote ? ` <em class="muted">(${escapeHtml(ing.preparationNote)})</em>` : ""}</span>
        ${flags.length ? `<span class="recipe-ing-flags">${flags.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</span>` : ""}
      </label>
    </li>`;
  };

  const ingredientsPanel = isLinkOnly
    ? `<section class="recipe-panel recipe-link-only-panel">
        <h2>${escapeHtml(tr(locale, "Référence externe uniquement", "Enkel externe verwijzing", "External link-only reference"))}</h2>
        <p>${escapeHtml(tr(
          locale,
          "La licence de cette recette n'est pas encore confirmée. ParcOS ne copie ni les instructions ni les photos tant que les droits ne sont pas vérifiés.",
          "De licentie van dit recept is nog niet bevestigd. ParcOS kopieert geen tekst of foto's zolang de rechten niet geverifieerd zijn.",
          "This recipe's license has not yet been confirmed. ParcOS does not copy instructions or photos until rights are verified."
        ))}</p>
        ${sourceHref ? `<a class="button primary" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tr(locale, "Lire la recette originale", "Lees het originele recept", "Open original recipe"))} ↗</a>` : ""}
      </section>`
    : `<section class="recipe-panel recipe-ingredients-panel" aria-labelledby="recipe-ingredients-heading">
        <div class="recipe-ingredients-header">
          <h2 id="recipe-ingredients-heading">${escapeHtml(tr(locale, "Ingrédients", "Ingrediënten", "Ingredients"))}</h2>
          ${baseServings ? `<div class="recipe-servings-control" role="group" aria-label="${escapeHtml(tr(locale, "Nombre de portions", "Aantal porties", "Servings"))}">
            <button type="button" class="button secondary recipe-step-btn" data-recipe-servings-delta="-1" ${activeServings <= 1 ? "disabled" : ""} aria-label="${escapeHtml(tr(locale, "Diminuer les portions", "Minder porties", "Decrease servings"))}">−</button>
            <output class="recipe-servings-value" aria-live="polite">${activeServings} ${escapeHtml(tr(locale, "pers.", "pers.", "serv."))}</output>
            <button type="button" class="button secondary recipe-step-btn" data-recipe-servings-delta="1" ${activeServings >= 40 ? "disabled" : ""} aria-label="${escapeHtml(tr(locale, "Augmenter les portions", "Meer porties", "Increase servings"))}">+</button>
          </div>` : ""}
        </div>
        ${activeServings !== baseServings && baseServings ? `<p class="recipe-scale-note">${escapeHtml(tr(locale, `Quantités adaptées pour ${activeServings} (recette de base : ${baseServings}). La recette enregistrée n'est pas modifiée.`, `Hoeveelheden aangepast voor ${activeServings} (basisrecept: ${baseServings}). Het opgeslagen recept blijft ongewijzigd.`, `Scaled for ${activeServings} servings (base recipe: ${baseServings}). The saved recipe is unchanged.`))}</p>` : ""}

        ${gardenIngredients.length > 0 ? `<div class="recipe-ing-group">
          <h3>${escapeHtml(tr(locale, "Du potager", "Uit de moestuin", "From the garden"))}</h3>
          <ul class="recipe-ingredient-list">${gardenIngredients.map((ing, i) => renderIngRow(ing, `g${i}`)).join("")}</ul>
        </div>` : ""}

        ${pantryIngredients.length > 0 ? `<div class="recipe-ing-group">
          <h3>${escapeHtml(tr(locale, "Garde-manger", "Voorraadkast", "Pantry"))}</h3>
          <ul class="recipe-ingredient-list">${pantryIngredients.map((ing, i) => renderIngRow(ing, `p${i}`)).join("")}</ul>
        </div>` : ""}

        ${otherIngredients.length > 0 ? `<div class="recipe-ing-group">
          <h3>${escapeHtml(tr(locale, "Autres / à classer", "Overige / nog in te delen", "Other / unclassified"))}</h3>
          <ul class="recipe-ingredient-list">${otherIngredients.map((ing, i) => renderIngRow(ing, `o${i}`)).join("")}</ul>
        </div>` : ""}
      </section>`;

  const stepsPanel = isLinkOnly
    ? ""
    : `<section class="recipe-panel recipe-steps-panel" aria-labelledby="recipe-steps-heading">
        <h2 id="recipe-steps-heading">${escapeHtml(tr(locale, "Préparation", "Bereiding", "Instructions"))}</h2>
        <ol class="recipe-steps-list">
          ${(text.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ol>
        ${recipe.content?.foodSafetyNote?.[locale] || recipe.content?.foodSafetyNote?.[recipe.sourceLocale] ? `<aside class="recipe-safety-note" role="note">
          <strong>${escapeHtml(tr(locale, "Note de sécurité alimentaire", "Voedselveiligheid", "Food safety note"))}</strong>
          <p>${escapeHtml(recipe.content.foodSafetyNote[locale] || recipe.content.foodSafetyNote[recipe.sourceLocale])}</p>
        </aside>` : ""}
      </section>`;

  const planningBlockerList = Array.isArray(recipe.editorial?.planningBlockers) ? recipe.editorial.planningBlockers : [];

  return `<article class="recipe-view recipe-detail-view" data-recipe-key="${escapeHtml(recipe.recipeKey)}" data-recipe-revision="${escapeHtml(recipe.revision)}">
    <nav class="recipe-breadcrumb" aria-label="${escapeHtml(tr(locale, "Navigation", "Navigatie", "Navigation"))}">
      <button type="button" class="button ghost" data-recipe-nav="browse">← ${escapeHtml(tr(locale, "Retour au carnet", "Terug naar het kookboek", "Back to cookbook"))}</button>
      <span class="recipe-revision-pill">${escapeHtml(tr(locale, `Rév. ${recipe.revision}`, `Rev. ${recipe.revision}`, `Rev. ${recipe.revision}`))}</span>
    </nav>

    <header class="recipe-detail-header">
      ${heroMedia}
      <div class="recipe-detail-intro">
        <div class="recipe-pill-row">
          ${(recipe.content?.seasons || []).map((s) => `<span class="recipe-season-tag">${escapeHtml(seasonLabel(s, locale))}</span>`).join("")}
          ${recipe.content?.category ? `<span class="recipe-meta-pill">${escapeHtml(categoryLabel(recipe.content.category, locale))}</span>` : ""}
          ${(recipe.content?.dietary || []).map((d) => `<span class="recipe-meta-pill">${escapeHtml(dietaryLabel(d, locale))}</span>`).join("")}
          ${recipe.origin === "synthetic" ? `<span class="recipe-synthetic-tag">${escapeHtml(tr(locale, "Exemple synthétique", "Synthetisch voorbeeld", "Synthetic fixture"))}</span>` : ""}
        </div>
        <h1>${escapeHtml(text.title)}</h1>
        ${text.summary ? `<p class="lede">${escapeHtml(text.summary)}</p>` : ""}

        <dl class="recipe-facts-grid">
          ${baseServings ? `<div><dt>${escapeHtml(tr(locale, "Portions", "Porties", "Servings"))}</dt><dd>${activeServings}</dd></div>` : ""}
          ${prep !== null ? `<div><dt>${escapeHtml(tr(locale, "Préparation", "Voorbereiding", "Prep"))}</dt><dd>${prep} min</dd></div>` : ""}
          ${cook !== null ? `<div><dt>${escapeHtml(tr(locale, "Cuisson", "Kooktijd", "Cook"))}</dt><dd>${cook} min</dd></div>` : ""}
          ${totalMinutes > 0 ? `<div><dt>${escapeHtml(tr(locale, "Total", "Totaal", "Total"))}</dt><dd>${totalMinutes} min</dd></div>` : ""}
        </dl>

        <div class="recipe-translation-banner">
          <span>${escapeHtml(translationStatusLabel(text.reviewStatus, locale))}</span>
          ${text.fallbackUsed ? ` · <em>${escapeHtml(tr(locale, `Affiché en ${text.displayedLocale.toUpperCase()}`, `Getoond in ${text.displayedLocale.toUpperCase()}`, `Displayed in ${text.displayedLocale.toUpperCase()}`))}</em>` : ""}
        </div>

        ${availabilityBox}
        <div class="recipe-primary-actions">
          ${calendarAction}
        </div>
      </div>
    </header>

    <div class="recipe-detail-layout">
      ${ingredientsPanel}
      ${stepsPanel}
    </div>

    ${!recipe.editorial?.planningReady && planningBlockerList.length > 0 ? `<section class="recipe-panel recipe-planning-note" aria-label="${escapeHtml(tr(locale, "Statut de planification", "Planningsstatus", "Planning readiness"))}">
      <h3>${escapeHtml(tr(locale, "Non encore prête pour le calcul de récolte", "Nog niet klaar voor oogstberekening", "Not yet ready for harvest demand planning"))}</h3>
      <ul>
        ${planningBlockerList.map((b) => `<li>${escapeHtml(b.message)}</li>`).join("")}
      </ul>
    </section>` : ""}

    <footer class="recipe-attribution-card" aria-labelledby="recipe-source-heading">
      <h2 id="recipe-source-heading">${escapeHtml(tr(locale, "Source, crédit et licence", "Bron, vermelding en licentie", "Source, attribution and license"))}</h2>
      <p>
        <strong>${escapeHtml(recipe.rights?.attribution || recipe.authorCredit || tr(locale, "Contributeur", "Bijdrager", "Contributor"))}</strong>
        ${recipe.rights?.licenseId ? ` · ${licenseHref ? `<a href="${escapeHtml(licenseHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(recipe.rights.licenseId)}</a>` : escapeHtml(recipe.rights.licenseId)}` : ""}
      </p>
      ${recipe.rights?.modifications ? `<p class="muted">${escapeHtml(recipe.rights.modifications)}</p>` : ""}
      ${sourceHref ? `<p><a class="recipe-source-link" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tr(locale, "Voir la page originale sur la source", "Bekijk de originele bronpagina", "View original source page"))} ↗</a></p>` : ""}
    </footer>

    <section class="recipe-community-bar" aria-label="${escapeHtml(tr(locale, "Actions communautaires", "Gemeenschapsacties", "Community actions"))}">
      <button type="button" class="button secondary" data-recipe-action="cooked-this" data-recipe-key="${escapeHtml(recipe.recipeKey)}" data-recipe-revision="${escapeHtml(recipe.revision)}">
        ${escapeHtml(tr(locale, "J'ai cuisiné cette recette", "Ik heb dit gekookt", "I cooked this"))}${cookedCount > 0 ? ` (${cookedCount})` : ""}
      </button>
      <button type="button" class="button ghost" data-recipe-action="propose-correction" data-recipe-key="${escapeHtml(recipe.recipeKey)}">${escapeHtml(tr(locale, "Suggérer une amélioration / traduction", "Verbetering of vertaling voorstellen", "Suggest edit / translation"))}</button>
      <button type="button" class="button ghost" data-recipe-action="propose-variant" data-recipe-key="${escapeHtml(recipe.recipeKey)}">${escapeHtml(tr(locale, "Proposer une variante", "Variant voorstellen", "Propose a variant"))}</button>
    </section>
  </article>`;
}
