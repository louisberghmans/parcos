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
  const anonymousFeed = await request(baseUrl, "/api/feed");
  assert.equal(anonymousFeed.response.status, 401);
  const initialBranding = await request(baseUrl, "/api/public/branding");
  assert.equal(initialBranding.response.status, 200);
  assert.deepEqual(initialBranding.body.branding, { login: null, public: null });
  const privateByDefaultSite = await request(baseUrl, "/api/public/site");
  assert.deepEqual(privateByDefaultSite.body, { site: { enabled: false }, events: [] });
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
  assert.equal("locationHint" in beds.body.beds[0], false);
  assert.equal("section" in beds.body.beds[0], false);
  assert.equal("garden" in beds.body.beds[0], false);

  const areas = await request(baseUrl, "/api/areas", { headers: { cookie: adminCookie } });
  assert.equal(areas.response.status, 200);
  assert.equal(areas.body.areas.length, 4);
  const nursery = areas.body.areas.find((area) => area.name === "Pépinière");
  assert.equal(nursery.membersCanAccess, false);

  const nurseryBed = await request(baseUrl, `/api/areas/${nursery.id}/beds`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ code: "", crop: "Semis de poireaux", status: "growing", section: "Tables de semis" }),
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

  const urgentTask = await request(baseUrl, "/api/tasks", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Arroser les tomates", description: "Avant midi.", priority: "urgent", bedId: 1 }),
  });
  assert.equal(urgentTask.response.status, 201);
  assert.equal(urgentTask.body.task.status, "open");
  assert.equal(urgentTask.body.task.bedCode, "GP-01");
  const hiddenTask = await request(baseUrl, "/api/tasks", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Travail réservé", bedId: nurseryBed.body.bed.id }),
  });
  assert.equal(hiddenTask.response.status, 201);
  const eventTask = await request(baseUrl, "/api/tasks", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ title: "Préparer les paniers", eventId, dueAt: startsAt }),
  });
  assert.equal(eventTask.response.status, 201);
  assert.equal(eventTask.body.task.eventTitle, "Récolte collective");
  const taskWithoutCsrf = await request(baseUrl, "/api/tasks", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Refusée" }),
  });
  assert.equal(taskWithoutCsrf.response.status, 403);

  const publicDetail = await request(baseUrl, `/api/public/events/${publicEventId}`);
  assert.equal(publicDetail.response.status, 200);
  assert.equal(publicDetail.body.event.title, "Portes ouvertes");
  assert.equal("registrations" in publicDetail.body, false);
  assert.equal("creatorName" in publicDetail.body.event, false);
  const publicRegistration = await request(baseUrl, `/api/public/events/${publicEventId}/registration`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guestName: "Neighbour Guest", guestContact: "guest@example.test", adults: 2, children: 1 }),
  });
  assert.equal(publicRegistration.response.status, 201);
  assert.equal(publicRegistration.body.status, "going");
  assert.equal(publicRegistration.body.event.attendeeCount, 3);
  const stillPrivateListing = await request(baseUrl, "/api/public/site");
  assert.deepEqual(stillPrivateListing.body, { site: { enabled: false }, events: [] });
  const publicSiteSettings = await request(baseUrl, "/api/public-site-settings", {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken, "x-parcos-locale": "fr" },
    body: JSON.stringify({
      enabled: true,
      locale: "fr",
      title: "Cultivons le parc ensemble",
      philosophy: "Un potager accueillant, vivant et partagé.",
    }),
  });
  assert.equal(publicSiteSettings.response.status, 200);
  assert.equal(publicSiteSettings.body.settings.enabled, true);
  const publishedSite = await request(baseUrl, "/api/public/site");
  assert.equal(publishedSite.body.site.title, "Cultivons le parc ensemble");
  assert.equal(publishedSite.body.events.length, 1);
  assert.equal(publishedSite.body.events[0].id, publicEventId);
  assert.equal(JSON.stringify(publishedSite.body).includes("Neighbour Guest"), false);
  const publicPage = await fetch(`${baseUrl}/public`);
  assert.equal(publicPage.status, 200);
  assert.match(publicPage.headers.get("content-type"), /^text\/html/);

  const imported = await request(baseUrl, "/api/import", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ rows: [
      { entity: "area", name: "Zone import", codePrefix: "ZI", membersCanAccess: "true" },
      { entity: "bed", areaCodePrefix: "ZI", number: "1", crop: "Basilic", status: "growing" },
      { entity: "member", username: "nederlandse.import", displayName: "Nederlandse Import", initialPassword: "import-test-password", preferredLocale: "nl" },
    ] }),
  });
  assert.equal(imported.response.status, 200);
  assert.deepEqual(imported.body.imported, { areas: 1, beds: 1, events: 0, members: 1 });
  const importedMembers = await request(baseUrl, "/api/members", { headers: { cookie: adminCookie } });
  assert.equal(importedMembers.body.members.find((member) => member.username === "nederlandse.import").preferredLocale, "nl");

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

  const roleWithoutCsrf = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "coordinator" }),
  });
  assert.equal(roleWithoutCsrf.response.status, 403);
  const memberRoleChange = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ role: "coordinator" }),
  });
  assert.equal(memberRoleChange.response.status, 403);
  const invalidRoleChange = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(invalidRoleChange.response.status, 400);
  const protectedAdminRole = await request(baseUrl, `/api/members/${login.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(protectedAdminRole.response.status, 400);
  const missingMemberRole = await request(baseUrl, "/api/members/999999/role", {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(missingMemberRole.response.status, 404);
  const promotedMember = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "coordinator" }),
  });
  assert.equal(promotedMember.response.status, 200);
  assert.equal(promotedMember.body.member.role, "coordinator");
  const coordinatorDirectory = await request(baseUrl, "/api/members", { headers: { cookie: memberCookie } });
  assert.equal(coordinatorDirectory.response.status, 200);
  const coordinatorRoleChange = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(coordinatorRoleChange.response.status, 403);
  const demotedCoordinator = await request(baseUrl, `/api/members/${redeem.body.member.id}/role`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ role: "member" }),
  });
  assert.equal(demotedCoordinator.response.status, 200);
  assert.equal(demotedCoordinator.body.member.role, "member");
  const demotedDirectory = await request(baseUrl, "/api/members", { headers: { cookie: memberCookie } });
  assert.equal(demotedDirectory.response.status, 403);

  const emptyFeed = await request(baseUrl, "/api/feed", { headers: { cookie: memberCookie } });
  assert.deepEqual(emptyFeed.body.posts, []);
  const feedWithoutCsrf = await request(baseUrl, "/api/feed", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ body: "No CSRF" }),
  });
  assert.equal(feedWithoutCsrf.response.status, 403);
  const blankFeedPost = await request(baseUrl, "/api/feed", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ body: "   " }),
  });
  assert.equal(blankFeedPost.response.status, 400);
  const memberAnnouncement = await request(baseUrl, "/api/feed", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ body: "Forged announcement", type: "announcement" }),
  });
  assert.equal(memberAnnouncement.response.status, 403);
  const feedImage = readFileSync(new URL("../assets/potager-kale.jpg", import.meta.url)).toString("base64");
  const memberFeedPost = await request(baseUrl, "/api/feed", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ body: "Premières tomates du jardin.", type: "question", dataUrl: `data:image/jpeg;base64,${feedImage}` }),
  });
  assert.equal(memberFeedPost.response.status, 201);
  assert.equal(memberFeedPost.body.post.author.displayName, "Test Member");
  assert.equal(memberFeedPost.body.post.type, "question");
  assert.match(memberFeedPost.body.post.imageUrl, /^\/media\/feed-/);
  const anonymousFeedImage = await fetch(`${baseUrl}${memberFeedPost.body.post.imageUrl}`);
  assert.equal(anonymousFeedImage.status, 401);
  const privateFeedImage = await fetch(`${baseUrl}${memberFeedPost.body.post.imageUrl}`, { headers: { cookie: memberCookie } });
  assert.equal(privateFeedImage.status, 200);
  assert.equal(privateFeedImage.headers.get("cache-control"), "private, no-store");
  const adminReply = await request(baseUrl, `/api/feed/posts/${memberFeedPost.body.post.id}/replies`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ body: "Bravo, gardons-en pour les graines." }),
  });
  assert.equal(adminReply.response.status, 201);
  assert.equal(adminReply.body.post.replies[0].author.displayName, login.body.member.displayName);
  const insertReply = app.db.prepare(`insert into feed_replies (post_id, body, author_id, created_at, updated_at)
    values (?, ?, ?, ?, ?)`);
  for (let index = 0; index < 51; index += 1) {
    const timestamp = new Date(Date.now() + index).toISOString();
    insertReply.run(memberFeedPost.body.post.id, `Bounded reply ${index}`, redeem.body.member.id, timestamp, timestamp);
  }
  const boundedDiscussion = await request(baseUrl, "/api/feed", { headers: { cookie: memberCookie } });
  const boundedPost = boundedDiscussion.body.posts.find((post) => post.id === memberFeedPost.body.post.id);
  assert.equal(boundedPost.replyCount, 52);
  assert.equal(boundedPost.replies.length, 50);
  assert.equal(boundedDiscussion.body.unreadCount, 1);
  const readWithoutCsrf = await request(baseUrl, "/api/feed/read", { method: "POST", headers: { cookie: memberCookie }, body: "{}" });
  assert.equal(readWithoutCsrf.response.status, 403);
  const readFeed = await request(baseUrl, "/api/feed/read", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: "{}",
  });
  assert.equal(readFeed.response.status, 200);
  assert.equal((await request(baseUrl, "/api/feed", { headers: { cookie: memberCookie } })).body.unreadCount, 0);
  const memberCannotDeleteReply = await request(baseUrl, `/api/feed/replies/${adminReply.body.post.replies[0].id}`, {
    method: "DELETE",
    headers: { cookie: memberCookie, "x-csrf-token": redeem.body.csrfToken },
  });
  assert.equal(memberCannotDeleteReply.response.status, 403);
  const editedFeedPost = await request(baseUrl, `/api/feed/posts/${memberFeedPost.body.post.id}`, {
    method: "PATCH",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ body: "Premières tomates partagées.", type: "update" }),
  });
  assert.equal(editedFeedPost.response.status, 200);
  assert.equal(editedFeedPost.body.post.body, "Premières tomates partagées.");
  const announcement = await request(baseUrl, "/api/feed", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ body: "Permanence samedi matin.", type: "announcement" }),
  });
  assert.equal(announcement.response.status, 201);
  assert.equal(announcement.body.post.type, "announcement");
  const memberCannotDeleteAnnouncement = await request(baseUrl, `/api/feed/posts/${announcement.body.post.id}`, {
    method: "DELETE",
    headers: { cookie: memberCookie, "x-csrf-token": redeem.body.csrfToken },
  });
  assert.equal(memberCannotDeleteAnnouncement.response.status, 403);
  const orderedFeed = await request(baseUrl, "/api/feed", { headers: { cookie: memberCookie } });
  assert.deepEqual(orderedFeed.body.posts.map((post) => post.id), [announcement.body.post.id, memberFeedPost.body.post.id]);
  assert.equal(orderedFeed.body.unreadCount, 1);
  const moderatedPost = await request(baseUrl, `/api/feed/posts/${memberFeedPost.body.post.id}`, {
    method: "DELETE",
    headers: { cookie: adminCookie, "x-csrf-token": login.body.csrfToken },
  });
  assert.equal(moderatedPost.response.status, 200);
  assert.equal((await fetch(`${baseUrl}${memberFeedPost.body.post.imageUrl}`, { headers: { cookie: memberCookie } })).status, 404);
  assert.equal(app.db.prepare("select count(*) as count from feed_replies where post_id = ?").get(memberFeedPost.body.post.id).count, 0);

  const memberAreas = await request(baseUrl, "/api/areas", { headers: { cookie: memberCookie } });
  assert.equal(memberAreas.body.areas.some((area) => area.name === "Pépinière"), false);
  assert.equal(memberAreas.body.areas.some((area) => area.name === "Verger"), true);
  const memberBeds = await request(baseUrl, "/api/beds", { headers: { cookie: memberCookie } });
  assert.equal(memberBeds.body.beds.some((bed) => bed.id === nurseryBed.body.bed.id), false);
  assert.equal(memberBeds.body.beds.some((bed) => bed.id === orchardBed.body.bed.id), true);
  const hiddenBed = await request(baseUrl, `/api/beds/${nurseryBed.body.bed.id}`, { headers: { cookie: memberCookie } });
  assert.equal(hiddenBed.response.status, 404);

  const memberTasks = await request(baseUrl, "/api/tasks", { headers: { cookie: memberCookie } });
  assert.equal(memberTasks.response.status, 200);
  assert.ok(memberTasks.body.tasks.some((task) => task.id === urgentTask.body.task.id && task.priority === "urgent"));
  assert.ok(memberTasks.body.tasks.some((task) => task.id === eventTask.body.task.id));
  assert.equal(memberTasks.body.tasks.some((task) => task.id === hiddenTask.body.task.id), false);
  const memberTaskCreate = await request(baseUrl, "/api/tasks", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ title: "Member-created task" }),
  });
  assert.equal(memberTaskCreate.response.status, 403);
  const claimWithoutCsrf = await request(baseUrl, `/api/tasks/${urgentTask.body.task.id}/claim`, {
    method: "POST", headers: { cookie: memberCookie, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(claimWithoutCsrf.response.status, 403);
  const claimedTask = await request(baseUrl, `/api/tasks/${urgentTask.body.task.id}/claim`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: "{}",
  });
  assert.equal(claimedTask.response.status, 200);
  assert.equal(claimedTask.body.task.status, "claimed");
  assert.equal(claimedTask.body.task.claimedBy.id, redeem.body.member.id);
  const completedTask = await request(baseUrl, `/api/tasks/${urgentTask.body.task.id}/complete`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: "{}",
  });
  assert.equal(completedTask.response.status, 200);
  assert.equal(completedTask.body.task.status, "done");
  assert.equal(completedTask.body.task.completedBy.id, redeem.body.member.id);
  const archivedTask = await request(baseUrl, `/api/tasks/${eventTask.body.task.id}`, {
    method: "PATCH",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ status: "archived" }),
  });
  assert.equal(archivedTask.response.status, 200);
  assert.equal(archivedTask.body.task.status, "archived");
  const memberTasksAfterArchive = await request(baseUrl, "/api/tasks", { headers: { cookie: memberCookie } });
  assert.equal(memberTasksAfterArchive.body.tasks.some((task) => task.id === eventTask.body.task.id), false);

  const quickLog = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "work", note: "Desherbage termine." }),
  });
  assert.equal(quickLog.response.status, 201);
  assert.equal(quickLog.body.activity.type, "log_work");
  assert.equal(quickLog.body.activity.memberName, "Test Member");
  const wateringLog = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "watering", note: "Arrosage du matin." }),
  });
  const weedingLog = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "weeding", note: "Adventices retirées." }),
  });
  const clearingLog = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "clearing", note: "Fin de culture nettoyée." }),
  });
  assert.equal(wateringLog.body.activity.type, "log_watering");
  assert.equal(weedingLog.body.activity.type, "log_weeding");
  assert.equal(clearingLog.body.activity.type, "log_clearing");
  assert.notEqual(weedingLog.body.activity.type, clearingLog.body.activity.type);

  const memberPublicSettings = await request(baseUrl, "/api/public-site-settings", { headers: { cookie: memberCookie } });
  assert.equal(memberPublicSettings.response.status, 403);

  const recentActivity = await request(baseUrl, "/api/activities", { headers: { cookie: memberCookie } });
  assert.equal(recentActivity.response.status, 200);
  assert.ok(recentActivity.body.activities.some((activity) => activity.note === "Desherbage termine." && activity.bedCode === "GP-01"));

  const hiddenLog = await request(baseUrl, `/api/beds/${nurseryBed.body.bed.id}/logs`, {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "observation", note: "Should remain hidden." }),
  });
  assert.equal(hiddenLog.response.status, 404);

  const logWithoutCsrf = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "problem", note: "No CSRF." }),
  });
  assert.equal(logWithoutCsrf.response.status, 403);

  const photoLogWithoutPhoto = await request(baseUrl, "/api/beds/1/logs", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ type: "photo", note: "Missing image." }),
  });
  assert.equal(photoLogWithoutPhoto.response.status, 400);

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
  const memberBranding = await request(baseUrl, "/api/branding/login", {
    method: "POST",
    headers: { cookie: memberCookie, "content-type": "application/json", "x-csrf-token": redeem.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}` }),
  });
  assert.equal(memberBranding.response.status, 403);

  const brandingUpload = await request(baseUrl, "/api/branding/today", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}` }),
  });
  assert.equal(brandingUpload.response.status, 200);
  assert.match(brandingUpload.body.branding.today, /^\/branding\/today\?v=/);
  const publicBranding = await request(baseUrl, "/api/public/branding");
  assert.equal(publicBranding.body.branding.today, undefined);
  assert.equal(publicBranding.body.branding.event, undefined);
  const publicBrandingUpload = await request(baseUrl, "/api/branding/public", {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${png}` }),
  });
  assert.equal(publicBrandingUpload.response.status, 200);
  assert.match(publicBrandingUpload.body.branding.public, /^\/branding\/public\?v=/);
  const explicitPublicBranding = await request(baseUrl, "/api/public/branding");
  assert.equal(explicitPublicBranding.body.branding.public, publicBrandingUpload.body.branding.public);
  const brandingPhoto = await fetch(`${baseUrl}${brandingUpload.body.branding.today}`);
  assert.equal(brandingPhoto.status, 200);
  assert.equal(brandingPhoto.headers.get("content-type"), "image/jpeg");
  const brandingReset = await request(baseUrl, "/api/branding/today", {
    method: "DELETE",
    headers: { cookie: adminCookie, "content-type": "application/json", "x-csrf-token": login.body.csrfToken },
    body: "{}",
  });
  assert.equal(brandingReset.response.status, 200);
  assert.equal(brandingReset.body.branding.today, null);
  assert.equal((await fetch(`${baseUrl}${brandingUpload.body.branding.today}`)).status, 404);

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

test("schema migrations apply once and upgrade databases missing task, feed, read-state, or notification tables", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "parcos-migration-test-"));
  let app;
  try {
    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    const migrations = app.db.prepare("select version, name from schema_migrations order by version").all();
    const existingAdmin = app.db.prepare("select id, username from members where role = 'admin'").get();
    assert.equal(migrations.length, 4);
    assert.equal(migrations[0].version, 1);
    assert.equal(migrations[0].name, "first_class_tasks");
    assert.equal(migrations[1].version, 2);
    assert.equal(migrations[1].name, "garden_feed");
    assert.equal(migrations[2].version, 3);
    assert.equal(migrations[2].name, "feed_read_state");
    assert.equal(migrations[3].version, 4);
    assert.equal(migrations[3].name, "daily_push_notifications");
    app.db.exec("drop table push_subscriptions; drop table notification_preferences; delete from schema_migrations where version = 4");
    app.close();

    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    assert.equal(app.db.prepare("select count(*) as count from schema_migrations where version = 4").get().count, 1);
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'notification_preferences'").get());
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'push_subscriptions'").get());
    app.db.exec("drop table feed_read_state; delete from schema_migrations where version = 3");
    app.close();

    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    assert.equal(app.db.prepare("select count(*) as count from schema_migrations where version = 3").get().count, 1);
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'feed_read_state'").get());
    app.db.exec("drop table feed_replies; drop table feed_posts; delete from schema_migrations where version = 2");
    app.close();

    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    assert.equal(app.db.prepare("select count(*) as count from schema_migrations where version = 2").get().count, 1);
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'feed_posts'").get());
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'feed_replies'").get());
    assert.deepEqual(app.db.prepare("select id, username from members where id = ?").get(existingAdmin.id), existingAdmin);
    app.db.exec("drop table tasks; delete from schema_migrations where version = 1");
    app.close();

    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    assert.equal(app.db.prepare("select count(*) as count from schema_migrations where version = 1").get().count, 1);
    assert.ok(app.db.prepare("select name from sqlite_master where type = 'table' and name = 'tasks'").get());
    app.close();

    app = createApp({ dataDir, adminUsername: "admin", adminPassword: "test-admin-password" });
    assert.equal(app.db.prepare("select count(*) as count from schema_migrations").get().count, 4);
  } finally {
    try { app?.close(); } catch { /* Already closed. */ }
    rmSync(dataDir, { recursive: true, force: true });
  }
});
