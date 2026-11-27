import { agricultureForms, optionalNumber } from "./forms.js";
import { mountLabels } from "./labels.js";

const endpoint = "/api/agriculture";

export async function mountCultivation(root, { api, t, escapeHtml: h, locale, manage, beds, id, compressPhoto }) {
  const f = agricultureForms(t, h);
  const words = {
    title: t("Lots de culture", "Cultivation batches", "Teeltpartijen"),
    crop: t("Culture", "Crop", "Gewas"), variety: t("Variété", "Variety", "Ras"),
    batch: t("Lot", "Batch", "Partij"), profile: t("Profil de culture", "Cultivation profile", "Teeltprofiel"),
    code: "Code", nursery: t("Pépinière ou plateau", "Nursery or tray", "Kwekerij of tray"),
    direct: t("Semis direct", "Direct sowing", "Rechtstreeks zaaien"),
    transplantRoute: t("Passage en pépinière", "Nursery and transplant", "Kwekerij en uitplanten"),
    seedSource: t("Source des semences", "Seed source", "Zaadbron"),
    seedLot: t("Lot de semences", "Seed lot", "Zaadpartij"),
    route: t("Parcours", "Route", "Traject"), sowPlannedOn: t("Semis prévu", "Planned sowing", "Geplande zaai"),
    transplantPlannedOn: t("Repiquage prévu", "Planned transplant", "Gepland uitplanten"),
    transplantExpectedOn: t("Repiquage estimé", "Forecast transplant", "Verwachte uitplanting"),
    harvestExpectedFrom: t("Récolte estimée à partir du", "Forecast harvest from", "Verwachte oogst vanaf"),
    harvestExpectedTo: t("Récolte estimée jusqu’au", "Forecast harvest until", "Verwachte oogst tot"),
    seedsPlanned: t("Graines prévues", "Planned seeds", "Geplande zaden"),
    nextOperation: t("Prochaine opération", "Next operation", "Volgende handeling"),
    nextOperationOn: t("Date prévue de l’opération", "Expected operation date", "Verwachte datum van de handeling"),
    sown: t("Semé", "Sown", "Gezaaid"), sow: t("Semer", "Sow", "Zaaien"),
    germination: t("Compter la germination", "Record germination", "Kieming registreren"),
    germinated: t("Germé", "Germinated", "Gekiemd"),
    move: t("Déplacer en pépinière", "Move within nursery", "Verplaatsen in kwekerij"),
    discard: t("Enregistrer une perte", "Record a loss", "Verlies registreren"),
    transplant: t("Repiquer", "Transplant", "Uitplanten"),
    plant: t("Semer sur une autre parcelle", "Sow on another footprint", "Op een ander perceeldeel zaaien"),
    observation: t("Observer", "Observe", "Observeren"),
    maintenance: t("Entretien", "Maintenance", "Onderhoud"),
    ready: t("Prêt à récolter", "Ready to harvest", "Oogstrijp"),
    growing: t("En croissance", "Growing", "In groei"),
    completed: t("Terminé", "Completed", "Afgerond"), failed: t("Échec", "Failed", "Mislukt"),
    cancelled: t("Annulé", "Cancelled", "Geannuleerd"),
    planned: t("Planifié", "Planned", "Gepland"),
    bed: t("Planche", "Bed", "Bed"), plants: t("Nombre de plants", "Plant count", "Aantal planten"),
    date: t("Date", "Date", "Datum"), note: t("Observation", "Observation", "Waarneming"),
    history: t("Historique", "History", "Geschiedenis"),
    allocations: t("Occupations des planches", "Bed allocations", "Bedtoewijzingen"),
    from: t("Depuis", "From", "Van"), to: t("Vers", "To", "Naar"),
    harvestedOn: t("Date de récolte", "Harvest date", "Oogstdatum"),
    harvest: t("Récolte", "Harvest", "Oogst"), quantity: t("Quantité", "Quantity", "Hoeveelheid"),
    unit: t("Unité", "Unit", "Eenheid"), unknown: t("Non renseigné", "Unknown", "Onbekend"),
    remaining: t("Plants en pépinière", "Plants in nursery", "Planten in kwekerij"),
    transplanted: t("Plants repiqués", "Transplanted plants", "Uitgeplante planten"),
    viable: t("Plants viables", "Viable plants", "Levensvatbare planten"),
    seeds: t("Graines semées", "Seeds sown", "Gezaaide zaden"),
    germinatedCount: t("Graines germées", "Seeds germinated", "Gekiemde zaden"),
    startsOn: t("Début prévu d’occupation", "Planned occupancy start", "Gepland begin van bezetting"),
    endsBefore: t("Libre à partir du", "Free from", "Vrij vanaf"),
    newFootprint: t("Nouvelle emprise", "New footprint", "Nieuw perceeldeel"),
    sharedFootprint: t("Emprise partagée existante", "Existing shared footprint", "Bestaand gedeeld perceeldeel"),
    combinations: t("Associations de cultures", "Crop combinations", "Gewascombinaties"),
    source: t("Source", "Source", "Bron"),
    reviewed: t("Vérifiée", "Reviewed", "Gecontroleerd"), draft: t("Brouillon", "Draft", "Concept"),
    piece: t("pièce", "piece", "stuk"), bunch: t("botte", "bunch", "bos"),
  };
  const name = (record) => record.names?.[locale] || Object.values(record.names ?? {}).find(Boolean) || record.name || record.id;
  const label = (key) => words[key] ?? key;
  const choices = (keys) => keys.map((key) => [key, label(key)]);
  const resourceName = (r) => r.code + " · " + r.name;
  const num = (key, text = label(key), value = null, step = "any") => f.field(key, text, value, { type: "number", step });
  const dateField = (key, text = label(key), value = null, required = false) => f.field(key, text, value, { type: "date", required });
  const asDate = (value) => value || null;
  const send = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
  const formSubmit = (form, handler) => form.addEventListener("submit", (event) => { event.preventDefault(); f.submit(form, handler); });
  let options;
  let catalogue;
  root.innerHTML = '<p role="status">' + h(t("Chargement…", "Loading…", "Laden…")) + "</p>";
  try {
    [options, catalogue] = await Promise.all([
      api(endpoint + "/batches"),
      manage && !id ? api(endpoint + "/catalogue?manage=1") : null,
    ]);
    if (!root.isConnected) return;
    if (id) await showDetail();
    else showList();
  } catch (error) {
    root.textContent = f.errorLabel(error);
  }

  function showList() {
    root.innerHTML = '<div class="page-title"><h1>' + h(words.title) + '</h1></div><div data-batch-find></div>' +
      '<div data-batch-list></div>' + (manage ? createPanel() + combinationPanel() : "");
    const batchList = root.querySelector("[data-batch-list]");
    const browse = root.querySelector("[data-batch-find]");
    const queryLabel = t("Chercher un lot par code ou culture", "Find a batch by code or crop", "Zoek een partij op code of gewas");
    browse.innerHTML = f.field("batchQuery", queryLabel, null, { type: "search" });
    function renderRows(query = "") {
      const rows = options.batches.filter((batch) => [batch.code, ...Object.values(batch.cropNames), batch.varietyName]
        .filter(Boolean).join(" ").toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
      batchList.innerHTML = rows.length ? '<ul class="ag-card ag-records">' + rows.map((batch) =>
        '<li><a class="button secondary" href="#/batches/' + batch.id + '">' + h(batch.code) + "</a> " +
        h(name({ names: batch.cropNames }) + (batch.varietyName ? " · " + batch.varietyName : "") + " · " + label(batch.status)) + "</li>").join("") + "</ul>" :
        '<p class="empty-state">' + h(t("Aucun lot trouvé.", "No batches found.", "Geen teeltpartijen gevonden.")) + "</p>";
    }
    renderRows();
    browse.firstElementChild.querySelector("input").addEventListener("input", (event) => renderRows(event.target.value));
    if (!manage) return;
    const form = root.querySelector("[data-batch-create]");
    const activeCrops = catalogue.crop.filter((crop) => crop.review !== "archived");
    const activeProfiles = catalogue.profile.filter((profile) => profile.review !== "archived");
    function updateDestinations() {
      const crop = form.elements.cropId.value;
      const variety = form.elements.varietyId?.value;
      const candidates = catalogue.variety.filter((row) => row.cropId === crop && row.review !== "archived");
      form.querySelector("[data-variety]").innerHTML = f.select("varietyId", words.variety, variety, candidates.map((row) => [row.id, row.name]));
      const selected = form.elements.varietyId.value;
      form.querySelector("[data-profile]").innerHTML = f.select("profileId", words.profile, null,
        activeProfiles.filter((row) => row.cropId === crop && (!row.varietyId || row.varietyId === selected))
          .map((row) => [row.id, row.name + " · " + row.context]), true);
      form.elements.varietyId.addEventListener("change", updateDestinations);
    }
    form.querySelector("[data-crop]").innerHTML = f.select("cropId", words.crop, null, activeCrops.map((row) => [row.id, name(row)]), true);
    form.elements.cropId.addEventListener("change", updateDestinations);
    updateDestinations();
    const transplantFields = form.querySelector("[data-transplant-fields]");
    function changeRoute() {
      transplantFields.hidden = form.elements.route.value !== "transplant";
      transplantFields.querySelectorAll("input,select").forEach((input) => { input.disabled = transplantFields.hidden; });
    }
    form.elements.route.addEventListener("change", changeRoute);
    changeRoute();
    formSubmit(form, async (input) => {
      const profile = activeProfiles.find((row) => row.id === input.profileId);
      const values = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value || null]));
      values.seedsPlanned = optionalNumber(input.seedsPlanned);
      const { batch } = await send(endpoint + "/batches", { ...values, profileRevision: profile?.revision });
      location.hash = "#/batches/" + batch.id;
    });
    const combo = root.querySelector("[data-combination-create]");
    formSubmit(combo, async (input) => {
      const { combination } = await send(endpoint + "/combinations", { ...input,
        crops: new FormData(combo).getAll("crops"), source: input.source ? { title: input.source } : null });
      options.combinations.push(combination);
      showList();
      root.querySelector("[data-combination-create] [data-ag-feedback]").textContent = t("Enregistré.", "Saved.", "Opgeslagen.");
    });
  }

  function createPanel() {
    return '<section class="ag-card"><form data-batch-create class="ag-fields"><h2>' +
      h(t("Créer un lot", "Create a batch", "Partij aanmaken")) + "</h2>" +
      f.field("code", words.code, null, { required: true }) + '<div data-crop></div><div data-variety></div><div data-profile></div>' +
      f.select("route", words.route, "direct", [["direct", words.direct], ["transplant", words.transplantRoute]], true) +
      f.field("seedSource", words.seedSource) + f.field("seedLot", words.seedLot) + num("seedsPlanned", words.seedsPlanned, null, 1) +
      dateField("sowPlannedOn") + '<fieldset data-transplant-fields><legend>' + h(words.transplantRoute) + "</legend>" +
      f.select("nurseryId", words.nursery, null, options.resources.map((row) => [row.id, resourceName(row)])) +
      dateField("transplantPlannedOn") + dateField("transplantExpectedOn") + "</fieldset>" +
      dateField("harvestExpectedFrom") + dateField("harvestExpectedTo") +
      f.field("nextOperation", words.nextOperation) + dateField("nextOperationOn") + f.actions() + "</form></section>";
  }

  function combinationPanel() {
    return '<details class="ag-card"><summary>' + h(words.combinations) + "</summary>" +
      '<ul>' + options.combinations.map((row) => "<li>" + h(row.name + " · " + label(row.review)) + "</li>").join("") + "</ul>" +
      '<form data-combination-create class="ag-fields">' +
      f.field("name", t("Nom", "Name", "Naam"), null, { required: true }) +
      f.field("context", t("Contexte local", "Local context", "Lokale context")) +
      f.field("source", words.source) + f.field("spacing", t("Espacement", "Spacing", "Plantafstand")) +
      f.field("timing", t("Calendrier compatible", "Compatible timing", "Passende timing")) +
      f.select("review", t("Vérification", "Review", "Controle"), "draft", choices(["draft", "reviewed"]), true) +
      '<fieldset><legend>' + h(words.crop) + "</legend>" + catalogue.crop.filter((row) => row.review !== "archived").map((row) =>
        '<label><input type="checkbox" name="crops" value="' + row.id + '"> ' + h(name(row)) + "</label>").join("") +
      "</fieldset>" + f.actions() + "</form></details>";
  }

  function snapshot(detail) {
    const { batch, actual, profile } = detail;
    const resource = options.resources.find(({ id }) => id === batch.nurseryId);
    const fields = [
      [words.profile, profile.name + " · " + profile.context + " · v" + profile.revision],
      [words.seedSource, batch.seedSource], [words.seedLot, batch.seedLot],
      [words.seedsPlanned, batch.seedsPlanned], [words.sowPlannedOn, batch.sowPlannedOn],
      [words.sown, actual.sowOn], [words.seeds, actual.seedsSown], [words.germinatedCount, actual.germinated],
      [words.viable, actual.viable], [words.nursery, resource ? resourceName(resource) : null],
      [words.transplantPlannedOn, batch.transplantPlannedOn], [words.transplantExpectedOn, batch.transplantExpectedOn],
      [words.transplant, actual.transplantOn], [words.transplanted, actual.transplanted],
      [words.remaining, actual.remaining],
      [words.harvestExpectedFrom, batch.harvestExpectedFrom], [words.harvestExpectedTo, batch.harvestExpectedTo],
      [words.nextOperation, batch.nextOperation], [words.nextOperationOn, batch.nextOperationOn],
    ];
    return '<div class="ag-card"><p><strong>' + h(label(actual.status)) + '</strong></p><dl class="ag-definitions">' +
      fields.map(([title, value]) => "<dt>" + h(title) + "</dt><dd>" + h(value ?? words.unknown) + "</dd>").join("") + "</dl>" +
      (actual.nursery.length ? '<ul>' + actual.nursery.map((item) => {
        const location = options.resources.find(({ id }) => id === item.id);
        return "<li>" + h((location ? resourceName(location) : item.id) + " · " + item.plants) + "</li>";
      }).join("") + "</ul>" : "") + "</div>";
  }

  function allocationRows(allocations) {
    return allocations.length ? '<ul class="ag-records">' + allocations.map((row) =>
      '<li><a class="button secondary" href="#/garden-plan/beds/' + row.bedId + '">' + h(row.bedCode) + "</a> " + h(footprintLabel(row)) +
      (row.combinationId ? " · " + h(t("Partagée", "Shared", "Gedeeld")) : "") +
      (manage && !row.releasedOn ? '<details><summary>' + h(t("Libérer l’emprise", "Release footprint", "Perceeldeel vrijgeven")) +
        '</summary><form class="ag-fields" data-release="' + row.id + '">' + dateField("freeOn", words.endsBefore, localDay(), true) +
        f.actions(t("Confirmer la libération", "Confirm release", "Vrijgave bevestigen")) + "</form></details>" : "") + "</li>").join("") +
      "</ul>" : "<p>" + h(words.unknown) + "</p>";
  }
  function footprintLabel(row) {
    return row.bedCode + " · " + row.startM + "–" + row.endM + " m · " + row.startsOn + (row.endsBefore ? " → " + row.endsBefore : "");
  }
  function allocationForm(detail) {
    const shared = options.sharedFootprints.filter((row) => !row.releasedOn && options.combinations.some((combo) =>
      combo.id === row.combinationId && combo.cropIds.includes(detail.batch.cropId)) && !detail.allocations.some(({ id }) => id === row.id));
    return '<form data-allocate class="ag-fields">' +
      f.select("footprintId", words.sharedFootprint, null, shared.map((row) => [row.id, footprintLabel(row)])) +
      '<fieldset data-new-footprint><legend>' + h(words.newFootprint) + "</legend>" +
      f.select("bedId", words.bed, null, beds.map((bed) => [bed.id, bed.code])) +
      num("startM", t("Début sur la longueur (m)", "Start along bed (m)", "Begin langs bed (m)"), 0) +
      num("endM", t("Fin sur la longueur (m)", "End along bed (m)", "Einde langs bed (m)")) +
      num("occupiedM2", t("Surface occupée (m²)", "Occupied area (m²)", "Bezette oppervlakte (m²)")) +
      dateField("startsOn", words.startsOn, localDay()) + dateField("endsBefore") +
      f.select("combinationId", words.combinations, null, options.combinations.filter((row) =>
        row.review === "reviewed" && row.cropIds.includes(detail.batch.cropId)).map((row) => [row.id, row.name])) +
      "</fieldset>" + num("plantCount", words.plants, null, 1) + f.actions(t("Réserver la place", "Reserve space", "Ruimte reserveren")) + "</form>";
  }

  function operationForm(detail) {
    const { batch, actual } = detail;
    const allowed = ["observation"];
    if (!actual.sowOn) {
      if (batch.route === "transplant" || detail.allocations.length) allowed.unshift("sow");
      if (manage) allowed.push("cancelled");
    } else {
      if (actual.viable == null) allowed.unshift("germination");
      if (actual.remaining) {
        allowed.push("move", "discard");
        if (detail.allocations.length) allowed.push("transplant");
      }
      if (batch.route === "direct" && detail.allocations.some((allocation) =>
        !detail.events.some((event) => event.footprintId === allocation.id && ["sow", "plant"].includes(event.kind)))) allowed.push("plant");
      allowed.push("maintenance");
      if (actual.planted || actual.transplanted) allowed.push("ready");
      if (manage && !actual.remaining) allowed.push("completed", "failed");
    }
    return '<form data-operation class="ag-fields"><h2>' + h(t("Enregistrer le travail", "Record work", "Werk registreren")) + "</h2>" +
      f.select("kind", t("Action", "Action", "Handeling"), allowed[0], choices(allowed), true) +
      dateField("occurredOn", words.date, localDay(), true) + '<div class="ag-fields" data-operation-fields></div>' +
      f.area("note", words.note, null) + f.actions() + "</form>";
  }
  function bindOperation(detail) {
    const form = root.querySelector("[data-operation]");
    if (!form) return;
    let eventId;
    let lastBody;
    function updateOperation() {
      const { batch, actual } = detail;
      const kind = form.elements.kind.value;
      const resources = options.resources.map((row) => [row.id, resourceName(row)]);
      const origin = actual.nursery.map(({ id, plants }) => [id, (resources.find(([key]) => key === id)?.[1] ?? id) + " · " + plants]);
      const fields = [];
      if (["move", "discard", "transplant"].includes(kind)) fields.push(f.select("fromResourceId", words.from, origin[0]?.[0], origin, true));
      if (kind === "move" || (kind === "sow" && batch.route === "transplant")) {
        fields.push(f.select("toResourceId", words.to, kind === "sow" ? batch.nurseryId : null, resources, true));
      }
      if (kind === "germination") fields.push(num("germinated", words.germinatedCount, null, 1));
      if (["sow", "germination", "move", "discard", "transplant", "plant"].includes(kind)) {
        fields.push(num("plants", kind === "sow" || kind === "plant" ? words.seeds : kind === "germination" ? words.viable : words.plants, null, 1));
      }
      if (["transplant", "plant"].includes(kind) || (kind === "sow" && batch.route === "direct")) {
        const footprints = detail.allocations.filter((allocation) =>
          kind !== "plant" || !detail.events.some((event) => event.footprintId === allocation.id && ["sow", "plant"].includes(event.kind)));
        fields.push(f.select("footprintId", words.bed, footprints.length === 1 ? footprints[0].id : null,
          footprints.map((row) => [row.id, footprintLabel(row)]), true));
      }
      form.querySelector("[data-operation-fields]").innerHTML = fields.join("");
    }
    form.elements.kind.addEventListener("change", updateOperation);
    updateOperation();
    formSubmit(form, async (values) => {
      const body = { ...values, plants: optionalNumber(values.plants), germinated: optionalNumber(values.germinated),
        fromResourceId: values.fromResourceId || null, toResourceId: values.toResourceId || null, footprintId: values.footprintId || null };
      const fingerprint = JSON.stringify(body);
      if (fingerprint !== lastBody) {
        eventId = globalThis.crypto?.randomUUID?.();
        lastBody = fingerprint;
      }
      await send(endpoint + "/batches/" + id + "/events", { ...body, id: eventId });
      await showDetail(words.history);
    });
  }

  function harvestPanel(detail) {
    const { events, allocations, harvests } = detail;
    const plantedIds = new Set(events.filter((event) => ["sow", "transplant", "plant"].includes(event.kind)).map((event) => event.footprintId));
    const allowedBeds = [...new Map(allocations.filter((row) => plantedIds.has(row.id)).map((row) => [row.bedId, row.bedCode]))];
    return '<section class="ag-card"><h2 tabindex="-1">' + h(words.harvest) + "</h2>" +
      (harvests.length ? '<ul class="ag-records">' + harvests.map((row) => '<li>' +
        h(row.harvestedOn + " · " + row.amount + " " + label(row.unit) + (row.note ? " · " + row.note : "")) +
        (row.photoUrl ? ' <a href="' + h(row.photoUrl) + '">' + h(t("Photo", "Photo", "Foto")) + "</a>" : "") + "</li>").join("") + "</ul>" : "<p>" + h(words.unknown) + "</p>") +
      (allowedBeds.length ? '<form class="ag-fields" data-batch-harvest>' +
        f.select("bed", words.bed, allowedBeds.length === 1 ? allowedBeds[0][0] : null, allowedBeds, true) +
        dateField("harvestedOn", words.harvestedOn, localDay(), true) + num("amount", words.quantity) +
        f.select("unit", words.unit, null, choices(options.quantityUnits), true) +
        f.area("note", words.note, null) + '<label class="ag-field">' + h(t("Photo facultative", "Optional photo", "Optionele foto")) +
        '<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>' +
        f.actions(t("Ajouter la récolte", "Add harvest", "Oogst toevoegen")) + "</form>" : "") + "</section>";
  }

  async function showDetail(focus = null) {
    const detail = await api(endpoint + "/batches/" + id);
    const { batch, actual, events, allocations } = detail;
    if (!root.isConnected) return;
    const labelTitle = batch.code + " · " + name({ names: batch.cropNames }) + (batch.varietyName ? " · " + batch.varietyName : "");
    root.innerHTML = '<div class="page-title"><h1 tabindex="-1">' + h(labelTitle) +
      '</h1></div><div><a href="#/batches" class="button secondary">' + h(words.title) + "</a></div>" + snapshot(detail) +
      '<section class="ag-card"><h2 tabindex="-1">' + h(words.allocations) + "</h2>" + allocationRows(allocations) +
      (manage && !["completed", "failed", "cancelled"].includes(actual.status) ? allocationForm(detail) : "") +
      '</section>' + (!["completed", "failed", "cancelled"].includes(actual.status) ? '<section class="ag-card">' + operationForm(detail) + "</section>" : "") +
      '<section class="ag-card"><h2 tabindex="-1">' + h(words.history) + "</h2>" +
      (events.length ? '<ol>' + events.map((event) => "<li>" + h(event.occurredOn + " · " + label(event.kind) +
        (event.plants == null ? "" : " · " + event.plants) + (event.note ? " · " + event.note : "")) + "</li>").join("") + "</ol>" : "<p>" + h(words.unknown) + "</p>") +
      "</section>" + harvestPanel(detail) + '<section data-batch-labels></section>';
    mountLabels(root.querySelector("[data-batch-labels]"), {
      t, h, batch, actual, allocations, resources: options.resources, cropName: name({ names: batch.cropNames }),
    });
    if (focus) [...root.querySelectorAll("h1,h2")].find((heading) => heading.textContent === focus)?.focus();
    root.querySelectorAll("[data-release]").forEach((form) => formSubmit(form, async ({ freeOn }) => {
      await send(endpoint + "/footprints/" + form.dataset.release + "/release", { freeOn });
      await showDetail(words.allocations);
    }));
    const form = root.querySelector("[data-allocate]");
    if (form) {
      const fieldset = form.querySelector("[data-new-footprint]");
      form.elements.footprintId.addEventListener("change", () => {
        fieldset.hidden = fieldset.disabled = Boolean(form.elements.footprintId.value);
      });
      formSubmit(form, async (values) => {
        const { allocation } = await send(endpoint + "/batches/" + id + "/allocations", {
          footprintId: values.footprintId || null, bedId: optionalNumber(values.bedId),
          startM: optionalNumber(values.startM), endM: optionalNumber(values.endM), occupiedM2: optionalNumber(values.occupiedM2),
          plantCount: optionalNumber(values.plantCount), startsOn: asDate(values.startsOn), endsBefore: asDate(values.endsBefore),
          combinationId: values.combinationId || null,
        });
        if (allocation.combinationId && !options.sharedFootprints.some(({ id }) => id === allocation.id)) options.sharedFootprints.push(allocation);
        await showDetail(words.allocations);
      });
    }
    bindOperation(detail);
    const harvest = root.querySelector("[data-batch-harvest]");
    let lastHarvest;
    let requestId;
    if (harvest) formSubmit(harvest, async ({ bed, photo, amount, unit, harvestedOn, note }) => {
      const dataUrl = photo.size ? await compressPhoto(photo) : null;
      const payload = { batchId: id, amount: optionalNumber(amount), unit, harvestedOn, note, dataUrl };
      const fingerprint = JSON.stringify([bed, payload]);
      if (lastHarvest !== fingerprint) {
        requestId = globalThis.crypto?.randomUUID?.();
        lastHarvest = fingerprint;
      }
      await send("/api/beds/" + bed + "/harvests", { ...payload, requestId });
      await showDetail(words.harvest);
    });
  }
}

export function localDay() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value) => String(value).padStart(2, "0")).join("-");
}
