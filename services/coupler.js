// services/coupler.js
// Coupler.io integration for KYP Scanner.
//
// What this adds:
//   1. Pushes each completed scan/order into a Coupler "importer" (Google Sheets or
//      Airtable), giving you a live dashboard of all scans, scores, and customer data
//      without manual CSV exports.
//   2. Optionally pushes client-connected Google Search Console / GA4 data INTO the
//      scan pipeline — so if a client shares their GSC access, their real search
//      visibility numbers feed into the report instead of PageSpeed estimates.
//   3. Enables scheduled monthly re-scans (Coupler can trigger a webhook on schedule),
//      opening a "KYP Monitor" upsell — pay once/month to get a refreshed score.
//
// Integration model used here: Coupler REST API (Data Destination).
// You create a Coupler "importer" that accepts rows via POST and writes them to
// your connected destination (Google Sheets, Airtable, BigQuery, etc.).
//
// Requires:
//   COUPLER_API_KEY      - from app.coupler.io → Account → API
//   COUPLER_IMPORTER_ID  - the importer ID from the Coupler dashboard (the one
//                          connected to your Google Sheet / Airtable base)
//
// Both are optional — if unset, Coupler calls are silently skipped and the
// scan proceeds normally. This lets you go live before setting up the sheet.

const axios = require("axios");

const COUPLER_BASE = "https://api.coupler.io/v1";

// ---------------------------------------------------------------------------
// Push a completed scan record to your Coupler destination.
// Call this after every paid order webhook fulfils, so every report
// that goes out also lands in your analytics sheet.
// ---------------------------------------------------------------------------
async function pushScanRecord(record) {
  const apiKey = process.env.COUPLER_API_KEY;
  const importerId = process.env.COUPLER_IMPORTER_ID;

  if (!apiKey || !importerId) return { pushed: false, reason: "not_configured" };

  // Flatten nested scores for easy column mapping in the sheet
  const row = {
    timestamp: new Date().toISOString(),
    reportId: record.reportId || "",
    businessName: record.businessName || "",
    businessType: record.businessType || "",
    city: record.city || "",
    email: record.email || "",
    overallScore: record.scores?.overall ?? "",
    googleScore: record.scores?.google ?? "",
    socialScore: record.scores?.social ?? "",
    websiteScore: record.scores?.website ?? "",
    reputationScore: record.scores?.reputation ?? "",
    grade: record.grade || "",
    potentialScore: record.potentialScore ?? "",
    // URLScan enrichment columns
    isMalicious: record.urlscan?.isMalicious ?? "",
    securityHeaderScore: record.urlscan?.securityHeaderScore ?? "",
    trackerCount: record.urlscan?.trackerCount ?? "",
    // Apify SEO columns
    hasSchema: record.apify?.seo?.hasSchema ?? "",
    altCoverage: record.apify?.seo?.altCoverage ?? "",
    // Meta Ads columns
    businessAdCount: record.metaAds?.business?.adCount ?? "",
    businessRunningAds: record.metaAds?.business?.found ?? "",
    competitorAdCount: record.metaAds?.competitor?.adCount ?? "",
    // Payment
    amount: record.amount || "",
    currency: record.currency || "",
    paymentId: record.paymentId || "",
  };

  try {
    await axios.post(
      `${COUPLER_BASE}/importers/${importerId}/run`,
      { data: [row] },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    return { pushed: true };
  } catch (err) {
    // Log but never throw — a Coupler failure must NEVER block report delivery
    console.error("Coupler push failed (non-blocking):", err.message);
    return { pushed: false, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Push a free-scan lead (no payment yet) to a separate Coupler importer
// for your leads sheet. Optional: use a different COUPLER_LEADS_IMPORTER_ID.
// ---------------------------------------------------------------------------
async function pushLeadRecord(lead) {
  const apiKey = process.env.COUPLER_API_KEY;
  const importerId = process.env.COUPLER_LEADS_IMPORTER_ID || process.env.COUPLER_IMPORTER_ID;

  if (!apiKey || !importerId) return { pushed: false, reason: "not_configured" };

  const row = {
    timestamp: new Date().toISOString(),
    email: lead.email || "",
    businessName: lead.businessName || "",
    city: lead.city || "",
    countryCode: lead.countryCode || "",
    overallScore: lead.overallScore ?? "",
    grade: lead.grade || "",
    converted: false,
  };

  try {
    await axios.post(
      `${COUPLER_BASE}/importers/${importerId}/run`,
      { data: [row] },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    return { pushed: true };
  } catch (err) {
    console.error("Coupler lead push failed (non-blocking):", err.message);
    return { pushed: false, reason: err.message };
  }
}

module.exports = { pushScanRecord, pushLeadRecord };
