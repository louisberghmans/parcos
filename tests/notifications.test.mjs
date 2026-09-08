import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server.mjs";
import {
  summaryBody,
  validDeliveryTime,
  validTimeZone,
  zonedDateAndTime,
} from "../src/services/push-notifications.mjs";

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("notification schedule helpers validate local daily delivery", () => {
  assert.equal(validDeliveryTime("18:00"), true);
  assert.equal(validDeliveryTime("24:00"), false);
  assert.equal(validTimeZone("Europe/Brussels"), true);
  assert.equal(validTimeZone("Not/A_Time_Zone"), false);
  assert.deepEqual(zonedDateAndTime(new Date("2026-06-10T16:30:00.000Z"), "Europe/Brussels"), {
    date: "2026-06-10",
    time: "18:30",
  });
  assert.equal(summaryBody("fr", 1), "1 nouveauté dans ParcOS");
  assert.equal(summaryBody("en", 2), "2 new updates in ParcOS");
  assert.equal(summaryBody("nl", 2), "2 nieuwe meldingen in ParcOS");
});

test("members save preferences before consent and receive at most one private daily summary", async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "parcos-notifications-"));
  const deliveries = [];
  let rejectPermanently = false;
  const app = createApp({
    dataDir,
    adminUsername: "admin",
    adminPassword: "test-admin-password",
    notificationScheduler: false,
    notificationSender: async (subscription, payload, vapidDetails) => {
      if (rejectPermanently) throw Object.assign(new Error("Expired"), { statusCode: 410 });
      deliveries.push({ subscription, payload, vapidDetails });
    },
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => {
    app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  assert.equal((await request(baseUrl, "/api/notifications/preferences")).response.status, 401);
  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "test-admin-password" }),
  });
  const cookie = cookieFrom(login.response);
  const writeHeaders = {
    cookie,
    "content-type": "application/json",
    "x-csrf-token": login.body.csrfToken,
  };

  const defaults = await request(baseUrl, "/api/notifications/preferences", { headers: { cookie } });
  assert.equal(defaults.response.status, 200);
  assert.deepEqual(defaults.body.preferences, {
    configured: false,
    enabled: false,
    frequency: "daily",
    deliveryTime: "18:00",
    timeZone: "Europe/Brussels",
    categories: { feedPosts: true, feedReplies: true },
  });
  assert.match(defaults.body.publicKey, /^[A-Za-z0-9_-]+$/);
  assert.equal("privateKey" in defaults.body, false);

  const preferences = {
    deliveryTime: "18:00",
    timeZone: "UTC",
    categories: { feedPosts: true, feedReplies: false },
  };
  assert.equal((await request(baseUrl, "/api/notifications/preferences", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(preferences),
  })).response.status, 403);
  const saved = await request(baseUrl, "/api/notifications/preferences", {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify(preferences),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.preferences.enabled, false);
  assert.equal(saved.body.preferences.deliveryTime, "18:00");
  assert.equal(saved.body.preferences.timeZone, "UTC");
  assert.equal((await request(baseUrl, "/api/notifications/preferences", {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify({ ...preferences, timeZone: "Invalid/Zone" }),
  })).response.status, 400);
  assert.equal((await request(baseUrl, "/api/notifications/preferences", {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify({ ...preferences, categories: { feedPosts: false, feedReplies: false } }),
  })).response.status, 400);

  const subscription = {
    endpoint: "https://push.example.test/device-one",
    expirationTime: null,
    keys: {
      p256dh: "A_valid_test_p256dh_key_1234567890",
      auth: "A_valid_test_auth_key_1234567890",
    },
  };
  assert.equal((await request(baseUrl, "/api/notifications/subscriptions", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(subscription),
  })).response.status, 403);
  assert.equal((await request(baseUrl, "/api/notifications/subscriptions", {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify({ ...subscription, endpoint: "http://push.example.test/not-secure" }),
  })).response.status, 400);
  const enabled = await request(baseUrl, "/api/notifications/subscriptions", {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify(subscription),
  });
  assert.equal(enabled.response.status, 201);
  assert.equal(enabled.body.preferences.enabled, true);
  assert.equal(enabled.body.preferences.deliveryTime, "18:00");
  assert.equal(enabled.body.subscriptionCount, 1);

  const adminId = login.body.member.id;
  const enabledAt = app.db.prepare("select last_digest_at from notification_preferences where member_id = ?").get(adminId).last_digest_at;
  const firstCycle = new Date(enabledAt);
  firstCycle.setUTCDate(firstCycle.getUTCDate() + 1);
  firstCycle.setUTCHours(18, 1, 0, 0);
  const firstPostAt = new Date(new Date(enabledAt).getTime() + 1_000).toISOString();
  app.db.prepare(`insert into feed_posts
    (post_type, body, image_path, image_content_type, author_id, created_at, updated_at)
    values ('update', 'Private garden detail', null, null, null, ?, ?)`)
    .run(firstPostAt, firstPostAt);

  const beforeFirstCycle = new Date(firstCycle);
  beforeFirstCycle.setUTCHours(17, 59, 0, 0);
  assert.deepEqual(await app.runNotificationCycle(beforeFirstCycle), { processed: 0, sent: 0, removed: 0, skipped: false });
  const firstResult = await app.runNotificationCycle(firstCycle);
  assert.deepEqual(firstResult, { processed: 1, sent: 1, removed: 0, skipped: false });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].subscription.endpoint, subscription.endpoint);
  assert.equal(deliveries[0].payload.body, "1 nouveauté dans ParcOS");
  assert.equal(JSON.stringify(deliveries[0].payload).includes("Private garden detail"), false);
  assert.equal(deliveries[0].vapidDetails.publicKey, defaults.body.publicKey);
  assert.ok(deliveries[0].vapidDetails.privateKey);
  assert.equal((await app.runNotificationCycle(firstCycle)).sent, 0);
  assert.equal(deliveries.length, 1);

  const secondCycle = new Date(firstCycle);
  secondCycle.setUTCDate(secondCycle.getUTCDate() + 1);
  const ignoredReplyAt = new Date(firstCycle.getTime() + 1_000).toISOString();
  const postId = app.db.prepare("select id from feed_posts order by id desc limit 1").get().id;
  app.db.prepare(`insert into feed_replies (post_id, body, author_id, created_at, updated_at)
    values (?, 'Private reply detail', null, ?, ?)`)
    .run(postId, ignoredReplyAt, ignoredReplyAt);
  assert.equal((await app.runNotificationCycle(secondCycle)).sent, 0);
  assert.equal(deliveries.length, 1);

  const repliesEnabled = await request(baseUrl, "/api/notifications/preferences", {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify({ ...preferences, categories: { feedPosts: true, feedReplies: true } }),
  });
  assert.equal(repliesEnabled.body.preferences.enabled, true);
  const thirdCycle = new Date(secondCycle);
  thirdCycle.setUTCDate(thirdCycle.getUTCDate() + 1);
  const includedReplyAt = new Date(secondCycle.getTime() + 1_000).toISOString();
  app.db.prepare(`insert into feed_replies (post_id, body, author_id, created_at, updated_at)
    values (?, 'Another private reply', null, ?, ?)`)
    .run(postId, includedReplyAt, includedReplyAt);
  assert.equal((await app.runNotificationCycle(thirdCycle)).sent, 1);
  assert.equal(deliveries.length, 2);

  rejectPermanently = true;
  const fourthCycle = new Date(thirdCycle);
  fourthCycle.setUTCDate(fourthCycle.getUTCDate() + 1);
  const finalPostAt = new Date(thirdCycle.getTime() + 1_000).toISOString();
  app.db.prepare(`insert into feed_posts
    (post_type, body, image_path, image_content_type, author_id, created_at, updated_at)
    values ('update', 'Final private detail', null, null, null, ?, ?)`)
    .run(finalPostAt, finalPostAt);
  assert.deepEqual(await app.runNotificationCycle(fourthCycle), { processed: 1, sent: 0, removed: 1, skipped: false });
  assert.equal(app.db.prepare("select count(*) as count from push_subscriptions").get().count, 0);
  assert.equal(app.db.prepare("select enabled from notification_preferences where member_id = ?").get(adminId).enabled, 0);

  const reenabled = await request(baseUrl, "/api/notifications/subscriptions", {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify(subscription),
  });
  assert.equal(reenabled.body.preferences.enabled, true);
  assert.equal((await request(baseUrl, "/api/notifications/subscriptions", {
    method: "DELETE",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  })).response.status, 403);
  const disabled = await request(baseUrl, "/api/notifications/subscriptions", {
    method: "DELETE",
    headers: writeHeaders,
    body: "{}",
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.body.preferences.enabled, false);
  assert.equal(disabled.body.subscriptionCount, 0);
});
