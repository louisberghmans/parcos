import { catalogue, catalogueCsv, catalogueTypes, importCatalogue, methods, parameterUnits, profileHistory, quantityUnits, saveRecord } from "./catalogue.mjs";
import { AgricultureError, number } from "./validation.mjs";
import { gardenRoute } from "./garden.mjs";
import { cultivationRoute } from "./cultivation.mjs";
import { operationsRoute } from "./operations.mjs";
import { supplierRoute } from "./suppliers.mjs";

export async function agricultureRoute(context) {
  const { db, req, path, url, readJson, json, text, authorize, localizeCrop, saveCropText } = context;
  const manage = ["coordinator", "admin"].includes(context.session.member.role);
  if (/^\/api\/agriculture\/(operations|labels|occupancy)(?:\/|$)/.test(path)) return operationsRoute(context, manage);
  if (/^\/api\/agriculture\/suppliers(?:\/|$)/.test(path)) return supplierRoute(context);
  if (/^\/api\/agriculture\/(batches|combinations|footprints)(?:\/|$)/.test(path)) return cultivationRoute(context, manage);
  if (/^\/api\/agriculture\/(areas|beds)\//.test(path)) return gardenRoute(context, manage);
  if (path === "/api/agriculture/catalogue" && req.method === "GET") {
    const query = (url.searchParams.get("q") ?? "").slice(0, 160);
    const edit = url.searchParams.get("manage") === "1";
    const month = url.searchParams.has("month") ? number(Number(url.searchParams.get("month")), "month", { min: 1, max: 12, integer: true }) : null;
    if (edit) authorize();
    return json(200, { ...catalogue(db, { manage: edit && manage, query, month, localize: localizeCrop }), methods, parameterUnits, quantityUnits });
  }
  if (path === "/api/agriculture/catalogue/export" && req.method === "GET") {
    authorize();
    const records = catalogue(db, { manage: true });
    if (url.searchParams.get("format") === "csv") {
      return text(200, catalogueCsv(records), "text/csv; charset=utf-8", { "Content-Disposition": 'attachment; filename="parcos-catalogue.csv"' });
    }
    const payload = catalogueTypes.flatMap((type) => records[type].map((record) => ({ type, record })));
    return text(200, JSON.stringify({ records: payload }), "application/json; charset=utf-8", { "Content-Disposition": 'attachment; filename="parcos-catalogue.json"' });
  }
  if (path === "/api/agriculture/catalogue/import" && req.method === "POST") {
    authorize();
    const body = await readJson();
    return json(200, { records: importCatalogue(db, body, saveCropText) });
  }
  const match = /^\/api\/agriculture\/catalogue\/(taxon|crop|variety|profile)$/.exec(path);
  if (match && req.method === "PUT") {
    authorize();
    const record = saveRecord(db, match[1], await readJson(), saveCropText);
    return json(200, { record: match[1] === "crop" ? localizeCrop(record) : record });
  }
  const history = /^\/api\/agriculture\/catalogue\/profile\/([a-z0-9_-]{1,80})\/history$/.exec(path);
  if (history && req.method === "GET") {
    authorize();
    const revisions = profileHistory(db, history[1]);
    if (!revisions.length) throw new AgricultureError("missing", null, 404);
    return json(200, { revisions });
  }
  throw new AgricultureError("missing", null, 404);
}
