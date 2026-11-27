import { agricultureForms } from "./forms.js";

const endpoint = "/api/agriculture/suppliers";

export async function mountSuppliers(root, { api, t, escapeHtml: h, locale }) {
  const f = agricultureForms(t, h);
  const title = t("Catalogues de semences", "Seed supplier catalogues", "Zadencatalogi van leveranciers");
  const draftLabel = t("À vérifier", "Pending review", "Te controleren");
  const currentLabel = t("Offres vérifiées", "Reviewed offers", "Gecontroleerde aanbiedingen");
  const status = {
    available: t("Disponible", "Available", "Beschikbaar"),
    unavailable: t("Indisponible", "Unavailable", "Onbeschikbaar"),
    discontinued: t("Retiré", "Discontinued", "Uit assortiment"),
    unknown: t("Non renseigné", "Unknown", "Onbekend"),
  };
  const display = (entry) => entry.names?.[locale] || Object.values(entry.names ?? {}).find(Boolean) || entry.name || entry.id;
  const send = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
  const pageSize = 20;
  let offset = 0;
  let catalogue;
  root.innerHTML = '<div class="page-title"><h1>' + h(title) + '</h1></div><p role="status" data-supplier-status></p><div data-suppliers></div>';
  const panel = root.querySelector("[data-suppliers]");
  const notice = root.querySelector("[data-supplier-status]");
  function message(value) { notice.textContent = value; }

  async function load() {
    message(t("Chargement…", "Loading…", "Laden…"));
    try {
      const [data, catalog] = await Promise.all([
        api(endpoint + "?" + new URLSearchParams({ limit: pageSize, offset })),
        catalogue ?? api("/api/agriculture/catalogue?manage=1"),
      ]);
      catalogue = catalog;
      if (!root.isConnected) return;
      if (!data.pending.length && !data.products.length && offset > 0) { offset -= pageSize; return load(); }
      render(data);
      message("");
    } catch (error) { message(f.errorLabel(error)); }
  }
  function details(offer) {
    return '<p>' + h(offer.source.retrievedOn + " · " + status[offer.availability] +
      (offer.seedCount == null ? "" : " · " + offer.seedCount + " " + t("graines", "seeds", "zaden")) +
      (offer.packetWeightG == null ? "" : " · " + offer.packetWeightG + " g")) +
      ' · <a href="' + h(offer.source.url) + '" target="_blank" rel="noopener noreferrer">' + h(t("Source", "Source", "Bron")) + "</a></p>";
  }
  function render(data) {
    const pagination = '<div class="ag-actions">' +
      (offset ? '<button type="button" class="button secondary" data-supplier-back>' + h(t("Précédent", "Previous", "Vorige")) + "</button>" : "") +
      (data.more || data.products.length > pageSize ? '<button type="button" class="button secondary" data-supplier-next>' + h(t("Suivant", "Next", "Volgende")) + "</button>" : "") + "</div>";
    panel.innerHTML = '<form class="ag-card" data-supplier-import><h2>' + h(t("Importer un fichier fournisseur", "Import a supplier file", "Leveranciersbestand importeren")) + "</h2>" +
      '<label class="ag-field">' + h(t("Fichier CSV ou JSON", "CSV or JSON file", "CSV- of JSON-bestand")) +
      '<input type="file" name="file" accept=".csv,.json" required></label>' +
      '<details><summary>' + h(t("Colonnes CSV", "CSV columns", "CSV-kolommen")) + '</summary><p><code>' + h(data.csvColumns.join(",")) + "</code></p></details>" +
      f.actions(t("Vérifier le fichier", "Preview file", "Bestand controleren")) + '<div data-supplier-preview></div></form>' +
      '<section class="ag-card"><h2>' + h(draftLabel) + "</h2>" +
      (data.pending.length ? data.pending.map((item) => '<details><summary>' + h(item.offer.supplier + " · " + item.offer.name + " · " + item.offer.sku) +
        '</summary><div data-supplier-review="' + item.id + '">' + details(item.offer) + reviewForm(item) + "</div></details>").join("") :
        "<p>" + h(t("Aucune offre en attente.", "No offers pending.", "Geen openstaande aanbiedingen.")) + "</p>") + "</section>" +
      '<section class="ag-card"><h2>' + h(currentLabel) + "</h2>" + data.products.slice(0, pageSize).map((product) =>
        '<article><h3>' + h(product.supplier + " · " + product.name + " · " + product.sku) + "</h3>" + details(product) +
        "<p>" + h(matchName(product) + " · v" + product.revision) + "</p></article>").join("") + "</section>" + pagination;
    bindImport(panel.querySelector("[data-supplier-import]"));
    data.pending.forEach((item) => bindReview(panel.querySelector('[data-supplier-review="' + item.id + '"]'), item));
    panel.querySelector("[data-supplier-back]")?.addEventListener("click", () => { offset -= pageSize; load(); });
    panel.querySelector("[data-supplier-next]")?.addEventListener("click", () => { offset += pageSize; load(); });
  }
  function matchName(offer) {
    const crop = catalogue.crop.find(({ id }) => id === offer.cropId);
    const cultivar = catalogue.variety.find(({ id }) => id === offer.varietyId);
    return [crop && display(crop), cultivar?.name].filter(Boolean).join(" · ") || status.unknown;
  }
  function reviewForm(item) {
    const hints = [item.offer.cropHint, item.offer.varietyHint].filter(Boolean).join(" · ");
    const current = item.current;
    return (hints ? "<p>" + h(t("Correspondance suggérée par le fichier", "Match suggested by the file", "Koppeling voorgesteld door het bestand") + " · " + hints) + "</p>" : "") +
      (current ? '<div><strong>' + h(currentLabel + " · " + current.name + " · v" + current.revision) + "</strong>" + details(current) +
        "<p>" + h(matchName(current)) + "</p></div>" : "") +
      '<form class="ag-fields">' + f.select("cropId", t("Culture associée", "Matched crop", "Gekoppeld gewas"), null, []) +
      '<div data-review-variety></div>' + f.actions(t("Publier l’offre", "Publish offer", "Aanbieding publiceren")) +
      '<button type="button" class="button secondary" data-reject>' + h(t("Rejeter", "Reject", "Afwijzen")) + "</button></form>";
  }
  function bindReview(container, item) {
    const form = container.querySelector("form");
    const cropOptions = catalogue.crop.filter((row) => row.review !== "archived");
    const varietyOptions = catalogue.variety.filter((row) => row.review !== "archived");
    const exact = item.matches.varieties.length === 1 ? item.matches.varieties[0] : null;
    const cropId = item.current?.cropId ?? exact?.cropId ?? (item.matches.cropIds.length === 1 ? item.matches.cropIds[0] : null);
    form.elements.cropId.parentElement.outerHTML = f.select("cropId", t("Culture associée", "Matched crop", "Gekoppeld gewas"), cropId,
      cropOptions.map((row) => [row.id, display(row)]));
    const update = (selected) => {
      form.querySelector("[data-review-variety]").innerHTML = f.select("varietyId", t("Variété associée", "Matched variety", "Gekoppeld ras"),
        selected, varietyOptions.filter((row) => row.cropId === form.elements.cropId.value).map((row) => [row.id, row.name]));
    };
    update(item.current?.varietyId ?? exact?.id);
    form.elements.cropId.addEventListener("change", () => update(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      f.submit(form, async (values) => {
        await send(endpoint + "/review/" + item.id, { state: "approved", expectedRevision: item.current?.revision ?? null,
          cropId: values.cropId || null, varietyId: values.varietyId || null });
        await load();
        message(t("Offre publiée.", "Offer published.", "Aanbieding gepubliceerd."));
      });
    });
    form.querySelector("[data-reject]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await send(endpoint + "/review/" + item.id, { state: "rejected" });
        await load();
        message(t("Offre rejetée.", "Offer rejected.", "Aanbieding afgewezen."));
      } catch (error) { message(f.errorLabel(error)); button.disabled = false; }
    });
  }
  function bindImport(form) {
    const preview = form.querySelector("[data-supplier-preview]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      preview.replaceChildren();
      f.submit(form, async ({ file }) => {
        if (file.size > 850000) throw Object.assign(new Error(), { code: "invalid", field: "file" });
        const value = await file.text();
        const payload = file.name.toLowerCase().endsWith(".csv") ? { csv: value } : { products: JSON.parse(value).products };
        const { staged } = await send(endpoint + "/import", { ...payload, preview: true });
        const summary = document.createElement("p");
        summary.textContent = t("Nouvelles offres à vérifier", "New offers for review", "Nieuwe aanbiedingen ter controle") + " · " +
          staged.filter((item) => !item.duplicate).length + " / " + staged.length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button primary";
        button.textContent = t("Mettre en attente de validation", "Stage for review", "Klaarzetten voor controle");
        preview.append(summary, button);
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await send(endpoint + "/import", payload);
            offset = 0;
            await load();
            message(t("Offres mises en attente.", "Offers staged.", "Aanbiedingen klaargezet."));
          } catch (error) { message(f.errorLabel(error)); button.disabled = false; }
        });
      });
    });
  }
  await load();
}
