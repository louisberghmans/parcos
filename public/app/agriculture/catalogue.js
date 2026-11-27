import { agricultureForms, optionalNumber, splitList } from "./forms.js";

const endpoint = "/api/agriculture/catalogue";
const locales = ["fr", "nl", "en"];
const types = ["taxon", "crop", "variety", "profile"];

export async function mountCatalogue(root, { api, t, escapeHtml: h, locale, manage, cropId }) {
  const f = agricultureForms(t, h);
  const tr = {
    taxon: t("Espèce botanique", "Botanical taxon", "Botanisch taxon"),
    crop: t("Culture", "Crop", "Gewas"),
    variety: t("Variété", "Variety", "Ras"),
    profile: t("Profil de culture", "Cultivation profile", "Teeltprofiel"),
    draft: t("Brouillon", "Draft", "Concept"), reviewed: t("Vérifié", "Reviewed", "Gecontroleerd"),
    archived: t("Archivé", "Archived", "Gearchiveerd"),
    unknown: t("Non renseigné", "Unknown", "Onbekend"),
    source: t("Source", "Source", "Bron"), name: t("Nom", "Name", "Naam"),
    sources: t("Sources", "Sources", "Bronnen"),
    direct: t("Semis direct", "Direct sowing", "Rechtstreeks zaaien"),
    transplant: t("Semis et repiquage", "Sowing and transplanting", "Zaaien en uitplanten"),
    greenhouse: t("Serre", "Greenhouse", "Serre"), tunnel: t("Tunnel", "Tunnel", "Tunnel"),
    overwintering: t("Hivernage", "Overwintering", "Overwintering"),
    perennial: t("Vivace", "Perennial", "Meerjarig"),
    annual: t("Annuelle", "Annual", "Eenjarig"), biennial: t("Bisannuelle", "Biennial", "Tweejarig"),
    early: t("Précoce", "Early", "Vroeg"), intermediate: t("Intermédiaire", "Intermediate", "Middelvroeg"),
    late: t("Tardive", "Late", "Laat"),
    hard: t("Exigence", "Requirement", "Vereiste"), preference: t("Préférence", "Preference", "Voorkeur"),
    estimate: t("Estimation", "Estimate", "Schatting"),
    review: t("État de vérification", "Review status", "Controlestatus"),
    region: t("Région ou climat", "Region or climate", "Regio of klimaat"),
    description: t("Description", "Description", "Beschrijving"),
    synonyms: t("Synonymes, séparés par des virgules", "Synonyms, comma separated", "Synoniemen, gescheiden door komma’s"),
  };
  const parameterLabels = {
    sowingWindow: t("Période de semis", "Sowing window", "Zaaiperiode"),
    sowingDepth: t("Profondeur de semis", "Sowing depth", "Zaaidiepte"),
    sowingDensity: t("Densité de semis", "Sowing density", "Zaaidichtheid"),
    germinationTemperature: t("Température de germination", "Germination temperature", "Kiemtemperatuur"),
    germinationDuration: t("Durée de germination", "Germination duration", "Kiemduur"),
    germinationRate: t("Taux de germination", "Germination rate", "Kiempercentage"),
    nurseryDuration: t("Durée en pépinière", "Nursery duration", "Duur in de kwekerij"),
    trayCapacity: t("Cellules par plateau", "Cells per tray", "Cellen per tray"),
    thinning: t("Éclaircissage", "Thinning", "Uitdunnen"),
    hardeningOff: t("Acclimatation", "Hardening off", "Afharden"),
    transplantWindow: t("Période de repiquage", "Transplant window", "Uitplantperiode"),
    spacing: t("Espacement sur le rang", "In-row spacing", "Plantafstand"),
    transplantSurvival: t("Survie au repiquage", "Transplant survival", "Overleving na uitplanten"),
    rowSpacing: t("Distance entre rangs", "Row spacing", "Rijafstand"),
    areaPerPlant: t("Surface par plant", "Area per plant", "Oppervlakte per plant"),
    height: t("Hauteur", "Height", "Hoogte"), spread: t("Largeur du plant", "Plant spread", "Plantbreedte"),
    sunlight: t("Ensoleillement", "Sunlight", "Zonlicht"), soil: t("Sol", "Soil", "Bodem"),
    ph: "pH", drainage: t("Drainage", "Drainage", "Afwatering"),
    protection: t("Protection", "Protection", "Bescherming"), watering: t("Arrosage", "Watering", "Water geven"),
    weeding: t("Désherbage", "Weeding", "Wieden"), mulching: t("Paillage", "Mulching", "Mulchen"),
    pruning: t("Taille", "Pruning", "Snoeien"), staking: t("Tuteurage", "Staking", "Opbinden"),
    maturity: t("Délai de maturité", "Time to maturity", "Tijd tot rijpheid"),
    harvestWindow: t("Période de récolte", "Harvest window", "Oogstperiode"),
    yield: t("Rendement", "Yield", "Opbrengst"),
    storageConditions: t("Conditions de stockage", "Storage conditions", "Bewaaromstandigheden"),
    storageDuration: t("Durée de stockage", "Storage duration", "Bewaartijd"),
    labourSetup: t("Temps de préparation", "Setup labour", "Voorbereidingstijd"),
    labourVariable: t("Temps de travail variable", "Variable labour", "Variabele werktijd"),
    rotation: t("Rotation", "Rotation", "Vruchtwisseling"),
  };
  const unitLabel = (unit) => ({
    month: t("mois (1–12)", "month (1–12)", "maand (1–12)"),
    day: t("jours", "days", "dagen"), cell: t("cellules", "cells", "cellen"),
    "h/day": t("h/jour", "h/day", "u/dag"), C: "°C",
    "seed/m2": t("graines/m²", "seeds/m²", "zaden/m²"),
    "piece/plant": t("pièces/plant", "pieces/plant", "stuks/plant"),
    "bunch/m2": t("bottes/m²", "bunches/m²", "bosjes/m²"),
    "min/tray": t("min/plateau", "min/tray", "min/tray"),
  })[unit] ?? unit.replace("m2", "m²");
  const display = (item) => item.names?.[locale] ?? Object.values(item.names ?? {}).find(Boolean) ?? item.name ?? item.scientificName;
  const choices = (ids) => ids.map((id) => [id, tr[id]]);
  const listItem = (heading, value) => value ? "<p><strong>" + h(heading) + "</strong> " + h(value) + "</p>" : "";
  const fetchRecords = (query = "") => api(endpoint + "?" + new URLSearchParams({ q: query, ...(manage ? { manage: "1" } : {}) }));
  const searchLabel = t("Rechercher un légume ou une variété", "Search for a vegetable or variety", "Zoek een groente of ras");
  const title = manage ? t("Gérer le catalogue", "Manage the catalogue", "Catalogus beheren") :
    t("Catalogue des cultures", "Crop catalogue", "Gewassencatalogus");
  root.innerHTML = '<div class="page-title"><h1>' + h(title) + '</h1></div><div data-catalogue><p role="status">' +
    h(t("Chargement…", "Loading…", "Laden…")) + "</p></div>";
  const container = root.querySelector("[data-catalogue]");
  let data;
  try {
    data = await fetchRecords();
  } catch (error) {
    container.textContent = f.errorLabel(error);
    return;
  }
  if (!root.isConnected) return;
  const recordsOf = (type, selected) => data[type].filter((row) =>
    !selected || row.id === selected || row.cropId === selected || (type === "taxon" && row.id === data.crop.find(({ id }) => id === selected)?.taxonId));
  function cropCards(records) {
    if (!records.crop.length) return '<p class="empty-state">' + h(t("Aucune culture trouvée.", "No crops found.", "Geen gewassen gevonden.")) + "</p>";
    return '<div class="ag-grid">' + records.crop.map((crop) => {
      const taxon = records.taxon.find(({ id }) => id === crop.taxonId);
      const varieties = records.variety.filter(({ cropId }) => cropId === crop.id);
      return '<article class="ag-card"><h2><a href="#/crops/' + crop.id + '">' + h(display(crop)) + "</a></h2>" +
        (taxon ? "<p><i>" + h(taxon.scientificName) + "</i></p>" : "") +
        (varieties.length ? "<p>" + h(varieties.map(display).join(", ")) + "</p>" : "") + "</article>";
    }).join("") + "</div>";
  }
  function cropDetail() {
    const crop = data.crop.find(({ id }) => id === cropId);
    const back = '<a class="button secondary" href="#/crops">' + h(t("Toutes les cultures", "All crops", "Alle gewassen")) + "</a>";
    if (!crop) return back + "<p>" + h(t("Culture introuvable.", "Crop not found.", "Gewas niet gevonden.")) + "</p>";
    const taxon = data.taxon.find(({ id }) => id === crop.taxonId);
    const descriptions = crop.description;
    const months = crop.availability?.months.map((month) => monthName(locale, month)).join(", ");
    return back + '<article class="ag-card"><h2>' + h(display(crop)) + "</h2><p><i>" + h(taxon?.scientificName ?? "") + "</i></p><p>" +
      h(descriptions[locale] ?? Object.values(descriptions).find(Boolean) ?? "") + "</p>" +
      listItem(t("Famille", "Family", "Familie"), taxon?.family) +
      listItem(t("Cycle", "Lifecycle", "Levenscyclus"), tr[crop.lifecycle]) +
      listItem(t("Disponibilité habituelle", "Typical availability", "Gebruikelijke beschikbaarheid"), months ? months + " (" + crop.availability.context + ")" : tr.unknown) +
      '<h3>' + h(tr.variety) + '</h3><ul>' + recordsOf("variety", cropId).map((variety) =>
        "<li><strong>" + h(variety.name) + "</strong>" + (variety.growthHabit ? " · " + h(variety.growthHabit) : "") + "</li>").join("") +
      '</ul><h3>' + h(tr.profile) + "</h3>" + (recordsOf("profile", cropId).map((profile) => {
        const claims = Object.entries(profile.parameters).filter(([, claim]) => claim);
        return '<details><summary>' + h(profile.name + " · " + tr[profile.method] + " · " + profile.context) + "</summary>" +
          (claims.length ? "<ul>" + claims.map(([name, claim]) => {
            const value = claim.unit === "month" ? monthName(locale, claim.min) + " – " + monthName(locale, claim.max) :
              claim.text ?? (claim.min === claim.max ? String(claim.min) : claim.min + "–" + claim.max) + " " + unitLabel(claim.unit);
            return "<li>" + h(parameterLabels[name] + " · " + value + (claim.source ? " · " + claim.source.title : "")) + "</li>";
          }).join("") + "</ul>" : "<p>" + h(tr.unknown) + "</p>") + "</details>";
      }).join("") || "<p>" + h(tr.unknown) + "</p>") + "</article>";
  }

  if (!manage && cropId) {
    container.innerHTML = cropDetail();
    return;
  }
  if (!manage) {
    container.innerHTML = '<form data-ag-search class="ag-search">' + f.field("q", searchLabel, "", { type: "search" }) +
      '<button class="button secondary">' + h(t("Rechercher", "Search", "Zoeken")) + '</button></form><div aria-live="polite" data-ag-results></div>';
    const results = container.querySelector("[data-ag-results]");
    const form = container.querySelector("[data-ag-search]");
    results.innerHTML = cropCards(data);
    let sequence = 0;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const request = ++sequence;
      results.setAttribute("aria-busy", "true");
      try {
        const found = await fetchRecords(form.elements.q.value);
        if (request === sequence) results.innerHTML = cropCards(found);
      } catch (error) {
        if (request === sequence) results.textContent = f.errorLabel(error);
      } finally {
        if (request === sequence) results.removeAttribute("aria-busy");
      }
    });
    return;
  }

  const panel = document.createElement("div");
  container.append(panel);
  function renderManager() {
    panel.innerHTML = '<div class="ag-grid">' + types.map((type) =>
      '<section class="ag-card"><h2>' + h(tr[type]) + '</h2><button type="button" data-ag-new="' + type + '" class="button secondary">' +
      h(t("Ajouter", "Add", "Toevoegen")) + '</button><ul class="ag-records">' + data[type].map((record) =>
        '<li><button type="button" class="button secondary" data-ag-edit="' + type + '" data-id="' + record.id + '">' +
        h(display(record)) + " · " + h(tr[record.review]) + "</button></li>").join("") + "</ul></section>").join("") +
      '</div><div data-ag-editor></div>' + importPanel();
    panel.querySelectorAll("[data-ag-new],[data-ag-edit]").forEach((button) => button.addEventListener("click", () => {
      const { agNew, agEdit, id } = button.dataset;
      editRecord(agNew ?? agEdit, agNew ? {} : data[agEdit].find((record) => record.id === id));
    }));
    bindImport();
  }

  const flag = (name, label, record, options) => f.select(name, label, record[name], choices(options));
  const relation = (type, name, value, required = false) => f.select(name, tr[type], value,
    data[type].map((entry) => [entry.id, display(entry)]), required);
  const translations = (record, description) => locales.map((language) =>
    '<fieldset><legend>' + language.toUpperCase() + '</legend>' +
    f.field("name_" + language, tr.name, record.names?.[language]) +
    f.field("synonyms_" + language, tr.synonyms, record.synonyms?.[language]?.join(", ")) +
    (description ? f.area("description_" + language, tr.description, record.description?.[language]) : "") + "</fieldset>").join("");
  const fields = {
    taxon: (r) => f.field("scientificName", t("Nom scientifique", "Scientific name", "Wetenschappelijke naam"), r.scientificName, { required: true }) +
      f.field("family", t("Famille", "Family", "Familie"), r.family) + f.field("genus", t("Genre", "Genus", "Geslacht"), r.genus) +
      f.field("species", t("Espèce", "Species", "Soort"), r.species) + translations(r, false),
    crop: (r) => relation("taxon", "taxonId", r.taxonId, true) + translations(r, true) +
      f.field("category", t("Catégorie culinaire (code)", "Culinary category (code)", "Culinaire categorie (code)"), r.category) +
      f.field("edibleParts", t("Parties comestibles (codes séparés par des virgules)", "Edible parts (comma-separated codes)", "Eetbare delen (kommagescheiden codes)"), r.edibleParts?.join(", ")) +
      flag("lifecycle", t("Cycle de vie", "Lifecycle", "Levenscyclus"), r, ["annual", "biennial", "perennial"]) +
      f.field("rotationGroup", t("Groupe de rotation", "Rotation group", "Rotatiegroep"), r.rotationGroup) +
      '<fieldset><legend>' + h(t("Disponibilité habituelle", "Typical availability", "Gebruikelijke beschikbaarheid")) + "</legend>" +
      f.field("months", t("Mois (1–12, séparés par des virgules)", "Months (1–12, comma separated)", "Maanden (1–12, kommagescheiden)"), r.availability?.months.join(", ")) +
      f.field("availabilityContext", tr.region, r.availability?.context) + sourceFields("availability", r.availability?.source) + "</fieldset>",
    variety: (r) => relation("crop", "cropId", r.cropId, true) + f.field("name", tr.name, r.name, { required: true }) +
      f.field("aliases", tr.synonyms, r.aliases?.join(", ")) +
      f.field("growthHabit", t("Type de croissance", "Growth habit", "Groeiwijze"), r.growthHabit) +
      flag("maturity", t("Précocité", "Maturity", "Vroegheid"), r, ["early", "intermediate", "late"]) +
      '<fieldset><legend>' + h(t("Modes de culture", "Growing methods", "Teeltmethoden")) + "</legend>" +
      data.methods.map((method) => '<label><input type="checkbox" name="method_' + method + '"' + (r.methods?.includes(method) ? " checked" : "") + "> " + h(tr[method]) + "</label>").join("") +
      "</fieldset>" + parameterFields(r.overrides) + resistanceFields(r.resistance),
    profile: (r) => relation("crop", "cropId", r.cropId, true) + relation("variety", "varietyId", r.varietyId) +
      f.field("name", tr.name, r.name, { required: true }) +
      f.select("method", t("Méthode", "Method", "Methode"), r.method, choices(data.methods), true) +
      f.field("context", tr.region, r.context, { required: true }) +
      f.field("environment", t("Milieu de culture", "Growing environment", "Teeltomgeving"), r.environment) +
      parameterFields(r.parameters),
  };
  function sourceFields(prefix, value) {
    return f.field(prefix + "_title", tr.source, value?.title) +
      f.field(prefix + "_url", "URL", value?.url, { type: "url" }) +
      f.field(prefix + "_date", t("Date de consultation", "Date accessed", "Datum geraadpleegd"), value?.retrievedOn, { type: "date" });
  }
  function readSource(values, prefix) {
    return values[prefix + "_title"] || values[prefix + "_url"] || values[prefix + "_date"] ?
      { title: values[prefix + "_title"], url: values[prefix + "_url"] || null, retrievedOn: values[prefix + "_date"] || null } : null;
  }
  function parameterFields(values = {}) {
    return '<details class="ag-collapse"><summary>' + h(t("Paramètres de culture", "Cultivation parameters", "Teeltparameters")) + "</summary>" +
      Object.entries(data.parameterUnits).map(([name, unit]) => {
        const p = values[name];
        const units = Array.isArray(unit) ? unit : [unit];
        return '<details><summary>' + h(parameterLabels[name]) + (p ? " ✓" : "") + '</summary><div class="ag-fields">' +
          (unit === "text" ? f.field(name + "_text", t("Valeur", "Value", "Waarde"), p?.text) :
            f.select(name + "_unit", t("Unité", "Unit", "Eenheid"), p?.unit ?? units[0], units.map((u) => [u, unitLabel(u)])) +
            f.field(name + "_min", t("Minimum / début", "Minimum / start", "Minimum / begin"), p?.min, { type: "number" }) +
            f.field(name + "_max", t("Maximum / fin", "Maximum / end", "Maximum / einde"), p?.max, { type: "number" })) +
          f.select(name + "_constraint", t("Type de valeur", "Value type", "Waardetype"), p?.constraint, choices(["hard", "preference", "estimate"])) +
          f.select(name + "_review", tr.review, p?.review ?? "draft", choices(["draft", "reviewed"])) +
          f.field(name + "_conditions", t("Conditions d’application", "Applicable conditions", "Toepassingsvoorwaarden"), p?.conditions) +
          sourceFields(name, p?.source) + "</div></details>";
      }).join("") + "</details>";
  }
  function readParameters(values) {
    return Object.fromEntries(Object.entries(data.parameterUnits).filter(([key]) =>
      values[key + "_text"] || values[key + "_min"] || values[key + "_max"]).map(([key, unit]) => [key, {
      unit: unit === "text" ? unit : values[key + "_unit"],
      text: values[key + "_text"], min: optionalNumber(values[key + "_min"]), max: optionalNumber(values[key + "_max"]),
      constraint: values[key + "_constraint"], review: values[key + "_review"] || "draft",
      conditions: values[key + "_conditions"], source: readSource(values, key),
    }]));
  }
  function resistanceFields(rows = []) {
    return '<details class="ag-collapse"><summary>' + h(t("Résistances documentées", "Documented resistance", "Gedocumenteerde resistentie")) + "</summary>" +
      Array.from({ length: Math.min(50, rows.length + 1) }, (_, i) =>
        f.field("resistance_" + i, tr.description, rows[i]?.text) + sourceFields("resistance_" + i, rows[i]?.source)).join("") + "</details>";
  }

  function editRecord(type, record) {
    const editor = panel.querySelector("[data-ag-editor]");
    editor.innerHTML = '<form class="ag-card ag-fields"><h2>' + h(tr[type]) + '</h2>' + fields[type](record) +
      f.select("review", tr.review, record.review ?? "draft", choices(["draft", "reviewed", "archived"])) +
      '<details class="ag-collapse"><summary>' + h(tr.sources) + "</summary>" +
      Array.from({ length: Math.min(20, (record.sources?.length ?? 0) + 1) }, (_, i) => sourceFields("source_" + i, record.sources?.[i])).join("") +
      "</details>" + f.actions() + "</form>";
    const form = editor.querySelector("form");
    form.querySelector("h2").tabIndex = -1;
    form.querySelector("h2").focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(form, async (values) => {
        const mapped = Object.fromEntries(Object.keys(values).filter((key) => !key.includes("_")).map((key) => [key, values[key] || null]));
        mapped.sources = Array.from({ length: 20 }, (_, i) => readSource(values, "source_" + i)).filter(Boolean);
        mapped.names = Object.fromEntries(locales.map((language) => [language, values["name_" + language] || null]));
        mapped.synonyms = Object.fromEntries(locales.map((language) => [language, splitList(values["synonyms_" + language])]));
        mapped.description = Object.fromEntries(locales.map((language) => [language, values["description_" + language] || null]));
        mapped.availability = values.months ? { months: splitList(values.months).map(Number), context: values.availabilityContext, source: readSource(values, "availability") } : null;
        mapped.edibleParts = splitList(values.edibleParts);
        mapped.aliases = splitList(values.aliases);
        mapped.methods = data.methods.filter((method) => values["method_" + method]);
        mapped.resistance = Array.from({ length: 50 }, (_, i) => values["resistance_" + i] ?
          { text: values["resistance_" + i], source: readSource(values, "resistance_" + i) } : null).filter(Boolean);
        mapped.overrides = mapped.parameters = readParameters(values);
        const { record: saved } = await api(endpoint + "/" + type, { method: "PUT", body: JSON.stringify({ ...record, ...mapped }) });
        data = await fetchRecords();
        renderManager();
        editRecord(type, saved);
        panel.querySelector("[data-ag-editor] [data-ag-feedback]").textContent = t("Enregistré.", "Saved.", "Opgeslagen.");
      });
    });
  }

  function importPanel() {
    return '<section class="ag-card"><h2>' + h(t("Importer ou exporter", "Import or export", "Importeren of exporteren")) + '</h2>' +
      '<div class="ag-actions"><a class="button secondary" href="' + endpoint + '/export">JSON</a><a class="button secondary" href="' +
      endpoint + '/export?format=csv">CSV</a></div><form data-ag-import>' +
      '<label class="ag-field">' + h(t("Fichier catalogue (CSV ou JSON)", "Catalogue file (CSV or JSON)", "Catalogusbestand (CSV of JSON)")) +
      '<input name="file" type="file" accept=".json,.csv" required></label>' +
      f.actions(t("Vérifier le fichier", "Preview file", "Bestand controleren")) +
      '<div data-preview aria-live="polite"></div></form></section>';
  }
  function bindImport() {
    const form = panel.querySelector("[data-ag-import]");
    const result = form.querySelector("[data-preview]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      result.replaceChildren();
      f.submit(form, async ({ file }) => {
        if (file.size > 850000) throw Object.assign(new Error(), { code: "invalid", field: "file" });
        const contents = await file.text();
        const payload = file.name.toLowerCase().endsWith(".csv") ? { csv: contents } : { records: JSON.parse(contents).records };
        const send = (preview) => api(endpoint + "/import", { method: "POST", body: JSON.stringify({ ...payload, preview }) });
        const { records } = await send(true);
        const summary = document.createElement("p");
        summary.textContent = records.map(({ type, record }) => tr[type] + " · " + display(record)).join("; ");
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "button primary";
        confirm.textContent = t("Confirmer l’import", "Confirm import", "Import bevestigen");
        result.append(summary, confirm);
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          try {
            await send(false);
            data = await fetchRecords();
            renderManager();
            panel.querySelector("[data-ag-feedback]").textContent = t("Import terminé.", "Import complete.", "Import voltooid.");
          } catch (error) {
            result.textContent = f.errorLabel(error);
          }
        });
      });
    });
  }
  renderManager();
}

function monthName(locale, month) {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month - 1, 1)));
}

