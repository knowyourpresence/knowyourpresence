// services/rateLimit.js
// Two-layer protection for the free scan endpoint:
//
//  Layer 1 — EMAIL (primary, persistent)
//    Each email address gets exactly 1 free scan, forever.
//    Stored in a JSON file on disk → survives server restarts.
//    Checked AFTER email validation in server.js via hasEmailScanned()
//    and recorded via recordEmailScan().
//
//  Layer 2 — IP (secondary, in-memory, bot abuse only)
//    3 scans per IP per 24 hours, in-memory.
//    Prevents bots hammering the endpoint with throwaway emails.
//    Resets on restart — acceptable since email layer is the real gate.

const fs   = require("fs");
const path = require("path");

// ── Email restriction (persistent file) ───────────────────────────────────────
const SCANNED_EMAILS_FILE = process.env.SCANNED_EMAILS_FILE ||
  path.join(__dirname, "../data/scanned_emails.json");

// Ensure the data directory exists
const dataDir = path.dirname(SCANNED_EMAILS_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Load existing scanned emails from disk into a Set for O(1) lookups.
// If the file doesn't exist or is corrupt, start fresh.
let scannedEmails = new Set();
try {
  if (fs.existsSync(SCANNED_EMAILS_FILE)) {
    const raw = fs.readFileSync(SCANNED_EMAILS_FILE, "utf8");
    const arr = JSON.parse(raw);
    scannedEmails = new Set(arr.map(e => e.toLowerCase().trim()));
    console.log(`[rateLimit] Loaded ${scannedEmails.size} scanned emails from disk.`);
  }
} catch (e) {
  console.error("[rateLimit] Could not load scanned_emails.json — starting fresh:", e.message);
}

function _saveEmails() {
  try {
    fs.writeFileSync(SCANNED_EMAILS_FILE, JSON.stringify([...scannedEmails]), "utf8");
  } catch (e) {
    console.error("[rateLimit] Could not save scanned_emails.json:", e.message);
  }
}

/**
 * Returns true if this email has already used their one free scan.
 * Call this AFTER validating the email format.
 */
function hasEmailScanned(email) {
  return scannedEmails.has(email.toLowerCase().trim());
}

/**
 * Mark an email as having used their free scan.
 * Call this just before running the scan (not after — we want to record
 * the attempt even if the scan itself fails mid-way).
 */
function recordEmailScan(email) {
  scannedEmails.add(email.toLowerCase().trim());
  _saveEmails();
}

// ── IP restriction (in-memory, bot layer) ─────────────────────────────────────
const scanRecords = new Map(); // ip -> { count, firstSeen }

const WINDOW_MS          = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SCANS_PER_IP   = 5; // generous — real users share IPs (offices, cafes)
// Email layer is the real gate; IP layer just stops bot floods.

/**
 * Express middleware. Rejects with 429 if this IP has exceeded its daily limit.
 */
function scanRateLimit(req, res, next) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (forwarded ? forwarded.split(",")[0] : req.ip || "").trim();

  if (!ip) return next(); // can't identify — fail open

  const now    = Date.now();
  const record = scanRecords.get(ip);

  if (!record || now - record.firstSeen > WINDOW_MS) {
    scanRecords.set(ip, { count: 1, firstSeen: now });
    return next();
  }

  if (record.count >= MAX_SCANS_PER_IP) {
    const hoursLeft = Math.ceil((WINDOW_MS - (now - record.firstSeen)) / (60 * 60 * 1000));
    return res.status(429).json({
      error: "rate_limited",
      message: `Too many scan attempts from your network. Try again in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}.`,
    });
  }

  record.count += 1;
  next();
}

// Hourly cleanup so the IP Map doesn't grow forever
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of scanRecords.entries()) {
    if (now - record.firstSeen > WINDOW_MS) scanRecords.delete(ip);
  }
}, 60 * 60 * 1000);
cleanupTimer.unref();

module.exports = { scanRateLimit, hasEmailScanned, recordEmailScan };
