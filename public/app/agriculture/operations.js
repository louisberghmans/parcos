import { agricultureForms, optionalNumber, splitList } from "./forms.js";
import { localDay } from "./cultivation.js";

const endpoint = "/api/agriculture";

export async function mountOperations(root, { api, t, escapeHtml: h, locale, refreshTasks }) {
  const f = agricultureForms(t, h);
  const text = {
    prepare: t("Préparer", "Prepare", "Voorbereiden"), sow: t("Semer", "Sow", "Zaaien"),
    thin: t("Éclaircir", "Thin", "Uitdunnen"), potUp: t("Rempoter", "Pot up", "Verpotten"),
    harden: t("Acclimater", "Harden off", "Afharden"), transplant: t("Repiquer", "Transplant", "Uitplanten"),
    support: t("Installer des supports", "Install supports", "Steunen plaatsen"),
    water: t("Arroser", "Water", "Water geven"), weed: t("Désherber", "Weed", "Wieden"),
    mulch: t("Pailler", "Mulch", "Mulchen"), prune: t("Tailler", "Prune", "Snoeien"),
    harvest: t("Récolter", "Harvest", "Oogsten"), clear: t("Libérer", "Clear", "Vrijmaken"),
    other: t("Autre", "Other", "Anders"),
    title: t("Nom de l’opération", "Operation name", "Naam van de handeling"),
    status: t("État", "Status", "Status"), draft: t("Brouillon", "Draft", "Concept"),
    ready: t("Prête à planifier", "Ready to schedule", "Klaar om te plannen"),
    archived: t("Archivée", "Archived", "Gearchiveerd"),
    kind: t("Type d’opération", "Operation type", "Type handeling"),
    cropId: t("Culture", "Crop", "Gewas"), profileId: t("Profil de culture", "Cultivation profile", "Teeltprofiel"),
    materials: t("Matériaux (séparés par des virgules)", "Materials (comma separated)", "Materialen (kommagescheiden)"),
    tools: t("Outils (séparés par des virgules)", "Tools (comma separated)", "Gereedschap (kommagescheiden)"),
    anchor: t("Opération de référence", "Reference operation", "Referentiehandeling"),
    startOffsetDays: t("Début relatif (jours)", "Earliest offset (days)", "Vroegste streefdag (dagen)"),
    endOffsetDays: t("Fin relative (jours)", "Latest offset (days)", "Laatste streefdag (dagen)"),
    setupMinutes: t("Temps de préparation (min)", "Setup time (min)", "Voorbereidingstijd (min)"),
    variableMinutes: t("Temps variable (min)", "Variable time (min)", "Variabele tijd (min)"),
    variableBasis: t("Par unité", "Per unit", "Per eenheid"),
    plant: t("Plant", "Plant", "Plant"), m2: "m²", m: "m", tray: t("Plateau", "Tray", "Tray"), bed: t("Planche", "Bed", "Bed"),
    recurrenceDays: t("Répéter après (jours)", "Repeat after (days)", "Herhalen na (dagen)"),
    trigger: t("Observation déclenchante", "Observation trigger", "Observatietrigger"),
    instructions: t("Instructions", "Instructions", "Instructies"),
    completion: t("Critères de fin", "Completion criteria", "Afrondcriteria"),
    safety: t("Consignes de sécurité", "Safety considerations", "Veiligheidsinstructies"),
    dependencies: t("Opérations précédentes", "Preceding operations", "Voorafgaande handelingen"),
  };
  const choose = (ids) => ids.map((id) => [id, text[id]]);
  const name = (crop) => crop.names[locale] ?? Object.values(crop.names).find(Boolean) ?? crop.id;
  const apiWrite = (path, method, body) => api(endpoint + path, { method, body: JSON.stringify(body) });
  root.innerHTML = '<p role="status">' + h(t("Chargement…", "Loading…", "Laden…")) + "</p>";
  let batches;
  let records;
  let catalogue;
  try {
    [records, batches, catalogue] = await Promise.all([
      api(endpoint + "/operations"), api(endpoint + "/batches"), api(endpoint + "/catalogue?manage=1"),
    ]);
  } catch (error) {
    root.textContent = f.errorLabel(error);
    return;
  }
  if (!root.isConnected) return;
  const templates = records.templates;
  function render() {
    root.innerHTML = '<div class="page-title"><h1>' + h(t("Opérations de culture", "Cultivation operations", "Teelthandelingen")) + '</h1></div>' +
      '<section class="ag-card"><h2>' + h(t("Modèles", "Templates", "Sjablonen")) + '</h2><button class="button secondary" data-template="">' +
      h(t("Ajouter un modèle", "Add a template", "Sjabloon toevoegen")) + '</button><ul class="ag-records">' + templates.map((template) =>
        '<li><button type="button" data-template="' + template.id + '" class="button secondary">' +
        h(template.title + " · " + text[template.status] + " · v" + template.revision) + "</button></li>").join("") +
      '</ul><div data-template-editor></div></section><section class="ag-card"><form class="ag-fields" data-schedule><h2>' +
      h(t("Créer une tâche pour un lot", "Create a task for a batch", "Taak voor een partij aanmaken")) + "</h2>" +
      f.select("batchId", t("Lot", "Batch", "Partij"), null, batches.batches.filter((batch) =>
        !["completed", "failed", "cancelled"].includes(batch.status)).map((batch) => [batch.id, batch.code]), true) +
      '<div data-template-choice></div><div data-task-bed></div>' +
      f.field("scheduledOn", t("Date d’échéance", "Due date", "Vervaldatum"), localDay(), { type: "date", required: true }) +
      f.actions(t("Confirmer la tâche", "Confirm task", "Taak bevestigen")) + "</form></section>";
    root.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () =>
      edit(templates.find(({ id }) => id === button.dataset.template) ?? {})));
    const form = root.querySelector("[data-schedule]");
    const templateSelect = form.querySelector("[data-template-choice]");
    const bedSelect = form.querySelector("[data-task-bed]");
    async function changeBatch() {
      const id = form.elements.batchId.value;
      const batch = batches.batches.find((item) => item.id === id);
      const compatible = templates.filter((template) => batch && template.status === "ready" &&
        (!template.cropId || template.cropId === batch.cropId) && (!template.profileId || template.profileId === batch.profileId));
      templateSelect.innerHTML = f.select("templateId", t("Modèle", "Template", "Sjabloon"), null, compatible.map((row) => [row.id, row.title]), true);
      bedSelect.replaceChildren();
      if (!id) return;
      try {
        const { beds } = await api(endpoint + "/operations/batches/" + id);
        if (form.elements.batchId.value === id) bedSelect.innerHTML = f.select("bedId", text.bed, null, beds.map((bed) => [bed.id, bed.code]));
      } catch (error) {
        if (form.elements.batchId.value === id) bedSelect.textContent = f.errorLabel(error);
      }
    }
    changeBatch();
    form.elements.batchId.addEventListener("change", changeBatch);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(form, async (value) => {
        const template = templates.find(({ id }) => id === value.templateId);
        await apiWrite("/operations/tasks", "POST", { ...value, templateRevision: template?.revision, bedId: optionalNumber(value.bedId) });
        await refreshTasks();
      });
    });
  }

  function edit(record) {
    const editor = root.querySelector("[data-template-editor]");
    const numberFields = ["startOffsetDays", "endOffsetDays", "setupMinutes", "variableMinutes", "recurrenceDays"];
    editor.innerHTML = '<form class="ag-fields"><h2 tabindex="-1">' + h(t("Modèle d’opération", "Operation template", "Handelingssjabloon")) + "</h2>" +
      f.field("title", text.title, record.title, { required: true }) +
      f.select("kind", text.kind, record.kind, choose(records.kinds), true) +
      f.select("status", text.status, record.status ?? "draft", choose(["draft", "ready", "archived"]), true) +
      f.select("cropId", text.cropId, record.cropId, catalogue.crop.filter((item) => item.review !== "archived").map((item) => [item.id, name(item)])) +
      f.select("profileId", text.profileId, record.profileId, catalogue.profile.filter((item) => item.review !== "archived").map((item) => [item.id, item.name])) +
      f.select("anchor", text.anchor, record.anchor, choose(records.anchors)) +
      numberFields.map((key) => f.field(key, text[key], record[key], { type: "number" })).join("") +
      f.select("variableBasis", text.variableBasis, record.variableBasis, choose(records.labourUnits)) +
      ["materials", "tools"].map((key) => f.field(key, text[key], record[key]?.join(", "))).join("") +
      f.field("trigger", text.trigger, record.trigger) +
      ["instructions", "completion", "safety"].map((key) => f.area(key, text[key], record[key])).join("") +
      '<fieldset><legend>' + h(text.dependencies) + "</legend>" + templates.filter((row) => row.id !== record.id).map((row) =>
        '<label><input type="checkbox" name="dependencies" value="' + row.id + '"' +
        (record.dependencies?.includes(row.id) ? " checked" : "") + "> " + h(row.title) + "</label>").join("") + "</fieldset>" + f.actions() + "</form>";
    const form = editor.querySelector("form");
    form.querySelector("h2").focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(form, async (values) => {
        const body = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null]));
        numberFields.forEach((key) => { body[key] = optionalNumber(values[key]); });
        body.materials = splitList(values.materials);
        body.tools = splitList(values.tools);
        body.dependencies = new FormData(form).getAll("dependencies");
        const { template } = await apiWrite("/operations", "PUT", { ...record, ...body });
        const index = templates.findIndex(({ id }) => id === template.id);
        if (index < 0) templates.unshift(template);
        else templates[index] = template;
        render();
        edit(template);
        root.querySelector("[data-template-editor] [data-ag-feedback]").textContent = t("Enregistré.", "Saved.", "Opgeslagen.");
      });
    });
  }
  render();
}

export async function mountOccupancy(root, { api, t, escapeHtml: h, locale, areas }) {
  const f = agricultureForms(t, h);
  const unknown = t("Non renseigné", "Unknown", "Onbekend");
  const yes = t("Occupation constatée", "Confirmed occupancy", "Bevestigde bezetting");
  const reserved = t("Réservé", "Reserved", "Gereserveerd");
  const name = (names) => names[locale] ?? Object.values(names).find(Boolean) ?? unknown;
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const units = { piece: t("pièce", "piece", "stuk"), bunch: t("botte", "bunch", "bos") };
  root.innerHTML = '<div class="page-title"><h1>' + h(t("Occupation et récoltes", "Occupancy and harvests", "Bezetting en oogst")) + '</h1></div>' +
    '<form class="ag-card ag-fields" data-occupancy-filter>' +
    f.select("area", t("Filtrer par lieu", "Filter by area", "Filter op locatie"), null, areas.map(({ id, name }) => [id, name])) +
    f.field("date", t("Occupation au", "Occupancy on", "Bezetting op"), localDay(), { type: "date", required: true }) +
    f.field("from", t("Récoltes à partir du", "Harvests from", "Oogst vanaf"), null, { type: "date" }) +
    f.field("to", t("Récoltes jusqu’au", "Harvests through", "Oogst tot en met"), null, { type: "date" }) +
    f.actions(t("Afficher", "Show", "Tonen")) + '</form><div data-occupancy-results aria-live="polite"></div>';
  const form = root.querySelector("[data-occupancy-filter]");
  form.elements.area.options[0].textContent = t("Tous les lieux accessibles", "All accessible areas", "Alle toegankelijke locaties");
  const results = root.querySelector("[data-occupancy-results]");
  function metrics(value, title) {
    return '<article class="ag-card"><h2>' + h(title) + "</h2><p><strong>" + h(value.percentage == null ? unknown : formatted.format(value.percentage) + "%") +
      "</strong> · " + h(formatted.format(value.occupiedKnownArea) + " / " + formatted.format(value.totalKnownArea) + " m²") + "</p><p>" +
      h(t("Planches exclues faute de plan ou de surface", "Beds excluded for missing map or area", "Bedden zonder kaart of oppervlakte") +
        " · " + value.unknownBeds) + "</p><p>" +
      h(t("Planches aux emprises incomplètes ou incompatibles", "Beds with incomplete or conflicting footprints", "Bedden met onvolledige of tegenstrijdige indeling") +
        " · " + (value.partialBeds + value.conflictingBeds)) + "</p></article>";
  }
  async function load(values) {
    results.textContent = t("Chargement…", "Loading…", "Laden…");
    try {
      const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
      const data = await api(endpoint + "/occupancy?" + query);
      results.innerHTML = '<div class="ag-grid">' + metrics(data.reserved, reserved) + metrics(data.actual, yes) + "</div>" +
        '<section class="ag-card"><h2>' + h(t("Cultures par planche", "Crops by bed", "Gewassen per bed")) + '</h2><ul class="ag-records">' +
        data.beds.filter((bed) => bed.footprints.length).map((bed) => '<li><a href="#/garden-plan/beds/' + bed.id + '">' + h(bed.code + " · " + bed.areaName) +
          "</a><ul>" + bed.footprints.map((footprint) => "<li>" + h(footprint.startM + "–" + footprint.endM + " m") + " · " +
            footprint.batches.map((batch) => '<a href="#/batches/' + batch.id + '">' + h(name(batch.cropNames)) + "</a> (" + h(batch.actual ? yes : reserved) + ")").join(", ") +
          "</li>").join("") + "</ul></li>").join("") + "</ul></section>" +
        '<section class="ag-card"><h2>' + h(t("Récoltes mesurées", "Measured harvests", "Gemeten oogst")) + "</h2>" +
        (data.harvests.length ? "<ul>" + data.harvests.map((row) => "<li>" + h(name(row.names) + " · " + formatted.format(row.amount) +
          " " + (units[row.unit] ?? row.unit)) + "</li>").join("") + "</ul>" : "<p>" + h(t("Aucune mesure pour cette période.", "No measurements for this period.", "Geen metingen voor deze periode.")) + "</p>") + "</section>";
    } catch (error) {
      results.textContent = f.errorLabel(error);
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    await load(Object.fromEntries(new FormData(form)));
    button.disabled = false;
  });
  await load(Object.fromEntries(new FormData(form)));
}
