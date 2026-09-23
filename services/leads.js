// services/leads.js
// Stores emails captured before the free scan. These are people who showed
// enough interest to run a scan but haven't purchased - your follow-up list.
//
// Stored separately from orders.json because these are leads, not customers.
//
// PRIVACY NOTE: this file will contain real email addresses. Never commit it
// to a public repo, and make sure your Privacy Policy covers collecting an
// email for the free scan (ours does - it discloses email collection).

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "..", "data", "leads.json");

function ensureDataFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
}

function readLeads() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Saves a lead. If this email already exists, updates their record instead
 * of creating a duplicate (people often re-scan).
 * @param {object} lead - { email, businessName, countryCode }
 */
function saveLead(lead) {
  const leads = readLeads();
  const existing = leads.find((l) => l.email.toLowerCase() === lead.email.toLowerCase());

  if (existing) {
    existing.scanCount = (existing.scanCount || 1) + 1;
    existing.lastScanAt = new Date().toISOString();
    if (lead.businessName) existing.businessName = lead.businessName;
  } else {
    leads.push({
      email: lead.email,
      businessName: lead.businessName || null,
      countryCode: lead.countryCode || null,
      scanCount: 1,
      createdAt: new Date().toISOString(),
      lastScanAt: new Date().toISOString(),
      converted: false, // flip to true when they purchase
    });
  }

  ensureDataFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2));
  return existing || leads[leads.length - 1];
}

/** Marks a lead as converted once they buy - useful for measuring real conversion rate. */
function markConverted(email) {
  const leads = readLeads();
  const lead = leads.find((l) => l.email.toLowerCase() === email.toLowerCase());
  if (lead) {
    lead.converted = true;
    lead.convertedAt = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(leads, null, 2));
  }
}

function getAllLeads() {
  return readLeads();
}

function getLeadStats() {
  const leads = readLeads();
  const converted = leads.filter((l) => l.converted).length;
  return {
    totalLeads: leads.length,
    converted,
    conversionRate: leads.length ? ((converted / leads.length) * 100).toFixed(1) + "%" : "0%",
  };
}

/**
 * Public-safe counter for the landing page.
 *
 * Returns ONLY a total count - never emails or any identifying data, since
 * this endpoint is exposed publicly.
 *
 * `visible` is false until the count passes MIN_DISPLAY. The number is real
 * from day one; it's simply not shown while it's small enough to undermine
 * confidence. It is never inflated - a fabricated starting figure would be a
 * false claim about the business, which is actively prosecuted by the FTC
 * (US), ASA (UK) and ACCC (AU).
 */
const MIN_DISPLAY = 100;

function getPublicScanCount() {
  const leads = readLeads();
  // Total scans run, not unique people - repeat scanners increment scanCount
  const totalScans = leads.reduce((sum, l) => sum + (l.scanCount || 1), 0);
  return {
    count: totalScans,
    visible: totalScans >= MIN_DISPLAY,
    threshold: MIN_DISPLAY,
  };
}

module.exports = { saveLead, markConverted, getAllLeads, getLeadStats, getPublicScanCount };
