import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtime = globalThis.process;
const env = runtime?.env ?? {};

const SESSION_COOKIE = "parcos_session";
const SESSION_DAYS = 30;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const PHOTO_BYTES = 6 * 1024 * 1024;
const AVATAR_BYTES = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function passwordHash(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function passwordMatches(password, encoded) {
  try {
    const [scheme, saltText, hashText] = String(encoded).split("$");
    if (scheme !== "scrypt" || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, "base64url");
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function cleanUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new HttpError(400, "Le nom d’utilisateur doit contenir 3 à 32 lettres, chiffres, points, tirets ou underscores.");
  }
  return username;
}

function cleanDisplayName(value) {
  const displayName = String(value ?? "").trim();
  if (displayName.length < 1 || displayName.length > 80) {
    throw new HttpError(400, "Le nom affiché doit contenir entre 1 et 80 caractères.");
  }
  return displayName;
}

function validatePassword(value) {
  const password = String(value ?? "");
  if (password.length < 12 || password.length > 200) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 12 caractères.");
  }
  return password;
}

function memberJson(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    preferredLocale: row.preferred_locale,
    bio: row.bio ?? "",
    avatarUrl: row.avatar_path ? `/media/${row.avatar_path}` : null,
    createdAt: row.created_at,
  };
}

function bedJson(row) {
  return {
    id: row.id,
    areaId: row.area_id,
    code: row.code,
    number: row.display_number,
    garden: row.garden,
    section: row.section,
    locationHint: row.location_hint,
    crop: row.crop,
    variety: row.variety,
    status: row.status,
    note: row.note,
    harvestNote: row.harvest_note,
    photoUrl: row.photo_path ? `/media/${row.photo_path}` : null,
    updatedAt: row.updated_at,
  };
}

function areaJson(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    codePrefix: row.code_prefix,
    description: row.description ?? "",
    locationHint: row.location_hint ?? "",
    membersCanAccess: Boolean(row.members_can_access),
    sortOrder: row.sort_order,
    bedCount: Number(row.bed_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function registrationJson(row) {
  if (!row?.registration_status) return null;
  return {
    status: row.registration_status,
    adults: row.registration_adults,
    teenagers: row.registration_teenagers,
    children: row.registration_children,
    youngChildren: row.registration_young_children,
    partySize: row.registration_adults + row.registration_teenagers + row.registration_children + row.registration_young_children,
  };
}

function attendeeJson(entry) {
  return {
    memberId: entry.member_id ?? null,
    memberName: entry.member_name,
    username: entry.username ?? null,
    avatarUrl: entry.avatar_path ? `/media/${entry.avatar_path}` : null,
    status: entry.status,
    adults: entry.adults,
    teenagers: entry.teenagers,
    children: entry.children,
    youngChildren: entry.young_children,
    partySize: entry.adults + entry.teenagers + entry.children + entry.young_children,
    public: Boolean(entry.is_public),
  };
}

function eventJson(row, attendees = null) {
  const attendeeCount = Number(row.attendee_count ?? 0);
  const activeAttendees = attendees?.filter((entry) => ["going", "attended"].includes(entry.status)) ?? [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    location: row.location,
    type: row.event_type,
    state: row.state,
    audience: row.audience,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    accessibilityNote: row.accessibility_note ?? "",
    preparationNote: row.preparation_note ?? "",
    attendeeCount,
    spotsRemaining: row.capacity === null ? null : Math.max(0, row.capacity - attendeeCount),
    creatorName: row.creator_name ?? null,
    registration: registrationJson(row),
    attendeeNames: activeAttendees.slice(0, 4).map((entry) => entry.memberName),
    attendeeOverflow: Math.max(0, activeAttendees.length - 4),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function harvestJson(row) {
  return {
    id: row.id,
    bedId: row.bed_id,
    quantity: row.quantity ?? "",
    note: row.note ?? "",
    photoUrl: row.photo_path ? `/media/${row.photo_path}` : null,
    memberName: row.member_name ?? "Membre",
    createdAt: row.created_at,
  };
}

function bedNoteJson(row) {
  return {
    id: row.id,
    bedId: row.bed_id,
    type: row.note_type,
    body: row.body,
    memberName: row.member_name ?? "Ancienne note",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function activityJson(row) {
  return {
    id: row.id,
    bedId: row.bed_id,
    bedCode: row.bed_code ?? null,
    bedCrop: row.bed_crop ?? "",
    type: row.activity_type,
    note: row.note ?? "",
    memberName: row.member_name ?? "Membre",
    createdAt: row.created_at,
  };
}

function howToVideoJson(row) {
  return {
    id: row.id,
    bedId: row.bed_id,
    title: row.title,
    note: row.note ?? "",
    youtubeVideoId: row.youtube_video_id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${row.youtube_video_id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      return index < 0
        ? [decodeURIComponent(part), ""]
        : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function text(res, status, body, contentType, headers = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "private, no-store",
    ...headers,
  });
  res.end(body);
}

function securityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; frame-src https://www.youtube-nocookie.com https://www.youtube.com; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(), microphone=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

async function readJson(req) {
  const contentType = String(req.headers["content-type"] ?? "").split(";")[0];
  if (contentType !== "application/json") throw new HttpError(415, "JSON requis.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new HttpError(413, "Requête trop volumineuse.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

function createSchema(db) {
  db.exec(`
    pragma foreign_keys = on;
    pragma journal_mode = wal;
    pragma busy_timeout = 5000;

    create table if not exists members (
      id integer primary key,
      username text not null unique collate nocase,
      display_name text not null,
      password_hash text not null,
      role text not null check (role in ('member', 'coordinator', 'admin')),
      preferred_locale text not null default 'fr' check (preferred_locale in ('fr', 'nl', 'en')),
      bio text,
      avatar_path text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists sessions (
      token_hash text primary key,
      member_id integer not null references members(id) on delete cascade,
      csrf_token text not null,
      expires_at text not null,
      created_at text not null
    );
    create index if not exists sessions_member_idx on sessions(member_id);

    create table if not exists invites (
      id integer primary key,
      token_hash text not null unique,
      role text not null check (role in ('member', 'coordinator')),
      created_by integer not null references members(id),
      expires_at text not null,
      used_at text,
      used_by integer references members(id),
      created_at text not null
    );

    create table if not exists access_resets (
      id integer primary key,
      token_hash text not null unique,
      member_id integer not null references members(id) on delete cascade,
      created_by integer not null references members(id),
      expires_at text not null,
      used_at text,
      created_at text not null
    );

    create table if not exists garden_areas (
      id integer primary key,
      name text not null unique collate nocase,
      slug text not null unique,
      code_prefix text not null unique collate nocase,
      description text,
      location_hint text,
      members_can_access integer not null default 1 check (members_can_access in (0, 1)),
      sort_order integer not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists beds (
      id integer primary key,
      area_id integer references garden_areas(id) on delete restrict,
      code text not null unique,
      display_number integer not null,
      garden text not null,
      section text not null,
      location_hint text,
      sort_order integer not null,
      crop text,
      variety text,
      status text not null check (status in ('unknown', 'ready', 'growing', 'harvest', 'clear', 'winter')),
      note text,
      harvest_note text,
      updated_at text not null,
      unique(garden, display_number)
    );

    create table if not exists bed_photos (
      id integer primary key,
      bed_id integer not null references beds(id) on delete cascade,
      path text not null unique,
      content_type text not null,
      caption text,
      uploaded_by integer references members(id) on delete set null,
      is_cover integer not null default 0,
      created_at text not null
    );
    create index if not exists bed_photos_bed_idx on bed_photos(bed_id, is_cover, created_at desc);

    create table if not exists bed_notes (
      id integer primary key,
      bed_id integer not null references beds(id) on delete cascade,
      member_id integer references members(id) on delete set null,
      note_type text not null check (note_type in ('garden', 'harvest')),
      body text not null,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists bed_notes_bed_idx on bed_notes(bed_id, created_at desc);

    create table if not exists harvests (
      id integer primary key,
      bed_id integer not null references beds(id) on delete cascade,
      member_id integer references members(id) on delete set null,
      quantity text,
      note text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists harvests_bed_idx on harvests(bed_id, created_at desc);

    create table if not exists harvest_photos (
      id integer primary key,
      harvest_id integer not null references harvests(id) on delete cascade,
      path text not null unique,
      content_type text not null,
      caption text,
      uploaded_by integer references members(id) on delete set null,
      created_at text not null
    );
    create index if not exists harvest_photos_harvest_idx on harvest_photos(harvest_id, created_at desc);

    create table if not exists how_to_videos (
      id integer primary key,
      bed_id integer not null references beds(id) on delete cascade,
      title text not null,
      youtube_video_id text not null,
      source_url text not null,
      note text,
      created_by integer references members(id) on delete set null,
      created_at text not null,
      updated_at text not null,
      unique(bed_id, youtube_video_id)
    );
    create index if not exists how_to_videos_bed_idx on how_to_videos(bed_id, created_at desc);

    create table if not exists activities (
      id integer primary key,
      bed_id integer references beds(id) on delete set null,
      member_id integer references members(id) on delete set null,
      activity_type text not null,
      note text,
      before_json text,
      after_json text,
      created_at text not null
    );
    create index if not exists activities_bed_idx on activities(bed_id, created_at desc);

    create table if not exists events (
      id integer primary key,
      title text not null,
      description text,
      location text not null,
      event_type text not null check (event_type in ('work', 'workshop', 'community', 'school', 'planning', 'milestone')),
      state text not null default 'published' check (state in ('draft', 'published', 'cancelled', 'completed')),
      audience text not null default 'members' check (audience in ('members', 'coordinators', 'public')),
      starts_at text not null,
      ends_at text not null,
      capacity integer check (capacity is null or capacity > 0),
      accessibility_note text,
      preparation_note text,
      created_by integer references members(id) on delete set null,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists events_starts_idx on events(starts_at, state);

    create table if not exists event_registrations (
      id integer primary key,
      event_id integer not null references events(id) on delete cascade,
      member_id integer not null references members(id) on delete cascade,
      adults integer not null default 1 check (adults >= 0),
      teenagers integer not null default 0 check (teenagers >= 0),
      children integer not null default 0 check (children >= 0),
      young_children integer not null default 0 check (young_children >= 0),
      status text not null check (status in ('going', 'waitlisted', 'cancelled', 'attended', 'no_show')),
      created_at text not null,
      updated_at text not null,
      unique(event_id, member_id)
    );
    create index if not exists event_registrations_event_idx on event_registrations(event_id, status, updated_at);

    create table if not exists public_event_registrations (
      id integer primary key,
      event_id integer not null references events(id) on delete cascade,
      guest_name text not null,
      guest_contact text,
      adults integer not null default 1 check (adults >= 0),
      teenagers integer not null default 0 check (teenagers >= 0),
      children integer not null default 0 check (children >= 0),
      young_children integer not null default 0 check (young_children >= 0),
      status text not null check (status in ('going', 'waitlisted', 'cancelled', 'attended', 'no_show')),
      created_at text not null,
      updated_at text not null
    );
    create index if not exists public_event_registrations_event_idx on public_event_registrations(event_id, status, updated_at);

    create table if not exists app_meta (
      key text primary key,
      value text not null,
      updated_at text not null
    );
  `);

  const bedColumns = db.prepare("pragma table_info(beds)").all();
  if (!bedColumns.some((column) => column.name === "area_id")) {
    db.exec("alter table beds add column area_id integer references garden_areas(id) on delete restrict");
  }
  db.exec("create index if not exists beds_area_idx on beds(area_id, display_number)");

  const memberColumns = db.prepare("pragma table_info(members)").all();
  if (!memberColumns.some((column) => column.name === "avatar_path")) {
    db.exec("alter table members add column avatar_path text");
  }

  const eventsSql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'events'").get()?.sql ?? "";
  if (eventsSql && !eventsSql.includes("'public'")) {
    db.exec(`
      pragma foreign_keys = off;
      pragma legacy_alter_table = on;
      alter table events rename to events_legacy_public_migration;
      create table events (
        id integer primary key,
        title text not null,
        description text,
        location text not null,
        event_type text not null check (event_type in ('work', 'workshop', 'community', 'school', 'planning', 'milestone')),
        state text not null default 'published' check (state in ('draft', 'published', 'cancelled', 'completed')),
        audience text not null default 'members' check (audience in ('members', 'coordinators', 'public')),
        starts_at text not null,
        ends_at text not null,
        capacity integer check (capacity is null or capacity > 0),
        accessibility_note text,
        preparation_note text,
        created_by integer references members(id) on delete set null,
        created_at text not null,
        updated_at text not null
      );
      insert into events select * from events_legacy_public_migration;
      drop table events_legacy_public_migration;
      pragma legacy_alter_table = off;
      pragma foreign_keys = on;
    `);
  }
  db.exec("create index if not exists events_starts_idx on events(starts_at, state)");
}

const seedBeds = [
  [1, "Tomates", "Noire de Crimée", "growing"],
  [2, "Courgettes", "Verte de Milan", "harvest"],
  [3, null, null, "ready"],
  [4, "Haricots", "Neckarkönigin", "growing"],
  [5, "Fraises", "Mara des bois", "harvest"],
  [6, "Carottes", "Nantaise", "growing"],
  [7, "Laitues", "Reine de Mai", "harvest"],
  [8, "Fleurs", "Cosmos & zinnias", "growing"],
  [9, "Framboisiers", "Zone permanente", "growing"],
  [10, "Pommes de terre", "Charlotte", "clear"],
  [11, "Pois", "Merveille de Kelvedon", "growing"],
  [12, null, null, "ready"],
  [13, "Chou kale", "Nero di Toscana", "harvest"],
  [14, "Blettes", "Bright Lights", "growing"],
  [15, "Oignons", "Sturon", "growing"],
  [16, "Engrais vert", "Phacélie", "winter"],
  [17, "Betteraves", "Detroit", "growing"],
  [18, "Poireaux", "Bleu de Solaise", "growing"],
  [19, null, null, "ready"],
  [20, "Concombres", "Marketmore", "growing"],
  [21, "Choux", "Milan", "growing"],
  [22, "Radis", "Flamboyant", "harvest"],
  [23, "Aromatiques", "Basilic & persil", "growing"],
  [24, null, null, "clear"],
];

function seedDatabase(db, adminUsername, adminPassword, demoData = false) {
  const memberCount = db.prepare("select count(*) as count from members").get().count;
  if (memberCount === 0) {
    if (!adminPassword) {
      throw new Error("PARCOS_ADMIN_PASSWORD is required the first time ParcOS starts (minimum 10 characters).");
    }
    const username = cleanUsername(adminUsername || "admin");
    const password = validatePassword(adminPassword);
    const timestamp = now();
    db.prepare(`insert into members (username, display_name, password_hash, role, preferred_locale, created_at, updated_at)
      values (?, ?, ?, 'admin', 'fr', ?, ?)`)
      .run(username, "Administrateur ParcOS", passwordHash(password), timestamp, timestamp);
  }

  // Production installs deliberately start empty. The legacy seed remains
  // available only for explicit development and migration tests.
  if (!demoData) return;

  const areaCount = db.prepare("select count(*) as count from garden_areas").get().count;
  if (areaCount === 0) {
    const timestamp = now();
    const insertArea = db.prepare(`insert into garden_areas
      (name, slug, code_prefix, description, location_hint, members_can_access, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const areas = [
      ["Grand Potager", "grand-potager", "GP", "Le potager principal et ses planches de culture.", "Autour de la ruine", 1, 1],
      ["Potager des enfants", "potager-enfants", "PE", "L’espace pédagogique consacré aux enfants.", "À proximité de la zone de jeux", 1, 2],
      ["Pépinière", "pepiniere", "PN", "Semis, jeunes plants et matériel de multiplication.", "Zone réservée à l’équipe de coordination", 0, 3],
      ["Compost", "compost", "CP", "Bacs de compostage et matières organiques.", "Près de l’accès de service", 1, 4],
    ];
    for (const area of areas) insertArea.run(...area, timestamp, timestamp);
  }

  const bedCount = db.prepare("select count(*) as count from beds").get().count;
  if (bedCount === 0) {
    const insert = db.prepare(`insert into beds
      (code, display_number, garden, section, location_hint, sort_order, crop, variety, status, note, harvest_note, updated_at)
      values (?, ?, 'Grand Potager', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const timestamp = now();
    db.exec("begin");
    try {
      for (const [number, crop, variety, status] of seedBeds) {
        const section = number <= 8 ? "Planches nord" : number === 9 ? "Côté ouest" : "Planches sud";
        const hint = number === 9 ? "Grande zone près de la ruine" : number <= 8 ? "Au nord de la ruine" : "Au sud de la ruine";
        const note = crop ? "Informations à confirmer sur le terrain." : "Planche disponible — informations à confirmer.";
        const harvest = status === "harvest" ? "Récolte ouverte — vérifier les consignes avec un coordinateur." : null;
        insert.run(`GP-${String(number).padStart(2, "0")}`, number, section, hint, number, crop, variety, status, note, harvest, timestamp);
      }
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }

  db.prepare(`update beds set area_id = (
    select id from garden_areas where garden_areas.name = beds.garden collate nocase
  ) where area_id is null`).run();

  const calendarVersion = db.prepare("select value from app_meta where key = 'calendar_seed_version'").get()?.value;
  if (!calendarVersion) {
    const admin = db.prepare("select id from members where role = 'admin' order by id limit 1").get();
    const seeds = [
      ["Permanence au potager", "Équipe prévue : Raymond, Céline et Olivier.", "Grand Potager", "work", "2026-06-06T08:00:00.000Z", "2026-06-06T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Michel.", "Grand Potager", "work", "2026-06-14T08:00:00.000Z", "2026-06-14T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Laurie, Joël et Céline.", "Grand Potager", "work", "2026-06-21T08:00:00.000Z", "2026-06-21T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Atelier Cornichon", "Atelier et permanence. Équipe prévue : Raymond et Carbo ; Joël est encore à confirmer.", "Grand Potager", "workshop", "2026-06-28T08:00:00.000Z", "2026-06-28T11:00:00.000Z", 24, "Rendez-vous à 10 h au Grand Potager."],
      ["Permanence au potager", "Équipe prévue : Céline et Carbo ; Joël viendra peut-être après 11 h.", "Grand Potager", "work", "2026-07-04T08:00:00.000Z", "2026-07-04T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Raymond et Laurie.", "Grand Potager", "work", "2026-07-11T08:00:00.000Z", "2026-07-11T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Céline et Michel.", "Grand Potager", "work", "2026-07-18T08:00:00.000Z", "2026-07-18T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Joël ; la présence d’Olivier reste à confirmer.", "Grand Potager", "work", "2026-07-25T08:00:00.000Z", "2026-07-25T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Joël et Carbo.", "Grand Potager", "work", "2026-08-01T08:00:00.000Z", "2026-08-01T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Michel ; Joël est encore à confirmer.", "Grand Potager", "work", "2026-08-08T08:00:00.000Z", "2026-08-08T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Raymond.", "Grand Potager", "work", "2026-08-15T08:00:00.000Z", "2026-08-15T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Permanence au potager", "Équipe prévue : Raymond et Joël.", "Grand Potager", "work", "2026-08-23T08:00:00.000Z", "2026-08-23T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["BBQ Maïs", "Barbecue de fin d’été. Équipe de permanence prévue : Laurie et Olivier.", "Grand Potager", "community", "2026-08-30T10:00:00.000Z", "2026-08-30T15:00:00.000Z", 40, "Les détails pratiques et la récolte de maïs seront confirmés plus près de la date."],
      ["Permanence au potager", "Équipe prévue : Marie et Joël.", "Grand Potager", "work", "2026-09-05T08:00:00.000Z", "2026-09-05T11:00:00.000Z", 20, "Permanence de 10 h à 13 h."],
      ["Sculpture de citrouilles", "Atelier d’automne autour des citrouilles du potager.", "Grand Potager", "workshop", "2026-10-11T12:00:00.000Z", "2026-10-11T15:00:00.000Z", 24, "Les horaires et le matériel seront confirmés par les coordinateurs."],
      ["Plantation de bulbes", "Plantation collective des bulbes pour préparer le printemps.", "Grand Potager", "workshop", "2026-11-15T09:00:00.000Z", "2026-11-15T12:00:00.000Z", 24, "Prévoyez des gants et des vêtements adaptés à la météo."],
      ["Hivernage du potager", "Dernière rencontre de l’année pour protéger les cultures et ranger le matériel.", "Grand Potager", "milestone", "2026-12-13T09:00:00.000Z", "2026-12-13T12:00:00.000Z", 30, "Permanence de 10 h à 13 h."],
    ];
    const insertEvent = db.prepare(`insert into events
      (title, description, location, event_type, state, audience, starts_at, ends_at, capacity, preparation_note, created_by, created_at, updated_at)
      values (?, ?, ?, ?, 'published', 'members', ?, ?, ?, ?, ?, ?, ?)`);
    const timestamp = now();
    db.exec("begin immediate");
    try {
      db.prepare("delete from events where title in ('Chantier collectif du samedi', 'Atelier compost vivant', 'Apéro des jardiniers')").run();
      for (const [title, description, location, type, startsAt, endsAt, capacity, preparation] of seeds) {
        insertEvent.run(title, description, location, type, startsAt, endsAt, capacity, preparation, admin?.id ?? null, timestamp, timestamp);
      }
      db.prepare(`insert into app_meta (key, value, updated_at) values ('calendar_seed_version', '2026-real-v2', ?)
        on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(timestamp);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  } else if (calendarVersion === "2026-real-v1") {
    const timestamp = now();
    db.exec("begin immediate");
    try {
      db.prepare("update events set title = 'Permanence au potager', updated_at = ? where title = 'Permanence au jardin'").run(timestamp);
      db.prepare("update events set title = 'Hivernage du potager', updated_at = ? where title = 'Hivernage du jardin'").run(timestamp);
      db.prepare("update events set description = replace(description, 'du jardin', 'du potager'), updated_at = ? where description like '%du jardin%'").run(timestamp);
      db.prepare("update app_meta set value = '2026-real-v2', updated_at = ? where key = 'calendar_seed_version'").run(timestamp);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }
}

function createSession(db, memberId) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare("insert into sessions (token_hash, member_id, csrf_token, expires_at, created_at) values (?, ?, ?, ?, ?)")
    .run(sha256(token), memberId, csrfToken, expiresAt, now());
  return { token, csrfToken, expiresAt };
}

function sessionCookie(token, req, secureSetting, trustProxy = false) {
  const forwardedSecure = trustProxy && String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
  const secure = secureSetting || forwardedSecure;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(req, secureSetting, trustProxy = false) {
  return sessionCookie("", req, secureSetting, trustProxy).replace(`Max-Age=${SESSION_DAYS * 86400}`, "Max-Age=0");
}

function getSession(db, req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = db.prepare(`select s.token_hash, s.csrf_token, s.expires_at,
    m.id, m.username, m.display_name, m.role, m.preferred_locale, m.bio, m.avatar_path, m.created_at
    from sessions s join members m on m.id = s.member_id where s.token_hash = ?`).get(tokenHash);
  if (!row) return null;
  if (row.expires_at <= now()) {
    db.prepare("delete from sessions where token_hash = ?").run(tokenHash);
    return null;
  }
  return { tokenHash, csrfToken: row.csrf_token, member: memberJson(row) };
}

function requireSession(db, req) {
  const session = getSession(db, req);
  if (!session) throw new HttpError(401, "Connexion requise.");
  return session;
}

function requireCsrf(req, session) {
  const supplied = String(req.headers["x-csrf-token"] ?? "");
  const expected = session.csrfToken;
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) throw new HttpError(403, "Jeton de sécurité invalide. Rechargez la page.");
}

function requireCoordinator(session) {
  if (!(["coordinator", "admin"].includes(session.member.role))) {
    throw new HttpError(403, "Accès coordinateur requis.");
  }
}

function requestOrigin(req, configuredBaseUrl, trustProxy = false) {
  const forwardedHost = trustProxy ? String(req.headers["x-forwarded-host"] ?? "").split(",")[0].trim() : "";
  const rawHost = forwardedHost || req.headers.host;
  let host = String(rawHost ?? "localhost").split(",")[0].trim();
  const forwardedProtocol = trustProxy ? String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase() : "";
  if (forwardedProtocol && !["http", "https"].includes(forwardedProtocol)) throw new HttpError(400, "Protocole transmis invalide.");
  const protocol = forwardedProtocol || (req.socket.encrypted ? "https" : "http");
  const forwardedPort = trustProxy ? String(req.headers["x-forwarded-port"] ?? "").split(",")[0].trim() : "";
  if (forwardedPort && (!/^\d{1,5}$/.test(forwardedPort) || Number(forwardedPort) > 65535 || Number(forwardedPort) < 1)) {
    throw new HttpError(400, "Port transmis invalide.");
  }
  const hostHasPort = host.startsWith("[") ? /\]:\d+$/.test(host) : /:\d+$/.test(host);
  const defaultPort = (protocol === "https" && forwardedPort === "443") || (protocol === "http" && forwardedPort === "80");
  if (forwardedHost && forwardedPort && !hostHasPort && !defaultPort) host = `${host}:${forwardedPort}`;
  if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(host)) {
    throw new HttpError(400, "En-tête Host invalide.");
  }
  if (!rawHost && configuredBaseUrl) return configuredBaseUrl;
  return `${protocol}://${host}`;
}

function photoData(value, maxBytes = PHOTO_BYTES) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value ?? ""));
  if (!match) throw new HttpError(400, "Photo JPEG, PNG ou WebP requise.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes) throw new HttpError(413, `La photo doit faire moins de ${Math.round(maxBytes / 1024 / 1024)} Mo.`);
  const validSignature = match[1] === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validSignature) throw new HttpError(400, "Le contenu du fichier ne correspond pas au format de photo annoncé.");
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[match[1]];
  return { bytes, contentType: match[1], extension };
}

function youtubeVideoId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new HttpError(400, "Lien YouTube requis.");
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpError(400, "Lien YouTube invalide.");
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let candidate = "";
  if (host === "youtu.be") {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") candidate = parsed.searchParams.get("v") ?? "";
    else candidate = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(candidate)) throw new HttpError(400, "Lien YouTube invalide.");
  return candidate;
}

function insertBedNote(db, bedId, memberId, type, body, timestamp = now()) {
  const cleanBody = String(body ?? "").trim().slice(0, 1000);
  if (!cleanBody) return null;
  return db.prepare(`insert into bed_notes (bed_id, member_id, note_type, body, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)`).run(bedId, memberId ?? null, type, cleanBody, timestamp, timestamp);
}

function backfillBedNotes(db) {
  const done = db.prepare("select value from app_meta where key = 'bed_notes_backfill_v1'").get()?.value;
  if (done) return;
  const timestamp = now();
  db.exec("begin immediate");
  try {
    const rows = db.prepare("select id, note, harvest_note, updated_at from beds where note is not null or harvest_note is not null").all();
    for (const row of rows) {
      if (String(row.note ?? "").trim()) insertBedNote(db, row.id, null, "garden", row.note, row.updated_at || timestamp);
      if (String(row.harvest_note ?? "").trim()) insertBedNote(db, row.id, null, "harvest", row.harvest_note, row.updated_at || timestamp);
    }
    db.prepare(`insert into app_meta (key, value, updated_at) values ('bed_notes_backfill_v1', 'done', ?)
      on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(timestamp);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function slugify(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function areaInput(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? "").trim().slice(0, 100);
  if (!name) throw new HttpError(400, "Le nom du lieu est requis.");
  const codePrefix = String(body.codePrefix ?? existing.code_prefix ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(codePrefix)) throw new HttpError(400, "Le préfixe doit contenir 2 à 6 lettres ou chiffres.");
  const slug = slugify(body.slug ?? existing.slug ?? name);
  if (!slug) throw new HttpError(400, "Le nom du lieu est invalide.");
  return {
    name,
    slug,
    codePrefix,
    description: String(body.description ?? existing.description ?? "").trim().slice(0, 800) || null,
    locationHint: String(body.locationHint ?? existing.location_hint ?? "").trim().slice(0, 300) || null,
    membersCanAccess: body.membersCanAccess === undefined ? Boolean(existing.members_can_access ?? true) : Boolean(body.membersCanAccess),
  };
}

function findArea(db, id) {
  const row = db.prepare(`select a.*, (select count(*) from beds b where b.area_id = a.id) as bed_count
    from garden_areas a where a.id = ?`).get(id);
  if (!row) throw new HttpError(404, "Lieu introuvable.");
  return row;
}

function findBed(db, id) {
  const row = db.prepare(`select b.*, p.path as photo_path, a.members_can_access, a.name as area_name from beds b
    join garden_areas a on a.id = b.area_id
    left join bed_photos p on p.bed_id = b.id and p.is_cover = 1 where b.id = ?`).get(id);
  if (!row) throw new HttpError(404, "Planche introuvable.");
  return row;
}

function requireBedAccess(row, session) {
  if (!row.members_can_access && !["coordinator", "admin"].includes(session.member.role)) {
    throw new HttpError(404, "Planche introuvable.");
  }
  return row;
}

function eventSelect(db, memberId, eventId = null) {
  const where = eventId === null ? "" : "where e.id = ?";
  const parameters = eventId === null ? [memberId] : [memberId, eventId];
  return db.prepare(`select e.*, creator.display_name as creator_name,
    coalesce((select sum(total) from (
      select r.adults + r.teenagers + r.children + r.young_children as total
      from event_registrations r where r.event_id = e.id and r.status in ('going', 'attended')
      union all
      select pr.adults + pr.teenagers + pr.children + pr.young_children as total
      from public_event_registrations pr where pr.event_id = e.id and pr.status in ('going', 'attended')
    )), 0) as attendee_count,
    mine.status as registration_status, mine.adults as registration_adults,
    mine.teenagers as registration_teenagers, mine.children as registration_children,
    mine.young_children as registration_young_children
    from events e
    left join members creator on creator.id = e.created_by
    left join event_registrations mine on mine.event_id = e.id and mine.member_id = ?
    ${where}`).all(...parameters);
}

function findEvent(db, eventId, memberId) {
  const row = eventSelect(db, memberId, eventId)[0];
  if (!row) throw new HttpError(404, "Événement introuvable.");
  return row;
}

function findPublicEvent(db, eventId) {
  const row = eventSelect(db, null, eventId)[0];
  if (!row || row.state !== "published" || row.audience !== "public") throw new HttpError(404, "Événement public introuvable.");
  return row;
}

function eventAttendees(db, eventId) {
  return db.prepare(`select * from (
    select 0 as is_public, r.status, r.adults, r.teenagers, r.children, r.young_children,
      m.id as member_id, m.display_name as member_name, m.username, m.avatar_path, r.updated_at
    from event_registrations r join members m on m.id = r.member_id
    where r.event_id = ? and r.status != 'cancelled'
    union all
    select 1 as is_public, pr.status, pr.adults, pr.teenagers, pr.children, pr.young_children,
      null as member_id, pr.guest_name as member_name, null as username, null as avatar_path, pr.updated_at
    from public_event_registrations pr
    where pr.event_id = ? and pr.status != 'cancelled'
  )
    order by case status when 'going' then 0 when 'attended' then 1 when 'waitlisted' then 2 else 3 end, member_name collate nocase`)
    .all(eventId, eventId).map(attendeeJson);
}

function eventInput(body, existing = {}) {
  const textValue = (key, fallback, max, required = false) => {
    const value = body[key] === undefined ? fallback : String(body[key] ?? "").trim().slice(0, max);
    if (required && !value) throw new HttpError(400, `Le champ ${key} est requis.`);
    return value || null;
  };
  const startsAt = new Date(body.startsAt ?? existing.starts_at ?? "");
  const endsAt = new Date(body.endsAt ?? existing.ends_at ?? "");
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new HttpError(400, "Les heures de début et de fin sont invalides.");
  }
  const capacityValue = body.capacity === undefined ? existing.capacity : body.capacity;
  const capacity = capacityValue === null || capacityValue === "" ? null : Number(capacityValue);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
    throw new HttpError(400, "La capacité doit être comprise entre 1 et 1000.");
  }
  const allowedTypes = ["work", "workshop", "community", "school", "planning", "milestone"];
  const allowedStates = ["draft", "published", "cancelled", "completed"];
  const allowedAudiences = ["members", "coordinators", "public"];
  return {
    title: textValue("title", existing.title, 140, true),
    description: textValue("description", existing.description, 3000),
    location: textValue("location", existing.location, 180, true),
    type: allowedTypes.includes(body.type) ? body.type : (existing.event_type ?? "work"),
    state: allowedStates.includes(body.state) ? body.state : (existing.state ?? "published"),
    audience: allowedAudiences.includes(body.audience) ? body.audience : (existing.audience ?? "members"),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity,
    accessibilityNote: textValue("accessibilityNote", existing.accessibility_note, 1000),
    preparationNote: textValue("preparationNote", existing.preparation_note, 1000),
  };
}

function registrationCounts(body) {
  const count = (key, fallback = 0) => {
    const value = Number(body[key] ?? fallback);
    if (!Number.isInteger(value) || value < 0 || value > 20) throw new HttpError(400, "Le nombre de participants est invalide.");
    return value;
  };
  const counts = { adults: count("adults", 1), teenagers: count("teenagers"), children: count("children"), youngChildren: count("youngChildren") };
  const partySize = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (partySize < 1 || partySize > 20) throw new HttpError(400, "Une inscription doit comprendre entre 1 et 20 personnes.");
  return { ...counts, partySize };
}

function rebalanceWaitlist(db, eventId) {
  const event = db.prepare("select capacity from events where id = ?").get(eventId);
  if (!event?.capacity) return;
  let occupied = Number(db.prepare(`select coalesce(sum(total), 0) as total from (
    select adults + teenagers + children + young_children as total from event_registrations where event_id = ? and status in ('going', 'attended')
    union all
    select adults + teenagers + children + young_children as total from public_event_registrations where event_id = ? and status in ('going', 'attended')
  )`).get(eventId, eventId).total);
  const waiting = db.prepare(`select 'member' as source, id, adults + teenagers + children + young_children as party_size, updated_at
    from event_registrations where event_id = ? and status = 'waitlisted'
    union all
    select 'public' as source, id, adults + teenagers + children + young_children as party_size, updated_at
    from public_event_registrations where event_id = ? and status = 'waitlisted'
    order by updated_at, id`).all(eventId, eventId);
  for (const entry of waiting) {
    if (occupied + entry.party_size <= event.capacity) {
      const table = entry.source === "public" ? "public_event_registrations" : "event_registrations";
      db.prepare(`update ${table} set status = 'going', updated_at = ? where id = ?`).run(now(), entry.id);
      occupied += entry.party_size;
    }
  }
}

function occupiedSeats(db, eventId, excludeMemberId = null) {
  return Number(db.prepare(`select coalesce(sum(total), 0) as total from (
    select adults + teenagers + children + young_children as total
      from event_registrations where event_id = ? and (? is null or member_id != ?) and status in ('going', 'attended')
    union all
    select adults + teenagers + children + young_children as total
      from public_event_registrations where event_id = ? and status in ('going', 'attended')
  )`).get(eventId, excludeMemberId, excludeMemberId, eventId).total);
}

function publicRegistrationInput(body) {
  const guestName = cleanDisplayName(body.guestName ?? body.displayName);
  const guestContact = String(body.guestContact ?? body.email ?? "").trim().slice(0, 160) || null;
  return { guestName, guestContact, ...registrationCounts(body) };
}

function booleanImportValue(value, fallback = true) {
  const textValue = String(value ?? "").trim().toLowerCase();
  if (!textValue) return fallback;
  return ["1", "true", "yes", "y", "oui", "o"].includes(textValue);
}

function importRows(db, rows, adminId) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    throw new HttpError(400, "Importez entre 1 et 500 lignes.");
  }
  const timestamp = now();
  const result = { imported: { areas: 0, beds: 0, events: 0, members: 0 }, errors: [] };
  db.exec("begin immediate");
  try {
    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const row = Object.fromEntries(Object.entries(rawRow ?? {}).map(([key, value]) => [String(key).trim(), value]));
      const entity = String(row.entity ?? row.type ?? "").trim().toLowerCase();
      if (!entity) continue;
      try {
        if (entity === "area") {
          const values = areaInput({
            name: row.name,
            codePrefix: row.codePrefix,
            description: row.description,
            locationHint: row.locationHint,
            membersCanAccess: booleanImportValue(row.membersCanAccess, true),
          });
          const sortOrder = Number(db.prepare("select coalesce(max(sort_order), 0) + 1 as next from garden_areas").get().next);
          db.prepare(`insert into garden_areas
            (name, slug, code_prefix, description, location_hint, members_can_access, sort_order, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(values.name, values.slug, values.codePrefix, values.description, values.locationHint, values.membersCanAccess ? 1 : 0, sortOrder, timestamp, timestamp);
          result.imported.areas += 1;
        } else if (entity === "bed") {
          const areaCode = String(row.areaCodePrefix ?? row.codePrefix ?? "").trim().toUpperCase();
          const areaName = String(row.areaName ?? row.garden ?? "").trim();
          const area = db.prepare("select * from garden_areas where code_prefix = ? or name = ? collate nocase").get(areaCode, areaName);
          if (!area) throw new HttpError(400, "Lieu introuvable pour cette planche.");
          const suggestedNumber = Number(db.prepare("select coalesce(max(display_number), 0) + 1 as next from beds where area_id = ?").get(area.id).next);
          const number = row.number === undefined || row.number === "" ? suggestedNumber : Number(row.number);
          if (!Number.isInteger(number) || number < 1 || number > 999) throw new HttpError(400, "Numéro de planche invalide.");
          const code = String(row.code ?? `${area.code_prefix}-${String(number).padStart(2, "0")}`).trim().toUpperCase();
          if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) throw new HttpError(400, "Code de planche invalide.");
          const status = ["unknown", "ready", "growing", "harvest", "clear", "winter"].includes(row.status) ? row.status : "unknown";
          const value = (key, max) => String(row[key] ?? "").trim().slice(0, max) || null;
          const sortOrder = Number(db.prepare("select coalesce(max(sort_order), 0) + 1 as next from beds").get().next);
          const createdBed = db.prepare(`insert into beds
            (area_id, code, display_number, garden, section, location_hint, sort_order, crop, variety, status, note, harvest_note, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(area.id, code, number, area.name, value("section", 120) || area.name, value("locationHint", 240), sortOrder,
              value("crop", 120), value("variety", 120), status, value("note", 1000), value("harvestNote", 1000), timestamp);
          insertBedNote(db, Number(createdBed.lastInsertRowid), adminId, "garden", row.note, timestamp);
          insertBedNote(db, Number(createdBed.lastInsertRowid), adminId, "harvest", row.harvestNote, timestamp);
          result.imported.beds += 1;
        } else if (entity === "event") {
          const values = eventInput({
            title: row.title,
            description: row.description,
            location: row.location,
            type: row.eventType ?? row.type,
            state: row.state || "published",
            audience: row.audience || "members",
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            capacity: row.capacity,
            accessibilityNote: row.accessibilityNote,
            preparationNote: row.preparationNote,
          });
          db.prepare(`insert into events
            (title, description, location, event_type, state, audience, starts_at, ends_at, capacity, accessibility_note, preparation_note, created_by, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(values.title, values.description, values.location, values.type, values.state, values.audience, values.startsAt, values.endsAt,
              values.capacity, values.accessibilityNote, values.preparationNote, adminId, timestamp, timestamp);
          result.imported.events += 1;
        } else if (entity === "member") {
          const username = cleanUsername(row.username);
          const displayName = cleanDisplayName(row.displayName ?? row.name);
          const password = validatePassword(row.initialPassword ?? row.password);
          const role = ["member", "coordinator"].includes(row.role) ? row.role : "member";
          const locale = ["fr", "en"].includes(row.preferredLocale) ? row.preferredLocale : "fr";
          const bio = String(row.bio ?? "").trim().slice(0, 400) || null;
          db.prepare(`insert into members (username, display_name, password_hash, role, preferred_locale, bio, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(username, displayName, passwordHash(password), role, locale, bio, timestamp, timestamp);
          result.imported.members += 1;
        } else {
          throw new HttpError(400, `Type inconnu: ${entity}.`);
        }
      } catch (error) {
        result.errors.push({ row: rowNumber, message: error.message });
      }
    }
    if (result.errors.length) {
      db.exec("rollback");
      return result;
    }
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function icalEscape(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icalDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventCalendar(event, origin) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ParcOS//Agenda//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:event-${event.id}@parcos.local`, `DTSTAMP:${icalDate(now())}`,
    `DTSTART:${icalDate(event.starts_at)}`, `DTEND:${icalDate(event.ends_at)}`,
    `SUMMARY:${icalEscape(event.title)}`, `DESCRIPTION:${icalEscape(event.description)}`,
    `LOCATION:${icalEscape(event.location)}`, `URL:${origin}/?event=${event.id}`,
    `STATUS:${event.state === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

function mimeType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function serveFile(res, root, relativePath, cache = "no-cache") {
  const safeRoot = resolve(root);
  const target = resolve(safeRoot, `.${sep}${relativePath.replace(/^[/\\]+/, "")}`);
  if (target !== safeRoot && !target.startsWith(`${safeRoot}${sep}`)) throw new HttpError(404, "Introuvable.");
  if (!existsSync(target) || !statSync(target).isFile()) throw new HttpError(404, "Introuvable.");
  const body = readFileSync(target);
  res.writeHead(200, { "Content-Type": mimeType(target), "Content-Length": body.length, "Cache-Control": cache });
  res.end(body);
}

function setupInfo(db) {
  const areaCount = Number(db.prepare("select count(*) as count from garden_areas").get().count);
  const parcName = db.prepare("select value from app_meta where key = 'parc_name'").get()?.value ?? "ParcOS";
  return { setupRequired: areaCount === 0, parcName };
}

export function createApp(options = {}) {
  const dataDir = resolve(options.dataDir ?? env.PARCOS_DATA_DIR ?? join(moduleDir, "data"));
  const publicDir = resolve(options.publicDir ?? join(moduleDir, "public"));
  const assetsDir = resolve(options.assetsDir ?? join(moduleDir, "assets"));
  const dbPath = resolve(options.dbPath ?? join(dataDir, "parcos.db"));
  const uploadsDir = resolve(options.uploadsDir ?? join(dataDir, "uploads"));
  const secureCookies = options.secureCookies ?? env.PARCOS_COOKIE_SECURE === "true";
  const trustProxy = options.trustProxy ?? env.PARCOS_TRUST_PROXY === "true";
  const configuredBaseUrl = String(options.baseUrl ?? env.PARCOS_BASE_URL ?? "").trim().replace(/\/$/, "");
  let baseUrl = "";
  if (configuredBaseUrl) {
    const parsedBaseUrl = new URL(configuredBaseUrl);
    if (!["http:", "https:"].includes(parsedBaseUrl.protocol) || parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.pathname !== "/") {
      throw new Error("PARCOS_BASE_URL must be an http(s) origin without credentials or a path.");
    }
    baseUrl = parsedBaseUrl.origin;
  }
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  createSchema(db);
  seedDatabase(db, options.adminUsername ?? env.PARCOS_ADMIN_USERNAME, options.adminPassword ?? env.PARCOS_ADMIN_PASSWORD,
    options.seedDemoData ?? env.PARCOS_SEED_DEMO === "true");
  backfillBedNotes(db);
  db.prepare("delete from sessions where expires_at <= ?").run(now());

  const loginAttempts = new Map();
  const server = createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const url = new URL(req.url, "http://parcos.local");
      const path = decodeURIComponent(url.pathname);

      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { status: "ok" });
      }

      if (path.startsWith("/api/")) {
        if (req.method === "POST" && path === "/api/auth/login") {
          const body = await readJson(req);
          const username = cleanUsername(body.username);
          const ip = String(trustProxy ? (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress) : req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
          const attemptKey = `${ip}:${username}`;
          if (loginAttempts.size > 5000) {
            const timestamp = Date.now();
            for (const [key, value] of loginAttempts) if (value.until <= timestamp) loginAttempts.delete(key);
            if (loginAttempts.size > 5000) loginAttempts.clear();
          }
          const attempt = loginAttempts.get(attemptKey);
          if (attempt && attempt.until > Date.now() && attempt.count >= 6) {
            throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
          }
          const row = db.prepare("select * from members where username = ?").get(username);
          if (!row || !passwordMatches(String(body.password ?? ""), row.password_hash)) {
            const next = attempt && attempt.until > Date.now() ? { count: attempt.count + 1, until: attempt.until } : { count: 1, until: Date.now() + 15 * 60_000 };
            loginAttempts.set(attemptKey, next);
            throw new HttpError(401, "Nom d’utilisateur ou mot de passe incorrect.");
          }
          loginAttempts.delete(attemptKey);
          const session = createSession(db, row.id);
          return json(res, 200, { member: memberJson(row), csrfToken: session.csrfToken, ...setupInfo(db) }, { "Set-Cookie": sessionCookie(session.token, req, secureCookies, trustProxy) });
        }

        if (req.method === "POST" && path === "/api/invites/redeem") {
          const body = await readJson(req);
          const token = String(body.token ?? "");
          const invite = db.prepare("select * from invites where token_hash = ?").get(sha256(token));
          if (!invite || invite.used_at || invite.expires_at <= now()) throw new HttpError(400, "Cette invitation est invalide ou expirée.");
          const username = cleanUsername(body.username);
          const displayName = cleanDisplayName(body.displayName);
          const password = validatePassword(body.password);
          const timestamp = now();
          db.exec("begin immediate");
          try {
            const result = db.prepare(`insert into members
              (username, display_name, password_hash, role, preferred_locale, created_at, updated_at)
              values (?, ?, ?, ?, 'fr', ?, ?)`)
              .run(username, displayName, passwordHash(password), invite.role, timestamp, timestamp);
            db.prepare("update invites set used_at = ?, used_by = ? where id = ?").run(timestamp, result.lastInsertRowid, invite.id);
            db.exec("commit");
            const row = db.prepare("select * from members where id = ?").get(result.lastInsertRowid);
            const session = createSession(db, row.id);
            return json(res, 201, { member: memberJson(row), csrfToken: session.csrfToken }, { "Set-Cookie": sessionCookie(session.token, req, secureCookies, trustProxy) });
          } catch (error) {
            db.exec("rollback");
            if (String(error.message).includes("UNIQUE constraint failed: members.username")) throw new HttpError(409, "Ce nom d’utilisateur est déjà pris.");
            throw error;
          }
        }

        if (req.method === "POST" && path === "/api/access/reset") {
          const body = await readJson(req);
          const token = String(body.token ?? "");
          const reset = db.prepare("select * from access_resets where token_hash = ?").get(sha256(token));
          if (!reset || reset.used_at || reset.expires_at <= now()) throw new HttpError(400, "Ce lien de récupération est invalide ou expiré.");
          const password = validatePassword(body.password);
          const timestamp = now();
          db.exec("begin immediate");
          try {
            db.prepare("update members set password_hash = ?, updated_at = ? where id = ?").run(passwordHash(password), timestamp, reset.member_id);
            db.prepare("update access_resets set used_at = ? where id = ?").run(timestamp, reset.id);
            db.prepare("delete from sessions where member_id = ?").run(reset.member_id);
            db.exec("commit");
            const row = db.prepare("select * from members where id = ?").get(reset.member_id);
            const session = createSession(db, row.id);
            return json(res, 200, { member: memberJson(row), csrfToken: session.csrfToken }, { "Set-Cookie": sessionCookie(session.token, req, secureCookies, trustProxy) });
          } catch (error) {
            db.exec("rollback");
            throw error;
          }
        }

        const publicEventMatch = /^\/api\/public\/events\/(\d+)$/.exec(path);
        if (publicEventMatch && req.method === "GET") {
          const eventId = Number(publicEventMatch[1]);
          const event = findPublicEvent(db, eventId);
          const attendees = eventAttendees(db, eventId);
          return json(res, 200, { event: eventJson(event, attendees), registrations: attendees });
        }

        const publicEventCalendarMatch = /^\/api\/public\/events\/(\d+)\/calendar\.ics$/.exec(path);
        if (publicEventCalendarMatch && req.method === "GET") {
          const event = findPublicEvent(db, Number(publicEventCalendarMatch[1]));
          const body = eventCalendar(event, requestOrigin(req, baseUrl, trustProxy));
          return text(res, 200, body, "text/calendar; charset=utf-8", { "Content-Disposition": `attachment; filename=parcos-public-${event.id}.ics` });
        }

        const publicRegistrationMatch = /^\/api\/public\/events\/(\d+)\/registration$/.exec(path);
        if (publicRegistrationMatch && req.method === "POST") {
          const eventId = Number(publicRegistrationMatch[1]);
          const event = findPublicEvent(db, eventId);
          const values = publicRegistrationInput(await readJson(req));
          const occupied = occupiedSeats(db, eventId);
          const status = event.capacity !== null && occupied + values.partySize > event.capacity ? "waitlisted" : "going";
          const timestamp = now();
          const result = db.prepare(`insert into public_event_registrations
            (event_id, guest_name, guest_contact, adults, teenagers, children, young_children, status, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(eventId, values.guestName, values.guestContact, values.adults, values.teenagers, values.children, values.youngChildren, status, timestamp, timestamp);
          rebalanceWaitlist(db, eventId);
          return json(res, 201, {
            registrationId: result.lastInsertRowid,
            event: eventJson(findPublicEvent(db, eventId), eventAttendees(db, eventId)),
            status,
          });
        }

        const session = requireSession(db, req);

        if (req.method === "GET" && path === "/api/me") {
          return json(res, 200, { member: session.member, csrfToken: session.csrfToken, ...setupInfo(db) });
        }

        if (req.method === "POST" && path === "/api/setup") {
          requireCsrf(req, session);
          if (session.member.role !== "admin") throw new HttpError(403, "Accès administrateur requis.");
          if (!setupInfo(db).setupRequired) throw new HttpError(409, "La configuration initiale est déjà terminée.");
          const body = await readJson(req);
          const parcName = String(body.parcName ?? "").trim().slice(0, 100);
          if (parcName.length < 2) throw new HttpError(400, "Le nom du parc est requis.");
          if (!Array.isArray(body.areas) || body.areas.length < 1 || body.areas.length > 20) {
            throw new HttpError(400, "Ajoutez entre 1 et 20 lieux à gérer.");
          }
          const areas = body.areas.map((area) => areaInput(area));
          if (new Set(areas.map((area) => area.slug)).size !== areas.length || new Set(areas.map((area) => area.codePrefix)).size !== areas.length) {
            throw new HttpError(400, "Chaque lieu doit avoir un nom et un préfixe uniques.");
          }
          const timestamp = now();
          db.exec("begin immediate");
          try {
            const insert = db.prepare(`insert into garden_areas
              (name, slug, code_prefix, description, location_hint, members_can_access, sort_order, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            areas.forEach((area, index) => insert.run(area.name, area.slug, area.codePrefix, area.description, area.locationHint,
              area.membersCanAccess ? 1 : 0, index + 1, timestamp, timestamp));
            db.prepare(`insert into app_meta (key, value, updated_at) values ('parc_name', ?, ?)
              on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(parcName, timestamp);
            db.exec("commit");
          } catch (error) {
            db.exec("rollback");
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Les lieux doivent avoir des noms et préfixes uniques.");
            throw error;
          }
          return json(res, 201, { ...setupInfo(db) });
        }

        if (req.method === "POST" && path === "/api/auth/logout") {
          requireCsrf(req, session);
          db.prepare("delete from sessions where token_hash = ?").run(session.tokenHash);
          return json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(req, secureCookies, trustProxy), "Clear-Site-Data": '"cache", "storage"' });
        }

        if (req.method === "PATCH" && path === "/api/profile") {
          requireCsrf(req, session);
          const body = await readJson(req);
          const displayName = cleanDisplayName(body.displayName);
          const locale = ["fr", "nl", "en"].includes(body.preferredLocale) ? body.preferredLocale : "fr";
          const bio = String(body.bio ?? "").trim().slice(0, 400) || null;
          const timestamp = now();
          if (body.newPassword && !passwordMatches(String(body.currentPassword ?? ""),
            db.prepare("select password_hash from members where id = ?").get(session.member.id).password_hash)) {
            throw new HttpError(403, "Le mot de passe actuel est incorrect.");
          }
          db.prepare("update members set display_name = ?, preferred_locale = ?, bio = ?, updated_at = ? where id = ?")
            .run(displayName, locale, bio, timestamp, session.member.id);
          if (body.newPassword) {
            const password = validatePassword(body.newPassword);
            db.prepare("update members set password_hash = ?, updated_at = ? where id = ?")
              .run(passwordHash(password), timestamp, session.member.id);
          }
          const row = db.prepare("select * from members where id = ?").get(session.member.id);
          return json(res, 200, { member: memberJson(row) });
        }

        if (req.method === "POST" && path === "/api/profile/avatar") {
          requireCsrf(req, session);
          const body = await readJson(req);
          const photo = photoData(body.dataUrl, AVATAR_BYTES);
          const filename = `avatar-${session.member.id}-${randomBytes(12).toString("hex")}.${photo.extension}`;
          const filePath = join(uploadsDir, filename);
          const current = db.prepare("select avatar_path from members where id = ?").get(session.member.id);
          writeFileSync(filePath, photo.bytes, { flag: "wx", mode: 0o600 });
          try {
            db.prepare("update members set avatar_path = ?, updated_at = ? where id = ?")
              .run(filename, now(), session.member.id);
          } catch (error) {
            rmSync(filePath, { force: true });
            throw error;
          }
          if (current?.avatar_path && /^avatar-\d+-[a-f0-9]{24}\.(?:jpg|png|webp)$/.test(current.avatar_path)) {
            rmSync(join(uploadsDir, current.avatar_path), { force: true });
          }
          return json(res, 200, { member: memberJson(db.prepare("select * from members where id = ?").get(session.member.id)) });
        }

        if (req.method === "GET" && path === "/api/members") {
          requireCoordinator(session);
          const rows = db.prepare("select id, username, display_name, role, preferred_locale, bio, avatar_path, created_at from members order by display_name collate nocase").all();
          return json(res, 200, { members: rows.map(memberJson) });
        }

        if (req.method === "POST" && path === "/api/import") {
          requireCsrf(req, session);
          if (session.member.role !== "admin") throw new HttpError(403, "Accès administrateur requis.");
          const body = await readJson(req);
          return json(res, 200, importRows(db, body.rows, session.member.id));
        }

        if (req.method === "POST" && path === "/api/invites") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const body = await readJson(req);
          const requestedRole = body.role === "coordinator" ? "coordinator" : "member";
          if (requestedRole === "coordinator" && session.member.role !== "admin") throw new HttpError(403, "Seul un administrateur peut inviter un coordinateur.");
          const token = randomBytes(24).toString("base64url");
          const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
          db.prepare("insert into invites (token_hash, role, created_by, expires_at, created_at) values (?, ?, ?, ?, ?)")
            .run(sha256(token), requestedRole, session.member.id, expiresAt, now());
          return json(res, 201, { inviteUrl: `${requestOrigin(req, baseUrl, trustProxy)}/?invite=${encodeURIComponent(token)}`, expiresAt });
        }

        const resetMatch = /^\/api\/members\/(\d+)\/reset-link$/.exec(path);
        if (resetMatch && req.method === "POST") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const memberId = Number(resetMatch[1]);
          const target = db.prepare("select * from members where id = ?").get(memberId);
          if (!target) throw new HttpError(404, "Membre introuvable.");
          if (target.role !== "member" && session.member.role !== "admin") throw new HttpError(403, "Seul un administrateur peut renouveler cet accès.");
          const token = randomBytes(24).toString("base64url");
          const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
          db.prepare("insert into access_resets (token_hash, member_id, created_by, expires_at, created_at) values (?, ?, ?, ?, ?)")
            .run(sha256(token), memberId, session.member.id, expiresAt, now());
          return json(res, 201, { resetUrl: `${requestOrigin(req, baseUrl, trustProxy)}/?reset=${encodeURIComponent(token)}`, expiresAt });
        }

        if (req.method === "GET" && path === "/api/events") {
          const coordinator = ["coordinator", "admin"].includes(session.member.role);
          const events = eventSelect(db, session.member.id)
            .filter((event) => coordinator || (event.state !== "draft" && ["members", "public"].includes(event.audience)))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((event) => eventJson(event, eventAttendees(db, event.id)));
          return json(res, 200, { events });
        }

        if (req.method === "POST" && path === "/api/events") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const values = eventInput(await readJson(req));
          const timestamp = now();
          const result = db.prepare(`insert into events
            (title, description, location, event_type, state, audience, starts_at, ends_at, capacity, accessibility_note, preparation_note, created_by, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(values.title, values.description, values.location, values.type, values.state, values.audience, values.startsAt, values.endsAt,
              values.capacity, values.accessibilityNote, values.preparationNote, session.member.id, timestamp, timestamp);
          const eventId = Number(result.lastInsertRowid);
          return json(res, 201, { event: eventJson(findEvent(db, eventId, session.member.id), eventAttendees(db, eventId)) });
        }

        const eventCalendarMatch = /^\/api\/events\/(\d+)\/calendar\.ics$/.exec(path);
        if (eventCalendarMatch && req.method === "GET") {
          const event = findEvent(db, Number(eventCalendarMatch[1]), session.member.id);
          if ((event.state === "draft" || event.audience === "coordinators") && !["coordinator", "admin"].includes(session.member.role)) throw new HttpError(404, "Événement introuvable.");
          const body = eventCalendar(event, requestOrigin(req, baseUrl, trustProxy));
          return text(res, 200, body, "text/calendar; charset=utf-8", { "Content-Disposition": `attachment; filename=parcos-${event.id}.ics` });
        }

        const eventRegistrationMatch = /^\/api\/events\/(\d+)\/registration$/.exec(path);
        if (eventRegistrationMatch && req.method === "POST") {
          requireCsrf(req, session);
          const eventId = Number(eventRegistrationMatch[1]);
          const event = findEvent(db, eventId, session.member.id);
          if (event.state !== "published") throw new HttpError(409, "Les inscriptions ne sont pas ouvertes pour cet événement.");
          if (event.audience === "coordinators" && !["coordinator", "admin"].includes(session.member.role)) throw new HttpError(403, "Cet événement est réservé aux coordinateurs.");
          const counts = registrationCounts(await readJson(req));
          const occupied = occupiedSeats(db, eventId, session.member.id);
          const status = event.capacity !== null && occupied + counts.partySize > event.capacity ? "waitlisted" : "going";
          const timestamp = now();
          db.prepare(`insert into event_registrations
            (event_id, member_id, adults, teenagers, children, young_children, status, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(event_id, member_id) do update set adults = excluded.adults, teenagers = excluded.teenagers,
              children = excluded.children, young_children = excluded.young_children, status = excluded.status, updated_at = excluded.updated_at`)
            .run(eventId, session.member.id, counts.adults, counts.teenagers, counts.children, counts.youngChildren, status, timestamp, timestamp);
          rebalanceWaitlist(db, eventId);
          return json(res, 200, { event: eventJson(findEvent(db, eventId, session.member.id), eventAttendees(db, eventId)) });
        }

        if (eventRegistrationMatch && req.method === "DELETE") {
          requireCsrf(req, session);
          const eventId = Number(eventRegistrationMatch[1]);
          findEvent(db, eventId, session.member.id);
          db.prepare("update event_registrations set status = 'cancelled', updated_at = ? where event_id = ? and member_id = ?")
            .run(now(), eventId, session.member.id);
          rebalanceWaitlist(db, eventId);
          return json(res, 200, { event: eventJson(findEvent(db, eventId, session.member.id), eventAttendees(db, eventId)) });
        }

        const eventMatch = /^\/api\/events\/(\d+)$/.exec(path);
        if (eventMatch && req.method === "GET") {
          const eventId = Number(eventMatch[1]);
          const event = findEvent(db, eventId, session.member.id);
          const coordinator = ["coordinator", "admin"].includes(session.member.role);
          if (!coordinator && (event.state === "draft" || event.audience === "coordinators")) throw new HttpError(404, "Événement introuvable.");
          const registrations = eventAttendees(db, eventId);
          return json(res, 200, { event: eventJson(event, registrations), registrations });
        }

        if (eventMatch && req.method === "PATCH") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const eventId = Number(eventMatch[1]);
          const before = findEvent(db, eventId, session.member.id);
          const values = eventInput(await readJson(req), before);
          db.prepare(`update events set title = ?, description = ?, location = ?, event_type = ?, state = ?, audience = ?,
            starts_at = ?, ends_at = ?, capacity = ?, accessibility_note = ?, preparation_note = ?, updated_at = ? where id = ?`)
            .run(values.title, values.description, values.location, values.type, values.state, values.audience, values.startsAt, values.endsAt,
              values.capacity, values.accessibilityNote, values.preparationNote, now(), eventId);
          rebalanceWaitlist(db, eventId);
          return json(res, 200, { event: eventJson(findEvent(db, eventId, session.member.id), eventAttendees(db, eventId)) });
        }

        if (req.method === "GET" && path === "/api/areas") {
          const coordinator = ["coordinator", "admin"].includes(session.member.role);
          const rows = db.prepare(`select a.*, (select count(*) from beds b where b.area_id = a.id) as bed_count
            from garden_areas a where ? = 1 or a.members_can_access = 1 order by a.sort_order, a.name collate nocase`).all(coordinator ? 1 : 0);
          return json(res, 200, { areas: rows.map(areaJson) });
        }

        if (req.method === "POST" && path === "/api/areas") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const values = areaInput(await readJson(req));
          const timestamp = now();
          const sortOrder = Number(db.prepare("select coalesce(max(sort_order), 0) + 1 as next from garden_areas").get().next);
          try {
            const result = db.prepare(`insert into garden_areas
              (name, slug, code_prefix, description, location_hint, members_can_access, sort_order, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(values.name, values.slug, values.codePrefix, values.description, values.locationHint, values.membersCanAccess ? 1 : 0, sortOrder, timestamp, timestamp);
            return json(res, 201, { area: areaJson(findArea(db, Number(result.lastInsertRowid))) });
          } catch (error) {
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Ce nom ou ce préfixe est déjà utilisé.");
            throw error;
          }
        }

        const areaMatch = /^\/api\/areas\/(\d+)$/.exec(path);
        if (areaMatch && req.method === "PATCH") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const areaId = Number(areaMatch[1]);
          const before = findArea(db, areaId);
          const values = areaInput(await readJson(req), before);
          const timestamp = now();
          db.exec("begin immediate");
          try {
            db.prepare(`update garden_areas set name = ?, slug = ?, code_prefix = ?, description = ?, location_hint = ?,
              members_can_access = ?, updated_at = ? where id = ?`)
              .run(values.name, values.slug, values.codePrefix, values.description, values.locationHint, values.membersCanAccess ? 1 : 0, timestamp, areaId);
            if (values.name !== before.name) db.prepare("update beds set garden = ?, updated_at = ? where area_id = ?").run(values.name, timestamp, areaId);
            db.exec("commit");
          } catch (error) {
            db.exec("rollback");
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Ce nom ou ce préfixe est déjà utilisé.");
            throw error;
          }
          return json(res, 200, { area: areaJson(findArea(db, areaId)) });
        }

        const areaBedsMatch = /^\/api\/areas\/(\d+)\/beds$/.exec(path);
        if (areaBedsMatch && req.method === "POST") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const areaId = Number(areaBedsMatch[1]);
          const area = findArea(db, areaId);
          const body = await readJson(req);
          const suggestedNumber = Number(db.prepare("select coalesce(max(display_number), 0) + 1 as next from beds where area_id = ?").get(areaId).next);
          const number = body.number === undefined || body.number === "" ? suggestedNumber : Number(body.number);
          if (!Number.isInteger(number) || number < 1 || number > 999) throw new HttpError(400, "Le numéro de planche doit être compris entre 1 et 999.");
          const code = String(body.code || `${area.code_prefix}-${String(number).padStart(2, "0")}`).trim().toUpperCase();
          if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) throw new HttpError(400, "Le code de planche est invalide.");
          const status = ["unknown", "ready", "growing", "harvest", "clear", "winter"].includes(body.status) ? body.status : "unknown";
          const value = (key, max) => String(body[key] ?? "").trim().slice(0, max) || null;
          const timestamp = now();
          const sortOrder = Number(db.prepare("select coalesce(max(sort_order), 0) + 1 as next from beds").get().next);
          try {
            const result = db.prepare(`insert into beds
              (area_id, code, display_number, garden, section, location_hint, sort_order, crop, variety, status, note, harvest_note, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(areaId, code, number, area.name, value("section", 120) || area.name, value("locationHint", 240), sortOrder,
                value("crop", 120), value("variety", 120), status, value("note", 1000), value("harvestNote", 1000), timestamp);
            const bedId = Number(result.lastInsertRowid);
            insertBedNote(db, bedId, session.member.id, "garden", body.note, timestamp);
            insertBedNote(db, bedId, session.member.id, "harvest", body.harvestNote, timestamp);
            return json(res, 201, { bed: bedJson(findBed(db, bedId)) });
          } catch (error) {
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Ce numéro ou ce code de planche existe déjà dans ce lieu.");
            throw error;
          }
        }

        if (req.method === "GET" && path === "/api/beds") {
          const coordinator = ["coordinator", "admin"].includes(session.member.role);
          const rows = db.prepare(`select b.*, p.path as photo_path, a.members_can_access from beds b
            join garden_areas a on a.id = b.area_id
            left join bed_photos p on p.bed_id = b.id and p.is_cover = 1
            where ? = 1 or a.members_can_access = 1 order by a.sort_order, b.sort_order, b.display_number`).all(coordinator ? 1 : 0);
          return json(res, 200, { beds: rows.map(bedJson) });
        }

        if (req.method === "GET" && path === "/api/activities") {
          const coordinator = ["coordinator", "admin"].includes(session.member.role);
          const rows = db.prepare(`select activity.*, member.display_name as member_name,
            bed.code as bed_code, bed.crop as bed_crop
            from activities activity
            join beds bed on bed.id = activity.bed_id
            join garden_areas area on area.id = bed.area_id
            left join members member on member.id = activity.member_id
            where ? = 1 or area.members_can_access = 1
            order by activity.created_at desc, activity.id desc limit 20`).all(coordinator ? 1 : 0);
          return json(res, 200, { activities: rows.map(activityJson) });
        }

        const bedMatch = /^\/api\/beds\/(\d+)$/.exec(path);
        if (bedMatch && req.method === "GET") {
          const bedId = Number(bedMatch[1]);
          const bed = requireBedAccess(findBed(db, bedId), session);
          const photos = db.prepare("select id, path, caption, created_at from bed_photos where bed_id = ? order by is_cover desc, created_at desc").all(bedId)
            .map((photo) => ({ id: photo.id, url: `/media/${photo.path}`, caption: photo.caption, createdAt: photo.created_at }));
          const harvests = db.prepare(`select h.*, hp.path as photo_path, m.display_name as member_name
            from harvests h
            left join harvest_photos hp on hp.harvest_id = h.id
            left join members m on m.id = h.member_id
            where h.bed_id = ? order by h.created_at desc, h.id desc limit 30`).all(bedId).map(harvestJson);
          const notes = db.prepare(`select n.*, m.display_name as member_name
            from bed_notes n left join members m on m.id = n.member_id
            where n.bed_id = ? order by n.created_at desc, n.id desc limit 50`).all(bedId).map(bedNoteJson);
          const howToVideos = db.prepare("select * from how_to_videos where bed_id = ? order by created_at desc, id desc").all(bedId).map(howToVideoJson);
          const activities = db.prepare(`select a.id, a.activity_type, a.note, a.created_at, m.display_name
            from activities a left join members m on m.id = a.member_id where a.bed_id = ? order by a.created_at desc limit 30`).all(bedId)
            .map((activity) => ({ id: activity.id, type: activity.activity_type, note: activity.note, createdAt: activity.created_at, memberName: activity.display_name }));
          return json(res, 200, { bed: bedJson(bed), photos, notes, harvests, howToVideos, activities });
        }

        if (bedMatch && req.method === "PATCH") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const bedId = Number(bedMatch[1]);
          const before = findBed(db, bedId);
          const body = await readJson(req);
          const status = ["unknown", "ready", "growing", "harvest", "clear", "winter"].includes(body.status) ? body.status : before.status;
          const value = (key, fallback, max = 500) => body[key] === undefined ? fallback : (String(body[key] ?? "").trim().slice(0, max) || null);
          const after = {
            crop: value("crop", before.crop, 120),
            variety: value("variety", before.variety, 120),
            status,
            note: value("note", before.note, 1000),
            harvestNote: value("harvestNote", before.harvest_note, 1000),
            section: value("section", before.section, 120) || before.section,
            locationHint: value("locationHint", before.location_hint, 240),
          };
          const timestamp = now();
          db.exec("begin immediate");
          try {
            db.prepare(`update beds set crop = ?, variety = ?, status = ?, note = ?, harvest_note = ?, section = ?, location_hint = ?, updated_at = ? where id = ?`)
              .run(after.crop, after.variety, after.status, after.note, after.harvestNote, after.section, after.locationHint, timestamp, bedId);
            if (after.note && after.note !== before.note) insertBedNote(db, bedId, session.member.id, "garden", after.note, timestamp);
            if (after.harvestNote && after.harvestNote !== before.harvest_note) insertBedNote(db, bedId, session.member.id, "harvest", after.harvestNote, timestamp);
            const summary = String(body.activityNote ?? "").trim().slice(0, 500) || `Mise à jour de ${before.code}`;
            db.prepare(`insert into activities (bed_id, member_id, activity_type, note, before_json, after_json, created_at)
              values (?, ?, 'bed_updated', ?, ?, ?, ?)`)
              .run(bedId, session.member.id, summary, JSON.stringify(bedJson(before)), JSON.stringify(after), timestamp);
            db.exec("commit");
          } catch (error) {
            db.exec("rollback");
            throw error;
          }
          return json(res, 200, { bed: bedJson(findBed(db, bedId)) });
        }

        const logMatch = /^\/api\/beds\/(\d+)\/logs$/.exec(path);
        if (logMatch && req.method === "POST") {
          requireCsrf(req, session);
          const bedId = Number(logMatch[1]);
          const bed = requireBedAccess(findBed(db, bedId), session);
          const body = await readJson(req);
          const type = String(body.type ?? "");
          if (!["work", "observation", "problem", "harvest", "photo"].includes(type)) {
            throw new HttpError(400, "Type de journal invalide.");
          }
          const note = String(body.note ?? "").trim().slice(0, 600);
          if (!note) throw new HttpError(400, "Ajoutez une courte description.");
          if (type === "photo" && !body.dataUrl) throw new HttpError(400, "Ajoutez une photo.");
          const photo = body.dataUrl ? photoData(body.dataUrl) : null;
          const filename = photo ? `bed-${bedId}-${Date.now()}-${randomBytes(5).toString("hex")}.${photo.extension}` : null;
          const filePath = filename ? join(uploadsDir, filename) : null;
          const timestamp = now();
          if (photo) writeFileSync(filePath, photo.bytes, { flag: "wx" });
          try {
            db.exec("begin immediate");
            if (photo) {
              db.prepare("update bed_photos set is_cover = 0 where bed_id = ?").run(bedId);
              db.prepare(`insert into bed_photos (bed_id, path, content_type, caption, uploaded_by, is_cover, created_at)
                values (?, ?, ?, ?, ?, 1, ?)`).run(bedId, filename, photo.contentType, note.slice(0, 200), session.member.id, timestamp);
            }
            const result = db.prepare(`insert into activities (bed_id, member_id, activity_type, note, created_at)
              values (?, ?, ?, ?, ?)`).run(bedId, session.member.id, `log_${type}`, note, timestamp);
            db.prepare("update beds set updated_at = ? where id = ?").run(timestamp, bedId);
            db.exec("commit");
            const activity = db.prepare(`select activity.*, member.display_name as member_name,
              bed.code as bed_code, bed.crop as bed_crop
              from activities activity join beds bed on bed.id = activity.bed_id
              left join members member on member.id = activity.member_id where activity.id = ?`).get(result.lastInsertRowid);
            return json(res, 201, { activity: activityJson(activity), bed: bedJson(findBed(db, bedId)) });
          } catch (error) {
            db.exec("rollback");
            if (filePath) rmSync(filePath, { force: true });
            throw error;
          }
        }

        const photoMatch = /^\/api\/beds\/(\d+)\/photos$/.exec(path);
        if (photoMatch && req.method === "POST") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const bedId = Number(photoMatch[1]);
          const bed = findBed(db, bedId);
          const body = await readJson(req);
          const photo = photoData(body.dataUrl);
          const filename = `bed-${bedId}-${Date.now()}-${randomBytes(5).toString("hex")}.${photo.extension}`;
          const filePath = join(uploadsDir, filename);
          writeFileSync(filePath, photo.bytes, { flag: "wx" });
          const timestamp = now();
          try {
            db.exec("begin immediate");
            db.prepare("update bed_photos set is_cover = 0 where bed_id = ?").run(bedId);
            db.prepare(`insert into bed_photos (bed_id, path, content_type, caption, uploaded_by, is_cover, created_at)
              values (?, ?, ?, ?, ?, 1, ?)`)
              .run(bedId, filename, photo.contentType, String(body.caption ?? "").trim().slice(0, 200) || null, session.member.id, timestamp);
            db.prepare("update beds set updated_at = ? where id = ?").run(timestamp, bedId);
            db.prepare(`insert into activities (bed_id, member_id, activity_type, note, created_at)
              values (?, ?, 'photo_added', ?, ?)`)
              .run(bedId, session.member.id, `Nouvelle photo pour ${bed.code}`, timestamp);
            db.exec("commit");
          } catch (error) {
            db.exec("rollback");
            rmSync(filePath, { force: true });
            throw error;
          }
          return json(res, 201, { bed: bedJson(findBed(db, bedId)) });
        }

        const harvestMatch = /^\/api\/beds\/(\d+)\/harvests$/.exec(path);
        if (harvestMatch && req.method === "POST") {
          requireCsrf(req, session);
          const bedId = Number(harvestMatch[1]);
          const bed = requireBedAccess(findBed(db, bedId), session);
          const body = await readJson(req);
          const photo = photoData(body.dataUrl);
          const filename = `harvest-${bedId}-${Date.now()}-${randomBytes(5).toString("hex")}.${photo.extension}`;
          const filePath = join(uploadsDir, filename);
          const timestamp = now();
          writeFileSync(filePath, photo.bytes, { flag: "wx" });
          try {
            db.exec("begin immediate");
            const result = db.prepare(`insert into harvests (bed_id, member_id, quantity, note, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?)`)
              .run(bedId, session.member.id, String(body.quantity ?? "").trim().slice(0, 120) || null,
                String(body.note ?? "").trim().slice(0, 600) || null, timestamp, timestamp);
            db.prepare(`insert into harvest_photos (harvest_id, path, content_type, caption, uploaded_by, created_at)
              values (?, ?, ?, ?, ?, ?)`)
              .run(result.lastInsertRowid, filename, photo.contentType, String(body.caption ?? "").trim().slice(0, 200) || null, session.member.id, timestamp);
            db.prepare("update beds set status = 'harvest', updated_at = ? where id = ?").run(timestamp, bedId);
            db.prepare(`insert into activities (bed_id, member_id, activity_type, note, created_at)
              values (?, ?, 'harvest_added', ?, ?)`)
              .run(bedId, session.member.id, `Recolte ajoutee pour ${bed.code}`, timestamp);
            db.exec("commit");
          } catch (error) {
            db.exec("rollback");
            rmSync(filePath, { force: true });
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Cette photo de recolte existe deja.");
            throw error;
          }
          const harvests = db.prepare(`select h.*, hp.path as photo_path, m.display_name as member_name
            from harvests h
            left join harvest_photos hp on hp.harvest_id = h.id
            left join members m on m.id = h.member_id
            where h.bed_id = ? order by h.created_at desc, h.id desc limit 30`).all(bedId).map(harvestJson);
          return json(res, 201, { bed: bedJson(findBed(db, bedId)), harvests });
        }

        const howToMatch = /^\/api\/beds\/(\d+)\/how-tos$/.exec(path);
        if (howToMatch && req.method === "POST") {
          requireCsrf(req, session);
          requireCoordinator(session);
          const bedId = Number(howToMatch[1]);
          const bed = findBed(db, bedId);
          const body = await readJson(req);
          const videoId = youtubeVideoId(body.url ?? body.youtubeUrl ?? body.youtubeVideoId);
          const title = String(body.title ?? "").trim().slice(0, 140) || "Tutoriel video";
          const note = String(body.note ?? "").trim().slice(0, 600) || null;
          const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const timestamp = now();
          try {
            db.prepare(`insert into how_to_videos (bed_id, title, youtube_video_id, source_url, note, created_by, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(bedId, title, videoId, sourceUrl, note, session.member.id, timestamp, timestamp);
          } catch (error) {
            if (String(error.message).includes("UNIQUE constraint failed")) throw new HttpError(409, "Cette video est deja liee a cette planche.");
            throw error;
          }
          db.prepare(`insert into activities (bed_id, member_id, activity_type, note, created_at)
            values (?, ?, 'how_to_added', ?, ?)`)
            .run(bedId, session.member.id, `Tutoriel ajoutÃ© pour ${bed.code}`, timestamp);
          const howToVideos = db.prepare("select * from how_to_videos where bed_id = ? order by created_at desc, id desc").all(bedId).map(howToVideoJson);
          return json(res, 201, { howToVideos });
        }

        throw new HttpError(404, "API introuvable.");
      }

      if (path.startsWith("/media/")) {
        const mediaSession = requireSession(db, req);
        const filename = path.slice("/media/".length);
        const avatar = db.prepare("select id from members where avatar_path = ?").get(filename);
        if (avatar) return serveFile(res, uploadsDir, filename, "private, no-store");
        const photo = db.prepare(`select a.members_can_access from bed_photos p
          join beds b on b.id = p.bed_id join garden_areas a on a.id = b.area_id where p.path = ?`).get(filename);
        const harvestPhoto = photo ? null : db.prepare(`select a.members_can_access from harvest_photos hp
          join harvests h on h.id = hp.harvest_id
          join beds b on b.id = h.bed_id join garden_areas a on a.id = b.area_id where hp.path = ?`).get(filename);
        const media = photo ?? harvestPhoto;
        if (!media || (!media.members_can_access && !["coordinator", "admin"].includes(mediaSession.member.role))) {
          throw new HttpError(404, "Photo introuvable.");
        }
        res.setHeader("Cache-Control", "private, no-store");
        return serveFile(res, uploadsDir, filename, "private, no-store");
      }

      if (path.startsWith("/assets/")) {
        return serveFile(res, assetsDir, path.slice("/assets/".length), "public, max-age=86400");
      }

      if (path === "/icon.svg") return serveFile(res, moduleDir, "icon.svg", "public, max-age=86400");
      const staticPath = path === "/" ? "index.html" : path.slice(1);
      return serveFile(res, publicDir, staticPath, "no-cache");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      if (!res.headersSent) return json(res, status, { error: status === 500 ? "Erreur interne du serveur." : error.message });
      res.end();
    }
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  return {
    server,
    db,
    dataDir,
    close() {
      server.close();
      db.close();
    },
  };
}

const entry = runtime?.argv?.[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const port = Number(env.PORT || 3000);
  const app = createApp();
  app.server.listen(port, "0.0.0.0", () => {
    console.log(`ParcOS listening on http://0.0.0.0:${port}`);
  });
}
