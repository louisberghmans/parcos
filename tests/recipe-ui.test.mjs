import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  canMemberEditDraft,
  canMemberViewRecipe,
  createRevisionProposal,
  takedownRecipe,
  transitionRecipeWorkflow,
} from "../src/domain/recipes/workflow.mjs";
import {
  filterRecipes,
  renderRecipeBrowse,
  renderRecipeContribute,
  renderRecipeDetail,
  renderRecipeReviewQueue,
  safeExternalHref,
  scaleIngredientsForUi,
} from "../public/app/recipes/index.js";

const BUNDLE = JSON.parse(readFileSync(resolve("catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json"), "utf8"));

test("contribution workflow enforces authorization, prevents self-approval, isolates private drafts, and preserves history on takedown", () => {
  const memberA = { memberId: "m-alice", role: "member", displayLabel: "Alice" };
  const memberB = { memberId: "m-bob", role: "member", displayLabel: "Bob" };
  const coordinator = { memberId: "m-coord", role: "coordinator", displayLabel: "Coord" };

  const draft = structuredClone(BUNDLE.recipes[0]);
  draft.recipeKey = "community:alice-chard-soup";
  draft.origin = "community";
  draft.contributor = { ownerMemberId: memberA.memberId, publicCredit: "Alice" };
  draft.editorial.workflowStatus = "draft";
  draft.editorial.collection = "community";

  // Private draft visibility: Alice & coordinator can see, Bob CANNOT
  assert.equal(canMemberViewRecipe(draft, memberA), true);
  assert.equal(canMemberViewRecipe(draft, coordinator), true);
  assert.equal(canMemberViewRecipe(draft, memberB), false, "ordinary members must not view others' pending drafts");
  assert.equal(canMemberEditDraft(draft, memberA), true);
  assert.equal(canMemberEditDraft(draft, memberB), false);

  // Alice submits draft -> submitted
  const submitted = transitionRecipeWorkflow(draft, { toStatus: "submitted", actor: memberA });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.recipe.editorial.workflowStatus, "submitted");

  // Author CANNOT self-approve
  const selfApprove = transitionRecipeWorkflow(submitted.recipe, { toStatus: "approved", actor: memberA });
  assert.equal(selfApprove.ok, false);
  assert.equal(selfApprove.error, "forbidden");

  // Coordinator requests changes without reason -> rejected
  const missingReason = transitionRecipeWorkflow(submitted.recipe, { toStatus: "changes_requested", actor: coordinator, reason: "" });
  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.error, "reason_required");

  // Coordinator requests changes with reason -> succeeds
  const changesReq = transitionRecipeWorkflow(submitted.recipe, {
    toStatus: "changes_requested",
    actor: coordinator,
    reason: "Préciser le poids des bettes en grammes.",
  });
  assert.equal(changesReq.ok, true);
  assert.equal(changesReq.recipe.editorial.workflowStatus, "changes_requested");

  // Alice resubmits -> coordinator approves & promotes to curated
  const resubmitted = transitionRecipeWorkflow(changesReq.recipe, { toStatus: "submitted", actor: memberA });
  assert.equal(resubmitted.ok, true);
  const promoted = transitionRecipeWorkflow(resubmitted.recipe, {
    toStatus: "approved",
    actor: coordinator,
    promoteToCurated: true,
    reason: "Cleared and garden-relevant",
  });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.recipe.editorial.collection, "curated");
  assert.equal(canMemberViewRecipe(promoted.recipe, memberB), true, "approved recipe is visible to authenticated members");

  // Correction vs variant preserves original revision & attribution
  const variant = createRevisionProposal(promoted.recipe, {
    kind: "variant",
    changes: { variantSlug: "vegan", titleByLocale: { fr: "Variante végétale" } },
    actor: { memberId: memberB.memberId, publicCredit: "Bob" },
  });
  assert.notEqual(variant.recipeKey, promoted.recipe.recipeKey);
  assert.equal(variant.derivedFrom.recipeKey, promoted.recipe.recipeKey);
  assert.equal(variant.derivedFrom.revision, promoted.recipe.revision);

  // Moderation takedown archives for future use while flagging historical snapshots preserved
  const blockedTakedown = takedownRecipe(promoted.recipe, { actor: memberB, reason: "nope" });
  assert.equal(blockedTakedown.ok, false);
  const takenDown = takedownRecipe(promoted.recipe, { actor: coordinator, reason: "Rights claim under review" });
  assert.equal(takenDown.ok, true);
  assert.equal(takenDown.recipe.editorial.workflowStatus, "archived");
  assert.equal(takenDown.recipe.editorial.takedown.historicalSnapshotsPreserved, true);
});

test("browse UI renders FR/NL/EN, filters by produce/season/multilingual query, and renders empty/loading/error/denied states", () => {
  for (const [locale, expectedHeading] of [
    ["fr", "Recettes du potager"],
    ["nl", "Recepten uit de moestuin"],
    ["en", "Garden Cookbook"],
  ]) {
    const html = renderRecipeBrowse({
      recipes: BUNDLE.recipes,
      ingredientRefs: BUNDLE.ingredientReferences,
      locale,
    });
    assert.ok(html.includes(expectedHeading), `missing heading for ${locale}`);
    assert.ok(html.includes("recipe-card"));
  }

  // Multilingual search finds Belgian Dutch 'knolselder'
  const nlMatch = filterRecipes(BUNDLE.recipes, { search: "knolselder", ingredientRefs: BUNDLE.ingredientReferences });
  assert.equal(nlMatch.length, 1);
  assert.equal(nlMatch[0].recipeKey, "synthetic:gratin-celeri-rave-topinambours");

  // Season filter
  const springOnly = filterRecipes(BUNDLE.recipes, { season: "spring", ingredientRefs: BUNDLE.ingredientReferences });
  assert.equal(springOnly.length, 1);

  // States: loading, error, denied, no-results
  assert.match(renderRecipeBrowse({ state: "loading", locale: "fr" }), /aria-busy="true"/);
  assert.match(renderRecipeBrowse({ state: "error", errorMessage: "Offline", locale: "en" }), /Unable to load recipes/);
  assert.match(renderRecipeBrowse({ state: "denied", locale: "nl" }), /Receptenboek enkel voor leden/);
  assert.match(
    renderRecipeBrowse({ recipes: BUNDLE.recipes, filters: { search: "xyznonexistent" }, locale: "en" }),
    /No recipes match these filters/
  );
});

test("detail UI escapes XSS, blocks unsafe URLs, scales servings accurately, and shows honest M2/M3 pending availability", () => {
  const courgetteSoup = structuredClone(BUNDLE.recipes.find((r) => r.recipeKey === "synthetic:veloute-courgettes-potager"));
  courgetteSoup.content.locales.fr.title = 'Velouté <script>alert("xss")</script>';
  courgetteSoup.sourceUrl = "javascript:alert(1)";

  const html = renderRecipeDetail({
    recipe: courgetteSoup,
    ingredientRefs: BUNDLE.ingredientReferences,
    locale: "fr",
    servings: 6,
  });

  // XSS escaped & javascript: URL omitted
  assert.equal(html.includes("<script>"), false, "raw HTML script tag must be escaped");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(html.includes("javascript:alert"), false, "unsafe link protocol must never be rendered");
  assert.equal(safeExternalHref("javascript:alert(1)"), null);
  assert.equal(safeExternalHref("https://www.cuisine-libre.org/recette"), "https://www.cuisine-libre.org/recette");

  // Scaled courgettes: 800 g for 4 -> 1,2 kg for 6 in fr-BE
  const scaled = scaleIngredientsForUi(courgetteSoup, 6);
  const cRow = scaled.find((i) => i.ingredientKey === "courgette");
  assert.equal(cRow.scaledQuantity, 1.2);
  assert.equal(cRow.scaledUnit, "kg");
  assert.match(html, /1,2 kg/);

  // Garden and pantry groups clearly separated
  assert.match(html, /Du potager/);
  assert.match(html, /Garde-manger/);

  // Honest pending availability & non-misleading M3 food calendar placeholder
  assert.match(html, /non encore calculée/);
  assert.match(html, /Calendrier repas \(M3\) — bientôt disponible/);
});

test("contribute and review queue UI enforce role gate and separate local sharing from open-license opt-in", () => {
  const contributeEn = renderRecipeContribute({ locale: "en", mode: "manual" });
  assert.match(contributeEn, /Optional: allow public export under open license CC BY-SA 4.0/);
  assert.match(contributeEn, /EXIF\/GPS metadata is stripped before publication/);

  const linkModeNl = renderRecipeContribute({ locale: "nl", mode: "link_only" });
  assert.match(linkModeNl, /haalt geen webpagina&#39;s automatisch op/);

  // Member denied access to review queue
  const memberDenied = renderRecipeReviewQueue({ actorRole: "member", locale: "en", queueItems: [BUNDLE.recipes[0]] });
  assert.match(memberDenied, /Coordinator review access required/);

  // Coordinator sees review controls
  const coordView = renderRecipeReviewQueue({
    actorRole: "coordinator",
    locale: "fr",
    queueItems: [BUNDLE.recipes[0]],
    approvedRecipes: BUNDLE.recipes,
  });
  assert.match(coordView, /Approuver \(Communauté\)/);
  assert.match(coordView, /Approuver &amp; promouvoir \(Sélection\)/);
});
