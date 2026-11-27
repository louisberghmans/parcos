import { createHash, randomUUID } from "node:crypto";
import { getRecord, parseCsv } from "./catalogue.mjs";
import { AgricultureError, atomic, choice, day, fold, invalid, key, list, number, object, source, string } from "./validation.mjs";

export function migrateSuppliers(db) {
  db.exec([
    "create table supplier_products (id text primary key, supplier_key text not null, sku_key text not null, revision integer not null, data text not null, unique(supplier_key, sku_key));",
    "create table supplier_product_revisions (product_id text not null references supplier_products(id), revision integer not null, data text not null, primary key(product_id, revision));",
    "create table supplier_import_reviews (id text primary key, supplier_key text not null, sku_key text not null, digest text not null, state text not null check(state in ('pending', 'approved', 'rejected')), data text not null, staged_at text not null, reviewed_at text, reviewed_by integer references members(id) on delete set null, product_id text references supplier_products(id), unique(supplier_key, sku_key, digest));",
    "create index supplier_import_pending on supplier_import_reviews(state, staged_at);",
  ].join("\n"));
}

export const availabilityValues = ["available", "unavailable", "discontinued", "unknown"];
const csvColumns = ["supplier", "sku", "name", "sourceUrl", "retrievedOn", "availability", "seedCount", "packetWeightG", "cropHint", "varietyHint"];
const record = (row) => row ? JSON.parse(row.data) : null;

function clean(value) {
  const row = object(value, "product");
  const supplier = string(row.supplier, "supplier", { required: true, max: 120 });
  const sku = string(row.sku, "sku", { required: true, max: 120 });
  const retrievedOn = day(row.retrievedOn, "retrievedOn", true);
  const evidence = source({ title: supplier, url: row.sourceUrl, retrievedOn });
  if (!evidence.url) invalid("sourceUrl");
  return {
    supplier, sku, name: string(row.name, "name", { required: true, max: 220 }),
    availability: choice(row.availability ?? "unknown", "availability", availabilityValues),
    seedCount: number(row.seedCount, "seedCount", { min: 1, integer: true }),
    packetWeightG: number(row.packetWeightG, "packetWeightG", { min: 0.001 }),
    cropHint: string(row.cropHint, "cropHint", { max: 160 }), varietyHint: string(row.varietyHint, "varietyHint", { max: 160 }),
    source: evidence,
  };
}

function currentProduct(db, supplier, sku) {
  return record(db.prepare("select data from supplier_products where supplier_key = ? and sku_key = ?").get(supplier, sku));
}

function suggestions(offer, catalogue) {
  const { crops, varieties } = catalogue;
  const cropHint = offer.cropHint && fold(offer.cropHint);
  const varietyHint = offer.varietyHint && fold(offer.varietyHint);
  const cropMatches = crops.filter((crop) => [crop.id, ...Object.values(crop.names), ...Object.values(crop.synonyms).flat()]
    .filter(Boolean).some((name) => fold(name) === cropHint)).map(({ id }) => id);
  const varietyMatches = varieties.filter((variety) => (!cropMatches.length || cropMatches.includes(variety.cropId)) &&
    [variety.id, variety.name, ...variety.aliases].some((name) => fold(name) === varietyHint))
    .map(({ id, cropId }) => ({ id, cropId }));
  return { cropIds: cropMatches, varieties: varietyMatches };
}

function supplierCatalogue(db) {
  return {
    crops: db.prepare("select data from agricultural_crops").all().map(record).filter((item) => item.review !== "archived"),
    varieties: db.prepare("select data from agricultural_varieties").all().map(record).filter((item) => item.review !== "archived"),
  };
}

function reviewJson(db, row, catalogue) {
  const offer = record(row);
  const current = currentProduct(db, row.supplier_key, row.sku_key);
  return { id: row.id, state: row.state, offer, current, reviewedAt: row.reviewed_at, matches: suggestions(offer, catalogue) };
}

function parseUpload(body) {
  const input = object(body, "import");
  let rows = input.products;
  if (input.csv !== undefined) {
    const [header, ...data] = parseCsv(input.csv, csvColumns.length);
    if (header?.join(",") !== csvColumns.join(",")) invalid("csv.header");
    rows = data.map((cells) => {
      const values = Object.fromEntries(csvColumns.map((column, i) => [column, cells[i] === "" ? null : cells[i]]));
      for (const name of ["packetWeightG", "seedCount"]) {
        if (values[name] !== null) {
          if (!/^\d+(\.\d+)?$/.test(values[name])) invalid(name);
          values[name] = Number(values[name]);
        }
      }
      return values;
    });
  }
  if (input.preview !== undefined && typeof input.preview !== "boolean") invalid("preview");
  const products = list(rows, "products", clean, 500);
  if (!products.length) invalid("products");
  return { products, preview: input.preview === true };
}

function stage(db, body) {
  const { products, preview } = parseUpload(body);
  const identities = new Set();
  const catalogue = supplierCatalogue(db);
  db.exec("begin immediate");
  try {
    const result = products.map((offer) => {
      const supplier = fold(offer.supplier);
      const sku = fold(offer.sku);
      const identity = JSON.stringify([supplier, sku]);
      if (identities.has(identity)) throw new AgricultureError("duplicate", offer.sku, 409);
      identities.add(identity);
      const encoded = JSON.stringify(offer);
      const digest = createHash("sha256").update(encoded).digest("hex");
      const existing = db.prepare("select * from supplier_import_reviews where supplier_key = ? and sku_key = ? and digest = ?").get(supplier, sku, digest);
      if (existing) return { ...reviewJson(db, existing, catalogue), duplicate: true };
      const id = randomUUID();
      db.prepare("insert into supplier_import_reviews (id, supplier_key, sku_key, digest, state, data, staged_at) values (?, ?, ?, ?, 'pending', ?, ?)")
        .run(id, supplier, sku, digest, encoded, new Date().toISOString());
      return { ...reviewJson(db, { id, supplier_key: supplier, sku_key: sku, state: "pending", data: encoded, reviewed_at: null }, catalogue), duplicate: false };
    });
    db.exec(preview ? "rollback" : "commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function review(db, id, value, actor) {
  const body = object(value, "review");
  const state = choice(body.state, "state", ["approved", "rejected"]);
  const row = db.prepare("select * from supplier_import_reviews where id = ?").get(id);
  if (!row) throw new AgricultureError("missing", null, 404);
  const timestamp = new Date().toISOString();
  const current = currentProduct(db, row.supplier_key, row.sku_key);
  if (row.state !== "pending") {
    const previous = row.product_id ? record(db.prepare("select data from supplier_product_revisions where product_id = ? and json_extract(data, '$.reviewId') = ?").get(row.product_id, id)) : null;
    if (row.state === state && (state === "rejected" || (previous && previous.cropId === (body.cropId ?? null) && previous.varietyId === (body.varietyId ?? null)))) {
      return { id, state, product: previous };
    }
    throw new AgricultureError("conflict", id, 409);
  }
  if (state === "rejected") {
    db.prepare("update supplier_import_reviews set state = ?, reviewed_at = ?, reviewed_by = ? where id = ?").run(state, timestamp, actor, id);
    return { id, state, product: null };
  }
  if ((current?.revision ?? null) !== (body.expectedRevision ?? null)) throw new AgricultureError("conflict", "expectedRevision", 409);
  const offer = record(row);
  if (current && offer.source.retrievedOn < current.source.retrievedOn) throw new AgricultureError("conflict", "retrievedOn", 409);
  const cropId = body.cropId == null ? null : key(body.cropId, "cropId");
  const varietyId = body.varietyId == null ? null : key(body.varietyId, "varietyId");
  const crop = cropId && getRecord(db, "crop", cropId);
  const variety = varietyId && getRecord(db, "variety", varietyId);
  if (cropId && (!crop || crop.review === "archived")) invalid("cropId");
  if (varietyId && (!variety || variety.review === "archived" || variety.cropId !== cropId)) invalid("varietyId");
  const result = { ...offer, cropId, varietyId, id: current?.id ?? randomUUID(), revision: (current?.revision ?? 0) + 1,
    reviewId: id, reviewedAt: timestamp };
  const data = JSON.stringify(result);
  db.prepare("insert into supplier_products values (?, ?, ?, ?, ?) on conflict(id) do update set revision = excluded.revision, data = excluded.data")
    .run(result.id, row.supplier_key, row.sku_key, result.revision, data);
  db.prepare("insert into supplier_product_revisions values (?, ?, ?)").run(result.id, result.revision, data);
  db.prepare("update supplier_import_reviews set state = ?, reviewed_at = ?, reviewed_by = ?, product_id = ? where id = ?")
    .run(state, timestamp, actor, result.id, id);
  return { id, state, product: result };
}

export async function supplierRoute({ db, req, url, path, authorize, readJson, json, session }) {
  authorize();
  const root = "/api/agriculture/suppliers";
  if (path === root && req.method === "GET") {
    const catalogue = supplierCatalogue(db);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) invalid("page");
    const rows = db.prepare("select * from supplier_import_reviews where state = 'pending' order by staged_at, id limit ? offset ?").all(limit + 1, offset);
    return json(200, {
      pending: rows.slice(0, limit).map((row) => reviewJson(db, row, catalogue)), more: rows.length > limit,
      products: db.prepare("select data from supplier_products order by supplier_key, sku_key limit ? offset ?").all(limit + 1, offset).map(record),
      availabilityValues, csvColumns,
    });
  }
  if (path === root + "/import" && req.method === "POST") return json(200, { staged: stage(db, await readJson()) });
  const match = /^\/api\/agriculture\/suppliers\/review\/([a-z0-9_-]{1,80})$/.exec(path);
  if (match && req.method === "POST") {
    const value = await readJson();
    return json(200, atomic(db, () => review(db, match[1], value, session.member.id)));
  }
  throw new AgricultureError("missing", null, 404);
}
