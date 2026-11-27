import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server.mjs";
import { createCompleteBackup, restoreBackup } from "../backup.mjs";

const provenance = { title: "Synthetic test fixture" };
const records = [
  { type: "taxon", record: { id: "synthetic-taxon", scientificName: "Synthetic test taxon", review: "reviewed", sources: [provenance] } },
  { type: "crop", record: { id: "test-crop", taxonId: "synthetic-taxon", names: { en: "Test crop", fr: "Légume témoin", nl: "Proefgewas" }, synonyms: { nl: ["Testgroente"] }, review: "reviewed", sources: [provenance] } },
  { type: "variety", record: { id: "test-variety", cropId: "test-crop", name: "Test cultivar", review: "reviewed", sources: [provenance] } },
  { type: "profile", record: { id: "test-profile", cropId: "test-crop", varietyId: "test-variety", method: "direct", name: "Test profile",
    context: "Synthetic Brussels fixture", review: "reviewed", sources: [provenance],
    parameters: { sowingDepth: { unit: "cm", min: 1, max: 2, constraint: "estimate", review: "reviewed", source: provenance }, yield: null } } },
];

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "parcos-agriculture-"));
  const settings = { dataDir: directory, adminUsername: "admin", adminPassword: "test-admin-password", seedDemoData: true, notificationScheduler: false };
  let app = createApp(settings);
  const bed = app.db.prepare("select id, code, crop, variety from beds order by id limit 1").get();
  app.db.exec("drop table cultivation_profile_revisions; drop table cultivation_profiles; drop table agricultural_varieties; drop table agricultural_crops; drop table agricultural_taxa; delete from schema_migrations where version = 5");
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

