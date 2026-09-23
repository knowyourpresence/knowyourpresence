// services/rateLimit.js
// Simple in-memory IP rate limiter for the free scan endpoint.
//
// Why this exists: each free scan costs real money in Google Places API
// calls (~4 cents at the Enterprise+Atmosphere tier, since we request
// reviews and photos). Without a limit, a single bot hammering /api/scan
// could run up a serious bill in minutes.
//
// LIMITATION: this stores counts in memory, so it resets whenever the
// server restarts, and it does NOT work correctly across multiple server
// instances (each would keep its own separate count). For a single small
// server this is fine. If you scale to multiple instances, move this to
// Redis or your database.

const scanRecords = new Map(); // ip -> { count, firstSeen }

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SCANS_PER_WINDOW = 3; // 3 free scans per IP per day
// The email gate is the real friction — IP limit just prevents bot abuse.
// 3/day is enough to let someone scan themselves, a competitor, and a sample
// without being blocked by shared IPs (offices, cafes, mobile networks).

/**
 * Express middleware. Rejects with 429 if this IP has already used its
 * free scan within the current window.
 */
function scanRateLimit(req, res, next) {
  // Respect proxy headers - hosts like Render/Railway put the real client
  // IP in x-forwarded-for, since req.ip would otherwise be the proxy's IP.
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (forwarded ? forwarded.split(",")[0] : req.ip || "").trim();

  if (!ip) return next(); // can't identify - fail open rather than block real users

  const now = Date.now();
  const record = scanRecords.get(ip);

  if (!record || now - record.firstSeen > WINDOW_MS) {
    // First scan, or previous window expired - start fresh
    scanRecords.set(ip, { count: 1, firstSeen: now });
    return next();
  }

  if (record.count >= MAX_SCANS_PER_WINDOW) {
    const hoursLeft = Math.ceil((WINDOW_MS - (now - record.firstSeen)) / (60 * 60 * 1000));
    return res.status(429).json({
      error: "rate_limited",
      message: `You've used your 3 free scans for today. Try again in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}, or get your full report now.`,
    });
  }

  record.count += 1;
  next();
}

// Periodically drop expired entries so the Map doesn't grow forever.
// .unref() lets Node exit naturally if this timer is the only thing left -
// without it, the process would hang forever on shutdown or in tests.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of scanRecords.entries()) {
    if (now - record.firstSeen > WINDOW_MS) scanRecords.delete(ip);
  }
}, 60 * 60 * 1000); // hourly cleanup
cleanupTimer.unref();

module.exports = { scanRateLimit };
