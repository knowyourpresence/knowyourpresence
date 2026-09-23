// services/urlscan.js
// URLScan.io integration for KYP Scanner.
//
// What this adds to the report:
//   1. External screenshot of the homepage (what the world actually sees)
//   2. Security headers audit (HSTS, CSP, X-Frame-Options, X-Content-Type)
//   3. Tracker/ad-tech detection (number of third-party trackers loaded)
//   4. Malicious / phishing flag check (independent of Google Safe Browsing)
//   5. Technology fingerprint (what CMS / stack is the site running)
//
// These are trust and credibility signals that no other check in KYP covers.
// A business owner rarely knows their site is loading 14 ad trackers or
// missing HSTS — both are urgent fixable issues.
//
// Free tier: 5,000 scans/day (public scans). KYP usage will be well under this.
// Scans are PUBLIC on urlscan.io unless you use a private API key.
//
// Requires: URLSCAN_API_KEY in .env  (get at https://urlscan.io/user/signup)
// Optional: set URLSCAN_VISIBILITY=private to hide scans from the public feed
//           (requires a paid API key)

const axios = require("axios");

const URLSCAN_BASE = "https://urlscan.io/api/v1";

// ---------------------------------------------------------------------------
// Submit a URL for scanning and poll for the result.
// URLScan is async: submit → wait ~15-25s → fetch result.
// ---------------------------------------------------------------------------
async function scanUrl(websiteUrl) {
  const apiKey = process.env.URLSCAN_API_KEY;
  if (!apiKey || !websiteUrl) {
    return { checked: false, reason: "no_key_or_url" };
  }

  // Normalise URL — must have a scheme
  let url = websiteUrl.trim();
  if (!url.startsWith("http")) url = "https://" + url;

  try {
    // 1. Submit scan
    const { data: submitData } = await axios.post(
      `${URLSCAN_BASE}/scan/`,
      {
        url,
        visibility: process.env.URLSCAN_VISIBILITY || "public",
        tags: ["kyp-scanner"],
      },
      {
        headers: {
          "API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const uuid = submitData.uuid;
    const resultUrl = submitData.api; // e.g. https://urlscan.io/api/v1/result/<uuid>/

    if (!uuid) {
      console.error("URLScan submit returned no UUID:", submitData);
      return { checked: false, reason: "no_uuid" };
    }

    // 2. Poll for result — URLScan typically finishes in 15-30 s
    let result = null;
    const maxAttempts = 12;
    const pollInterval = 5000; // 5 s between polls

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));
      try {
        const { data } = await axios.get(resultUrl, {
          headers: { "API-Key": apiKey },
          timeout: 10000,
        });
        result = data;
        break;
      } catch (pollErr) {
        if (pollErr.response?.status === 404) {
          // Scan not ready yet
          continue;
        }
        throw pollErr;
      }
    }

    if (!result) {
      return { checked: false, reason: "scan_timeout" };
    }

    return parseUrlScanResult(result, uuid);
  } catch (err) {
    console.error("URLScan scan failed:", err.message);
    return { checked: false, reason: "api_error", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Parse the URLScan result object into the signals KYP cares about.
// ---------------------------------------------------------------------------
function parseUrlScanResult(result, uuid) {
  const page = result.page || {};
  const stats = result.stats || {};
  const verdicts = result.verdicts || {};
  const meta = result.meta || {};

  // --- Screenshot URL (public CDN, accessible without auth) ---
  const screenshotUrl = uuid
    ? `https://urlscan.io/screenshots/${uuid}.png`
    : null;

  // --- Security Headers ---
  const responseHeaders = {};
  const requests = result.data?.requests || [];
  if (requests.length > 0) {
    const mainReq = requests[0];
    const headers =
      mainReq?.response?.response?.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      responseHeaders[k.toLowerCase()] = v;
    }
  }

  const securityHeaders = {
    hsts: !!responseHeaders["strict-transport-security"],
    csp: !!responseHeaders["content-security-policy"],
    xFrameOptions: !!responseHeaders["x-frame-options"],
    xContentType: !!responseHeaders["x-content-type-options"],
  };
  const securityHeaderScore = Object.values(securityHeaders).filter(Boolean).length; // 0–4

  // --- Tracker / third-party count ---
  const thirdPartyRequests = stats.serverStats || [];
  const trackerDomains = (result.lists?.domains || []).filter(
    (d) => !d.includes(new URL(page.url || "https://example.com").hostname.replace("www.", ""))
  );
  const trackerCount = trackerDomains.length;

  // --- Malicious verdict ---
  const isMalicious =
    verdicts?.overall?.malicious === true ||
    verdicts?.urlscan?.malicious === true ||
    verdicts?.community?.score > 50;

  // --- Technology stack ---
  const technologies = (meta.processors?.wappa?.data || []).map((t) => t.app || t.name).filter(Boolean);

  // --- Simple trust score contribution (0-100) ---
  let trustScore = 50; // baseline
  trustScore += securityHeaderScore * 10; // up to +40
  if (isMalicious) trustScore -= 50;
  if (trackerCount > 10) trustScore -= 15;
  else if (trackerCount > 5) trustScore -= 5;
  trustScore = Math.max(0, Math.min(100, trustScore));

  return {
    checked: true,
    screenshotUrl,
    securityHeaders,
    securityHeaderScore,
    trackerCount,
    isMalicious,
    technologies: technologies.slice(0, 10),
    trustScore,
    scanUrl: `https://urlscan.io/result/${uuid}/`,
    pageTitle: page.title || null,
    pageCountry: page.country || null,
    finalUrl: page.url || null,
  };
}

module.exports = { scanUrl };
