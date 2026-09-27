// services/followUpJob.js
// Background cron job that runs every hour on the Render server.
// Finds free-scan leads who:
//   1. Scanned more than 24 hours ago
//   2. Have NOT converted to a paid report
//   3. Have NOT already received a follow-up email
// ...and sends them one upsell email via followUpEmail.js.
//
// HOW IT WORKS:
//   - getAllLeads() returns all leads from leads.json
//   - Each lead has: { email, businessName, countryCode, scannedAt, converted, followUpSent }
//   - We add a `followUpSent: true` flag after sending so we never double-email anyone
//   - The job runs every 60 minutes via setInterval; it's lightweight (JSON file read + Resend call)
//
// USAGE (in server.js):
//   const { startFollowUpJob } = require("./services/followUpJob");
//   startFollowUpJob();

"use strict";

const { getAllLeads } = require("./leads");
const { sendFollowUpEmail } = require("./followUpEmail");
const fs = require("fs");
const path = require("path");

// Path to the same leads file leads.js uses
const LEADS_FILE = path.join(__dirname, "../data/leads.json");

const DELAY_MS = 24 * 60 * 60 * 1000;   // 24 hours in ms
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every 1 hour

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads leads.json directly so we can write the followUpSent flag back.
 * Falls back to getAllLeads() if the file path is wrong (safe degradation).
 */
function readLeadsRaw() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("[followUpJob] Could not read leads file directly:", e.message);
  }
  // Fallback: use the exported function (won't be able to write back)
  return getAllLeads();
}

/**
 * Writes the updated leads array back to leads.json.
 * Atomic-ish: writes to a temp file then renames.
 */
function writeLeadsRaw(leads) {
  const tmp = LEADS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(leads, null, 2), "utf8");
  fs.renameSync(tmp, LEADS_FILE);
}

/**
 * Marks a single lead as having received the follow-up email.
 * Mutates the leads file in place.
 */
function markFollowUpSent(email) {
  try {
    const leads = readLeadsRaw();
    const updated = leads.map(l =>
      l.email === email ? { ...l, followUpSent: true, followUpSentAt: new Date().toISOString() } : l
    );
    writeLeadsRaw(updated);
  } catch (e) {
    console.error("[followUpJob] Failed to mark followUpSent for", email, e.message);
  }
}

// ─── main job ─────────────────────────────────────────────────────────────────

async function runFollowUpCheck() {
  const now = Date.now();
  let leads;

  try {
    leads = readLeadsRaw();
  } catch (e) {
    console.error("[followUpJob] Could not load leads:", e.message);
    return;
  }

  // Filter: unconverted, not yet emailed, scanned > 24h ago
  const eligible = leads.filter(lead => {
    if (lead.converted)      return false; // already bought — skip
    if (lead.followUpSent)   return false; // already sent follow-up — skip
    if (!lead.email)         return false; // no email to send to
    if (!lead.createdAt)     return false; // no timestamp — can't determine age

    // Use createdAt (set by leads.js on first scan) to measure 24h window
    const age = now - new Date(lead.createdAt).getTime();
    return age >= DELAY_MS;
  });

  if (eligible.length === 0) {
    console.log(`[followUpJob] Check complete — no eligible leads at ${new Date().toISOString()}`);
    return;
  }

  console.log(`[followUpJob] Found ${eligible.length} lead(s) to follow up.`);

  for (const lead of eligible) {
    try {
      await sendFollowUpEmail(lead);
      markFollowUpSent(lead.email);
    } catch (err) {
      // Non-fatal: log and continue to next lead
      console.error(`[followUpJob] Email failed for ${lead.email}:`, err.message);
    }

    // Small delay between sends to avoid Resend rate limits
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`[followUpJob] Done. Processed ${eligible.length} lead(s).`);
}

// ─── export ───────────────────────────────────────────────────────────────────

/**
 * Starts the follow-up cron job.
 * Call once at server boot in server.js:
 *
 *   const { startFollowUpJob } = require("./services/followUpJob");
 *   startFollowUpJob();
 */
function startFollowUpJob() {
  // Run once immediately at boot (catches any leads from overnight)
  runFollowUpCheck().catch(e => console.error("[followUpJob] Initial check failed:", e.message));

  // Then run every hour
  const interval = setInterval(() => {
    runFollowUpCheck().catch(e => console.error("[followUpJob] Scheduled check failed:", e.message));
  }, CHECK_INTERVAL_MS);

  // Allow Node to exit cleanly if nothing else is keeping it alive
  if (interval.unref) interval.unref();

  console.log("[followUpJob] Started — checking every 60 minutes for unconverted leads.");
}

module.exports = { startFollowUpJob };
