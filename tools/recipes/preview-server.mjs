#!/usr/bin/env node
/**
 * THROWAWAY LOCAL-ONLY PREVIEW SERVER for ParcOS Recipe UI components.
 * Bound strictly to 127.0.0.1. Uses synthetic fixture data only.
 * DO NOT merge into server.mjs or deploy to production.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const PORT = Number(process.env.RECIPE_PREVIEW_PORT || 4179);
const ROOT = resolve(".");
const BUNDLE_PATH = resolve("catalogues/recipes/fixtures/synthetic-cookbook.v1.bundle.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const PREVIEW_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>ParcOS — Recipe Preview (Synthetic Local Only)</title>
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/app/recipes/recipes.css" />
    <style>
      .preview-topbar {
        position: sticky;
        top: 0;
        z-index: 30;
        padding: 10px 16px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: rgba(244, 241, 232, 0.96);
        border-bottom: 1px solid var(--line);
        backdrop-filter: blur(12px);
      }
      .preview-brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .preview-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .preview-controls .button,
      .preview-controls .language-toggle {
        min-height: 40px;
        padding: 0 12px;
        font-size: 12px;
      }
      .preview-banner {
        padding: 8px 16px;
        background: #fff2c8;
        color: #5b450f;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="preview-banner">LOCAL SYNTHETIC PREVIEW ONLY · Isolated recipe UI components (not connected to live DB)</div>
    <header class="preview-topbar">
      <div class="preview-brand">
        <span class="brand-mark small" aria-hidden="true">P</span>
        <div>
          <strong>ParcOS</strong>
          <div style="font-size:11px;color:var(--muted)">Cookbook Preview</div>
        </div>
      </div>
      <div class="preview-controls">
        <button type="button" class="language-toggle" id="preview-locale-btn" aria-label="Switch language">FR</button>
        <button type="button" class="button ghost" id="preview-role-btn">Role: coordinator</button>
      </div>
    </header>
    <main id="recipe-root"></main>
    <script type="module">
      import {
        renderRecipeBrowse,
        renderRecipeDetail,
        renderRecipeContribute,
        renderRecipeReviewQueue,
      } from "/app/recipes/index.js";

      const root = document.querySelector("#recipe-root");
      const localeBtn = document.querySelector("#preview-locale-btn");
      const roleBtn = document.querySelector("#preview-role-btn");

      const bundle = await fetch("/api/preview/bundle").then((r) => r.json());

      // Add synthetic community recipe + pending coordinator review item for realistic interactive demo
      const communityApproved = {
        recipeKey: "community:poelee-blettes-ail-famille",
        revision: "1.0",
        origin: "community",
        sourceLocale: "fr",
        sourceUrl: null,
        authorCredit: "Claire (Parc Parmentier)",
        contributor: { ownerMemberId: "member-claire", publicCredit: "Claire (Parc Parmentier)" },
        rights: {
          status: "local_only",
          licenseId: "LOCAL-COMMUNITY-ONLY",
          attribution: "Claire (Parc Parmentier)",
          sourceEvidence: "Synthetic local-only community contribution",
          publicExportOptIn: { granted: false, licenseId: null },
        },
        content: {
          baseServings: 4,
          prepMinutes: 10,
          cookMinutes: 15,
          restMinutes: 0,
          seasons: ["spring", "autumn"],
          category: "side",
          tags: ["weekday", "family"],
          dietary: ["vegetarian", "vegan", "gluten_free", "dairy_free"],
          locales: {
            fr: {
              title: "Poêlée rapide de bettes à l'ail",
              summary: "Recette familiale locale partagée uniquement avec les membres du parc.",
              steps: [
                "Couper 500 g de bettes en séparant côtes et feuilles.",
                "Faire revenir les côtes 7 minutes dans 2 c. à s. d'huile d'olive avec 2 gousses d'ail.",
                "Ajouter les feuilles 5 minutes jusqu'à ce qu'elles fondent."
              ],
              reviewStatus: "source",
              sourceRevision: "1.0",
            },
            nl: {
              title: "Snelle pan van snijbiet met look",
              summary: "Lokaal familierecept, enkel gedeeld met leden van het park.",
              steps: [
                "Snijd 500 g snijbiet en houd stelen en bladeren apart.",
                "Stoof de stelen 7 minuten in 2 eetlepels olijfolie met 2 teentjes look.",
                "Voeg de bladeren 5 minuten toe tot ze slinken."
              ],
              reviewStatus: "reviewed",
              sourceRevision: "1.0",
            },
            en: {
              title: "Quick Garlic Sautéed Swiss Chard",
              summary: "A local family recipe shared with authenticated park members only.",
              steps: [
                "Chop 500 g of Swiss chard, separating stalks and leaves.",
                "Sauté the stalks for 7 minutes in 2 tbsp olive oil with 2 cloves of garlic.",
                "Add the leaves for 5 minutes until tender."
              ],
              reviewStatus: "reviewed",
              sourceRevision: "1.0",
            },
          },
        },
        ingredients: [
          { ingredientKey: "chard", originalText: "500 g de bettes", quantity: 500, unit: "g", role: "garden", required: true, cropMapping: { status: "reviewed", cropKeys: ["crop_chard"] } },
          { ingredientKey: "garlic", originalText: "2 gousses d'ail", quantity: 2, unit: "clove", role: "garden", required: false, cropMapping: { status: "reviewed", cropKeys: ["crop_garlic"] } },
          { ingredientKey: "olive_oil", originalText: "2 c. à s. huile d'olive", quantity: 2, unit: "tbsp", role: "pantry", required: true, cropMapping: { status: "not_applicable", cropKeys: [] } },
        ],
        media: [],
        editorial: { workflowStatus: "approved", collection: "community", planningReady: true, planningBlockers: [] },
      };

      const pendingSubmission = {
        recipeKey: "community:soupe-navets-carottes-draft",
        revision: "1.0",
        origin: "community",
        sourceLocale: "nl",
        sourceUrl: null,
        authorCredit: "Bram (lid)",
        contributor: { ownerMemberId: "member-demo", publicCredit: "Bram" },
        rights: {
          status: "cleared",
          licenseId: "CC-BY-SA-4.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
          attribution: "Bram",
          sourceEvidence: "Synthetic member submission with explicit open-license opt-in",
          publicExportOptIn: { granted: true, licenseId: "CC-BY-SA-4.0", creditName: "Bram" },
        },
        content: {
          baseServings: 4,
          prepMinutes: 15,
          cookMinutes: 25,
          seasons: ["autumn", "winter"],
          category: "soup",
          tags: ["family"],
          dietary: ["vegetarian"],
          locales: {
            nl: {
              title: "Zachte soep van raapjes en wortelen",
              summary: "Eenvoudige herfstsoep om raapjes uit de moestuin te benutten.",
              steps: ["Snijd 400 g raapjes en 400 g wortelen in blokjes.", "Kook 25 minuten in 1 l bouillon en mix fijn."],
              reviewStatus: "source",
              sourceRevision: "1.0",
            },
          },
        },
        ingredients: [
          { ingredientKey: "turnip", originalText: "400 g raapjes", quantity: 400, unit: "g", role: "garden", required: true, cropMapping: { status: "unresolved", cropKeys: [] } },
          { ingredientKey: "carrot", originalText: "400 g wortelen", quantity: 400, unit: "g", role: "garden", required: true, cropMapping: { status: "reviewed", cropKeys: ["crop_carrot"] } },
        ],
        media: [],
        editorial: {
          workflowStatus: "submitted",
          collection: "community",
          planningReady: false,
          planningBlockers: [{ code: "unmapped_crop", message: 'Required garden ingredient "turnip" lacks a reviewed M2 crop mapping' }],
        },
      };

      const state = {
        locale: "fr",
        role: "coordinator",
        view: "browse", // browse | detail | contribute | review
        selectedKey: null,
        servingsByKey: {},
        checkedByKey: {},
        cookedCounts: {},
        filters: { collection: "all", season: "all", category: "all", produce: "all", search: "" },
        contributeMode: "manual",
        feedback: "",
        recipes: [...bundle.recipes, communityApproved, pendingSubmission],
        ingredientRefs: bundle.ingredientReferences || [],
      };

      const locales = ["fr", "nl", "en"];

      function render() {
        document.documentElement.lang = state.locale;
        localeBtn.textContent = state.locale.toUpperCase();
        roleBtn.textContent = "Role: " + state.role;

        const approved = state.recipes.filter((r) => r.editorial?.workflowStatus === "approved");
        const pending = state.recipes.filter((r) => r.editorial?.workflowStatus === "submitted");
        const mySubs = state.recipes.filter((r) => r.contributor?.ownerMemberId === "member-demo");

        if (state.view === "detail") {
          const recipe = state.recipes.find((r) => r.recipeKey === state.selectedKey);
          const servings = state.servingsByKey[state.selectedKey] ?? recipe?.content?.baseServings ?? 4;
          const checked = state.checkedByKey[state.selectedKey] || new Set();
          root.innerHTML = renderRecipeDetail({
            recipe,
            ingredientRefs: state.ingredientRefs,
            locale: state.locale,
            servings,
            checkedIngredients: checked,
            cookedCount: state.cookedCounts[state.selectedKey] || 0,
          });
          return;
        }

        if (state.view === "contribute") {
          root.innerHTML = renderRecipeContribute({
            locale: state.locale,
            mode: state.contributeMode,
            mySubmissions: mySubs,
            feedbackMessage: state.feedback,
          });
          return;
        }

        if (state.view === "review") {
          root.innerHTML = renderRecipeReviewQueue({
            locale: state.locale,
            actorRole: state.role,
            queueItems: pending,
            approvedRecipes: approved,
            feedbackMessage: state.feedback,
          });
          return;
        }

        root.innerHTML = renderRecipeBrowse({
          recipes: approved,
          ingredientRefs: state.ingredientRefs,
          locale: state.locale,
          filters: state.filters,
          canContribute: true,
          canReview: state.role === "coordinator" || state.role === "admin",
          pendingReviewCount: pending.length,
        });
      }

      localeBtn.addEventListener("click", () => {
        const idx = (locales.indexOf(state.locale) + 1) % locales.length;
        state.locale = locales[idx];
        render();
      });

      roleBtn.addEventListener("click", () => {
        state.role = state.role === "coordinator" ? "member" : "coordinator";
        render();
      });

      root.addEventListener("click", (event) => {
        const target = event.target.closest("button");
        if (!target) return;

        if (target.dataset.recipeNav) {
          state.view = target.dataset.recipeNav;
          state.feedback = "";
          render();
          return;
        }
        if (target.dataset.recipeOpen) {
          state.selectedKey = target.dataset.recipeOpen;
          state.view = "detail";
          render();
          return;
        }
        if (target.dataset.recipeFilter === "collection") {
          state.filters.collection = target.dataset.value;
          render();
          return;
        }
        if (target.dataset.recipeAction === "reset-filters") {
          state.filters = { collection: "all", season: "all", category: "all", produce: "all", search: "" };
          render();
          return;
        }
        if (target.dataset.recipeServingsDelta) {
          const recipe = state.recipes.find((r) => r.recipeKey === state.selectedKey);
          const cur = state.servingsByKey[state.selectedKey] ?? recipe?.content?.baseServings ?? 4;
          const next = Math.max(1, Math.min(40, cur + Number(target.dataset.recipeServingsDelta)));
          state.servingsByKey[state.selectedKey] = next;
          render();
          return;
        }
        if (target.dataset.recipeAction === "cooked-this") {
          const key = target.dataset.recipeKey;
          state.cookedCounts[key] = (state.cookedCounts[key] || 0) + 1;
          render();
          return;
        }
        if (target.dataset.contributeMode) {
          state.contributeMode = target.dataset.contributeMode;
          render();
          return;
        }
        if (target.dataset.reviewAction) {
          const key = target.dataset.recipeKey;
          const item = state.recipes.find((r) => r.recipeKey === key);
          if (!item) return;
          const reasonInput = root.querySelector(\`[data-review-reason-for="\${CSS.escape(key)}"]\`);
          const reason = reasonInput ? reasonInput.value.trim() : "";
          if (target.dataset.reviewAction === "approve-community") {
            item.editorial.workflowStatus = "approved";
            item.editorial.collection = "community";
            state.feedback = "Approved for authenticated community.";
          } else if (target.dataset.reviewAction === "promote-curated") {
            item.editorial.workflowStatus = "approved";
            item.editorial.collection = "curated";
            state.feedback = "Approved and promoted to curated cookbook.";
          } else if (target.dataset.reviewAction === "request-changes") {
            item.editorial.workflowStatus = "changes_requested";
            item.editorial.lastReviewReason = reason || "Please add missing crop quantities.";
            state.feedback = "Changes requested.";
          } else if (target.dataset.reviewAction === "reject") {
            item.editorial.workflowStatus = "rejected";
            item.editorial.lastReviewReason = reason || "Rejected during review.";
            state.feedback = "Submission rejected.";
          }
          render();
        }
      });

      root.addEventListener("change", (event) => {
        const el = event.target;
        if (el.dataset.recipeCheck && state.selectedKey) {
          if (!state.checkedByKey[state.selectedKey]) state.checkedByKey[state.selectedKey] = new Set();
          if (el.checked) state.checkedByKey[state.selectedKey].add(el.dataset.recipeCheck);
          else state.checkedByKey[state.selectedKey].delete(el.dataset.recipeCheck);
          render();
          return;
        }
        if (el.closest("[data-recipe-filter-form]")) {
          state.filters[el.name] = el.value;
          render();
        }
      });

      root.addEventListener("input", (event) => {
        const el = event.target;
        if (el.name === "search" && el.closest("[data-recipe-filter-form]")) {
          state.filters.search = el.value;
          render();
          const input = root.querySelector('input[name="search"]');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }
      });

      root.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-recipe-contribute-form]");
        if (!form) return;
        event.preventDefault();
        const fd = new FormData(form);
        const intent = event.submitter?.dataset?.submitIntent || "draft";
        const title = String(fd.get("title") || "").trim();
        const sourceLocale = String(fd.get("sourceLocale") || "fr");
        const mode = String(fd.get("mode") || "manual");
        const optIn = fd.get("publicExportOptIn") === "on";
        const key = "community:demo-" + Date.now();
        state.recipes.push({
          recipeKey: key,
          revision: "1.0",
          origin: "community",
          sourceLocale,
          sourceUrl: String(fd.get("sourceUrl") || "").trim() || null,
          contributor: { ownerMemberId: "member-demo", publicCredit: String(fd.get("creditName") || "Membre").trim() },
          rights: {
            status: mode === "link_only" ? "link_only" : optIn ? "cleared" : "local_only",
            licenseId: mode === "link_only" ? "UNKNOWN" : optIn ? "CC-BY-SA-4.0" : "LOCAL-COMMUNITY-ONLY",
            attribution: String(fd.get("creditName") || "Membre").trim(),
            sourceEvidence: "Local preview submission",
            publicExportOptIn: optIn ? { granted: true, licenseId: "CC-BY-SA-4.0" } : { granted: false },
          },
          content: {
            baseServings: mode === "link_only" ? null : Number(fd.get("baseServings") || 4),
            prepMinutes: mode === "link_only" ? null : Number(fd.get("prepMinutes") || 15),
            cookMinutes: mode === "link_only" ? null : Number(fd.get("cookMinutes") || 20),
            seasons: fd.getAll("seasons"),
            category: "main",
            locales: {
              [sourceLocale]: {
                title,
                summary: "",
                steps: mode === "link_only" ? [] : String(fd.get("stepsText") || "").split(/\\r?\\n/).filter(Boolean),
                reviewStatus: "source",
                sourceRevision: "1.0",
              },
            },
          },
          ingredients: [],
          media: [],
          editorial: {
            workflowStatus: intent === "submit" ? "submitted" : "draft",
            collection: "community",
            planningReady: false,
            planningBlockers: [{ code: "missing_required_quantity", message: "Ingredients pending structured review" }],
          },
        });
        state.feedback = intent === "submit" ? "Submitted for coordinator review." : "Saved as private draft.";
        render();
      });

      render();
    </script>
  </body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PREVIEW_HTML);
    return;
  }
  if (url.pathname === "/api/preview/bundle") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(readFileSync(BUNDLE_PATH, "utf8"));
    return;
  }
  if (url.pathname === "/styles.css" || url.pathname.startsWith("/app/recipes/")) {
    const safePath = resolve(join(ROOT, "public", url.pathname));
    if (!safePath.startsWith(resolve(join(ROOT, "public")))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      const content = readFileSync(safePath);
      const mime = MIME_TYPES[extname(safePath)] || "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ParcOS Recipe UI Preview listening at http://127.0.0.1:${PORT}/`);
});
