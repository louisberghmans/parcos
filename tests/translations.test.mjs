import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test("content translations keep their source locale, localize responses and reject stale imports", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "parcos-i18n-test-"));
  const app = createApp({
    dataDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    seedDemoData: false,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => {
    app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-admin-password" }),
  });
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  const writeHeaders = (locale) => ({
    cookie,
    "content-type": "application/json",
    "x-csrf-token": login.body.csrfToken,
    "x-parcos-locale": locale,
  });

  const setup = await request(baseUrl, "/api/setup", {
    method: "POST",
    headers: writeHeaders("fr"),
    body: JSON.stringify({ parcName: "Parc test", areas: [{ name: "Potager", codePrefix: "PT", membersCanAccess: true }] }),
  });
  assert.equal(setup.response.status, 201);

  const created = await request(baseUrl, "/api/events", {
    method: "POST",
    headers: writeHeaders("fr"),
    body: JSON.stringify({
      title: "Atelier des semis",
      description: "Préparons les semis ensemble.",
      location: "Serre",
      type: "workshop",
      state: "published",
      audience: "members",
      capacity: "",
      startsAt: "2027-03-01T09:00:00.000Z",
      endsAt: "2027-03-01T11:00:00.000Z",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const eventId = created.body.event.id;

  const firstExport = await request(baseUrl, "/api/translations/export", {
    headers: { cookie, "x-parcos-locale": "fr" },
  });
  assert.equal(firstExport.response.status, 200);
  assert.match(firstExport.response.headers.get("content-disposition"), /^attachment; filename=parcos-translations-/);
  assert.equal(firstExport.body.format, "parcos-translations-v1");
  assert.ok(firstExport.body.exportedAt);
  const dutchTitle = firstExport.body.items.find((item) => item.entityType === "event"
    && item.entityId === eventId && item.field === "title" && item.targetLocale === "nl");
  assert.deepEqual({ sourceLocale: dutchTitle.sourceLocale, sourceText: dutchTitle.sourceText, status: dutchTitle.status }, {
    sourceLocale: "fr", sourceText: "Atelier des semis", status: "missing",
  });
  dutchTitle.translation = "Workshop zaaien";

  const imported = await request(baseUrl, "/api/translations/import", {
    method: "POST",
    headers: writeHeaders("fr"),
    body: JSON.stringify(firstExport.body),
  });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.body.imported, 1);

  const dutch = await request(baseUrl, `/api/events/${eventId}`, {
    headers: { cookie, "x-parcos-locale": "nl" },
  });
  assert.equal(dutch.body.event.title, "Workshop zaaien");
  assert.equal(dutch.body.event.description, "Préparons les semis ensemble.", "missing fields fall back to the source text");

  const french = await request(baseUrl, `/api/events/${eventId}`, {
    headers: { cookie, "x-parcos-locale": "fr" },
  });
  assert.equal(french.body.event.title, "Atelier des semis");

  const updated = await request(baseUrl, `/api/events/${eventId}`, {
    method: "PATCH",
    headers: writeHeaders("fr"),
    body: JSON.stringify({ ...french.body.event, title: "Grand atelier des semis" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.event.title, "Grand atelier des semis");

  const staleFallback = await request(baseUrl, `/api/events/${eventId}`, {
    headers: { cookie, "x-parcos-locale": "nl" },
  });
  assert.equal(staleFallback.body.event.title, "Grand atelier des semis");

  const staleImport = await request(baseUrl, "/api/translations/import", {
    method: "POST",
    headers: writeHeaders("fr"),
    body: JSON.stringify(firstExport.body),
  });
  assert.equal(staleImport.body.stale, 1);
  assert.equal(staleImport.body.imported, 0);

  const secondExport = await request(baseUrl, "/api/translations/export", { headers: { cookie } });
  const staleTitle = secondExport.body.items.find((item) => item.entityType === "event"
    && item.entityId === eventId && item.field === "title" && item.targetLocale === "nl");
  assert.equal(staleTitle.status, "stale");
  assert.equal(staleTitle.sourceRevision, dutchTitle.sourceRevision + 1);
  assert.equal(staleTitle.sourceText, "Grand atelier des semis");

  const dutchCreated = await request(baseUrl, "/api/events", {
    method: "POST",
    headers: writeHeaders("nl"),
    body: JSON.stringify({
      title: "Oogstfeest",
      location: "Moestuin",
      type: "community",
      state: "published",
      audience: "members",
      capacity: "",
      startsAt: "2027-04-01T09:00:00.000Z",
      endsAt: "2027-04-01T11:00:00.000Z",
    }),
  });
  const finalExport = await request(baseUrl, "/api/translations/export", { headers: { cookie } });
  const dutchSource = finalExport.body.items.find((item) => item.entityType === "event"
    && item.entityId === dutchCreated.body.event.id && item.field === "title" && item.targetLocale === "fr");
  assert.equal(dutchSource.sourceLocale, "nl");
  assert.equal(dutchSource.sourceText, "Oogstfeest");
});
