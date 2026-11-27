import { escapeHtml, seasonLabel, tr, workflowStatusLabel } from "./recipe-model.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];

export function renderRecipeContribute({
  locale = "fr",
  mode = "manual", // "manual" | "link_only" | "correction"
  baseRecipe = null,
  mySubmissions = [],
  draft = {},
  feedbackMessage = "",
  errorMessage = "",
} = {}) {
  const activeMode = mode;

  return `<section class="recipe-view recipe-contribute-view">
    <nav class="recipe-breadcrumb">
      <button type="button" class="button ghost" data-recipe-nav="browse">← ${escapeHtml(tr(locale, "Retour au carnet", "Terug naar het kookboek", "Back to cookbook"))}</button>
    </nav>

    <header class="recipe-header">
      <div>
        <p class="eyebrow">${escapeHtml(tr(locale, "Contribution communautaire", "Bijdrage van de gemeenschap", "Community contribution"))}</p>
        <h1>${escapeHtml(tr(locale, "Partager une recette ou une amélioration", "Een recept of verbetering delen", "Share a recipe or improvement"))}</h1>
        <p class="lede">${escapeHtml(tr(
          locale,
          "Enregistrez un brouillon privé puis envoyez-le en relecture. Les brouillons restent visibles uniquement par vous jusqu'à validation.",
          "Bewaar een privéconcept en stuur het door om na te kijken. Concepten blijven enkel voor jou zichtbaar tot goedkeuring.",
          "Save a private draft and submit it for coordinator review. Pending drafts stay visible only to you until approved."
        ))}</p>
      </div>
    </header>

    ${feedbackMessage ? `<div class="recipe-banner success" role="status">${escapeHtml(feedbackMessage)}</div>` : ""}
    ${errorMessage ? `<div class="form-error" role="alert">${escapeHtml(errorMessage)}</div>` : ""}

    <div class="recipe-mode-tabs" role="tablist" aria-label="${escapeHtml(tr(locale, "Type de contribution", "Type bijdrage", "Contribution type"))}">
      <button type="button" role="tab" class="recipe-tab ${activeMode === "manual" ? "active" : ""}" aria-selected="${activeMode === "manual"}" data-contribute-mode="manual">${escapeHtml(tr(locale, "Ma recette (texte)", "Mijn recept (tekst)", "My recipe (text)"))}</button>
      <button type="button" role="tab" class="recipe-tab ${activeMode === "link_only" ? "active" : ""}" aria-selected="${activeMode === "link_only"}" data-contribute-mode="link_only">${escapeHtml(tr(locale, "Suggérer un lien", "Link voorstellen", "Suggest a link"))}</button>
      <button type="button" role="tab" class="recipe-tab ${activeMode === "correction" ? "active" : ""}" aria-selected="${activeMode === "correction"}" data-contribute-mode="correction">${escapeHtml(tr(locale, "Amélioration / traduction", "Verbetering / vertaling", "Edit / translation"))}</button>
    </div>

    <form class="recipe-panel form-stack" data-recipe-contribute-form="true">
      <input type="hidden" name="mode" value="${escapeHtml(activeMode)}" />
      ${baseRecipe ? `<div class="recipe-context-box">
        <strong>${escapeHtml(tr(locale, "Basé sur :", "Gebaseerd op:", "Based on:"))}</strong> ${escapeHtml(baseRecipe.recipeKey)} (${escapeHtml(tr(locale, `rév. ${baseRecipe.revision}`, `rev. ${baseRecipe.revision}`, `rev. ${baseRecipe.revision}`))})
      </div>` : ""}

      <div class="recipe-form-grid">
        <label>
          <span>${escapeHtml(tr(locale, "Titre de la recette *", "Titel van het recept *", "Recipe title *"))}</span>
          <input type="text" name="title" required maxlength="140" value="${escapeHtml(draft.title || "")}" placeholder="${escapeHtml(tr(locale, "Ex. Poêlée de blettes à l'ail", "Bv. Gestoofde snijbiet met look", "e.g. Garlic sautéed Swiss chard"))}" />
        </label>

        <label>
          <span>${escapeHtml(tr(locale, "Langue d'origine", "Oorspronkelijke taal", "Original language"))}</span>
          <select name="sourceLocale">
            <option value="fr" ${(draft.sourceLocale || locale) === "fr" ? "selected" : ""}>Français (FR)</option>
            <option value="nl" ${(draft.sourceLocale || locale) === "nl" ? "selected" : ""}>Nederlands (BE)</option>
            <option value="en" ${(draft.sourceLocale || locale) === "en" ? "selected" : ""}>English (EN)</option>
          </select>
        </label>
      </div>

      ${activeMode === "link_only" ? `<label>
        <span>${escapeHtml(tr(locale, "Lien public vers la recette (HTTP/HTTPS) *", "Publieke link naar het recept (HTTP/HTTPS) *", "Public recipe URL (HTTP/HTTPS) *"))}</span>
        <input type="url" name="sourceUrl" required placeholder="https://www.cuisine-libre.org/..." value="${escapeHtml(draft.sourceUrl || "")}" />
        <small>${escapeHtml(tr(locale, "ParcOS n'aspire pas automatiquement les pages web. Cette suggestion sera enregistrée comme lien seul jusqu'à vérification des droits.", "ParcOS haalt geen webpagina's automatisch op. Deze suggestie wordt enkel als link bewaard tot de rechten gecontroleerd zijn.", "ParcOS does not fetch arbitrary URLs on the server. This suggestion is stored link-only until rights are verified."))}</small>
      </label>` : `
      <div class="recipe-form-grid three-cols">
        <label>
          <span>${escapeHtml(tr(locale, "Portions de base *", "Basisporties *", "Base servings *"))}</span>
          <input type="number" name="baseServings" min="1" max="30" required value="${escapeHtml(draft.baseServings ?? 4)}" />
        </label>
        <label>
          <span>${escapeHtml(tr(locale, "Préparation (min)", "Voorbereiding (min)", "Prep (min)"))}</span>
          <input type="number" name="prepMinutes" min="0" max="600" value="${escapeHtml(draft.prepMinutes ?? 15)}" />
        </label>
        <label>
          <span>${escapeHtml(tr(locale, "Cuisson (min)", "Kooktijd (min)", "Cook (min)"))}</span>
          <input type="number" name="cookMinutes" min="0" max="600" value="${escapeHtml(draft.cookMinutes ?? 25)}" />
        </label>
      </div>

      <label>
        <span>${escapeHtml(tr(locale, "Ingrédients (un par ligne, ex. 500 g courgettes) *", "Ingrediënten (één per lijn, bv. 500 g courgettes) *", "Ingredients (one per line, e.g. 500 g zucchini) *"))}</span>
        <textarea name="ingredientsText" rows="5" required placeholder="${escapeHtml(tr(locale, "600 g courgettes\n200 g pommes de terre\n2 c. à s. huile d'olive", "600 g courgettes\n200 g aardappelen\n2 el olijfolie", "600 g zucchini\n200 g potatoes\n2 tbsp olive oil"))}">${escapeHtml(draft.ingredientsText || "")}</textarea>
      </label>

      <label>
        <span>${escapeHtml(tr(locale, "Étapes de préparation (une par ligne) *", "Bereidingsstappen (één per lijn) *", "Preparation steps (one per line) *"))}</span>
        <textarea name="stepsText" rows="5" required>${escapeHtml(draft.stepsText || "")}</textarea>
      </label>

      <label>
        <span>${escapeHtml(tr(locale, "Votre propre photo (facultatif — JPG/PNG/WebP)", "Je eigen foto (optioneel — JPG/PNG/WebP)", "Your own photograph (optional — JPG/PNG/WebP)"))}</span>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" />
        <small>${escapeHtml(tr(locale, "Uniquement une photo prise par vous (pas de capture de livre ou blog). Les données EXIF/GPS sont retirées avant publication.", "Enkel een zelfgemaakte foto (geen boek- of blogfoto). EXIF/GPS-gegevens worden vóór publicatie verwijderd.", "Upload only your own photograph (not book or blog photos). EXIF/GPS metadata is stripped before publication."))}</small>
      </label>

      <label>
        <span>${escapeHtml(tr(locale, "Source originale (si adaptée d'une autre recette)", "Originele bron (indien gebaseerd op een ander recept)", "Original source (if adapted from another recipe)"))}</span>
        <input type="url" name="sourceUrl" placeholder="https://..." value="${escapeHtml(draft.sourceUrl || "")}" />
      </label>
      `}

      <fieldset class="recipe-seasons-fieldset">
        <legend>${escapeHtml(tr(locale, "Saisons éditoriales", "Seizoenen", "Editorial seasons"))}</legend>
        <div class="recipe-checkbox-row">
          ${SEASONS.map((s) => {
            const checked = Array.isArray(draft.seasons) ? draft.seasons.includes(s) : s === "summer";
            return `<label class="recipe-check-chip"><input type="checkbox" name="seasons" value="${s}" ${checked ? "checked" : ""} /><span>${escapeHtml(seasonLabel(s, locale))}</span></label>`;
          }).join("")}
        </div>
      </fieldset>

      <fieldset class="recipe-rights-fieldset">
        <legend>${escapeHtml(tr(locale, "Droits, crédit et partage", "Rechten, vermelding en delen", "Rights, credit and sharing"))}</legend>
        <label>
          <span>${escapeHtml(tr(locale, "Nom ou pseudonyme affiché", "Weergegeven naam of pseudoniem", "Display credit name or pseudonym"))}</span>
          <input type="text" name="creditName" maxlength="80" value="${escapeHtml(draft.creditName || "")}" placeholder="${escapeHtml(tr(locale, "Ex. Marie (Parc Parmentier)", "Bv. Marie (Parmentierpark)", "e.g. Marie (Parc Parmentier)"))}" />
        </label>
        <label class="recipe-consent-row">
          <input type="checkbox" name="confirmRights" required ${draft.confirmRights ? "checked" : ""} />
          <span>${escapeHtml(tr(
            locale,
            "Je confirme être l'auteur de cette recette/photo (ou indiquer une source libre compatible) pour un partage dans le groupe local ParcOS.",
            "Ik bevestig dat ik de auteur ben van dit recept/deze foto (of een compatibele vrije bron vermeld) voor lokaal gebruik in ParcOS.",
            "I confirm I authored this recipe/photo (or identified a compatible open source) for local ParcOS group sharing."
          ))}</span>
        </label>
        <label class="recipe-consent-row optional-open">
          <input type="checkbox" name="publicExportOptIn" ${draft.publicExportOptIn ? "checked" : ""} />
          <span>
            <strong>${escapeHtml(tr(locale, "Optionnel : autoriser l'export public sous licence libre CC BY-SA 4.0", "Optioneel: publieke export toestaan onder CC BY-SA 4.0", "Optional: allow public export under open license CC BY-SA 4.0"))}</strong>
            <small>${escapeHtml(tr(
              locale,
              "Distinct du partage local. Une licence libre autorise la réutilisation externe (y compris commerciale) avec crédit, et ne peut pas être révoquée pour les copies déjà diffusées. Aucun identifiant de compte n'est exporté. Refuser n'empêche pas la publication locale.",
              "Los van lokaal delen. Een vrije licentie laat externe hergebruik (ook commercieel) met bronvermelding toe en kan niet worden ingetrokken voor reeds verspreide kopieën. Accountgegevens worden nooit geëxporteerd. Weigeren blokkeert lokale publicatie niet.",
              "Separate from local group sharing. An open license permits external reuse (including commercial) with attribution and cannot be revoked for copies already legitimately received. No account IDs are exported. Declining never blocks local community sharing."
            ))}</small>
          </span>
        </label>
      </fieldset>

      <div class="recipe-form-actions">
        <button type="submit" class="button secondary" data-submit-intent="draft">${escapeHtml(tr(locale, "Enregistrer le brouillon privé", "Privéconcept opslaan", "Save private draft"))}</button>
        <button type="submit" class="button primary" data-submit-intent="submit">${escapeHtml(tr(locale, "Envoyer en relecture", "Indienen voor nakijken", "Submit for review"))}</button>
      </div>
    </form>

    <section class="recipe-panel recipe-submissions-panel" aria-labelledby="my-submissions-heading">
      <h2 id="my-submissions-heading">${escapeHtml(tr(locale, "Mes brouillons et propositions", "Mijn concepten en voorstellen", "My drafts and submissions"))}</h2>
      ${mySubmissions.length === 0
        ? `<p class="muted">${escapeHtml(tr(locale, "Vous n'avez encore enregistré aucune proposition.", "Je hebt nog geen eigen voorstellen opgeslagen.", "You have not saved any submissions yet."))}</p>`
        : `<ul class="recipe-submission-list">
            ${mySubmissions.map((item) => `<li class="recipe-submission-item">
              <div>
                <strong>${escapeHtml(item.content?.locales?.[item.sourceLocale]?.title || item.recipeKey)}</strong>
                <span class="recipe-status-pill status-${escapeHtml(item.editorial?.workflowStatus || "draft")}">${escapeHtml(workflowStatusLabel(item.editorial?.workflowStatus, locale))}</span>
                ${item.editorial?.lastReviewReason ? `<p class="muted">${escapeHtml(tr(locale, "Note de relecture :", "Opmerking:", "Review note:"))} ${escapeHtml(item.editorial.lastReviewReason)}</p>` : ""}
              </div>
              <div class="recipe-submission-actions">
                ${item.editorial?.workflowStatus === "draft" || item.editorial?.workflowStatus === "changes_requested"
                  ? `<button type="button" class="button secondary compact-button" data-submission-action="submit" data-recipe-key="${escapeHtml(item.recipeKey)}">${escapeHtml(tr(locale, "Soumettre", "Indienen", "Submit"))}</button>`
                  : ""}
                ${item.editorial?.workflowStatus === "submitted"
                  ? `<button type="button" class="button ghost compact-button" data-submission-action="withdraw" data-recipe-key="${escapeHtml(item.recipeKey)}">${escapeHtml(tr(locale, "Retirer", "Intrekken", "Withdraw"))}</button>`
                  : ""}
              </div>
            </li>`).join("")}
          </ul>`}
    </section>
  </section>`;
}
