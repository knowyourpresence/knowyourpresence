// services/googleSheets.js
// Appends a row to the KYP Customers Google Sheet on every paid order.
// Uses a Service Account JSON (stored as GOOGLE_SERVICE_ACCOUNT_JSON env var)
// and raw HTTPS calls — no googleapis package required.
//
// Sheet ID: 140veaIJVYtZ_vBw4JBMKmKTNxjiCYDfFJ4AdeHmmGmk
// Service account: kyp-server@kyp-reports.iam.gserviceaccount.com

const https = require("https");
const crypto = require("crypto");

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "140veaIJVYtZ_vBw4JBMKmKTNxjiCYDfFJ4AdeHmmGmk";
const SHEET_TAB = "Sheet1"; // default tab name

// ── JWT helpers ───────────────────────────────────────────────────────────────
function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(serviceAccount.private_key));
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(serviceAccount) {
  const jwt = makeJwt(serviceAccount);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) resolve(json.access_token);
          else reject(new Error(`Token error: ${data}`));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Append row ────────────────────────────────────────────────────────────────
async function appendRow(values) {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.warn("googleSheets: GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping.");
    return;
  }

  let sa;
  try { sa = JSON.parse(saJson); } catch (e) {
    console.error("googleSheets: invalid service account JSON:", e.message);
    return;
  }

  const token = await getAccessToken(sa);
  const body = JSON.stringify({ values: [values] });
  const path = `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "sheets.googleapis.com",
      path,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("googleSheets: row appended.");
          resolve();
        } else {
          reject(new Error(`Sheets API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Public: log a completed order ─────────────────────────────────────────────
/**
 * @param {object} p
 * @param {string} p.reportId
 * @param {string} p.businessName
 * @param {string} p.city
 * @param {string} p.email
 * @param {object} p.scores        — { google, social, website, reputation }
 * @param {string} p.grade
 * @param {number} p.amount
 * @param {string} p.currency
 * @param {string} p.paymentId
 */
async function logOrderToSheet(p) {
  const overall = p.scores
    ? Math.round(
        (p.scores.reputation || 0) * 0.20 +
        (p.scores.google     || 0) * 0.35 +
        (p.scores.website    || 0) * 0.20 +
        (p.scores.social     || 0) * 0.25
      )
    : 0;

  const row = [
    new Date().toISOString(),           // A: Timestamp
    p.reportId    || "",                // B: Report ID
    p.businessName|| "",                // C: Business Name
    p.city        || "",                // D: City
    p.email       || "",                // E: Customer Email
    overall,                            // F: Overall Score
    p.grade       || "",                // G: Grade
    p.scores?.google     ?? "",         // H: Google Score
    p.scores?.social     ?? "",         // I: Social Score
    p.scores?.website    ?? "",         // J: Website Score
    p.scores?.reputation ?? "",         // K: Reputation Score
    p.amount      || "",                // L: Amount Paid
    p.currency    || "",                // M: Currency
    p.paymentId   || "",                // N: Payment ID
  ];

  await appendRow(row);
}

// ── Full report data backup (separate tab "OrderData") ───────────────────────
// Stores the complete reportData JSON so resend-pdf can regenerate HTML
// after a Render restart wipes the ephemeral disk.

async function getAccessTokenCached() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  let sa;
  try { sa = JSON.parse(saJson); } catch { return null; }
  return getAccessToken(sa);
}

async function readSheetRows(tab) {
  const token = await getAccessTokenCached();
  if (!token) return [];
  const rangePath = `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}`;
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "sheets.googleapis.com",
      path: rangePath,
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.values || []);
        } catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

async function appendToTab(tab, values) {
  const token = await getAccessTokenCached();
  if (!token) return;
  const body = JSON.stringify({ values: [values] });
  const p = `/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab + "!A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "sheets.googleapis.com",
      path: p,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Saves full reportData JSON to the OrderData tab.
 * Called after report generation so data survives Render restarts.
 */
async function saveReportDataToSheet(reportId, email, reportData) {
  try {
    await appendToTab("OrderData", [
      new Date().toISOString(),
      reportId,
      email || "",
      JSON.stringify(reportData),
    ]);
    console.log(`googleSheets: reportData saved for ${reportId}`);
  } catch (e) {
    console.error("googleSheets: saveReportDataToSheet failed (non-blocking):", e.message);
  }
}

/**
 * Looks up a report's full data from the OrderData tab by reportId.
 * Used by resend-pdf when local orders.json is gone after a Render restart.
 * Returns { email, reportData } or null.
 */
async function getReportDataFromSheet(reportId) {
  try {
    const rows = await readSheetRows("OrderData");
    // rows: [ [timestamp, reportId, email, reportDataJson], ... ]
    for (const row of rows) {
      if (row[1] === reportId) {
        return {
          email: row[2] || null,
          reportData: JSON.parse(row[3] || "null"),
        };
      }
    }
    return null;
  } catch (e) {
    console.error("googleSheets: getReportDataFromSheet failed:", e.message);
    return null;
  }
}

// ── Header row (call once to set up the sheet) ────────────────────────────────
async function initSheetHeaders() {
  await appendRow([
    "Timestamp", "Report ID", "Business Name", "City", "Customer Email",
    "Overall Score", "Grade", "Google Score", "Social Score", "Website Score",
    "Reputation Score", "Amount Paid", "Currency", "Payment ID",
  ]);
}

module.exports = { logOrderToSheet, initSheetHeaders, saveReportDataToSheet, getReportDataFromSheet };
