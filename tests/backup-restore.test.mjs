import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { restoreBackup, RUNNING_MARKER } from "../backup.mjs";
import { createApp } from "../server.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

function tarSize(header) {
  return Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim() || "0", 8);
}

function alteredManifestArchive(archive) {
  const tar = gunzipSync(archive);
  const manifestSize = tarSize(tar.subarray(0, 512));
  const manifestText = tar.subarray(512, 512 + manifestSize).toString("utf8");
  const manifest = JSON.parse(manifestText);
  const checksum = manifest.files[0].sha256;
  const checksumOffset = tar.indexOf(Buffer.from(checksum), 512);
  assert.ok(checksumOffset > 0);
  tar[checksumOffset] = checksum[0] === "0" ? 0x31 : 0x30;
  return gzipSync(tar);
}

function traversalArchive(archive) {
  const tar = gunzipSync(archive);
  tar.fill(0, 0, 100);
  tar.write("../escape", 0, "utf8");
  tar.fill(0x20, 148, 156);
  const checksum = tar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  tar.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return gzipSync(tar);
}

test("complete backup exports securely and restores a validated standalone instance", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "parcos-backup-test-"));
  const sourceDir = join(root, "source");
  const restoredDir = join(root, "restored");
  const archivePath = join(root, "complete.tar.gz");
  const alteredPath = join(root, "altered.tar.gz");
  const traversalPath = join(root, "traversal.tar.gz");
  let sourceApp = createApp({
    dataDir: sourceDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    seedDemoData: true,
  });
  let restoredApp = null;
  t.after(() => {
    sourceApp?.close();
    restoredApp?.close();
    rmSync(root, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => sourceApp.server.listen(0, "127.0.0.1", resolveListen));
  const baseUrl = `http://127.0.0.1:${sourceApp.server.address().port}`;

  const healthy = await request(baseUrl, "/health");
  assert.deepEqual({ status: healthy.response.status, body: healthy.body }, { status: 200, body: { status: "ok" } });
  renameSync(join(sourceDir, "uploads"), join(sourceDir, "uploads-unavailable"));
  const degraded = await request(baseUrl, "/health");
  assert.deepEqual({ status: degraded.response.status, body: degraded.body }, { status: 503, body: { status: "unhealthy" } });
  renameSync(join(sourceDir, "uploads-unavailable"), join(sourceDir, "uploads"));

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-admin-password" }),
  });
  assert.equal(login.response.status, 200);
  const adminCookie = cookieFrom(login.response);
  const adminWriteHeaders = {
    cookie: adminCookie,
    "content-type": "application/json",
    "x-csrf-token": login.body.csrfToken,
  };
  const memberImport = await request(baseUrl, "/api/import", {
    method: "POST",
    headers: adminWriteHeaders,
    body: JSON.stringify({ rows: [
      {
        entity: "member",
        username: "backup.member",
        displayName: "Backup Member",
        initialPassword: "backup-member-password",
        preferredLocale: "nl",
      },
      {
        entity: "member",
        username: "backup.coordinator",
        displayName: "Backup Coordinator",
        initialPassword: "backup-coordinator-password",
        role: "coordinator",
        preferredLocale: "en",
      },
    ] }),
  });
  assert.equal(memberImport.response.status, 200);

  const timestamp = new Date().toISOString();
  const adminId = sourceApp.db.prepare("select id from members where role = 'admin' order by id limit 1").get().id;
  const bedId = sourceApp.db.prepare("select id from beds order by id limit 1").get().id;
  sourceApp.db.prepare("insert into bed_notes (bed_id, member_id, note_type, body, created_at, updated_at) values (?, ?, 'garden', ?, ?, ?)")
    .run(bedId, adminId, "Backup note", timestamp, timestamp);
  const media = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const harvest = await request(baseUrl, `/api/beds/${bedId}/harvests`, {
    method: "POST",
    headers: adminWriteHeaders,
    body: JSON.stringify({
      quantity: "2 kg",
      note: "Backup harvest",
      caption: "Backup media",
      dataUrl: `data:image/png;base64,${media.toString("base64")}`,
    }),
  });
  assert.equal(harvest.response.status, 201);
  const localized = sourceApp.db.prepare("select * from localized_content order by entity_type, entity_id, field limit 1").get();
  sourceApp.db.prepare(`insert into content_translations
    (entity_type, entity_id, field, locale, value, source_revision, created_at, updated_at)
    values (?, ?, ?, 'nl', ?, ?, ?, ?)
    on conflict(entity_type, entity_id, field, locale) do update set value = excluded.value`)
    .run(localized.entity_type, localized.entity_id, localized.field, "Back-upvertaling", localized.source_revision, timestamp, timestamp);
  sourceApp.db.prepare(`insert into app_meta (key, value, updated_at) values ('backup_test_setting', 'preserved', ?)
    on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`).run(timestamp);
  const mediaName = sourceApp.db.prepare("select path from harvest_photos order by id desc limit 1").get().path;

  const tableNames = ["members", "garden_areas", "beds", "events", "content_translations", "bed_notes", "activities", "harvests", "harvest_photos"];
  const expectedCounts = Object.fromEntries(tableNames.map((table) => [
    table,
    Number(sourceApp.db.prepare(`select count(*) as count from ${table}`).get().count),
  ]));

  const memberLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "backup.member", password: "backup-member-password" }),
  });
  const memberDenied = await request(baseUrl, "/api/backups/complete", {
    method: "POST",
    headers: {
      cookie: cookieFrom(memberLogin.response),
      "content-type": "application/json",
      "x-csrf-token": memberLogin.body.csrfToken,
    },
    body: JSON.stringify({ currentPassword: "backup-member-password" }),
  });
  assert.equal(memberDenied.response.status, 403);

  const coordinatorLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "backup.coordinator", password: "backup-coordinator-password" }),
  });
  const coordinatorDenied = await request(baseUrl, "/api/backups/complete", {
    method: "POST",
    headers: {
      cookie: cookieFrom(coordinatorLogin.response),
      "content-type": "application/json",
      "x-csrf-token": coordinatorLogin.body.csrfToken,
    },
    body: JSON.stringify({ currentPassword: "backup-coordinator-password" }),
  });
  assert.equal(coordinatorDenied.response.status, 403);

  const wrongPassword = await request(baseUrl, "/api/backups/complete", {
    method: "POST",
    headers: adminWriteHeaders,
    body: JSON.stringify({ currentPassword: "incorrect-password" }),
  });
  assert.equal(wrongPassword.response.status, 403);

  const backupResponse = await fetch(`${baseUrl}/api/backups/complete`, {
    method: "POST",
    headers: adminWriteHeaders,
    body: JSON.stringify({ currentPassword: "test-admin-password" }),
  });
  assert.equal(backupResponse.status, 200);
  assert.equal(backupResponse.headers.get("cache-control"), "no-store");
  assert.match(backupResponse.headers.get("content-disposition"), /^attachment; filename="parcos-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.gz"$/);
  const archive = Buffer.from(await backupResponse.arrayBuffer());
  assert.ok(archive.length > 0);
  writeFileSync(archivePath, archive);

  sourceApp.close();
  sourceApp = null;
  const report = await restoreBackup({ archivePath, targetDir: restoredDir });
  assert.equal(report.format, "parcos-backup-v1");
  assert.equal(report.integrity, "ok");
  assert.ok(report.referencedUploads >= 1);
  assert.equal(existsSync(join(restoredDir, "parcos.db-wal")), false);
  assert.equal(existsSync(join(restoredDir, "parcos.db-shm")), false);

  restoredApp = createApp({
    dataDir: restoredDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    seedDemoData: false,
  });
  await new Promise((resolveListen) => restoredApp.server.listen(0, "127.0.0.1", resolveListen));
  for (const [table, count] of Object.entries(expectedCounts)) {
    assert.equal(Number(restoredApp.db.prepare(`select count(*) as count from ${table}`).get().count), count, table);
  }
  assert.equal(restoredApp.db.prepare("select value from app_meta where key = 'backup_test_setting'").get().value, "preserved");
  assert.equal(restoredApp.db.prepare("select preferred_locale from members where username = 'backup.member'").get().preferred_locale, "nl");
  assert.deepEqual(readFileSync(join(restoredDir, "uploads", mediaName)), media);
  assert.equal(restoredApp.db.prepare("pragma integrity_check").get().integrity_check, "ok");
  const restoredHealth = await request(`http://127.0.0.1:${restoredApp.server.address().port}`, "/health");
  assert.equal(restoredHealth.response.status, 200);
  restoredApp.close();
  restoredApp = null;

  writeFileSync(alteredPath, alteredManifestArchive(archive));
  await assert.rejects(
    restoreBackup({ archivePath: alteredPath, targetDir: join(root, "altered-target") }),
    /validation failed/,
  );
  assert.equal(existsSync(join(root, "altered-target")), false);

  writeFileSync(traversalPath, traversalArchive(archive));
  await assert.rejects(
    restoreBackup({ archivePath: traversalPath, targetDir: join(root, "traversal-target") }),
    /path-traversal/,
  );
  assert.equal(existsSync(join(root, "escape")), false);

  const runningTarget = join(root, "running");
  mkdirSync(runningTarget);
  writeFileSync(join(runningTarget, RUNNING_MARKER), "{}");
  await assert.rejects(
    restoreBackup({ archivePath, targetDir: runningTarget, force: true }),
    /appears to contain a running/,
  );

  const occupiedTarget = join(root, "occupied");
  mkdirSync(occupiedTarget);
  writeFileSync(join(occupiedTarget, "keep.txt"), "keep");
  await assert.rejects(restoreBackup({ archivePath, targetDir: occupiedTarget }), /not empty/);
  assert.equal(readFileSync(join(occupiedTarget, "keep.txt"), "utf8"), "keep");
  await restoreBackup({ archivePath, targetDir: occupiedTarget, force: true });
  assert.equal(existsSync(join(occupiedTarget, "keep.txt")), false);
  assert.equal(existsSync(join(occupiedTarget, "parcos.db")), true);
});
