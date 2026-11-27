import { agricultureForms, optionalNumber } from "./forms.js";

const endpoint = "/api/agriculture";

export async function mountGarden(root, { api, t, escapeHtml: h, manage, areas, beds, bedId, openBed }) {
  const f = agricultureForms(t, h);
  const label = {
    title: t("Plan du jardin", "Garden plan", "Tuinplan"),
    bed: t("Planche", "Bed", "Bed"), area: t("Lieu", "Area", "Locatie"),
    date: t("Plan au", "Plan on", "Plan op"), unknown: t("Non renseigné", "Unknown", "Onbekend"),
    measurements: t("Mesures et caractéristiques", "Measurements and conditions", "Metingen en kenmerken"),
    lengthM: t("Longueur (m)", "Length (m)", "Lengte (m)"),
    widthM: t("Largeur (m)", "Width (m)", "Breedte (m)"),
    grossM2: t("Surface brute (m²)", "Gross area (m²)", "Bruto-oppervlakte (m²)"),
    usableM2: t("Surface cultivable (m²)", "Usable area (m²)", "Beteelbare oppervlakte (m²)"),
    shape: t("Forme", "Shape", "Vorm"), location: t("Emplacement", "Location", "Ligging"),
    sun: t("Exposition au soleil", "Sun exposure", "Zonligging"),
    soil: t("Type de sol", "Soil type", "Bodemtype"), ph: "pH",
    drainage: t("Drainage", "Drainage", "Afwatering"),
    irrigation: t("Irrigation", "Irrigation", "Irrigatie"),
    protection: t("Protection", "Protection", "Bescherming"),
    support: t("Supports", "Supports", "Steunen"),
    accessibility: t("Accessibilité", "Accessibility", "Toegankelijkheid"),
    soilMeasurements: t("Analyses du sol", "Soil measurements", "Bodemmetingen"),
    soilMeasuredOn: t("Date d’analyse du sol", "Soil measurement date", "Datum bodemmeting"),
    measuredOn: t("Date de mesure", "Measurement date", "Meetdatum"),
    availability: t("Disponibilité physique", "Physical availability", "Fysieke beschikbaarheid"),
    confidence: t("Précision", "Confidence", "Nauwkeurigheid"),
    approximate: t("Approximative", "Approximate", "Geschat"), measured: t("Mesurée", "Measured", "Gemeten"),
    available: t("Disponible", "Available", "Beschikbaar"), limited: t("Limitée", "Limited", "Beperkt"),
    unavailable: t("Indisponible", "Unavailable", "Onbeschikbaar"),
    source: t("Source de la mesure", "Measurement source", "Meetbron"),
    mapped: t("Sur le plan", "Mapped", "Op het plan"), unmapped: t("Sans géométrie", "Unmapped", "Zonder geometrie"),
    legacy: t("Culture enregistrée", "Recorded crop", "Geregistreerd gewas"),
    resources: t("Installations", "Facilities", "Voorzieningen"),
    nursery: t("Pépinière", "Nursery", "Kwekerij"), bench: t("Table", "Bench", "Tafel"),
    tray: t("Plateau", "Tray", "Tray"), greenhouse: t("Serre", "Greenhouse", "Serre"),
    tunnel: t("Tunnel", "Tunnel", "Tunnel"), compost: t("Compost", "Compost", "Compost"),
    other: t("Autre", "Other", "Anders"), cell: t("Cellule", "Cell", "Cel"), plant: t("Plant", "Plant", "Plant"),
  };
  const feedback = (error) => {
    const notice = document.createElement("p");
    notice.setAttribute("role", "alert");
    notice.textContent = f.errorLabel(error);
    return notice;
  };
  const numbers = ["lengthM", "widthM", "grossM2", "usableM2", "ph"];
  const strings = ["shape", "location", "sun", "soil", "drainage", "irrigation", "protection", "support", "accessibility", "soilMeasurements"];
  const dates = ["soilMeasuredOn", "measuredOn"];
  const statuses = { availability: ["available", "limited", "unavailable"], confidence: ["approximate", "measured"] };
  const options = (values) => values.map((value) => [value, label[value]]);
  root.innerHTML = '<p role="status">' + h(t("Chargement…", "Loading…", "Laden…")) + "</p>";

  if (bedId) {
    const bed = beds.find(({ id }) => id === bedId);
    try {
      const data = await api(endpoint + "/beds/" + bedId + "/physical");
      root.innerHTML = '<div class="page-title"><h1>' + h(label.bed + " " + (bed?.code ?? bedId)) + '</h1></div>' +
        '<div class="ag-actions"><a class="button secondary" href="#/garden-plan' + (bed?.areaId ? "/" + bed.areaId : "") + '">' + h(label.title) +
        '</a><button type="button" class="button secondary" data-bed-summary>' +
        h(t("Voir le journal et les photos", "View log and photos", "Logboek en foto’s bekijken")) + "</button></div>" +
        (bed?.crop || bed?.variety ? '<p>' + h(label.legacy + " · " + [bed.crop, bed.variety].filter(Boolean).join(" · ")) + "</p>" : "") +
        '<div data-ag-physical></div>' +
        '<article class="ag-card"><h2>' + h(t("Historique du plan", "Map history", "Kaartgeschiedenis")) + "</h2>" +
        (data.geometry.length ? '<ul>' + data.geometry.map((shape) =>
          '<li>' + h(shape.validFrom + (shape.validTo ? " – " + shape.validTo : "") + " · " + shape.source.title +
          (shape.sourceRevision ? " · " + shape.sourceRevision : "")) + "</li>").join("") + "</ul>" : "<p>" + h(label.unmapped) + "</p>") + "</article>";
      displayPhysical(root.querySelector("[data-ag-physical]"), data.physical);
      root.querySelector("[data-bed-summary]").addEventListener("click", () => openBed(bedId));
    } catch (error) {
      root.replaceChildren(feedback(error));
    }
    return;
  }

  function displayPhysical(container, value = null) {
    const data = value ?? {};
    if (!manage) {
      const fields = [...numbers, ...strings, ...dates, ...Object.keys(statuses)];
      container.innerHTML = '<article class="ag-card"><h2>' + h(label.measurements) + '</h2><dl class="ag-definitions">' +
        fields.map((id) => "<dt>" + h(label[id]) + "</dt><dd>" + h(statuses[id] ? label[data[id]] ?? label.unknown : data[id] ?? label.unknown) + "</dd>").join("") +
        "<dt>" + h(label.source) + "</dt><dd>" + h(data.source?.title ?? label.unknown) + "</dd></dl></article>";
      return;
    }
    container.innerHTML = '<form class="ag-card ag-fields"><h2>' + h(label.measurements) + "</h2>" +
      numbers.map((id) => f.field(id, label[id], data[id], { type: "number" })).join("") +
      strings.map((id) => f.field(id, label[id], data[id])).join("") +
      dates.map((id) => f.field(id, label[id], data[id], { type: "date" })).join("") +
      Object.entries(statuses).map(([id, values]) => f.select(id, label[id], data[id], options(values))).join("") +
      f.field("source", label.source, data.source?.title) + f.field("sourceUrl", t("Lien de la source", "Source link", "Bronlink"), data.source?.url, { type: "url" }) + f.actions() + "</form>";
    let revision = data.revision;
    const form = container.querySelector("form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(form, async (formValues) => {
        const body = Object.fromEntries(Object.keys(formValues).map((id) => [id, formValues[id] || null]));
        for (const id of numbers) body[id] = optionalNumber(formValues[id]);
        body.source = formValues.source || formValues.sourceUrl ?
          { ...data.source, title: formValues.source, url: formValues.sourceUrl || null } : null;
        body.revision = revision;
        const { physical } = await api(endpoint + "/beds/" + bedId + "/physical", { method: "PUT", body: JSON.stringify(body) });
        revision = physical.revision;
      });
    });
  }

  const id = Number(location.hash.split("/")[2]) || areas[0]?.id;
  root.innerHTML = '<div class="page-title"><h1>' + h(label.title) + '</h1></div>' +
    '<form class="ag-search" data-plan-filter>' + f.select("area", label.area, id, areas.map((area) => [area.id, area.name]), true) +
    f.field("date", label.date, localDate(), { type: "date", required: true }) + '<button class="button secondary">' +
    h(t("Afficher", "Show", "Tonen")) + '</button></form><div data-ag-plan></div>';
  const form = root.querySelector("[data-plan-filter]");
  const panel = root.querySelector("[data-ag-plan]");
  if (!id) {
    panel.innerHTML = '<p class="empty-state">' + h(t("Aucun lieu accessible.", "No accessible areas.", "Geen toegankelijke locaties.")) + "</p>";
    return;
  }
  let latest = 0;
  async function load() {
    const request = ++latest;
    panel.setAttribute("aria-busy", "true");
    panel.textContent = t("Chargement…", "Loading…", "Laden…");
    try {
      const values = form.elements;
      const data = await api(endpoint + "/areas/" + values.area.value + "/plan?" + new URLSearchParams({ date: values.date.value }));
      if (request !== latest) return;
      showPlan(data);
    } catch (error) {
      if (request === latest) panel.replaceChildren(feedback(error));
    } finally {
      if (request === latest) panel.removeAttribute("aria-busy");
    }
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  function showPlan(plan) {
    const mapped = plan.beds.filter((bed) => bed.geometry);
    const mapLabel = t("Plan des planches", "Map of the beds", "Kaart van de bedden");
    const map = mapped.length ? '<svg class="ag-map" viewBox="0 0 1000 1000" role="group" aria-label="' + h(mapLabel) + '">' +
      mapped.map((bed) => {
        const points = bed.geometry.points.map(([x, y]) => [x * 1000, y * 1000]);
        const center = [0, 1].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
        return '<a href="#/garden-plan/beds/' + bed.id + '" aria-label="' + h(label.bed + " " + bed.code) + '"><polygon points="' +
          points.map((point) => point.join(",")).join(" ") + '"/><text x="' + center[0] + '" y="' + center[1] + '">' + h(bed.code) + "</text></a>";
      }).join("") + "</svg>" : '<p class="empty-state">' + h(t("Aucune géométrie pour cette date.", "No geometry for this date.", "Geen geometrie voor deze datum.")) + "</p>";
    panel.innerHTML = '<section class="ag-card"><h2>' + h(plan.area.name) + "</h2>" + map + "</section>" +
      '<section class="ag-card"><h2>' + h(t("Liste des planches", "Bed list", "Lijst van bedden")) + '</h2><ul class="ag-records">' +
      plan.beds.map((bed) => '<li><a class="button secondary" href="#/garden-plan/beds/' + bed.id + '">' + h(bed.code) + '</a> ' +
        h((bed.geometry ? label.mapped : label.unmapped) + " · " +
          (bed.physical?.usableM2 == null ? label.unknown : bed.physical.usableM2 + " m²") +
          (bed.legacyCrop ? " · " + bed.legacyCrop : "")) + "</li>").join("") + "</ul></section>" +
      '<section class="ag-card"><h2>' + h(label.resources) + "</h2>" +
      (plan.resources.length ? '<ul class="ag-records">' + plan.resources.map((resource) => '<li>' +
        (manage ? '<button type="button" class="button secondary" data-resource="' + resource.id + '">' + h(resource.name) + "</button>" : h(resource.name)) +
        " · " + h(label[resource.type] + (resource.capacity == null ? "" : " · " + resource.capacity + " " + label[resource.capacityUnit]) +
        (resource.archived ? " · " + t("Archivé", "Archived", "Gearchiveerd") : "")) + "</li>").join("") + "</ul>" : "<p>" + h(label.unknown) + "</p>") +
      (manage ? '<button type="button" class="button secondary" data-resource="">' + h(t("Ajouter une installation", "Add a facility", "Voorziening toevoegen")) + '</button><div data-resource-editor></div>' : "") +
      "</section>" + (manage ? planImport() : "");
    if (manage) {
      bindPlanImport(plan.area.id);
      panel.querySelectorAll("[data-resource]").forEach((button) => button.addEventListener("click", () => {
        editResource(plan, plan.resources.find(({ id }) => id === button.dataset.resource) ?? {});
      }));
    }
  }
  function planImport() {
    return '<form class="ag-card" data-plan-import><h2>' + h(t("Importer un plan", "Import a plan", "Plan importeren")) + "</h2>" +
      '<label class="ag-field">' + h(t("Fichier de géométrie (JSON)", "Geometry file (JSON)", "Geometriebestand (JSON)")) +
      '<input type="file" name="file" accept=".json,application/json" required></label>' +
      f.actions(t("Vérifier le plan", "Preview plan", "Plan controleren")) + '<div data-plan-preview></div></form>';
  }
  function bindPlanImport(areaId) {
    const importer = panel.querySelector("[data-plan-import]");
    const result = importer.querySelector("[data-plan-preview]");
    importer.addEventListener("submit", (event) => {
      event.preventDefault();
      result.replaceChildren();
      f.submit(importer, async ({ file }) => {
        if (file.size > 850000) throw Object.assign(new Error(), { code: "invalid", field: "file" });
        const payload = JSON.parse(await file.text());
        const send = (preview) => api(endpoint + "/areas/" + areaId + "/geometry", { method: "POST", body: JSON.stringify({ ...payload, preview }) });
        const { imported } = await send(true);
        const summary = document.createElement("p");
        summary.textContent = imported.map(({ code }) => code).join(", ");
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "button primary";
        confirm.textContent = t("Confirmer le plan", "Confirm plan", "Plan bevestigen");
        result.append(summary, confirm);
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          try { await send(false); await load(); }
          catch (error) { result.replaceChildren(feedback(error)); }
        });
      });
    });
  }
  function editResource(plan, resource) {
    const editor = panel.querySelector("[data-resource-editor]");
    editor.innerHTML = '<form class="ag-fields"><h2>' + h(label.resources) + "</h2>" +
      f.field("code", t("Code", "Code", "Code"), resource.code, { required: true }) +
      f.field("name", t("Nom", "Name", "Naam"), resource.name, { required: true }) +
      f.select("type", t("Type", "Type", "Type"), resource.type, options(["nursery", "bench", "tray", "greenhouse", "tunnel", "compost", "support", "other"]), true) +
      f.select("parentId", t("Installation parente", "Parent facility", "Bovenliggende voorziening"), resource.parentId,
        plan.resources.filter((row) => row.id !== resource.id && !row.archived).map(({ id, name }) => [id, name])) +
      f.field("capacity", t("Capacité", "Capacity", "Capaciteit"), resource.capacity, { type: "number", step: 1 }) +
      f.select("capacityUnit", t("Unité", "Unit", "Eenheid"), resource.capacityUnit, options(["tray", "cell", "plant"])) +
      f.field("conditions", t("Conditions", "Conditions", "Omstandigheden"), resource.conditions) +
      '<label><input name="archived" type="checkbox"' + (resource.archived ? " checked" : "") + '> ' + h(t("Archivé", "Archived", "Gearchiveerd")) + "</label>" +
      f.actions() + "</form>";
    const editorForm = editor.querySelector("form");
    editorForm.querySelector("h2").tabIndex = -1;
    editorForm.querySelector("h2").focus();
    editorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(editorForm, async (values) => {
        await api(endpoint + "/areas/" + plan.area.id + "/resources", { method: "PUT", body: JSON.stringify({
          ...resource, ...values, parentId: values.parentId || null, capacity: optionalNumber(values.capacity),
          capacityUnit: values.capacityUnit || null, archived: values.archived === "on",
        }) });
        await load();
      });
    });
  }
  await load();
}

function localDate() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value) => String(value).padStart(2, "0")).join("-");
}
