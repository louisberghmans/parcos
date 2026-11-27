import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server.mjs";
import { createCompleteBackup, restoreBackup } from "../backup.mjs";
import { today } from "../src/domain/agriculture/garden.mjs";

const provenance = { title: "Synthetic test fixture" };
const records = [
  { type: "taxon", record: { id: "synthetic-taxon", scientificName: "Synthetic test taxon", review: "reviewed", sources: [provenance] } },
  { type: "crop", record: { id: "test-crop", taxonId: "synthetic-taxon", names: { en: "Test crop", fr: "Légume témoin", nl: "Proefgewas" }, synonyms: { nl: ["Testgroente"] }, review: "reviewed", sources: [provenance] } },
  { type: "variety", record: { id: "test-variety", cropId: "test-crop", name: "Test cultivar", review: "reviewed", sources: [provenance] } },
  { type: "profile", record: { id: "test-profile", cropId: "test-crop", varietyId: "test-variety", method: "direct", name: "Test profile",
    context: "Synthetic Brussels fixture", review: "reviewed", sources: [provenance],
    parameters: { sowingDepth: { unit: "cm", min: 1, max: 2, constraint: "estimate", review: "reviewed", source: provenance }, yield: null } } },
];

test("agricultural civil dates follow the browser time zone at midnight", () => {
  const at = new Date("2026-11-27T23:30:00.000Z");
  assert.equal(today("Europe/Brussels", at), "2026-11-28");
  assert.equal(today("UTC", at), "2026-11-27");
  assert.match(today("invalid/time-zone", at), /^\d{4}-\d{2}-\d{2}$/);
});

test("catalogue descriptions use the existing revision-aware translation exchange", async (t) => {
  const { request, auth } = await fixture(t);
  const root = "/agriculture/catalogue";
  const transaction = await request(root + "/import", { method: "POST", auth, body: { records: records.map((entry) =>
    entry.type === "crop" ? { ...entry, record: { ...entry.record, description: { fr: "Texte source" },
      availability: { context: "Synthetic fixture", months: [5, 6], source: provenance } } } : entry) } });
  assert.equal(transaction.status, 200);
  const crop = (await request(root + "?month=5", { auth })).value.crop[0];
  assert.equal(crop.id, "test-crop");
  assert.equal((await request(root + "?month=7", { auth })).value.crop.length, 0);
  const exported = (await request("/translations/export", { auth })).value;
  const item = exported.items.find((row) => row.entityType === "agricultural_crop" && row.targetLocale === "nl");
  assert.equal(item.sourceText, "Texte source");
  const translation = { format: exported.format, items: [{ ...item, translation: "Brontest" }] };
  const importer = () => request("/translations/import", { method: "POST", auth, body: translation });
  assert.equal((await importer()).value.imported, 1);
  const localized = (await request(root, { auth })).value.crop[0];
  assert.equal(localized.description.nl, "Brontest");
  const saved = await request(root + "/crop", { method: "PUT", auth,
    body: { ...localized, description: { ...localized.description, fr: "Source révisée" } } });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.record.description.nl, null);
  assert.equal((await importer()).value.stale, 1);
});

test("cultivation traces partial transfers, shared and successive footprints, and actual harvests", async (t) => {
  const { app, request, auth, bed, directory } = await fixture(t);
  const otherBed = app.db.prepare("select id from beds where id != ? and area_id = (select area_id from beds where id = ?) order by id limit 1").get(bed.id, bed.id);
  const areaId = app.db.prepare("select area_id from beds where id = ?").get(bed.id).area_id;
  const send = (path, body, method = "POST", token = auth) => request(path, { method, body, auth: token });
  const prefix = "/agriculture";
  const assertStatus = (result, status) => { assert.equal(result.status, status, JSON.stringify(result.value)); return result.value; };
  const add = async (path, body, status = 201) => assertStatus(await send(prefix + path, body), status);
  const get = async (path, token = auth) => (await request(prefix + path, { auth: token })).value;
  const nurseryProfile = { ...records[3].record, id: "nursery-profile", method: "transplant" };
  const secondCrop = { ...records[1].record, id: "another-crop", names: { en: "Another crop" } };
  const secondProfile = { ...records[3].record, id: "other-profile", cropId: secondCrop.id, varietyId: null };
  await add("/catalogue/import", { records: [...records, { type: "profile", record: nurseryProfile },
    { type: "crop", record: secondCrop }, { type: "profile", record: secondProfile }] }, 200);
  assertStatus(await send(prefix + "/beds/" + bed.id + "/physical", { lengthM: 20, usableM2: 12 }, "PUT"), 200);
  await add("/areas/" + areaId + "/geometry", { validFrom: "2025-01-01", source: provenance,
    features: [{ bedCode: bed.code, points: [[0, 0], [1, 0], [1, 1], [0, 1]] }] }, 200);
  const resource = async (code, capacity) => assertStatus(await send(prefix + "/areas/" + areaId + "/resources",
    { type: "tray", code, name: code, capacity, capacityUnit: "plant" }, "PUT"), 200).resource;
  const tray1 = await resource("tray-a", 100);
  const tray2 = await resource("tray-b", 50);
  const batchFor = async (code, profile, nurseryId = null) => (await add("/batches", {
    id: code, code, cropId: profile.cropId, varietyId: profile.varietyId, profileId: profile.id, profileRevision: 1,
    route: profile.method, nurseryId, seedsPlanned: 110, sowPlannedOn: "2025-01-01", harvestExpectedFrom: "2025-02-01",
  })).batch;
  const transplant = await batchFor("nursery-test", nurseryProfile, tray1.id);
  const other = await batchFor("direct-test", secondProfile);
  const succession = await batchFor("succession-test", records[3].record);
  const combo = (await add("/combinations", { name: "Test combination", crops: [transplant.cropId, other.cropId],
    context: "Synthetic", source: provenance, review: "reviewed" })).combination;
  const allocate = async (batch, allocation, status = 201) => add("/batches/" + batch.id + "/allocations", allocation, status);
  const planned = { bedId: bed.id, startsOn: "2025-01-01", endsBefore: "2025-06-01", startM: 0, endM: 5, occupiedM2: 5 };
  const first = (await allocate(transplant, { ...planned, combinationId: combo.id, plantCount: 40 })).allocation;
  const second = (await allocate(transplant, { ...planned, bedId: otherBed.id, plantCount: 50 })).allocation;
  await allocate(other, planned, 409);
  const shared = (await allocate(other, { footprintId: first.id })).allocation;
  assert.equal(shared.id, first.id);
  await allocate(other, { ...planned, startM: 5, endM: 8, occupiedM2: 3 });
  await allocate(succession, { ...planned, startsOn: "2025-06-01", endsBefore: null });
  assert.equal(app.db.prepare("select count(*) as n from bed_footprints where bed_id = ?").get(bed.id).n, 3);
  assert.equal((await get("/batches/" + transplant.id)).actual.status, "planned");
  const event = (batch, kind, occurredOn, body = {}, status = 201) =>
    add("/batches/" + batch.id + "/events", { kind, occurredOn, ...body }, status);
  await event(transplant, "sow", "2025-01-01", { plants: 110, id: "sow-test" });
  await event(transplant, "sow", "2025-01-01", { plants: 110, id: "sow-test" });
  await event(transplant, "germination", "2025-01-10", { germinated: 105, plants: 100 });
  await event(transplant, "move", "2025-02-01", { fromResourceId: tray1.id, toResourceId: tray2.id, plants: 51 }, 409);
  await event(transplant, "move", "2025-02-01", { fromResourceId: tray1.id, toResourceId: tray2.id, plants: 50 });
  await event(transplant, "transplant", "2025-02-02", { fromResourceId: tray1.id, footprintId: first.id, plants: 40 });
  await event(transplant, "transplant", "2025-02-03", { fromResourceId: tray2.id, footprintId: second.id, plants: 50 });
  await event(transplant, "transplant", "2025-02-04", { fromResourceId: tray2.id, footprintId: second.id, plants: 1 }, 409);
  await event(other, "sow", "2025-01-10", { footprintId: shared.id, plants: 15 });
  const getHarvest = (bedId, value) => send("/beds/" + bedId + "/harvests",
    { batchId: transplant.id, amount: 0.45, unit: "kg", harvestedOn: "2025-04-01", ...value });
  assertStatus(await getHarvest(bed.id, { harvestedOn: "2025-01-10" }), 400);
  assertStatus(await getHarvest(bed.id, { unit: "buckets" }), 400);
  assertStatus(await getHarvest(bed.id, { requestId: "harvest-once" }), 201);
  assertStatus(await getHarvest(bed.id, { requestId: "harvest-once" }), 200);
  assertStatus(await getHarvest(bed.id, { requestId: "harvest-once", amount: 9 }), 409);
  assertStatus(await getHarvest(otherBed.id, { amount: 7, unit: "piece" }), 201);
  assertStatus(await send(prefix + "/footprints/" + first.id + "/release", { freeOn: "2025-03-31" }), 409);
  assertStatus(await send(prefix + "/footprints/" + first.id + "/release", { freeOn: "2025-04-10" }), 200);
  assertStatus(await getHarvest(bed.id, { harvestedOn: "2025-04-11" }), 400);
  const detail = await get("/batches/" + transplant.id);
  assert.equal(detail.actual.status, "growing");
  assert.equal(detail.actual.transplanted, 90);
  assert.equal(detail.actual.remaining, 10);
  assert.deepEqual(detail.actual.nursery, [{ id: tray1.id, plants: 10 }]);
  assert.equal(detail.events.filter(({ kind }) => kind === "sow").length, 1);
  assert.deepEqual(detail.harvests.map(({ amount, unit }) => [amount, unit]), [[7, "piece"], [0.45, "kg"]]);
  assert.equal(app.db.prepare("select crop from beds where id = ?").get(bed.id).crop, bed.crop);
  assert.equal(app.db.prepare("select count(*) as n from activities where activity_type = 'cultivation_transplant'").get().n, 2);
  const production = await get("/occupancy?date=2025-04-02&from=2025-04-01&to=2025-04-01");
  const measuredBed = production.beds.find((item) => item.id === bed.id);
  assert.equal(measuredBed.footprints[0].batches.length, 2);
  assert.equal(production.reserved.occupiedKnownArea, 8);
  assert.equal(production.actual.occupiedKnownArea, 5);
  assert.equal(production.harvests.length, 2);
  const putTemplate = async (value, status = 200) => assertStatus(await send(prefix + "/operations", value, "PUT"), status);
  const firstStep = (await putTemplate({ kind: "prepare", title: "Prepare fixture", status: "ready", setupMinutes: 4 })).template;
  const template = (await putTemplate({
    kind: "water", title: "Water fixture", status: "ready", dependencies: [firstStep.id], cropId: transplant.cropId,
    anchor: "transplant", startOffsetDays: 0, endOffsetDays: 4, instructions: "Check soil first",
    completion: "Watered the fixture", safety: "Keep the path clear",
  })).template;
  await putTemplate({ ...firstStep, dependencies: [template.id] }, 400);
  const taskInput = { templateId: template.id, templateRevision: template.revision, batchId: transplant.id, bedId: bed.id, scheduledOn: "2025-04-02" };
  const task = await add("/operations/tasks", taskInput);
  assert.equal((await add("/operations/tasks", taskInput, 200)).taskId, task.taskId);
  const existingTasks = (await request("/tasks", { auth })).value.tasks;
  const linkedTask = existingTasks.find(({ id }) => id === task.taskId);
  assert.equal(linkedTask.cultivationBatchId, transplant.id);
  assert.match(linkedTask.description, /Keep the path clear/);
  const qr = await request(prefix + "/labels/" + transplant.id + ".gif", { auth });
  assert.equal(qr.status, 200);
  assert.match(qr.value, /^GIF8[79]a/);

  const invite = await request("/invites", { method: "POST", auth, body: { role: "member" } });
  const member = assertStatus(await request("/invites/redeem", { method: "POST", body: {
    token: new URL(invite.value.inviteUrl).searchParams.get("invite"), username: "cultivation.member",
    displayName: "Cultivation Member", password: "test-member-password",
  } }), 201);
  assert.equal(member.member.role, "member");
  const login = await request("/auth/login", { method: "POST", body: { username: "cultivation.member", password: "test-member-password" } });
  const memberAuth = { cookie: login.cookie, token: login.value.csrfToken };
  const path = prefix + "/batches/" + transplant.id;
  assertStatus(await send(path + "/events", { kind: "observation", occurredOn: "2025-04-03", note: "Synthetic member observation" }, "POST", memberAuth), 201);
  assertStatus(await send(path + "/allocations", planned, "POST", memberAuth), 403);
  assertStatus(await request(prefix + "/suppliers", { auth: memberAuth }), 403);
  app.db.prepare("update garden_areas set members_can_access = 0 where id = ?").run(areaId);
  assertStatus(await request(path, { auth: memberAuth }), 404);
  assertStatus(await request(prefix + "/labels/" + transplant.id + ".gif", { auth: memberAuth }), 404);
  assert.ok(!(await request("/tasks", { auth: memberAuth })).value.tasks.some(({ id }) => id === task.taskId));
  assertStatus(await send(path + "/events", { kind: "observation", occurredOn: "2025-04-04", note: "Denied" }, "POST", memberAuth), 404);

  const backup = await createCompleteBackup({ db: app.db, dataDir: directory, uploadsDir: join(directory, "uploads"), appVersion: "1.4.2" });
  const restoredDir = join(directory, "batch-restore");
  await restoreBackup({ archivePath: backup.archivePath, targetDir: restoredDir });
  const restored = createApp({ dataDir: restoredDir });
  try {
    assert.equal(restored.db.prepare("select count(*) as n from harvest_measurements").get().n, 2);
    assert.equal(restored.db.prepare("select count(*) as n from batch_allocations").get().n, 5);
    assert.equal(restored.db.prepare("select count(*) as n from cultivation_task_links").get().n, 1);
    assert.deepEqual(restored.db.prepare("pragma foreign_key_check").all(), []);
  } finally { restored.close(); }
});

test("supplier imports stage, suggest cultivar matches and preserve reviewed revisions", async (t) => {
  const { app, request, auth } = await fixture(t);
  const path = "/agriculture/suppliers";
  const send = (route, body) => request(route, { method: "POST", body, auth });
  assert.equal((await send("/agriculture/catalogue/import", { records })).status, 200);
  const product = { supplier: "Synthetic Seeds", sku: "TEST-1", name: "Garden variety",
    sourceUrl: "https://example.test/seed", retrievedOn: "2025-03-01", seedCount: 45,
    availability: "available", cropHint: "Testgroente", varietyHint: "Test cultivar" };
  const upload = (products, preview = false) => send(path + "/import", { products, preview });
  assert.equal((await upload([{ ...product, sourceUrl: "javascript:alert(1)" }])).status, 400);
  assert.equal((await upload([product, product])).status, 409);
  assert.equal((await upload([product], true)).value.staged[0].matches.varieties[0].id, "test-variety");
  assert.equal((await request(path, { auth })).value.pending.length, 0);
  const initial = (await upload([product])).value.staged[0];
  const repeated = (await upload([product])).value.staged[0];
  assert.equal(repeated.id, initial.id);
  assert.equal(repeated.duplicate, true);
  assert.equal((await request(path, { auth })).value.products.length, 0);
  const approve = (id, expectedRevision, fields = {}) => send(path + "/review/" + id, {
    state: "approved", expectedRevision, cropId: "test-crop", varietyId: "test-variety", ...fields,
  });
  assert.equal((await approve(initial.id, null, { cropId: null })).status, 400);
  const published = (await approve(initial.id, null)).value.product;
  assert.equal(published.revision, 1);
  assert.equal((await approve(initial.id, null)).value.product.revision, 1);
  const header = (await request(path, { auth })).value.csvColumns.join(",");
  const csv = header + "\r\nSynthetic Seeds,TEST-1,\"New, factual name\",https://example.test/seed,2025-04-01,unavailable,40,,,";
  const next = (await send(path + "/import", { csv })).value.staged[0];
  assert.equal(next.current.id, published.id);
  assert.equal((await request(path, { auth })).value.products[0].availability, "available");
  assert.equal((await approve(next.id, null)).status, 409);
  const updated = (await approve(next.id, 1)).value.product;
  assert.equal(updated.id, published.id);
  assert.equal(updated.revision, 2);
  assert.equal(updated.name, "New, factual name");
  assert.equal(app.db.prepare("select count(*) as n from supplier_product_revisions where product_id = ?").get(updated.id).n, 2);
  assert.equal((await request(path, { auth })).value.pending.length, 0);
});

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "parcos-agriculture-"));
  const settings = { dataDir: directory, adminUsername: "admin", adminPassword: "test-admin-password", seedDemoData: true, notificationScheduler: false };
  let app = createApp(settings);
  const bed = app.db.prepare("select id, code, crop, variety from beds order by id limit 1").get();
  app.db.exec("drop table harvest_submission_keys; drop table agricultural_crop_text; drop table cultivation_task_links; drop table cultivation_operation_revisions; drop table cultivation_operation_templates; drop table supplier_import_reviews; drop table supplier_product_revisions; drop table supplier_products");
  app.db.exec("drop table harvest_measurements; drop table batch_events; drop table batch_allocations; drop table footprint_releases; drop table bed_footprints; drop table cultivation_combinations; drop table cultivation_batches");
  app.db.exec("drop table garden_resources; drop table bed_geometry; drop table bed_physical; drop table cultivation_profile_revisions; drop table cultivation_profiles; drop table agricultural_varieties; drop table agricultural_crops; drop table agricultural_taxa; delete from schema_migrations where version > 4");
  app.close();
  app = createApp(settings);
  assert.deepEqual(app.db.prepare("select id, code, crop, variety from beds where id = ?").get(bed.id), bed);
  assert.equal(app.db.prepare("select name from schema_migrations where version = 5").get().name, "agricultural_catalogue");
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + app.server.address().port;
  async function request(path, { method = "GET", body, auth, csrf = true } = {}) {
    const response = await fetch(base + "/api" + path, { method,
      headers: { ...(auth && { cookie: auth.cookie, ...(csrf && { "x-csrf-token": auth.token }) }),
        ...(body && { "content-type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = response.headers.get("content-type")?.startsWith("application/json") ? await response.json() : await response.text();
    return { status: response.status, value, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const login = await request("/auth/login", { method: "POST", body: { username: "admin", password: settings.adminPassword } });
  assert.equal(login.status, 200);
  return { app, bed, directory, request, auth: { cookie: login.cookie, token: login.value.csrfToken } };
}

test("catalogue upgrades, previews atomically, searches three locales and retains profile revisions", async (t) => {
  const { request, auth, app, directory } = await fixture(t);
  const path = "/agriculture/catalogue";
  const send = (body) => request(path + "/import", { method: "POST", body, auth });
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path + "/import", { method: "POST", body: { records }, auth, csrf: false })).status, 403);
  assert.equal((await send({ records, preview: true })).status, 200);
  assert.equal(app.db.prepare("select count(*) as n from agricultural_crops").get().n, 0);
  assert.equal((await send({ records })).status, 200);
  const csv = await request(path + "/export?format=csv", { auth });
  assert.match(csv.value, /^type,record/);
  assert.equal((await send({ csv: csv.value })).status, 200);
  for (const q of ["Legume", "Testgroente", "test crop", "test cultivar"]) {
    const response = await request(path + "?q=" + encodeURIComponent(q), { auth });
    assert.equal(response.value.crop[0]?.id, "test-crop");
    assert.equal(response.value.profile[0].parameters.yield, null);
  }
  const next = { ...records[3].record, revision: 1, environment: "Fixture greenhouse" };
  const put = (body) => request(path + "/profile", { method: "PUT", body, auth });
  assert.equal((await put({ ...next, parameters: { germinationRate: { unit: "%", min: 100, max: 110, constraint: "estimate" } } })).status, 400);
  assert.equal((await put(next)).value.record.revision, 2);
  assert.equal((await put(next)).status, 409);
  const history = await request(path + "/profile/test-profile/history", { auth });
  assert.deepEqual(history.value.revisions.map((row) => row.revision), [2, 1]);
  assert.equal((await send({ records })).status, 409);
  const duplicate = { ...records[0], record: { ...records[0].record, id: "other-taxon" } };
  const earlier = { ...records[0], record: { ...records[0].record, id: "earlier", scientificName: "Earlier fixture taxon" } };
  assert.equal((await send({ records: [earlier, duplicate] })).status, 409);
  assert.equal(app.db.prepare("select count(*) as n from agricultural_taxa").get().n, 1);
  const invite = await request("/invites", { method: "POST", auth, body: { role: "member" } });
  assert.equal(invite.status, 201);
  const token = new URL(invite.value.inviteUrl).searchParams.get("invite");
  const redeemed = await request("/invites/redeem", { method: "POST",
    body: { token, username: "catalogue.member", displayName: "Catalogue Member", password: "test-member-password" } });
  assert.equal(redeemed.status, 201);
  const member = { cookie: redeemed.cookie, token: redeemed.value.csrfToken };
  assert.equal((await request(path, { auth: member })).value.crop[0].id, "test-crop");
  assert.equal((await request(path + "?manage=1", { auth: member })).status, 403);
  assert.equal((await request(path + "/profile", { method: "PUT", body: next, auth: member })).status, 403);
  const backup = await createCompleteBackup({ db: app.db, dataDir: directory, uploadsDir: join(directory, "uploads"), appVersion: "1.4.2" });
  t.after(() => rmSync(backup.workDir, { recursive: true, force: true }));
  const restoredDir = join(directory, "restored");
  await restoreBackup({ archivePath: backup.archivePath, targetDir: restoredDir });
  const restoredApp = createApp({ dataDir: restoredDir });
  try {
    assert.equal(restoredApp.db.prepare("select count(*) as n from cultivation_profile_revisions").get().n, 2);
    assert.equal(restoredApp.db.prepare("select count(*) as n from agricultural_crops").get().n, 1);
    assert.deepEqual(restoredApp.db.prepare("pragma foreign_key_check").all(), []);
  } finally {
    restoredApp.close();
  }
});

test("physical data and geometry history retain bed identity and enforce area access", async (t) => {
  const { app, request, auth, bed } = await fixture(t);
  const areaId = app.db.prepare("select area_id from beds where id = ?").get(bed.id).area_id;
  const areaPath = "/agriculture/areas/" + areaId;
  const bedPath = "/agriculture/beds/" + bed.id + "/physical";
  const edit = (body) => request(bedPath, { method: "PUT", body, auth });
  assert.equal((await request(bedPath, { auth })).value.physical, null);
  assert.equal((await edit({ grossM2: 3, usableM2: 5 })).status, 400);
  const result = await edit({ lengthM: 20, confidence: "approximate" });
  assert.equal(result.value.physical.lengthM, 20);
  assert.equal(result.value.physical.usableM2, null);
  assert.equal((await edit({ lengthM: 30 })).status, 409);
  assert.equal((await edit({ lengthM: 20, usableM2: 15, confidence: "measured", source: provenance, revision: 1 })).status, 200);

  const original = { validFrom: "2025-01-01", source: provenance, sourceRevision: "synthetic-1",
    features: [{ bedCode: bed.code, points: [[0, 0], [1, 0], [1, 1], [0, 1]] }] };
  const savePlan = (body) => request(areaPath + "/geometry", { method: "POST", body, auth });
  assert.equal((await savePlan({ ...original, preview: true })).status, 200);
  assert.equal((await request(bedPath, { auth })).value.geometry.length, 0);
  assert.equal((await savePlan(original)).status, 200);
  assert.equal((await savePlan({ ...original, sourceRevision: "synthetic-2" })).status, 409);
  assert.equal((await savePlan({ ...original, validFrom: "2026-01-01", sourceRevision: "synthetic-2" })).status, 200);
  const state = (date) => request(areaPath + "/plan?date=" + date, { auth });
  const before = (await state("2025-12-31")).value.beds.find(({ id }) => id === bed.id);
  const after = (await state("2026-01-01")).value.beds.find(({ id }) => id === bed.id);
  assert.equal(before.geometry.validTo, "2026-01-01");
  assert.equal(before.geometry.sourceRevision, "synthetic-1");
  assert.equal(after.geometry.sourceRevision, "synthetic-2");
  assert.equal(after.legacyCrop, bed.crop);
  assert.equal((await request(bedPath, { auth })).value.geometry.length, 2);
  const resource = await request(areaPath + "/resources", { method: "PUT", auth,
    body: { type: "tray", code: "test-tray", name: "Test tray", capacity: 40, capacityUnit: "cell" } });
  assert.equal(resource.value.resource.capacity, 40);
  assert.equal((await state("2026-01-01")).value.resources[0].id, resource.value.resource.id);

  const invite = await request("/invites", { method: "POST", auth, body: { role: "member" } });
  const redeemed = await request("/invites/redeem", { method: "POST", body: {
    token: new URL(invite.value.inviteUrl).searchParams.get("invite"), username: "garden.member",
    displayName: "Garden Member", password: "test-member-password",
  } });
  const member = { cookie: redeemed.cookie, token: redeemed.value.csrfToken };
  app.db.prepare("update garden_areas set members_can_access = 0 where id = ?").run(areaId);
  assert.equal((await request(areaPath + "/plan", { auth: member })).status, 404);
  assert.equal((await request(bedPath, { auth: member })).status, 404);
  assert.equal((await request(areaPath + "/plan", { auth })).status, 200);
  assert.deepEqual(app.db.prepare("pragma foreign_key_check").all(), []);
});
