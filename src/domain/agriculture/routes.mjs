import { catalogue, catalogueCsv, catalogueTypes, importCatalogue, methods, parameterUnits, profileHistory, quantityUnits, saveRecord } from "./catalogue.mjs";
import { AgricultureError } from "./validation.mjs";

export async function agricultureRoute(context) {
  const { db, req, path, url, readJson, json, text, authorize } = context;
  const manage = ["coordinator", "admin"].includes(context.session.member.role);
  if (path === "/api/agriculture/catalogue" && req.method === "GET") {
    const query = (url.searchParams.get("q") ?? "").slice(0, 160);
    const edit = url.searchParams.get("manage") === "1";
    if (edit) authorize();
    return json(200, { ...catalogue(db, { manage: edit && manage, query }), methods, parameterUnits, quantityUnits });
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
    return json(200, { records: importCatalogue(db, body) });
  }
  const match = /^\/api\/agriculture\/catalogue\/(taxon|crop|variety|profile)$/.exec(path);
  if (match && req.method === "PUT") {
    authorize();
    return json(200, { record: saveRecord(db, match[1], await readJson()) });
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

