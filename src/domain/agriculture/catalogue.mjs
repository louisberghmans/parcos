import { randomUUID } from "node:crypto";
import { AgricultureError, atomic, choice, day, fold, invalid, key, list, LOCALES, number, object, source, string } from "./validation.mjs";

export const catalogueMigration = {
  version: 5,
  name: "agricultural_catalogue",
  up(db) {
    db.exec(
      "create table agricultural_taxa (id text primary key, scientific_name text not null unique collate nocase, data text not null);" +
      "create table agricultural_crops (id text primary key, taxon_id text not null references agricultural_taxa(id), data text not null);" +
      "create table agricultural_varieties (id text primary key, crop_id text not null references agricultural_crops(id), name_key text not null, data text not null, unique(crop_id, name_key));" +
      "create table cultivation_profiles (id text primary key, crop_id text not null references agricultural_crops(id), variety_id text references agricultural_varieties(id), data text not null);" +
      "create table cultivation_profile_revisions (profile_id text not null references cultivation_profiles(id), revision integer not null, data text not null, saved_at text not null, primary key(profile_id, revision));" +
      "create index agricultural_crops_taxon on agricultural_crops(taxon_id);" +
      "create index cultivation_profiles_crop on cultivation_profiles(crop_id, variety_id);"
    );
  },
};

export const catalogueTypes = ["taxon", "crop", "variety", "profile"];
const tables = {
  taxon: "agricultural_taxa", crop: "agricultural_crops",
  variety: "agricultural_varieties", profile: "cultivation_profiles",
};
const reviews = ["draft", "reviewed", "archived"];
export const methods = ["direct", "transplant", "greenhouse", "tunnel", "overwintering", "perennial"];
export const quantityUnits = ["g", "kg", "piece", "bunch", "ml", "l"];
export const parameterUnits = {
  sowingWindow: "month", sowingDepth: "cm", sowingDensity: "seed/m2",
  germinationTemperature: "C", germinationDuration: "day", germinationRate: "%",
  nurseryDuration: "day", trayCapacity: "cell", thinning: "text", hardeningOff: "day",
  transplantWindow: "month", spacing: "cm", transplantSurvival: "%", rowSpacing: "cm",
  areaPerPlant: "m2", height: "cm", spread: "cm", sunlight: "h/day", soil: "text",
  ph: "pH", drainage: "text", protection: "text", watering: "text", weeding: "text",
  mulching: "text", pruning: "text", staking: "text", maturity: "day",
  harvestWindow: "month", yield: ["g/plant", "kg/plant", "kg/m2", "kg/m", "piece/plant", "bunch/m2"],
  storageConditions: "text", storageDuration: "day", labourSetup: "min",
  labourVariable: ["min/plant", "min/m2", "min/m", "min/tray"], rotation: "text",
};

function localized(value, field) {
  const data = object(value ?? {}, field);
  if (Object.keys(data).some((locale) => !LOCALES.includes(locale))) invalid(field);
  return Object.fromEntries(LOCALES.map((locale) => [locale, string(data[locale], field + "." + locale, { max: field === "description" ? 2000 : 160 })]));
}
function words(value, field) {
  return list(value, field, (item) => string(item, field, { required: true, max: 120 }), 25);
}
function aliases(value) {
  const data = object(value ?? {}, "synonyms");
  if (Object.keys(data).some((locale) => !LOCALES.includes(locale))) invalid("synonyms");
  return Object.fromEntries(LOCALES.map((locale) => [locale, words(data[locale], "synonyms." + locale)]));
}

function parameters(value) {
  const data = object(value ?? {}, "parameters");
  return Object.fromEntries(Object.entries(data).map(([name, input]) => {
    if (!Object.hasOwn(parameterUnits, name)) invalid("parameters." + name);
    if (input === null) return [name, null];
    const claim = object(input, name);
    const allowed = parameterUnits[name];
    const unit = choice(claim.unit, name + ".unit", Array.isArray(allowed) ? allowed : [allowed]);
    const result = {
      unit, constraint: choice(claim.constraint, name + ".constraint", ["hard", "preference", "estimate"]),
      review: choice(claim.review ?? "draft", name + ".review", ["draft", "reviewed"]),
      source: claim.source == null ? null : source(claim.source),
      conditions: string(claim.conditions, name + ".conditions"),
    };
    if (result.review === "reviewed" && !result.source) invalid(name + ".source");
    if (unit === "text") result.text = string(claim.text, name + ".text", { required: true });
    else {
      const bounds = {
        month: { min: 1, max: 12, integer: true }, "%": { max: 100 },
        pH: { max: 14 }, C: { min: -100, max: 100 }, "h/day": { max: 24 },
      };
      result.min = number(claim.min, name + ".min", bounds[unit]);
      result.max = number(claim.max, name + ".max", bounds[unit]);
      if (result.min === null || result.max === null || (unit !== "month" && result.min > result.max)) invalid(name + ".range");
    }
    return [name, result];
  }));
}

function clean(type, input) {
  const data = object(input, "record");
  const shared = {
    id: data.id === undefined ? randomUUID() : key(data.id),
    review: choice(data.review ?? "draft", "review", reviews),
    sources: list(data.sources, "sources", source, 20),
  };
  if (shared.review === "reviewed" && !shared.sources.length) invalid("sources");
  const optionalText = (name) => string(data[name], name);
  const name = (field) => string(data[field], field, { required: true, max: 160 });
  if (type === "taxon") return {
    ...shared, scientificName: name("scientificName"), family: optionalText("family"),
    genus: optionalText("genus"), species: optionalText("species"), names: localized(data.names, "names"),
    synonyms: aliases(data.synonyms),
  };
  if (type === "crop") {
    const names = localized(data.names, "names");
    if (!Object.values(names).some(Boolean)) invalid("names");
    const availability = data.availability == null ? null : object(data.availability, "availability");
    const months = availability ? list(availability.months, "availability.months", (value) => {
      if (value == null) invalid("availability.months");
      return number(value, "availability.months", { min: 1, max: 12, integer: true });
    }, 12) : null;
    if (availability && !months.length) invalid("availability.months");
    return {
      ...shared, names, taxonId: key(data.taxonId, "taxonId"), synonyms: aliases(data.synonyms),
      category: data.category == null ? null : key(data.category, "category"),
      edibleParts: list(data.edibleParts, "edibleParts", key),
      lifecycle: data.lifecycle == null ? null : choice(data.lifecycle, "lifecycle", ["annual", "biennial", "perennial"]),
      rotationGroup: optionalText("rotationGroup"), description: localized(data.description, "description"),
      availability: availability ? { context: string(availability.context, "availability.context", { required: true }),
        months: [...new Set(months)].sort((a, b) => a - b), source: source(availability.source) } : null,
    };
  }
  if (type === "variety") return {
    ...shared, cropId: key(data.cropId, "cropId"), name: name("name"), aliases: words(data.aliases, "aliases"),
    growthHabit: optionalText("growthHabit"),
    maturity: data.maturity == null ? null : choice(data.maturity, "maturity", ["early", "intermediate", "late"]),
    methods: list(data.methods, "methods", (item) => choice(item, "methods", methods)),
    overrides: parameters(data.overrides),
    resistance: list(data.resistance, "resistance", (value) => {
      const claim = object(value, "resistance");
      return { text: string(claim.text, "resistance.text", { required: true }), source: source(claim.source) };
    }),
  };
  return {
    ...shared, cropId: key(data.cropId, "cropId"), varietyId: data.varietyId == null ? null : key(data.varietyId, "varietyId"),
    name: name("name"), method: choice(data.method, "method", methods), context: name("context"),
    environment: optionalText("environment"), parameters: parameters(data.parameters),
  };
}

export function getRecord(db, type, id) {
  const row = db.prepare("select data from " + tables[type] + " where id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

export function catalogue(db, { manage = false, query = "", includeArchived = manage } = {}) {
  const result = Object.fromEntries(catalogueTypes.map((type) => [
    type, db.prepare("select data from " + tables[type] + " order by id").all()
      .map(({ data }) => JSON.parse(data)).filter((item) => manage ? includeArchived || item.review !== "archived" : item.review === "reviewed"),
  ]));
  if (!manage) {
    const taxa = new Set(result.taxon.map(({ id }) => id));
    result.crop = result.crop.filter(({ taxonId }) => taxa.has(taxonId));
    const crops = new Set(result.crop.map(({ id }) => id));
    result.variety = result.variety.filter(({ cropId }) => crops.has(cropId));
    const varieties = new Set(result.variety.map(({ id }) => id));
    result.profile = result.profile.filter(({ cropId, varietyId }) => crops.has(cropId) && (!varietyId || varieties.has(varietyId)))
      .map((profile) => ({ ...profile, parameters: Object.fromEntries(Object.entries(profile.parameters)
        .map(([name, claim]) => [name, claim?.review === "reviewed" ? claim : null])) }));
    result.variety = result.variety.map((variety) => ({ ...variety,
      overrides: Object.fromEntries(Object.entries(variety.overrides)
        .map(([name, claim]) => [name, claim?.review === "reviewed" ? claim : null])) }));
  }
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return result;
  const taxonById = new Map(result.taxon.map((value) => [value.id, value]));
  result.crop = result.crop.filter((crop) => {
    const taxon = taxonById.get(crop.taxonId);
    const names = [
      ...Object.values(crop.names), ...Object.values(crop.synonyms).flat(),
      taxon?.scientificName, ...Object.values(taxon?.names ?? {}), ...Object.values(taxon?.synonyms ?? {}).flat(),
      ...result.variety.filter(({ cropId }) => crop.id === cropId).flatMap((variety) => [variety.name, ...variety.aliases]),
    ];
    const searchable = fold(names.filter(Boolean).join(" "));
    return terms.every((term) => searchable.includes(term));
  });
  const cropIds = new Set(result.crop.map(({ id }) => id));
  result.variety = result.variety.filter(({ cropId }) => cropIds.has(cropId));
  result.profile = result.profile.filter(({ cropId }) => cropIds.has(cropId));
  return result;
}

function save(db, type, record, expectedRevision, { importing = false } = {}) {
  const previous = getRecord(db, type, record.id);
  if (previous && importing) {
    const { revision, ...existing } = previous;
    if (JSON.stringify(existing) === JSON.stringify(record)) return previous;
    throw new AgricultureError("conflict", record.id, 409);
  }
  if ((previous?.revision ?? null) !== (expectedRevision ?? null)) throw new AgricultureError("conflict", record.id, 409);
  const relation = {
    crop: ["taxon_id", "taxon", "taxonId"],
    variety: ["crop_id", "crop", "cropId"],
    profile: ["crop_id", "crop", "cropId"],
  }[type];
  if (relation) {
    const [, parentType, field] = relation;
    if (!getRecord(db, parentType, record[field]) || (previous && previous[field] !== record[field])) invalid(field);
  }
  if (type === "profile" && ((previous && previous.varietyId !== record.varietyId) ||
      (record.varietyId && getRecord(db, "variety", record.varietyId)?.cropId !== record.cropId))) invalid("varietyId");

  const next = { ...record, revision: (previous?.revision ?? 0) + 1 };
  const columns = { id: record.id, data: JSON.stringify(next) };
  if (relation) columns[relation[0]] = record[relation[2]];
  if (type === "taxon") columns.scientific_name = record.scientificName;
  if (type === "variety") columns.name_key = fold(record.name);
  if (type === "profile") columns.variety_id = record.varietyId;
  const fields = Object.keys(columns);
  try {
    db.prepare("insert into " + tables[type] + " (" + fields.join(", ") + ") values (" + fields.map(() => "?").join(", ") +
      ") on conflict(id) do update set " + fields.slice(1).map((field) => field + " = excluded." + field).join(", "))
      .run(...Object.values(columns));
  } catch (error) {
    if (error.errcode === 2067) throw new AgricultureError("duplicate", record.id, 409);
    throw error;
  }
  if (type === "profile") db.prepare("insert into cultivation_profile_revisions values (?, ?, ?, ?)").run(record.id, next.revision, columns.data, new Date().toISOString());
  return next;
}

export function saveRecord(db, type, body) {
  const record = clean(type, body);
  return atomic(db, () => save(db, type, record, body.revision));
}

export function profileHistory(db, id) {
  return db.prepare("select data, saved_at from cultivation_profile_revisions where profile_id = ? order by revision desc")
    .all(id).map(({ data, saved_at }) => ({ ...JSON.parse(data), savedAt: saved_at }));
}

export function parseCsv(file, width) {
  if (typeof file !== "string" || file.length > 850000) invalid("file");
  const rows = [];
  const cell = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/gy;
  const text = file.replace(/^\uFEFF/, "");
  let row = [];
  for (let offset = 0; offset < text.length;) {
    cell.lastIndex = offset;
    const match = cell.exec(text);
    if (!match || cell.lastIndex === offset) invalid("csv");
    offset = cell.lastIndex;
    row.push(match[1]?.replaceAll('""', '"') ?? match[2]);
    if (match[3] !== ",") {
      if (row.length !== width) invalid("csv");
      rows.push(row);
      row = [];
    }
    if (rows.length > 501) invalid("csv");
  }
  if (row.length) invalid("csv");
  return rows;
}

export function catalogueCsv(records) {
  const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
  return ["type,record", ...catalogueTypes.flatMap((type) => records[type].map((record) => type + "," + quote(JSON.stringify(record))))].join("\r\n") + "\r\n";
}

export function importCatalogue(db, body) {
  object(body, "import");
  let records = body.records;
  if (body.csv !== undefined) {
    const [header, ...rows] = parseCsv(body.csv, 2);
    if (header?.join(",") !== "type,record") invalid("csv.header");
    records = rows.map(([type, data]) => {
      try { return { type, record: JSON.parse(data) }; }
      catch { return invalid("csv.record"); }
    });
  }
  const ids = new Set();
  const entries = list(records, "records", (input) => {
    const entry = object(input, "entry");
    const type = choice(entry.type, "type", catalogueTypes);
    const record = clean(type, object(entry.record, "record"));
    if (!entry.record.id) invalid("id");
    const identity = type + ":" + record.id;
    if (ids.has(identity)) throw new AgricultureError("duplicate", identity, 409);
    ids.add(identity);
    return { type, record };
  }, 500);
  if (!entries.length) invalid("records");
  entries.sort((a, b) => catalogueTypes.indexOf(a.type) - catalogueTypes.indexOf(b.type));
  if (body.preview !== undefined && typeof body.preview !== "boolean") invalid("preview");
  db.exec("begin immediate");
  try {
    const result = entries.map(({ type, record }) => ({ type, record: save(db, type, record, null, { importing: true }) }));
    db.exec(body.preview ? "rollback" : "commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

