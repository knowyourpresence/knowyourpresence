// services/resolveUrl.js
// Follows redirects on a customer-supplied website address so every check
// (PageSpeed, SSL, URLScan, social links) runs against the page visitors
// actually land on. Guards against server-side request forgery: only public
// http(s) hosts are fetched.

const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.");
}

async function isPublicHost(hostname) {
  if (!hostname) return false;
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

function normalize(input) {
  if (!input) return null;
  let u = String(input).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Returns the final URL after redirects, or the normalised input if it cannot
// be resolved. Never throws.
async function resolveFinalUrl(input) {
  const start = normalize(input);
  if (!start) return input || "";
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    if (!(await isPublicHost(current.hostname))) return current.toString();
    try {
      const res = await axios.get(current.toString(), {
        maxRedirects: 0,
        timeout: 8000,
        validateStatus: () => true,
        responseType: "stream",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KnowYourPresenceBot/1.0)" },
      });
      res.data.destroy();
      const loc = res.headers && res.headers.location;
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        if (!["http:", "https:"].includes(current.protocol)) return start.toString();
        continue;
      }
      return current.toString();
    } catch {
      return current.toString();
    }
  }
  return current.toString();
}

module.exports = { resolveFinalUrl };
