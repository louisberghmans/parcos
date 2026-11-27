import { randomUUID } from "node:crypto";
import { getRecord } from "./catalogue.mjs";
import { batchVisible } from "./cultivation.mjs";
import { migrateSuppliers } from "./suppliers.mjs";
import { AgricultureError, atomic, choice, day, invalid, key, list, number, object, string } from "./validation.mjs";
import qrcode from "qrcode-generator";

export const operationsMigration = {
  version: 8,
  name: "agricultural_operations_and_suppliers",
  up(db) {
    migrateSuppliers(db);
    db.exec([
      "create table agricultural_crop_text (id integer primary key, crop_id text not null unique references agricultural_crops(id), description text);",
      "create table harvest_submission_keys (id text primary key, harvest_id integer not null unique references harvests(id) on delete cascade, fingerprint text not null);",
      "create table cultivation_operation_templates (id text primary key, revision integer not null, data text not null);",
      "create table cultivation_operation_revisions (template_id text not null references cultivation_operation_templates(id), revision integer not null, data text not null, primary key(template_id, revision));",
      "create table cultivation_task_links (task_id integer primary key references tasks(id) on delete cascade, batch_id text not null references cultivation_batches(id), template_id text not null, template_revision integer not null, scheduled_on text not null, target_key text not null, foreign key(template_id, template_revision) references cultivation_operation_revisions(template_id, revision), unique(batch_id, template_id, scheduled_on, target_key));",
    ].join("\n"));
  },
};

const templateKinds = ["prepare", "sow", "thin", "potUp", "harden", "transplant", "support", "water", "weed", "mulch", "prune", "harvest", "clear", "other"];
const anchors = ["sow", "transplant", "harvest", "clear"];
const labourUnits = ["plant", "m2", "m", "tray", "bed"];
const parse = (row) => row ? JSON.parse(row.data) : null;
const notFound = () => { throw new AgricultureError("missing", null, 404); };
const idOrNull = (value, field) => value == null ? null : key(value, field);

function templateFor(db, templateId) {
  return parse(db.prepare("select data from cultivation_operation_templates where id = ?").get(templateId));
}

function saveTemplate(db, input) {
  const value = object(input, "template");
  const id = value.id == null ? randomUUID() : key(value.id);
  const existing = templateFor(db, id);
  if ((existing?.revision ?? null) !== (value.revision ?? null)) throw new AgricultureError("conflict", id, 409);
  const deps = [...new Set(list(value.dependencies, "dependencies", (entry) => key(entry, "dependencies"), 20))];
  const cropId = idOrNull(value.cropId, "cropId");
  const profileId = idOrNull(value.profileId, "profileId");
  const profile = profileId && getRecord(db, "profile", profileId);
  if (cropId && !getRecord(db, "crop", cropId)) invalid("cropId");
  if (profileId && (!profile || (cropId && profile.cropId !== cropId))) invalid("profileId");
  const effectiveCrop = cropId ?? profile?.cropId ?? null;
  const seen = new Set();
  function check(dependency) {
    if (dependency === id) invalid("dependencies");
    if (seen.has(dependency)) return;
    const record = templateFor(db, dependency);
    if (!record || (record.cropId && record.cropId !== effectiveCrop) || (record.profileId && record.profileId !== profileId)) invalid("dependencies");
    seen.add(dependency);
    record.dependencies.forEach(check);
  }
  deps.forEach(check);
  const startOffsetDays = number(value.startOffsetDays, "startOffsetDays", { min: -3650, max: 3650, integer: true });
  const endOffsetDays = number(value.endOffsetDays, "endOffsetDays", { min: -3650, max: 3650, integer: true });
  const anchor = value.anchor == null ? null : choice(value.anchor, "anchor", anchors);
  if ((startOffsetDays == null) !== (endOffsetDays == null) || (startOffsetDays !== null && (!anchor || startOffsetDays > endOffsetDays))) invalid("offsets");
  const variableMinutes = number(value.variableMinutes, "variableMinutes", { max: 10000 });
  const variableBasis = value.variableBasis == null ? null : choice(value.variableBasis, "variableBasis", labourUnits);
  if ((variableMinutes == null) !== (variableBasis == null)) invalid("variableBasis");
  const words = (value, field) => list(value, field, (entry) => string(entry, field, { required: true, max: 100 }), 20);
  const data = {
    id, revision: (existing?.revision ?? 0) + 1, cropId: effectiveCrop, profileId, dependencies: deps,
    kind: choice(value.kind, "kind", templateKinds),
    status: choice(value.status ?? "draft", "status", ["draft", "ready", "archived"]),
    title: string(value.title, "title", { required: true, max: 140 }),
    anchor, startOffsetDays, endOffsetDays,
    materials: words(value.materials, "materials"), tools: words(value.tools, "tools"),
    setupMinutes: number(value.setupMinutes, "setupMinutes", { max: 10000 }),
    variableMinutes, variableBasis,
    recurrenceDays: number(value.recurrenceDays, "recurrenceDays", { min: 1, max: 3650, integer: true }),
    trigger: string(value.trigger, "trigger"), instructions: string(value.instructions, "instructions", { max: 700 }),
    completion: string(value.completion, "completion", { max: 400 }), safety: string(value.safety, "safety", { max: 400 }),
  };
  const serialized = JSON.stringify(data);
  db.prepare("insert into cultivation_operation_templates values (?, ?, ?) on conflict(id) do update set revision = excluded.revision, data = excluded.data")
    .run(id, data.revision, serialized);
  db.prepare("insert into cultivation_operation_revisions values (?, ?, ?)").run(id, data.revision, serialized);
  return data;
}

function schedule(db, input, context) {
  const value = object(input, "task");
  const template = templateFor(db, key(value.templateId, "templateId"));
  if (!template || template.status !== "ready") invalid("templateId");
  if (template.revision !== value.templateRevision) throw new AgricultureError("conflict", "templateRevision", 409);
  const batch = parse(db.prepare("select data from cultivation_batches where id = ?").get(key(value.batchId, "batchId")));
  if (!batch || (template.cropId && template.cropId !== batch.cropId) || (template.profileId && template.profileId !== batch.profileId)) invalid("batchId");
  if (db.prepare("select 1 from batch_events where batch_id = ? and kind in ('completed', 'failed', 'cancelled') limit 1").get(batch.id)) invalid("batchId");
  const date = day(value.scheduledOn, "scheduledOn", true);
  const bedId = number(value.bedId, "bedId", { min: 1, integer: true });
  if (bedId && !db.prepare("select 1 from batch_allocations a join bed_footprints f on f.id = a.footprint_id where a.batch_id = ? and f.bed_id = ?")
    .get(batch.id, bedId)) invalid("bedId");
  const areaId = !bedId && batch.nurseryId
    ? db.prepare("select area_id from garden_resources where id = ?").get(batch.nurseryId)?.area_id ?? null : null;
  const targetKey = bedId ? "bed:" + bedId : areaId ? "area:" + areaId : "batch";
  const prior = db.prepare("select task_id, template_revision from cultivation_task_links where batch_id = ? and template_id = ? and scheduled_on = ? and target_key = ?")
    .get(batch.id, template.id, date, targetKey);
  if (prior) {
    if (prior.template_revision !== template.revision) throw new AgricultureError("conflict", "task", 409);
    return { taskId: prior.task_id, reused: true };
  }
  const description = context.operationTaskDescription(template);
  const taskId = context.createOperationTask({
    title: template.title + " · " + batch.code, description, bedId, areaId,
    dueAt: date + "T12:00:00.000Z",
  });
  db.prepare("insert into cultivation_task_links values (?, ?, ?, ?, ?, ?)").run(taskId, batch.id, template.id, template.revision, date, targetKey);
  return { taskId, reused: false };
}

export function batchTaskTargets(db, batchId, manage) {
  if (!db.prepare("select 1 from cultivation_batches where id = ?").get(batchId) || !batchVisible(db, batchId, manage)) notFound();
  return db.prepare("select distinct b.id, b.code from batch_allocations a join bed_footprints f on f.id = a.footprint_id join beds b on b.id = f.bed_id where a.batch_id = ? order by b.code")
    .all(batchId);
}

function occupancy(db, url, manage, localDay) {
  const date = day(url.searchParams.get("date"), "date") ?? localDay;
  const from = day(url.searchParams.get("from"), "from");
  const to = day(url.searchParams.get("to"), "to");
  if (from && to && from > to) invalid("to");
  const areaInput = url.searchParams.get("area");
  const areaId = areaInput == null ? null : number(Number(areaInput), "area", { min: 1, integer: true });
  if (areaId && !db.prepare("select 1 from garden_areas where id = ? and (? = 1 or members_can_access = 1)").get(areaId, Number(manage))) notFound();
  const beds = db.prepare(
    "select b.id, b.code, a.id as area_id, a.name as area_name, p.data, " +
    "exists(select 1 from bed_geometry g where g.bed_id = b.id and g.valid_from <= ? and (g.valid_to is null or g.valid_to > ?)) as mapped " +
    "from beds b join garden_areas a on a.id = b.area_id left join bed_physical p on p.bed_id = b.id " +
    "where (? = 1 or a.members_can_access = 1) and (? is null or a.id = ?) order by a.sort_order, b.sort_order, b.display_number"
  ).all(date, date, Number(manage), areaId, areaId).map((bed) => ({
    id: bed.id, code: bed.code, areaId: bed.area_id, areaName: bed.area_name, mapped: Boolean(bed.mapped),
    usableM2: parse(bed)?.usableM2 ?? null, footprints: [],
  }));
  const byBed = new Map(beds.map((bed) => [bed.id, bed]));
  const footprints = db.prepare(
    "select f.data, f.bed_id, b.data as batch_data, " +
    "exists(select 1 from batch_events e where e.batch_id = a.batch_id and e.footprint_id = f.id and e.kind in ('sow', 'plant', 'transplant') and e.occurred_on <= ?) as actual " +
    "from bed_footprints f join batch_allocations a on a.footprint_id = f.id join cultivation_batches b on b.id = a.batch_id " +
    "where f.starts_on <= ? and (f.ends_before is null or f.ends_before > ?) order by f.start_m, f.id"
  ).all(date, date, date);
  const seen = new Map();
  const visible = new Map();
  const showBatch = (id) => {
    if (!visible.has(id)) visible.set(id, batchVisible(db, id, manage));
    return visible.get(id);
  };
  for (const row of footprints) {
    const bed = byBed.get(row.bed_id);
    if (!bed) continue;
    const batch = JSON.parse(row.batch_data);
    if (!showBatch(batch.id)) continue;
    const data = parse(row);
    if (!seen.has(data.id)) {
      const footprint = { ...data, batches: [], actual: false };
      seen.set(data.id, footprint);
      bed.footprints.push(footprint);
    }
    const footprint = seen.get(data.id);
    footprint.batches.push({ id: batch.id, code: batch.code, cropNames: batch.cropNames, actual: Boolean(row.actual) });
    footprint.actual ||= Boolean(row.actual);
  }
  function metric(filter) {
    let totalKnownArea = 0;
    let occupiedKnownArea = 0;
    let unknownBeds = 0;
    let partialBeds = 0;
    let conflictingBeds = 0;
    for (const bed of beds) {
      const reserved = bed.footprints.filter(filter);
      if (bed.usableM2 === null || !bed.mapped) { unknownBeds++; continue; }
      totalKnownArea += bed.usableM2;
      if (reserved.some((item) => item.occupiedM2 === null)) partialBeds++;
      const known = reserved.reduce((sum, item) => sum + (item.occupiedM2 ?? 0), 0);
      occupiedKnownArea += known;
      if (known > bed.usableM2 + 1e-8) conflictingBeds++;
    }
    const percentage = totalKnownArea && !partialBeds && !conflictingBeds ? occupiedKnownArea / totalKnownArea * 100 : null;
    return { totalKnownArea, occupiedKnownArea, unknownBeds, partialBeds, conflictingBeds, percentage };
  }
  const rows = db.prepare(
    "select m.batch_id, m.quantity, m.unit, b.crop_id, b.data from harvest_measurements m join harvests h on h.id = m.harvest_id " +
    "join cultivation_batches b on b.id = m.batch_id join beds d on d.id = h.bed_id join garden_areas a on a.id = d.area_id " +
    "where (? = 1 or a.members_can_access = 1) and (? is null or a.id = ?) and (? is null or harvested_on >= ?) and (? is null or harvested_on <= ?)"
  ).all(Number(manage), areaId, areaId, from, from, to, to);
  const totals = new Map();
  for (const row of rows) {
    if (!showBatch(row.batch_id)) continue;
    const key = row.crop_id + ":" + row.unit;
    if (!totals.has(key)) totals.set(key, { cropId: row.crop_id, names: parse(row).cropNames, unit: row.unit, amount: 0, harvests: 0 });
    const group = totals.get(key);
    group.amount += row.quantity;
    group.harvests++;
  }
  return { date, from, to, beds, reserved: metric(() => true), actual: metric((item) => item.actual), harvests: [...totals.values()] };
}

export async function operationsRoute(context, manage) {
  const { db, req, url, path, authorize, readJson, json, text, canonicalBatchUrl } = context;
  const prefix = "/api/agriculture";
  const label = /^\/api\/agriculture\/labels\/([a-z0-9_-]{1,80})\.gif$/.exec(path);
  if (label && req.method === "GET") {
    const id = label[1];
    batchTaskTargets(db, id, manage);
    const code = qrcode(0, "M");
    code.addData(canonicalBatchUrl(id));
    code.make();
    return text(200, Buffer.from(code.createDataURL(4).split(",")[1], "base64"), "image/gif");
  }
  if (path === prefix + "/occupancy" && req.method === "GET") return json(200, occupancy(db, url, manage, context.localDay));
  authorize();
  if (path === prefix + "/operations" && req.method === "GET") return json(200, {
    templates: db.prepare("select data from cultivation_operation_templates order by rowid desc").all().map(parse),
    kinds: templateKinds, anchors, labourUnits,
  });
  if (path === prefix + "/operations" && req.method === "PUT") {
    const body = await readJson();
    return json(200, { template: atomic(db, () => saveTemplate(db, body)) });
  }
  const targets = /^\/api\/agriculture\/operations\/batches\/([a-z0-9_-]{1,80})$/.exec(path);
  if (targets && req.method === "GET") return json(200, { beds: batchTaskTargets(db, targets[1], manage) });
  if (path === prefix + "/operations/tasks" && req.method === "POST") {
    const input = await readJson();
    const result = atomic(db, () => schedule(db, input, context));
    return json(result.reused ? 200 : 201, result);
  }
  notFound();
}
