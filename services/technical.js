// services/technical.js
// Three supplementary website checks that add genuinely urgent, specific
// findings beyond what PageSpeed covers. All are low-cost, require no
// owner OAuth, and produce findings a business owner can act on immediately.
//
// 1. SSL certificate expiry  - how long until the cert expires (pure Node.js)
// 2. Google Safe Browsing    - is the site flagged for malware/phishing
// 3. DNS / email config      - MX records + SPF (pure Node.js dns module)

const tls = require("tls");
const dns = require("dns").promises;
const axios = require("axios");

// ---------------------------------------------------------------------------
// 1. SSL CERTIFICATE EXPIRY
// ---------------------------------------------------------------------------
// Checks the actual cert expiry date by opening a real TLS connection.
// No external API - pure Node.js built-ins. Returns days until expiry,
// which is far more actionable than "HTTPS yes/no" alone.
//
// Why this matters: a cert expiring in 14 days is urgent. A cert with
// 2 years left is fine. PageSpeed's isHttps flag treats both the same.

async function checkSslExpiry(websiteUrl) {
  if (!websiteUrl || !websiteUrl.startsWith("https://")) {
    return { checked: false, reason: "no_https" };
  }

  let hostname;
  try {
    hostname = new URL(websiteUrl).hostname;
  } catch {
    return { checked: false, reason: "invalid_url" };
  }

  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert || !cert.valid_to) {
            return resolve({ checked: true, valid: false, daysLeft: null });
          }
          const expiry = new Date(cert.valid_to);
          const daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
          resolve({ checked: true, valid: daysLeft > 0, daysLeft, expiryDate: expiry.toISOString().split("T")[0] });
        } catch {
          resolve({ checked: false, reason: "cert_parse_error" });
        }
      }
    );
    socket.setTimeout(8000, () => { socket.destroy(); resolve({ checked: false, reason: "timeout" }); });
    socket.on("error", () => resolve({ checked: false, reason: "connection_error" }));
  });
}

// ---------------------------------------------------------------------------
// 2. GOOGLE SAFE BROWSING
// ---------------------------------------------------------------------------
// Checks if the site is on Google's threat list (malware, phishing,
// unwanted software). Uses the Safe Browsing Lookup API v4, which is
// free with a Google API key (same project as Places/PageSpeed).
// Most businesses will be clean - but when it flags something, the
// business almost certainly doesn't know, and it's urgent.
//
// Requires: GOOGLE_SAFE_BROWSING_API_KEY (or falls back to
// GOOGLE_PAGESPEED_API_KEY - both work for this endpoint)

async function checkSafeBrowsing(websiteUrl) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY ||
                 process.env.GOOGLE_PAGESPEED_API_KEY; // same Google project works
  if (!apiKey || !websiteUrl) return { checked: false, reason: "no_key" };

  try {
    const { data } = await axios.post(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        client: { clientId: "knowyourpresence", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: websiteUrl }],
        },
      },
      { timeout: 8000 }
    );

    const threats = data.matches || [];
    return {
      checked: true,
      clean: threats.length === 0,
      threats: threats.map((t) => t.threatType),
    };
  } catch (err) {
    console.error("Safe Browsing check failed:", err.message);
    return { checked: false, reason: "api_error" };
  }
}

// ---------------------------------------------------------------------------
// 3. DNS / EMAIL CONFIGURATION
// ---------------------------------------------------------------------------
// Checks two things via Node.js dns.promises (no external API or cost):
//
// a) MX records - does this domain have a business email configured at all?
//    Many businesses use generic Gmail rather than their domain email,
//    missing a credibility signal. If MX exists, there's a business inbox.
//
// b) SPF record (TXT record containing "v=spf1") - is the domain configured
//    to authenticate its outgoing email? Without SPF, emails sent from
//    this domain are likely landing in customers' spam folders - a silent
//    revenue killer most owners have no idea is happening.

async function checkDnsConfig(websiteUrl) {
  let hostname;
  try {
    hostname = new URL(websiteUrl).hostname.replace(/^www\./, "");
  } catch {
    return { checked: false, reason: "invalid_url" };
  }

  const result = { checked: true, hostname, hasMx: false, hasSpf: false, mxRecords: [] };

  try {
    const mx = await dns.resolveMx(hostname);
    result.hasMx = mx.length > 0;
    result.mxRecords = mx.slice(0, 3).map((r) => r.exchange);
  } catch {
    result.hasMx = false; // NXDOMAIN or no MX record
  }

  try {
    const txt = await dns.resolveTxt(hostname);
    result.hasSpf = txt.some((record) =>
      record.join("").toLowerCase().includes("v=spf1")
    );
  } catch {
    result.hasSpf = false;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Combined check - runs all three in parallel so they don't serialize
// ---------------------------------------------------------------------------
async function runTechnicalChecks(websiteUrl) {
  if (!websiteUrl) return { ssl: null, safeBrowsing: null, dns: null };

  const [ssl, safeBrowsing, dns_] = await Promise.allSettled([
    checkSslExpiry(websiteUrl),
    checkSafeBrowsing(websiteUrl),
    checkDnsConfig(websiteUrl),
  ]);

  return {
    ssl: ssl.status === "fulfilled" ? ssl.value : { checked: false },
    safeBrowsing: safeBrowsing.status === "fulfilled" ? safeBrowsing.value : { checked: false },
    dns: dns_.status === "fulfilled" ? dns_.value : { checked: false },
  };
}

module.exports = { runTechnicalChecks, checkSslExpiry, checkSafeBrowsing, checkDnsConfig };
