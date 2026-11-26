import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, publicPushLookup, validPushEndpoint } from "../src/services/push-network.mjs";
import { sendWebPush } from "../src/services/push-notifications.mjs";

test("push endpoints reject internal IPs, aliases, credentials and non-HTTPS URLs", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.2", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "240.0.0.1", "192.88.99.1", "255.255.255.255", "::1", "::ffff:127.0.0.1",
    "fc00::1", "fe80::1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1"]) {
    assert.equal(isPublicAddress(address), false, address);
    assert.equal(validPushEndpoint(`https://${address.includes(":") ? `[${address}]` : address}/push`), false, address);
  }
  for (const endpoint of ["http://push.example.test/push", "https://localhost/push", "https://a.localhost/push",
    "https://2130706433/push", "https://0x7f000001/push", "https://127.1/push", "https://user:pass@push.example.test/push",
    "https://push.example.test/push#fragment", "not a URL"]) assert.equal(validPushEndpoint(endpoint), false, endpoint);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
  assert.equal(validPushEndpoint("https://custom-push.example.test/device"), true, "public custom providers remain supported");
});

const resolveWith = (addresses, options = { all: true }) => new Promise((resolve, reject) => {
  publicPushLookup("push.example.test", options, (error, result, family) => {
    if (error) reject(error);
    else resolve({ result, family });
  }, (_host, lookupOptions, callback) => {
    assert.equal(lookupOptions.all, true);
    callback(null, addresses);
  });
});

test("socket DNS lookup rejects private or mixed answers and returns only checked addresses", async () => {
  for (const addresses of [[], [{ address: "127.0.0.1", family: 4 }],
    [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }],
    [{ address: "::ffff:192.168.1.1", family: 6 }]]) {
    await assert.rejects(resolveWith(addresses), { code: "EACCES" });
  }
  const addresses = [{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
  assert.deepEqual((await resolveWith(addresses)).result, addresses);
  assert.deepEqual(await resolveWith(addresses, {}), { result: "8.8.8.8", family: 4 });
  await assert.rejects(new Promise((resolve, reject) => {
    publicPushLookup("absent.example", {}, (error) => error ? reject(error) : resolve(),
      (_host, _options, callback) => callback(Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" })));
  }), { code: "ENOTFOUND" });
});

test("delivery rejects an old internal subscription before invoking web-push", async () => {
  await assert.rejects(sendWebPush({ endpoint: "https://127.0.0.1/push" }, {}, {}), /Invalid push destination/);
});
