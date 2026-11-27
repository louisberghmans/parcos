import { escapeHtml, resolveRecipeText, tr, workflowStatusLabel } from "./recipe-model.js";

export function renderRecipeReviewQueue({
  locale = "fr",
  actorRole = "member",
  queueItems = [],
  approvedRecipes = [],
  feedbackMessage = "",
} = {}) {
  if (actorRole !== "coordinator" && actorRole !== "admin") {
    return `<section class="recipe-view recipe-state-card" role="alert">
      <p class="eyebrow">${escapeHtml(tr(locale, "Accès refusé", "Toegang geweigerd", "Access denied"))}</p>
      <h2>${escapeHtml(tr(locale, "Relecture réservée aux coordinateurs", "Nakijken enkel voor coördinatoren", "Coordinator review access required"))}</h2>
      <p class="muted">${escapeHtml(tr(locale, "Les membres ne peuvent pas approuver ou modérer les propositions. L'autorisation est vérifiée côté serveur.", "Leden kunnen geen voorstellen goedkeuren of modereren. De toegang wordt op de server gecontroleerd.", "Ordinary members cannot approve or moderate submissions. Authorization is enforced server-side."))}</p>
      <button type="button" class="button secondary" data-recipe-nav="browse">${escapeHtml(tr(locale, "Retour au carnet", "Terug naar het kookboek", "Back to cookbook"))}</button>
    </section>`;
  }

  return `<section class="recipe-view recipe-review-view">
    <nav class="recipe-breadcrumb">
      <button type="button" class="button ghost" data-recipe-nav="browse">← ${escapeHtml(tr(locale, "Retour au carnet", "Terug naar het kookboek", "Back to cookbook"))}</button>
    </nav>

    <header class="recipe-header">
      <div>
        <p class="eyebrow">${escapeHtml(tr(locale, "Coordination · Édition du carnet", "Coördinatie · Redactie kookboek", "Coordination · Cookbook Editorial"))}</p>
        <h1>${escapeHtml(tr(locale, "File de relecture des recettes", "Nakijkwachtrij voor recepten", "Recipe review queue"))}</h1>
        <p class="lede">${escapeHtml(tr(
          locale,
          "Vérifiez les droits, quantités, correspondances cultures et traductions avant publication ou promotion dans la sélection.",
          "Controleer rechten, hoeveelheden, teeltkoppelingen en vertalingen vóór publicatie of opname in de selectie.",
          "Verify rights, quantities, crop mappings, and translations before publishing to the community or promoting to curated."
        ))}</p>
      </div>
    </header>

    ${feedbackMessage ? `<div class="recipe-banner success" role="status">${escapeHtml(feedbackMessage)}</div>` : ""}

    ${queueItems.length === 0
      ? `<div class="recipe-state-card" role="status">
          <h3>${escapeHtml(tr(locale, "Aucune proposition en attente", "Geen openstaande voorstellen", "No pending submissions"))}</h3>
          <p class="muted">${escapeHtml(tr(locale, "Toutes les propositions soumises ont été traitées.", "Alle ingediende voorstellen zijn behandeld.", "All submitted proposals have been reviewed."))}</p>
        </div>`
      : `<div class="recipe-review-list">
          ${queueItems.map((item) => renderReviewCard(item, { locale, approvedRecipes })).join("")}
        </div>`}
  </section>`;
}

function renderReviewCard(item, { locale, approvedRecipes }) {
  const text = resolveRecipeText(item, locale);
  const blockers = Array.isArray(item.editorial?.planningBlockers) ? item.editorial.planningBlockers : [];
  const rightsStatus = item.rights?.status || "review_required";
  const canPromoteCurated = rightsStatus === "cleared" || rightsStatus === "local_only";

  // Detect potential title duplicate against existing approved recipes
  const normalizedTitle = String(text.title || "").trim().toLowerCase();
  const duplicateMatch = approvedRecipes.find(
    (other) =>
      other.recipeKey !== item.recipeKey &&
      resolveRecipeText(other, locale).title.trim().toLowerCase() === normalizedTitle
  );

  // If this is a correction proposal with a parent recipe, render a clear title/steps diff summary
  const parentRecipe = item.parentRevision
    ? approvedRecipes.find((r) => r.recipeKey === item.recipeKey && r.revision === item.parentRevision)
    : null;

  return `<article class="recipe-panel recipe-review-card" data-review-key="${escapeHtml(item.recipeKey)}">
    <div class="recipe-review-top">
      <div>
        <div class="recipe-pill-row">
          <span class="recipe-status-pill status-${escapeHtml(item.editorial?.workflowStatus || "submitted")}">${escapeHtml(workflowStatusLabel(item.editorial?.workflowStatus, locale))}</span>
          <span class="recipe-meta-pill">${escapeHtml(item.rights?.licenseId || "UNKNOWN")}</span>
          <span class="recipe-meta-pill">${escapeHtml(tr(locale, `Rév. ${item.revision}`, `Rev. ${item.revision}`, `Rev. ${item.revision}`))}</span>
          ${item.rights?.publicExportOptIn?.granted ? `<span class="recipe-season-tag">${escapeHtml(tr(locale, "Opt-in export public", "Opt-in publieke export", "Public export opt-in"))}</span>` : ""}
        </div>
        <h2>${escapeHtml(text.title)}</h2>
        <p class="muted">
          ${escapeHtml(tr(locale, "Proposé par :", "Voorgesteld door:", "Submitted by:"))}
          <strong>${escapeHtml(item.contributor?.publicCredit || item.rights?.attribution || tr(locale, "Membre", "Lid", "Member"))}</strong>
        </p>
      </div>
    </div>

    <div class="recipe-review-flags">
      ${duplicateMatch ? `<p class="recipe-flag warn">${escapeHtml(tr(locale, `Doublon potentiel avec « ${resolveRecipeText(duplicateMatch, locale).title} » (${duplicateMatch.recipeKey})`, `Mogelijk duplicaat van “${resolveRecipeText(duplicateMatch, locale).title}” (${duplicateMatch.recipeKey})`, `Potential duplicate of “${resolveRecipeText(duplicateMatch, locale).title}” (${duplicateMatch.recipeKey})`))}</p>` : ""}
      ${rightsStatus === "link_only" ? `<p class="recipe-flag info">${escapeHtml(tr(locale, "Candidat lien seul (droits non vérifiés — aucun texte copié)", "Enkel link (rechten niet bevestigd — geen tekst gekopieerd)", "Link-only candidate (rights unverified — no prose copied)"))}</p>` : ""}
      ${blockers.map((b) => `<p class="recipe-flag warn">${escapeHtml(b.message)}</p>`).join("")}
      ${blockers.length === 0 && !duplicateMatch ? `<p class="recipe-flag ok">${escapeHtml(tr(locale, "Prête pour la planification (quantités et cultures renseignées)", "Klaar voor planning (hoeveelheden en gewassen gekoppeld)", "Planning-ready (quantities and crop mappings complete)"))}</p>` : ""}
    </div>

    ${parentRecipe ? `<div class="recipe-diff-box">
      <h3>${escapeHtml(tr(locale, "Changements proposés (révision conservée)", "Voorgestelde wijzigingen (vorige revisie blijft bewaard)", "Proposed changes (prior revision preserved)"))}</h3>
      <p><del>${escapeHtml(resolveRecipeText(parentRecipe, locale).title)}</del> → <ins>${escapeHtml(text.title)}</ins></p>
    </div>` : ""}

    <div class="recipe-review-controls">
      <label>
        <span>${escapeHtml(tr(locale, "Motif / note pour l'auteur (obligatoire pour refus ou demande de modification)", "Reden / opmerking voor de auteur (verplicht bij afwijzing of aanpassing)", "Reason / note for author (required for reject or request changes)"))}</span>
        <input type="text" data-review-reason-for="${escapeHtml(item.recipeKey)}" placeholder="${escapeHtml(tr(locale, "Ex. Merci de préciser la quantité de courgettes en grammes.", "Bv. Geef graag de hoeveelheid courgettes in gram op.", "e.g. Please specify zucchini quantity in grams."))}" />
      </label>
      <div class="recipe-review-buttons">
        <button type="button" class="button primary" data-review-action="approve-community" data-recipe-key="${escapeHtml(item.recipeKey)}">${escapeHtml(tr(locale, "Approuver (Communauté)", "Goedkeuren (Gemeenschap)", "Approve (Community)"))}</button>
        <button type="button" class="button secondary" data-review-action="promote-curated" data-recipe-key="${escapeHtml(item.recipeKey)}" ${canPromoteCurated ? "" : "disabled"}>${escapeHtml(tr(locale, "Approuver & promouvoir (Sélection)", "Goedkeuren & selecteren", "Approve & promote to Curated"))}</button>
        <button type="button" class="button ghost" data-review-action="request-changes" data-recipe-key="${escapeHtml(item.recipeKey)}">${escapeHtml(tr(locale, "Demander des modifications", "Aanpassingen vragen", "Request changes"))}</button>
        <button type="button" class="button ghost danger" data-review-action="reject" data-recipe-key="${escapeHtml(item.recipeKey)}">${escapeHtml(tr(locale, "Refuser", "Afwijzen", "Reject"))}</button>
      </div>
    </div>
  </article>`;
}
