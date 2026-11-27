import { randomUUID } from "node:crypto";
import { AgricultureError, atomic, choice, day, invalid, key, list, number, object, source, string } from "./validation.mjs";

export const gardenMigration = {
  version: 6,
  name: "agricultural_garden",
  up(db) {
    db.exec(
      "create table bed_physical (bed_id integer primary key references beds(id) on delete cascade, revision integer not null, data text not null);" +
      "create table bed_geometry (bed_id integer not null references beds(id) on delete restrict, valid_from text not null, valid_to text, data text not null, primary key (bed_id, valid_from), check(valid_to is null or valid_to > valid_from));" +
      "create table garden_resources (id text primary key, area_id integer not null references garden_areas(id) on delete restrict, code text not null collate nocase, data text not null, unique(area_id, code));"
    );
  },
};

export const today = () => new Date().toISOString().slice(0, 10);
const parse = (row) => row ? JSON.parse(row.data) : null;

export function physical(db, bedId) {
  return parse(db.prepare("select data from bed_physical where bed_id = ?").get(bedId));
}

export function savePhysical(db, bedId, body) {
  const record = object(body, "bed");
  const dimensions = Object.fromEntries(["lengthM", "widthM", "grossM2", "usableM2"].map((field) => [
    field, number(record[field], field, { min: 0.001, max: 1000000 }),
  ]));
  if (dimensions.grossM2 != null && dimensions.usableM2 != null && dimensions.usableM2 > dimensions.grossM2) invalid("usableM2");
  const details = Object.fromEntries([
    "shape", "location", "sun", "soil", "drainage", "irrigation", "protection",
    "support", "accessibility", "soilMeasurements",
  ].map((field) => [field, string(record[field], field)]));
  const data = {
    ...dimensions, ...details,
    ph: number(record.ph, "ph", { max: 14 }),
    soilMeasuredOn: day(record.soilMeasuredOn, "soilMeasuredOn"),
    measuredOn: day(record.measuredOn, "measuredOn"),
    availability: choice(record.availability ?? "unknown", "availability", ["unknown", "available", "limited", "unavailable"]),
    confidence: choice(record.confidence ?? "unknown", "confidence", ["unknown", "approximate", "measured"]),
    source: record.source == null ? null : source(record.source),
  };
  if (data.confidence === "measured" && !data.source) invalid("source");
  return atomic(db, () => {
    const current = physical(db, bedId);
    if ((current?.revision ?? null) !== (record.revision ?? null)) throw new AgricultureError("conflict", "revision", 409);
    data.revision = (current?.revision ?? 0) + 1;
    db.prepare("insert into bed_physical values (?, ?, ?) on conflict(bed_id) do update set revision = excluded.revision, data = excluded.data")
      .run(bedId, data.revision, JSON.stringify(data));
    return data;
  });
}

function geometry(input) {
  const value = object(input, "geometry");
  const points = list(value.points, "points", (point) => {
    if (!Array.isArray(point) || point.length !== 2 || point.some((coordinate) => coordinate == null)) invalid("points");
    return point.map((coordinate) => number(coordinate, "points", { max: 1 }));
  }, 200);
  const signedArea = points.reduce((result, [x, y], i) => {
    const [nextX, nextY] = points[(i + 1) % points.length];
    return result + x * nextY - y * nextX;
  }, 0);
  if (points.length < 3 || Math.abs(signedArea) < 1e-10) invalid("points");
  return {
    validFrom: day(value.validFrom, "validFrom", true),
    points,
    source: source(value.source),
    sourceRevision: string(value.sourceRevision, "sourceRevision", { max: 120 }),
  };
}

function saveGeometry(db, bedId, value) {
  const latest = db.prepare("select * from bed_geometry where bed_id = ? order by valid_from desc limit 1").get(bedId);
  if (latest && latest.valid_from >= value.validFrom) {
    if (latest.valid_from === value.validFrom && latest.data === JSON.stringify(value)) return value;
    throw new AgricultureError("conflict", "validFrom", 409);
  }
  if (latest) db.prepare("update bed_geometry set valid_to = ? where bed_id = ? and valid_from = ?").run(value.validFrom, bedId, latest.valid_from);
  db.prepare("insert into bed_geometry values (?, ?, null, ?)").run(bedId, value.validFrom, JSON.stringify(value));
  return value;
}

export function importGeometry(db, areaId, body) {
  const payload = object(body, "plan");
  const beds = new Map(db.prepare("select id, code from beds where area_id = ?").all(areaId).map(({ id, code }) => [code, id]));
  const seen = new Set();
  const entries = list(payload.features, "features", (input) => {
    const entry = object(input, "feature");
    const code = string(entry.bedCode, "bedCode", { required: true, max: 80 });
    const id = beds.get(code);
    if (!id || seen.has(id)) invalid("bedCode " + code);
    seen.add(id);
    return { id, code, data: geometry({ ...entry, validFrom: payload.validFrom, source: payload.source, sourceRevision: payload.sourceRevision }) };
  }, 500);
  if (!entries.length || (payload.preview !== undefined && typeof payload.preview !== "boolean")) invalid("features");
  db.exec("begin immediate");
  try {
    entries.forEach(({ id, data }) => saveGeometry(db, id, data));
    db.exec(payload.preview ? "rollback" : "commit");
    return entries.map(({ id, code }) => ({ id, code }));
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function bedGeometry(db, bedId) {
  return db.prepare("select data, valid_to from bed_geometry where bed_id = ? order by valid_from desc")
    .all(bedId).map((row) => ({ ...parse(row), validTo: row.valid_to }));
}

export function gardenPlan(db, areaId, date) {
  return db.prepare(
    "select b.id, b.code, b.crop, b.variety, p.data as physical, g.data, g.valid_to " +
    "from beds b left join bed_physical p on p.bed_id = b.id left join bed_geometry g on g.bed_id = b.id " +
    "and g.valid_from <= ? and (g.valid_to is null or g.valid_to > ?) where b.area_id = ? order by b.sort_order, b.display_number"
  ).all(date, date, areaId).map((row) => ({
    id: row.id, code: row.code, legacyCrop: row.crop, legacyVariety: row.variety,
    physical: row.physical ? JSON.parse(row.physical) : null,
    geometry: row.data ? { ...parse(row), validTo: row.valid_to } : null,
  }));
}

export const resourceTypes = ["nursery", "bench", "tray", "greenhouse", "tunnel", "compost", "support", "other"];
export function resources(db, areaId) {
  return db.prepare("select data from garden_resources where area_id = ? order by code").all(areaId).map(parse);
}

export function saveResource(db, areaId, body) {
  const value = object(body, "resource");
  const id = value.id == null ? randomUUID() : key(value.id);
  const data = {
    id, areaId,
    code: string(value.code, "code", { required: true, max: 60 }),
    name: string(value.name, "name", { required: true, max: 120 }),
    type: choice(value.type, "type", resourceTypes),
    parentId: value.parentId == null ? null : key(value.parentId, "parentId"),
    capacity: number(value.capacity, "capacity", { integer: true }),
    capacityUnit: value.capacityUnit == null ? null : choice(value.capacityUnit, "capacityUnit", ["tray", "cell", "plant"]),
    conditions: string(value.conditions, "conditions"),
    archived: value.archived === true,
  };
  if ((data.capacity === null) !== (data.capacityUnit === null)) invalid("capacityUnit");
  return atomic(db, () => {
    const old = parse(db.prepare("select data from garden_resources where id = ?").get(id));
    if ((old?.revision ?? null) !== (value.revision ?? null) || (old && old.areaId !== areaId)) {
      throw new AgricultureError("conflict", "revision", 409);
    }
    const visited = new Set([id]);
    for (let parentId = data.parentId; parentId;) {
      const parent = parse(db.prepare("select data from garden_resources where id = ? and area_id = ?").get(parentId, areaId));
      if (!parent || visited.has(parentId)) invalid("parentId");
      visited.add(parentId);
      parentId = parent.parentId;
    }
    data.revision = (old?.revision ?? 0) + 1;
    try {
      db.prepare("insert into garden_resources values (?, ?, ?, ?) on conflict(id) do update set code = excluded.code, data = excluded.data")
        .run(id, areaId, data.code, JSON.stringify(data));
    } catch (error) {
      if (error.errcode === 2067) throw new AgricultureError("duplicate", "code", 409);
      throw error;
    }
    return data;
  });
}

function requireArea(db, areaId, manage) {
  const area = db.prepare("select id, name, members_can_access from garden_areas where id = ?").get(areaId);
  if (!area || (!manage && !area.members_can_access)) throw new AgricultureError("missing", null, 404);
  return area;
}

export async function gardenRoute({ db, req, path, url, json, readJson, authorize, bedAccess }, manage) {
  const match = /^\/api\/agriculture\/(areas|beds)\/(\d+)\/(plan|geometry|physical|resources)$/.exec(path);
  if (!match) throw new AgricultureError("missing", null, 404);
  const [, kind, idText, action] = match;
  const id = Number(idText);
  const method = req.method;
  if (!Number.isSafeInteger(id)) invalid("id");
  if (kind === "beds" && ["physical", "geometry"].includes(action)) {
    bedAccess(id);
    if (method === "GET") return json(200, {
      physical: physical(db, id), geometry: bedGeometry(db, id),
    });
    if (method === "PUT" && action === "physical") {
      authorize();
      const body = await readJson();
      bedAccess(id);
      return json(200, { physical: savePhysical(db, id, body) });
    }
  }
  if (kind === "areas") {
    const area = requireArea(db, id, manage);
    if (method === "GET" && action === "plan") {
      const date = day(url.searchParams.get("date"), "date") ?? today();
      return json(200, { area: { id, name: area.name }, date, beds: gardenPlan(db, id, date), resources: resources(db, id).filter((row) => manage || !row.archived) });
    }
    if (method === "POST" && action === "geometry") {
      authorize();
      const body = await readJson();
      requireArea(db, id, manage);
      return json(200, { imported: importGeometry(db, id, body) });
    }
    if (method === "PUT" && action === "resources") {
      authorize();
      const body = await readJson();
      requireArea(db, id, manage);
      return json(200, { resource: saveResource(db, id, body) });
    }
  }
  throw new AgricultureError("missing", null, 404);
}

