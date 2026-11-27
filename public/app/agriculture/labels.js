import { agricultureForms } from "./forms.js";

export function mountLabels(container, { t, h, batch, actual, allocations, resources, cropName }) {
  const f = agricultureForms(t, h);
  const label = {
    heading: t("Étiquettes à imprimer", "Printable labels", "Afdrukbare etiketten"),
    count: t("Nombre d’étiquettes", "Number of labels", "Aantal etiketten"),
    sheet: t("Disposition de la feuille", "Sheet layout", "Bladindeling"),
    wide: t("Deux colonnes", "Two columns", "Twee kolommen"),
    compact: t("Trois colonnes", "Three columns", "Drie kolommen"),
    tray: t("Plateau ou bac", "Tray or container", "Tray of bak"),
    print: t("Imprimer les étiquettes", "Print labels", "Etiketten afdrukken"),
    sow: t("Semé le", "Sown on", "Gezaaid op"),
    planSow: t("Semis prévu", "Planned sowing", "Geplande zaai"),
    destination: t("Destination", "Destination", "Bestemming"),
    next: t("Prochaine opération", "Next operation", "Volgende handeling"),
    unknown: t("Non renseigné", "Unknown", "Onbekend"),
    qr: t("Code QR du lot de culture", "Cultivation batch QR code", "QR-code van de teeltpartij"),
  };
  const located = [...new Set([batch.nurseryId, ...actual.nursery.map(({ id }) => id)].filter(Boolean))];
  const trays = resources.filter((row) => located.includes(row.id));
  const show = (name, value) => value ? "<p>" + h(name) + " · " + h(value) + "</p>" : "";
  container.innerHTML = '<details class="ag-card"><summary>' + h(label.heading) + "</summary>" +
    '<form class="ag-fields" data-label-form>' +
    f.field("count", label.count, 6, { type: "number", step: 1, required: true }) +
    f.select("layout", label.sheet, "wide", [["wide", label.wide], ["compact", label.compact]], true) +
    (trays.length ? f.select("tray", label.tray, trays.length === 1 ? trays[0].id : null, trays.map(({ id, code }) => [id, code])) : "") +
    '<div class="ag-actions"><button type="submit" class="button primary">' + h(label.print) +
    '</button><span role="status" data-ag-feedback></span></div></form>' +
    '<div class="ag-print-sheet" data-print-sheet></div></details>';
  const form = container.querySelector("form");
  form.elements.count.min = "1";
  form.elements.count.max = "36";
  const sheet = container.querySelector("[data-print-sheet]");
  function draw(count, layout, trayId) {
    sheet.dataset.layout = layout;
    const crop = [cropName, batch.varietyName].filter(Boolean).join(" · ");
    const destination = [...new Set(allocations.map(({ bedCode }) => bedCode))].join(", ");
    const tray = trays.find(({ id }) => id === trayId)?.code;
    const next = [batch.nextOperation, batch.nextOperationOn].filter(Boolean).join(" · ");
    const image = '/api/agriculture/labels/' + batch.id + '.gif';
    const card = '<article><div><strong>' + h(crop) + '</strong><p><b>' + h(batch.code) + "</b></p>" +
      show(actual.sowOn ? label.sow : label.planSow, actual.sowOn ?? batch.sowPlannedOn ?? label.unknown) +
      show(label.tray, tray) + show(label.destination, destination) + show(label.next, next) +
      '</div><img width="92" height="92" src="' + image + '" alt="' + h(label.qr) + '"></article>';
    sheet.innerHTML = card.repeat(count);
  }
  form.addEventListener("change", () => draw(1, form.elements.layout.value, form.elements.tray?.value));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { count, layout, tray } = Object.fromEntries(new FormData(form));
    const button = form.querySelector("button");
    const live = form.querySelector("[data-ag-feedback]");
    live.textContent = "";
    button.disabled = true;
    try {
      draw(Number(count), layout, tray);
      await Promise.all([...sheet.querySelectorAll("img")].map((image) => image.decode()));
      if (!container.isConnected) return;
      document.body.classList.add("ag-printing");
      try { window.print(); }
      finally { document.body.classList.remove("ag-printing"); }
    } catch {
      live.textContent = t("Impossible de charger le code QR.", "Could not load the QR code.", "De QR-code kon niet worden geladen.");
    } finally {
      button.disabled = false;
      draw(1, layout, tray);
    }
  });
  draw(1, "wide", form.elements.tray?.value);
}
