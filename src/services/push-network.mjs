import { lookup } from "node:dns";
import { Agent } from "node:https";
import { BlockList, isIP } from "node:net";

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
]) blockedV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]]) {
  blockedV6.addSubnet(address, prefix, "ipv6");
}

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, "ipv4");
  // Reject mapped IPv4, local, multicast and transition addresses too.
  return family === 6 && globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

export function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return endpoint.length <= 2048 && url.protocol === "https:" && !url.username && !url.password
      && !url.hash && (!isIP(host) || isPublicAddress(host))
      && host !== "localhost" && !host.endsWith(".localhost");
  } catch {
    return false;
  }
}

// Validate the exact addresses supplied to the socket, not a separate preflight
// DNS query. This prevents a hostname changing to an internal IP between checks.
export function publicPushLookup(hostname, options, callback, resolver = lookup) {
  resolver(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses?.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      return callback(Object.assign(new Error("Push destination is not public."), { code: "EACCES" }));
    }
    if (options?.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

export const pushAgent = new Agent({ lookup: publicPushLookup, keepAlive: false });
