import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("members, events, permissions, garden updates and recovery", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "parcos-test-"));
  const app = createApp({
    dataDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    seedDemoData: true,
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => {
    app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const anonymousBeds = await request(baseUrl, "/api/beds");
  assert.equal(anonymousBeds.response.status, 401);
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(home.headers.get("content-security-policy"), /frame-src .*youtube-nocookie\.com/);

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-admin-password" }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.member.role, "admin");
  const adminCookie = cookieFrom(login.response);

  const beds = await request(baseUrl, "/api/beds", { headers: { cookie: adminCookie } });
  assert.equal(beds.body.beds.length, 24);
  assert.equal(beds.body.beds[0].code, "GP-01");

  const areas = await request(baseUrl, "/api/areas", { headers: { cookie: adminCookie } });
  assert.equal(areas.response.status, 200);
  assert.equal(areas.body.areas.length, 4);
  const nursery = areas.body.areas.find((area) => area.name === "Pépinière");
  assert.equal(nursery.membersCanAccess, false);

  const nurseryBed = await request(baseUrl, `/api/areas/${nursery.id}/beds`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ crop: "Semis de poireaux", status: "growing", section: "Tables de semis" }),
  });
  assert.equal(nurseryBed.response.status, 201);
  assert.match(nurseryBed.body.bed.code, /^PN-/);

  const newArea = await request(baseUrl, "/api/areas", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ name: "Verger", codePrefix: "VG", description: "Les arbres fruitiers.", membersCanAccess: true }),
  });
  assert.equal(newArea.response.status, 201);
  const orchardBed = await request(baseUrl, `/api/areas/${newArea.body.area.id}/beds`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ number: 1, crop: "Pommiers", status: "growing" }),
  });
  assert.equal(orchardBed.body.bed.areaId, newArea.body.area.id);

  const startsAt = new Date(Date.now() + 2 * 86400_000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 86400_000 + 2 * 3600_000).toISOString();
  const createdEvent = await request(baseUrl, "/api/events", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Récolte collective", description: "Récolte et partage.", location: "Grand Potager", type: "work", state: "published", audience: "members", startsAt, endsAt, capacity: 3 }),
  });
  assert.equal(createdEvent.response.status, 201);
  assert.equal(createdEvent.body.event.title, "Récolte collective");
  const eventId = createdEvent.body.event.id;

  const publicEvent = await request(baseUrl, "/api/events", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Portes ouvertes", description: "Accueil du quartier.", location: "Grand Potager", type: "community", state: "published", audience: "public", startsAt, endsAt, capacity: 4 }),
  });
  assert.equal(publicEvent.response.status, 201);
  assert.equal(publicEvent.body.event.audience, "public");
  const publicEventId = publicEvent.body.event.id;

  const publicDetail = await request(baseUrl, `/api/public/events/${publicEventId}`);
  assert.equal(publicDetail.response.status, 200);
  assert.equal(publicDetail.body.event.title, "Portes ouvertes");
  const publicRegistration = await request(baseUrl, `/api/public/events/${publicEventId}/registration`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guestName: "Neighbour Guest", guestContact: "guest@example.test", adults: 2, children: 1 }),
  });
  assert.equal(publicRegistration.response.status, 201);
  assert.equal(publicRegistration.body.status, "going");
  assert.equal(publicRegistration.body.event.attendeeCount, 3);

  const imported = await request(baseUrl, "/api/import", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ rows: [
      { entity: "area", name: "Zone import", codePrefix: "ZI", membersCanAccess: "true" },
      { entity: "bed", areaCodePrefix: "ZI", number: "1", crop: "Basilic", status: "growing" },
    ] }),
  });
  assert.equal(imported.response.status, 200);
  assert.deepEqual(imported.body.imported, { areas: 1, beds: 1, events: 0, members: 0 });

  const calendar = await fetch(`${baseUrl}/api/events/${eventId}/calendar.ics`, { headers: { cookie: adminCookie } });
  assert.equal(calendar.status, 200);
  assert.match(calendar.headers.get("content-type"), /^text\/calendar/);
  assert.match(await calendar.text(), /SUMMARY:Récolte collective/);

  const invite = await request(baseUrl, "/api/invites", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(invite.response.status, 201);
  const inviteToken = new URL(invite.body.inviteUrl).searchParams.get("invite");

  const redeem = await request(baseUrl, "/api/invites/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: inviteToken, displayName: "Test Member", username: "test.member", password: "member-test-password" }),
  });
  assert.equal(redeem.response.status, 201);
  const memberCookie = cookieFrom(redeem.response);

  const memberAreas = await request(baseUrl, "/api/areas", { headers: { cookie: memberCookie } });
  assert.equal(memberAreas.body.areas.some((area) => area.name === "Pépinière"), false);
  assert.equal(memberAreas.body.areas.some((area) => area.name === "Verger"), true);
  const memberBeds = await request(baseUrl, "/api/beds", { headers: { cookie: memberCookie } });
  assert.equal(memberBeds.body.beds.some((bed) => bed.id === nurseryBed.body.bed.id), false);
  assert.equal(memberBeds.body.beds.some((bed) => bed.id === orchardBed.body.bed.id), true);
  const hiddenBed = await request(baseUrl, `/api/beds/${nurseryBed.body.bed.id}`, { headers: { cookie: memberCookie } });
  assert.equal(hiddenBed.response.status, 404);

  const memberEvents = await request(baseUrl, "/api/events", { headers: { cookie: memberCookie } });
  assert.equal(memberEvents.response.status, 200);
  assert.ok(memberEvents.body.events.some((event) => event.id === eventId));
  const publicEventForMember = memberEvents.body.events.find((event) => event.id === publicEventId);
  assert.equal(publicEventForMember.attendeeNames[0], "Neighbour Guest");

  const registration = await request(baseUrl, `/api/events/${eventId}/registration`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ adults: 1, children: 1 }),
  });
  assert.equal(registration.response.status, 200);
  assert.equal(registration.body.event.registration.status, "going");
  assert.equal(registration.body.event.attendeeCount, 2);

  const eventDetail = await request(baseUrl, `/api/events/${eventId}`, { headers: { cookie: adminCookie } });
  assert.equal(eventDetail.body.registrations.length, 1);
  assert.equal(eventDetail.body.registrations[0].partySize, 2);
  const memberEventDetail = await request(baseUrl, `/api/events/${eventId}`, { headers: { cookie: memberCookie } });
  assert.equal(memberEventDetail.body.registrations[0].memberName, "Test Member");

  const forbidden = await request(baseUrl, "/api/beds/1", {
    method: "PATCH",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ crop: "Forbidden" }),
  });
  assert.equal(forbidden.response.status, 403);

  const csrfRejected = await request(baseUrl, "/api/beds/1", {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ crop: "No CSRF" }),
  });
  assert.equal(csrfRejected.response.status, 403);

  const update = await request(baseUrl, "/api/beds/1", {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ crop: "Tomates", status: "harvest", activityNote: "Récolte ouverte" }),
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.bed.status, "harvest");

  const noteUpdate = await request(baseUrl, "/api/beds/1", {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ note: "Verifier les tuteurs.", harvestNote: "Cueillir les fruits rouges." }),
  });
  assert.equal(noteUpdate.response.status, 200);
  const notesDetail = await request(baseUrl, "/api/beds/1", { headers: { cookie: adminCookie } });
  assert.ok(notesDetail.body.notes.some((note) => note.type === "garden" && note.body === "Verifier les tuteurs." && note.memberName === "Administrateur ParcOS" && note.createdAt));
  assert.ok(notesDetail.body.notes.some((note) => note.type === "harvest" && note.body === "Cueillir les fruits rouges." && note.memberName === "Administrateur ParcOS" && note.createdAt));

  const png = readFileSync(new URL("../assets/potager-kale.jpg", import.meta.url)).toString("base64");
  const photo = await request(baseUrl, "/api/beds/1/photos", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}` }),
  });
  assert.equal(photo.response.status, 201);
  assert.match(photo.body.bed.photoUrl, /^\/media\//);
  const publicPhoto = await fetch(`${baseUrl}${photo.body.bed.photoUrl}`);
  assert.equal(publicPhoto.status, 401);
  const privatePhoto = await fetch(`${baseUrl}${photo.body.bed.photoUrl}`, { headers: { cookie: memberCookie } });
  assert.equal(privatePhoto.status, 200);
  assert.equal(privatePhoto.headers.get("cache-control"), "private, no-store");

  const harvest = await request(baseUrl, "/api/beds/1/harvests", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}`, quantity: "2 paniers", note: "A partager ce soir." }),
  });
  assert.equal(harvest.response.status, 201);
  assert.equal(harvest.body.harvests[0].quantity, "2 paniers");
  assert.match(harvest.body.harvests[0].photoUrl, /^\/media\/harvest-/);
  const harvestDetail = await request(baseUrl, "/api/beds/1", { headers: { cookie: memberCookie } });
  assert.equal(harvestDetail.body.harvests[0].memberName, "Test Member");
  const harvestPhoto = await fetch(`${baseUrl}${harvest.body.harvests[0].photoUrl}`, { headers: { cookie: memberCookie } });
  assert.equal(harvestPhoto.status, 200);

  const howTo = await request(baseUrl, "/api/beds/1/how-tos", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Tailler les tomates", url: "https://youtu.be/dQw4w9WgXcQ", note: "Technique courte." }),
  });
  assert.equal(howTo.response.status, 201);
  assert.equal(howTo.body.howToVideos[0].youtubeVideoId, "dQw4w9WgXcQ");
  assert.match(howTo.body.howToVideos[0].embedUrl, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  const memberHowTo = await request(baseUrl, "/api/beds/1/how-tos", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
  });
  assert.equal(memberHowTo.response.status, 403);

  const avatar = await request(baseUrl, "/api/profile/avatar", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}` }),
  });
  assert.equal(avatar.response.status, 200);
  assert.match(avatar.body.member.avatarUrl, /^\/media\/avatar-/);
  const anonymousAvatar = await fetch(`${baseUrl}${avatar.body.member.avatarUrl}`);
  assert.equal(anonymousAvatar.status, 401);
  const privateAvatar = await fetch(`${baseUrl}${avatar.body.member.avatarUrl}`, { headers: { cookie: memberCookie } });
  assert.equal(privateAvatar.status, 200);
  assert.equal(privateAvatar.headers.get("content-type"), "image/jpeg");
  assert.equal(privateAvatar.headers.get("cache-control"), "private, no-store");
  const directory = await request(baseUrl, "/api/members", { headers: { cookie: adminCookie } });
  assert.equal(directory.body.members.find((member) => member.id === redeem.body.member.id).avatarUrl, avatar.body.member.avatarUrl);

  const fakeAvatar = await request(baseUrl, "/api/profile/avatar", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${png}` }),
  });
  assert.equal(fakeAvatar.response.status, 400);

  const resetLink = await request(baseUrl, `/api/members/${redeem.body.member.id}/reset-link`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: "{}",
  });
  assert.equal(resetLink.response.status, 201);
  const resetToken = new URL(resetLink.body.resetUrl).searchParams.get("reset");
  const reset = await request(baseUrl, "/api/access/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "replacement-password" }),
  });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.member.id, redeem.body.member.id);

  const oldSession = await request(baseUrl, "/api/me", { headers: { cookie: memberCookie } });
  assert.equal(oldSession.response.status, 401);
});

test("fresh install uses the forwarded public origin once and protects the member directory", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "parcos-setup-test-"));
  const app = createApp({
    dataDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    trustProxy: true,
    baseUrl: "http://stale-lan-address.invalid:8180",
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
  assert.equal(login.response.status, 200);
  assert.equal(login.body.setupRequired, true);
  const adminCookie = cookieFrom(login.response);

  const setup = await request(baseUrl, "/api/setup", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ parcName: "Parc des Tests", areas: [
      { name: "Grand potager", codePrefix: "GP", membersCanAccess: true },
      { name: "Pépinière", codePrefix: "PN", membersCanAccess: false },
    ] }),
  });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.body.setupRequired, false);
  assert.equal(setup.body.parcName, "Parc des Tests");

  const proxiedReset = await request(baseUrl, `/api/members/${login.body.member.id}/reset-link`, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      "content-type": "application/json",
      "x-csrf-token": login.body.csrfToken,
      "x-forwarded-host": "parmentier.parcos.eu",
      "x-forwarded-proto": "https",
      "x-forwarded-port": "8443",
    },
    body: "{}",
  });
  assert.equal(new URL(proxiedReset.body.resetUrl).origin, "https://parmentier.parcos.eu:8443");

  const repeated = await request(baseUrl, "/api/setup", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ parcName: "Replacement", areas: [{ name: "Other", codePrefix: "OT" }] }),
  });
  assert.equal(repeated.response.status, 409);

  const invite = await request(baseUrl, "/api/invites", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      "content-type": "application/json",
      "x-csrf-token": login.body.csrfToken,
      "x-forwarded-host": "parmentier.parcos.eu",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(new URL(invite.body.inviteUrl).origin, "https://parmentier.parcos.eu");
  const token = new URL(invite.body.inviteUrl).searchParams.get("invite");
  const redeem = await request(baseUrl, "/api/invites/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, displayName: "Member", username: "member", password: "member-password-123" }),
  });
  const memberDirectory = await request(baseUrl, "/api/members", { headers: { cookie: cookieFrom(redeem.response) } });
  assert.equal(memberDirectory.response.status, 403);
});
