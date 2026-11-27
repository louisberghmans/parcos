import { randomUUID } from "node:crypto";
import { getRecord, quantityUnits } from "./catalogue.mjs";
import { AgricultureError, atomic, choice, day, invalid, key, list, number, object, source, string } from "./validation.mjs";

export const cultivationMigration = {
  version: 7,
  name: "cultivation_traceability",
  up(db) {
    db.exec([
      "create table cultivation_batches (id text primary key, code text not null unique collate nocase, crop_id text not null references agricultural_crops(id), variety_id text references agricultural_varieties(id), profile_id text not null, profile_revision integer not null, nursery_id text references garden_resources(id), data text not null, foreign key(profile_id, profile_revision) references cultivation_profile_revisions(profile_id, revision));",
      "create table cultivation_combinations (id text primary key, data text not null);",
      "create table bed_footprints (id text primary key, bed_id integer not null references beds(id) on delete restrict, starts_on text not null, ends_before text, start_m real not null, end_m real not null, combination_id text references cultivation_combinations(id), geometry_from text, data text not null, foreign key(bed_id, geometry_from) references bed_geometry(bed_id, valid_from), check(ends_before is null or starts_on < ends_before), check(0 <= start_m and start_m < end_m));",
      "create index bed_footprints_bed on bed_footprints(bed_id, starts_on, ends_before);",
      "create table footprint_releases (footprint_id text primary key references bed_footprints(id), free_on text not null, recorded_at text not null, actor_id integer references members(id) on delete set null);",
      "create table batch_allocations (batch_id text not null references cultivation_batches(id), footprint_id text not null references bed_footprints(id), plant_count integer, primary key(batch_id, footprint_id));",
      "create index batch_allocations_footprint on batch_allocations(footprint_id);",
      "create table batch_events (sequence integer primary key, id text not null unique, batch_id text not null references cultivation_batches(id), kind text not null, occurred_on text not null, recorded_at text not null, actor_id integer references members(id) on delete set null, footprint_id text references bed_footprints(id), from_resource_id text references garden_resources(id), to_resource_id text references garden_resources(id), data text not null);",
      "create index batch_events_batch on batch_events(batch_id, sequence);",
      "create table harvest_measurements (harvest_id integer primary key references harvests(id) on delete cascade, batch_id text not null, footprint_id text not null, quantity real not null check(quantity > 0), unit text not null, harvested_on text not null, foreign key(batch_id, footprint_id) references batch_allocations(batch_id, footprint_id));",
      "create index harvest_measurements_batch on harvest_measurements(batch_id, harvested_on);",
    ].join("\n"));
  },
};

const parse = (row) => row ? JSON.parse(row.data) : null;
const missing = () => { throw new AgricultureError("missing", null, 404); };
const conflict = (field) => { throw new AgricultureError("conflict", field, 409); };
const count = (value, field, min = 0) => number(value, field, { min, integer: true });
const safeId = (value, field) => value == null ? null : key(value, field);
const idFor = (value) => value == null ? randomUUID() : key(value);
const realDay = (value, field, localDay) => {
  const result = day(value, field, true);
  if (result > localDay) invalid(field);
  return result;
};

export function batchVisible(db, id, manage) {
  if (manage) return true;
  const privateLink = db.prepare(
    "select 1 from cultivation_batches cb join garden_resources r on r.id = cb.nursery_id join garden_areas a on a.id = r.area_id where cb.id = ? and a.members_can_access = 0 " +
    "union all select 1 from batch_allocations ba join bed_footprints f on f.id = ba.footprint_id join beds b on b.id = f.bed_id join garden_areas a on a.id = b.area_id where ba.batch_id = ? and a.members_can_access = 0 " +
    "union all select 1 from batch_events e join garden_resources r on r.id in (e.from_resource_id, e.to_resource_id) join garden_areas a on a.id = r.area_id where e.batch_id = ? and a.members_can_access = 0 limit 1"
  ).get(id, id, id);
  return !privateLink;
}

function getBatch(db, id, manage = true) {
  const result = parse(db.prepare("select data from cultivation_batches where id = ?").get(id));
  if (!result || !batchVisible(db, id, manage)) missing();
  return result;
}

function resource(db, id, manage, { archived = false } = {}) {
  if (!id) invalid("resourceId");
  const row = db.prepare("select r.data, a.members_can_access from garden_resources r join garden_areas a on a.id = r.area_id where r.id = ?").get(id);
  if (!row || (!manage && !row.members_can_access)) missing();
  const item = parse(row);
  if (!archived && item.archived) invalid("resourceId");
  return item;
}

function profileFor(db, id, revision) {
  return parse(db.prepare("select data from cultivation_profile_revisions where profile_id = ? and revision = ?").get(id, revision));
}

function saveBatch(db, input) {
  const value = object(input, "batch");
  const cropId = key(value.cropId, "cropId");
  const varietyId = safeId(value.varietyId, "varietyId");
  const profileId = key(value.profileId, "profileId");
  const nurseryId = safeId(value.nurseryId, "nurseryId");
  const profileRevision = count(value.profileRevision, "profileRevision", 1);
  const record = {
    id: idFor(value.id), code: string(value.code, "code", { required: true, max: 50 }),
    cropId, varietyId, profileId, profileRevision, nurseryId,
    route: choice(value.route, "route", ["direct", "transplant"]),
    seedSource: string(value.seedSource, "seedSource"), seedLot: string(value.seedLot, "seedLot", { max: 120 }),
    seedsPlanned: count(value.seedsPlanned, "seedsPlanned", 1),
    sowPlannedOn: day(value.sowPlannedOn, "sowPlannedOn"),
    transplantPlannedOn: day(value.transplantPlannedOn, "transplantPlannedOn"),
    transplantExpectedOn: day(value.transplantExpectedOn, "transplantExpectedOn"),
    harvestExpectedFrom: day(value.harvestExpectedFrom, "harvestExpectedFrom"),
    harvestExpectedTo: day(value.harvestExpectedTo, "harvestExpectedTo"),
    nextOperation: string(value.nextOperation, "nextOperation"),
    nextOperationOn: day(value.nextOperationOn, "nextOperationOn"),
  };
  if (record.harvestExpectedFrom && record.harvestExpectedTo && record.harvestExpectedTo < record.harvestExpectedFrom) invalid("harvestExpectedTo");
  if (record.sowPlannedOn && record.transplantPlannedOn && record.transplantPlannedOn < record.sowPlannedOn) invalid("transplantPlannedOn");
  if (record.route === "direct" && nurseryId) invalid("nurseryId");
  if (record.route === "direct" && (record.transplantPlannedOn || record.transplantExpectedOn)) invalid("transplantPlannedOn");
  const crop = getRecord(db, "crop", cropId);
  const taxon = crop && getRecord(db, "taxon", crop.taxonId);
  const variety = varietyId && getRecord(db, "variety", varietyId);
  const profile = profileRevision && profileFor(db, profileId, profileRevision);
  if (!crop || crop.review === "archived" || taxon?.review === "archived") invalid("cropId");
  if (varietyId && (variety?.cropId !== cropId || variety.review === "archived")) invalid("varietyId");
  if (profile?.cropId !== cropId || (profile.varietyId && profile.varietyId !== varietyId) ||
      getRecord(db, "profile", profileId)?.review === "archived" ||
      (["direct", "transplant"].includes(profile.method) && profile.method !== record.route)) invalid("profileRevision");
  if (nurseryId) resource(db, nurseryId, true);
  record.cropNames = crop.names;
  record.varietyName = variety?.name ?? null;
  record.createdAt = new Date().toISOString();
  try {
    db.prepare("insert into cultivation_batches values (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(record.id, record.code, cropId, varietyId, profileId, profileRevision, nurseryId, JSON.stringify(record));
  } catch (error) {
    if ([1555, 2067].includes(error.errcode)) throw new AgricultureError("duplicate", "code", 409);
    throw error;
  }
  return record;
}

function saveCombination(db, input) {
  const value = object(input, "combination");
  const crops = [...new Set(list(value.crops, "crops", (id) => key(id, "crops"), 12))];
  if (crops.length < 2 || crops.some((id) => !getRecord(db, "crop", id))) invalid("crops");
  const review = choice(value.review, "review", ["draft", "reviewed"]);
  const evidence = value.source == null ? null : source(value.source);
  if (review === "reviewed" && !evidence) invalid("source");
  const record = {
    id: idFor(value.id), name: string(value.name, "name", { required: true }), cropIds: crops, review, source: evidence,
    context: string(value.context, "context", { required: review === "reviewed" }),
    spacing: string(value.spacing, "spacing"), timing: string(value.timing, "timing"),
  };
  if (db.prepare("select 1 from cultivation_combinations where id = ?").get(record.id)) conflict("id");
  db.prepare("insert into cultivation_combinations values (?, ?)").run(record.id, JSON.stringify(record));
  return record;
}

function footprint(db, id) {
  return parse(db.prepare("select data from bed_footprints where id = ?").get(id));
}

function saveAllocation(db, input, bedAccess) {
  const value = object(input, "allocation");
  const batchId = key(value.batchId, "batchId");
  const plants = count(value.plantCount, "plantCount", 1);
  const batch = getBatch(db, batchId);
  if (["completed", "failed", "cancelled"].includes(actualState(batchEvents(db, batchId)).status)) conflict("status");
  let target;
  if (value.footprintId) {
    target = footprint(db, key(value.footprintId, "footprintId"));
    if (!target?.combinationId || target.releasedOn) invalid("footprintId");
    bedAccess(target.bedId);
  } else {
    const bedId = count(value.bedId, "bedId", 1);
    const bed = bedAccess(bedId);
    const startsOn = day(value.startsOn, "startsOn", true);
    const endsBefore = day(value.endsBefore, "endsBefore");
    const startM = number(value.startM, "startM");
    const endM = number(value.endM, "endM");
    const occupiedM2 = number(value.occupiedM2, "occupiedM2", { min: 0.001 });
    if (startM == null || endM == null || startM >= endM || (endsBefore && startsOn >= endsBefore)) invalid("footprint");
    const measurements = parse(db.prepare("select data from bed_physical where bed_id = ?").get(bedId));
    if (measurements?.availability === "unavailable") invalid("availability");
    if (measurements?.lengthM != null && endM > measurements.lengthM) invalid("endM");
    if (measurements?.usableM2 != null && occupiedM2 != null && occupiedM2 > measurements.usableM2) invalid("occupiedM2");
    const overlapping = db.prepare("select 1 from bed_footprints where bed_id = ? and start_m < ? and end_m > ? " +
      "and (ends_before is null or ends_before > ?) and (? is null or starts_on < ?) limit 1")
      .get(bedId, endM, startM, startsOn, endsBefore, endsBefore);
    if (overlapping) throw new AgricultureError("overlap", "footprint", 409);
    const geometry = db.prepare("select valid_from from bed_geometry where bed_id = ? and valid_from <= ? and (valid_to is null or valid_to > ?)").get(bedId, startsOn, startsOn);
    target = {
      id: randomUUID(), bedId, bedCode: bed.code, startsOn, endsBefore, startM, endM, occupiedM2,
      combinationId: safeId(value.combinationId, "combinationId"), geometryFrom: geometry?.valid_from ?? null,
    };
    if (target.combinationId) assertCombination(db, target, batchId, batch.cropId);
    db.prepare("insert into bed_footprints values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(target.id, bedId, startsOn, endsBefore, startM, endM, target.combinationId, target.geometryFrom, JSON.stringify(target));
  }
  if (target.combinationId) assertCombination(db, target, batchId, batch.cropId);
  if (db.prepare("select 1 from batch_allocations where batch_id = ? and footprint_id = ?").get(batchId, target.id)) conflict("footprintId");
  db.prepare("insert into batch_allocations values (?, ?, ?)").run(batchId, target.id, plants);
  return { ...target, batchId, plantCount: plants };
}

function releaseFootprint(db, id, input, context) {
  const value = object(input, "release");
  const target = footprint(db, id);
  if (!target) missing();
  context.bedAccess(target.bedId);
  const freeOn = realDay(value.freeOn, "freeOn", context.localDay);
  if (target.releasedOn === freeOn) return target;
  if (target.releasedOn || freeOn <= target.startsOn || (target.endsBefore && freeOn > target.endsBefore)) invalid("freeOn");
  const laterEvent = db.prepare("select 1 from batch_events where footprint_id = ? and occurred_on >= ? limit 1").get(id, freeOn);
  const laterHarvest = db.prepare("select 1 from harvest_measurements where footprint_id = ? and harvested_on >= ? limit 1").get(id, freeOn);
  if (laterEvent || laterHarvest) conflict("freeOn");
  const data = { ...target, plannedEndsBefore: target.endsBefore, endsBefore: freeOn, releasedOn: freeOn };
  db.prepare("update bed_footprints set ends_before = ?, data = ? where id = ?").run(freeOn, JSON.stringify(data), id);
  db.prepare("insert into footprint_releases values (?, ?, ?, ?)").run(id, freeOn, new Date().toISOString(), context.session.member.id);
  return data;
}

function assertCombination(db, target, batchId, cropId) {
  const combo = parse(db.prepare("select data from cultivation_combinations where id = ?").get(target.combinationId));
  if (combo?.review !== "reviewed" || !combo.cropIds.includes(cropId)) invalid("combinationId");
  const existing = db.prepare("select b.crop_id from batch_allocations a join cultivation_batches b on b.id = a.batch_id where a.footprint_id = ? and a.batch_id != ?")
    .all(target.id, batchId);
  if (existing.some(({ crop_id }) => crop_id === cropId)) conflict("combinationId");
}

export function allocationOn(db, batchId, bedId, date) {
  return db.prepare("select f.id from batch_allocations a join bed_footprints f on f.id = a.footprint_id " +
    "where a.batch_id = ? and f.bed_id = ? and f.starts_on <= ? and (f.ends_before is null or f.ends_before > ?) " +
    "and exists(select 1 from batch_events e where e.batch_id = a.batch_id and e.footprint_id = f.id and e.kind in ('sow', 'plant', 'transplant') and e.occurred_on <= ?) limit 1")
    .get(batchId, bedId, date, date, date);
}

function batchEvents(db, id) {
  return db.prepare("select data from batch_events where batch_id = ? order by sequence").all(id).map(parse);
}

function actualState(events) {
  const locations = new Map();
  function change(id, delta) {
    locations.set(id, (locations.get(id) ?? 0) + delta);
  }
  const actual = {
    sowOn: null, seedsSown: null, germinated: null, viable: null, transplanted: 0,
    transplantOn: null, planted: 0, status: "planned", lastTransition: null,
  };
  for (const event of events) {
    const { kind, fromResourceId, toResourceId, plants, occurredOn } = event;
    if (!["observation", "maintenance"].includes(kind)) actual.lastTransition = occurredOn;
    if (kind === "sow") Object.assign(actual, { sowOn: occurredOn, seedsSown: plants, status: "sown", planted: Number(event.footprintId !== null) });
    if (kind === "germination") {
      Object.assign(actual, { germinated: event.germinated, viable: plants, status: "germinated" });
      if (toResourceId) change(toResourceId, plants);
    }
    if (["move", "discard", "transplant"].includes(kind)) change(fromResourceId, -plants);
    if (kind === "move") change(toResourceId, plants);
    if (kind === "transplant") {
      actual.transplanted += plants;
      actual.transplantOn ??= occurredOn;
      if (actual.status !== "ready") actual.status = "growing";
    }
    if (kind === "plant") {
      actual.planted += 1;
      if (actual.status !== "ready") actual.status = "growing";
    }
    if (["ready", "completed", "failed", "cancelled"].includes(kind)) actual.status = kind;
  }
  return { ...actual, remaining: [...locations.values()].reduce((a, b) => a + b, 0),
    nursery: [...locations].filter(([, plants]) => plants > 0).map(([id, plants]) => ({ id, plants })) };
}

function batchAllocations(db, id) {
  return db.prepare("select f.data, a.plant_count from batch_allocations a join bed_footprints f on f.id = a.footprint_id where a.batch_id = ? order by f.starts_on, f.start_m")
    .all(id).map((row) => ({ ...parse(row), plantCount: row.plant_count }));
}

export const eventKinds = ["sow", "germination", "move", "discard", "transplant", "plant", "observation", "maintenance", "ready", "completed", "failed", "cancelled"];

function storeEvent(db, batch, input, context, manage) {
  const value = object(input, "event");
  const kind = choice(value.kind, "kind", eventKinds);
  if (!manage && ["completed", "failed", "cancelled"].includes(kind)) throw new AgricultureError("missing", null, 403);
  const occurredOn = realDay(value.occurredOn, "occurredOn", context.localDay);
  const id = idFor(value.id);
  const fromResourceId = safeId(value.fromResourceId, "fromResourceId");
  let toResourceId = safeId(value.toResourceId, "toResourceId");
  const footprintId = safeId(value.footprintId, "footprintId");
  const plants = count(value.plants, "plants");
  const germinated = count(value.germinated, "germinated");
  const note = string(value.note, "note", { max: 800 });
  const events = batchEvents(db, batch.id);
  const actual = actualState(events);
  const prior = events.find((event) => event.id === id);
  if (prior) {
    if (prior.kind !== kind || prior.occurredOn !== occurredOn || prior.fromResourceId !== fromResourceId ||
        (toResourceId && prior.toResourceId !== toResourceId) || prior.footprintId !== footprintId ||
        prior.plants !== plants || prior.germinated !== germinated || prior.note !== note) conflict("id");
    return prior;
  }
  if (db.prepare("select 1 from batch_events where id = ?").get(id)) conflict("id");
  if (["completed", "failed", "cancelled"].includes(actual.status)) conflict("status");
  if (!["observation", "maintenance"].includes(kind) && actual.lastTransition && occurredOn < actual.lastTransition) invalid("occurredOn");
  if (["observation", "maintenance"].includes(kind) && !note) invalid("note");
  if (!actual.sowOn && !["sow", "observation", "cancelled"].includes(kind)) invalid("sowOn");
  const footprintRequired = ["plant", "transplant"].includes(kind) || (kind === "sow" && batch.route === "direct");
  if (footprintRequired !== Boolean(footprintId)) invalid("footprintId");
  if (footprintId) {
    const allocation = batchAllocations(db, batch.id).find((item) => item.id === footprintId);
    if (!allocation || allocation.startsOn > occurredOn || (allocation.endsBefore && allocation.endsBefore <= occurredOn)) invalid("footprintId");
    context.bedAccess(allocation.bedId);
    if (kind === "transplant" && allocation.plantCount !== null) {
      const already = events.filter((event) => event.kind === "transplant" && event.footprintId === footprintId).reduce((sum, event) => sum + event.plants, 0);
      if (already + plants > allocation.plantCount) throw new AgricultureError("capacity", "plantCount", 409);
    }
  }
  if (kind === "sow") {
    if (actual.sowOn || plants === 0) invalid("sowOn");
    if (batch.route === "transplant") toResourceId ??= batch.nurseryId;
  }
  if (kind === "germination") {
    if (actual.viable !== null || plants == null || germinated == null || plants > germinated ||
        (actual.seedsSown != null && germinated > actual.seedsSown)) invalid("germinated");
    const sow = events.find((event) => event.kind === "sow");
    if (batch.route === "transplant") {
      if (toResourceId && toResourceId !== sow.toResourceId) invalid("toResourceId");
      toResourceId = sow.toResourceId;
    }
  }
  const originRequired = ["move", "discard", "transplant"].includes(kind);
  if (originRequired) {
    if (batch.route !== "transplant" || !fromResourceId || !plants) invalid("plants");
    resource(db, fromResourceId, manage, { archived: true });
    if (plants > (actual.nursery.find(({ id }) => id === fromResourceId)?.plants ?? 0)) {
      throw new AgricultureError("capacity", "plants", 409);
    }
  } else if (fromResourceId) invalid("fromResourceId");
  if (kind === "move" && (!toResourceId || toResourceId === fromResourceId)) invalid("toResourceId");
  if (toResourceId) {
    if (batch.route !== "transplant" || !["sow", "germination", "move"].includes(kind)) invalid("toResourceId");
    const target = resource(db, toResourceId, manage);
    if (target.capacity != null && target.capacityUnit === "plant" && ["germination", "move"].includes(kind)) {
      const total = db.prepare("select coalesce(sum((case when to_resource_id = ? then 1 else -1 end) * json_extract(data, '$.plants')), 0) as n " +
        "from batch_events where kind in ('germination', 'move', 'discard', 'transplant') and ? in (from_resource_id, to_resource_id)").get(toResourceId, toResourceId).n;
      if (total + plants > target.capacity) throw new AgricultureError("capacity", "toResourceId", 409);
    }
  } else if (batch.route === "transplant" && ["sow", "germination"].includes(kind)) invalid("toResourceId");
  if (kind === "plant" && batch.route !== "direct") invalid("kind");
  if (kind === "plant" && events.some((event) => ["sow", "plant"].includes(event.kind) && event.footprintId === footprintId)) conflict("footprintId");
  if (kind === "ready" && !(actual.transplanted || actual.planted)) invalid("kind");
  if (kind === "completed" && actual.remaining > 0) invalid("nursery");
  if (kind === "cancelled" && actual.sowOn) invalid("kind");
  if (kind === "failed" && actual.remaining > 0) invalid("nursery");
  const event = { id, kind, occurredOn, fromResourceId, toResourceId, footprintId, plants, germinated, note, recordedAt: new Date().toISOString() };
  const activityBedId = footprintId ? footprint(db, footprintId)?.bedId : null;
  db.prepare("insert into batch_events (id, batch_id, kind, occurred_on, recorded_at, actor_id, footprint_id, from_resource_id, to_resource_id, data) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, batch.id, kind, occurredOn, event.recordedAt, context.session.member.id, footprintId, fromResourceId, toResourceId, JSON.stringify(event));
  if (activityBedId) context.recordBatchActivity(activityBedId, kind);
  return event;
}

export function harvestInput(db, value, bedId, manage, localDay) {
  if (value.batchId == null && value.amount == null && value.unit == null && value.harvestedOn == null) return null;
  const batchId = key(value.batchId, "batchId");
  getBatch(db, batchId, manage);
  const harvestedOn = realDay(value.harvestedOn, "harvestedOn", localDay);
  const amount = number(value.amount, "amount", { min: 0.000001 });
  const unit = choice(value.unit, "unit", quantityUnits);
  const allocation = allocationOn(db, batchId, bedId, harvestedOn);
  const terminal = batchEvents(db, batchId).find((event) => ["completed", "failed", "cancelled"].includes(event.kind));
  if (amount == null || !allocation || (terminal && harvestedOn > terminal.occurredOn)) invalid("allocation");
  return { batchId, footprintId: allocation.id, harvestedOn, amount, unit };
}

function batchDetail(db, batch, harvests) {
  const events = batchEvents(db, batch.id);
  const profile = profileFor(db, batch.profileId, batch.profileRevision);
  return {
    batch, events, actual: actualState(events), allocations: batchAllocations(db, batch.id),
    profile: { id: profile.id, revision: profile.revision, name: profile.name, method: profile.method, context: profile.context },
    harvests: harvests(batch.id),
  };
}

function allocationOptions(db, manage) {
  const resourceRows = db.prepare("select r.data from garden_resources r join garden_areas a on a.id = r.area_id where ? = 1 or a.members_can_access = 1 order by r.code")
    .all(Number(manage)).map(parse).filter((item) => !item.archived);
  const result = { resources: resourceRows, eventKinds, quantityUnits };
  if (manage) {
    result.combinations = db.prepare("select data from cultivation_combinations order by id").all().map(parse);
    result.sharedFootprints = db.prepare("select data from bed_footprints where combination_id is not null order by starts_on").all().map(parse);
  }
  return result;
}

export async function cultivationRoute(context, manage) {
  const { db, req, path, readJson, json, authorize, requireWrite, batchHarvests } = context;
  const method = req.method;
  const prefix = "/api/agriculture";
  if (path === prefix + "/batches") {
    if (method === "GET") {
      const batches = db.prepare("select data from cultivation_batches order by rowid desc").all().map(parse)
        .filter(({ id }) => batchVisible(db, id, manage))
        .map((batch) => ({ ...batch, status: actualState(batchEvents(db, batch.id)).status }));
      return json(200, { batches, ...allocationOptions(db, manage) });
    }
    if (method === "POST") {
      authorize();
      const input = await readJson();
      return json(201, { batch: atomic(db, () => saveBatch(db, input)) });
    }
  }
  const match = /^\/api\/agriculture\/batches\/([a-z0-9_-]{1,80})(?:\/(events|allocations))?$/.exec(path);
  if (match) {
    const [, id, action] = match;
    if (!action && method === "GET") return json(200, batchDetail(db, getBatch(db, id, manage), batchHarvests));
    if (action === "events" && method === "POST") {
      requireWrite();
      const input = await readJson();
      return json(201, { event: atomic(db, () => storeEvent(db, getBatch(db, id, manage), input, context, manage)) });
    }
    if (action === "allocations" && method === "POST") {
      authorize();
      const input = object(await readJson(), "allocation");
      return json(201, { allocation: atomic(db, () => saveAllocation(db, { ...input, batchId: id }, context.bedAccess)) });
    }
  }
  if (path === prefix + "/combinations" && method === "POST") {
    authorize();
    const input = await readJson();
    return json(201, { combination: atomic(db, () => saveCombination(db, input)) });
  }
  const release = /^\/api\/agriculture\/footprints\/([a-z0-9_-]{1,80})\/release$/.exec(path);
  if (release && method === "POST") {
    authorize();
    const input = await readJson();
    return json(200, { allocation: atomic(db, () => releaseFootprint(db, release[1], input, context)) });
  }
  missing();
}
