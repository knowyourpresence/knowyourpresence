// services/abandonedCheckoutJob.js
// Runs every 30 minutes. Finds leads who started checkout but never paid,
// and sends a recovery email after 1 hour.
//
// A lead is "abandoned" when:
//   - checkoutStartedAt is set (they hit /api/checkout/create-session)
//   - converted is false (no payment webhook received)
//   - abandonedEmailSent is not true (we haven't already emailed them)
//   - at least 60 minutes have passed since checkoutStartedAt

"use strict";

const { readLeadsRaw, writeLeadsRaw } = require("./leads");
const { sendAbandonedCheckoutEmail } = require("./abandonedCheckoutEmail");

const JOB_INTERVAL_MS  = 30 * 60 * 1000; // check every 30 minutes
const ABANDON_DELAY_MS = 60 * 60 * 1000; // send after 1 hour

async function runAbandonedCheckoutJob() {
  console.log("[abandonedCheckout] Running check…");
  const leads = readLeadsRaw();
  const now = Date.now();
  let sent = 0;

  for (const lead of leads) {
    if (
      lead.checkoutStartedAt &&
      !lead.converted &&
      !lead.abandonedEmailSent &&
      now - new Date(lead.checkoutStartedAt).getTime() >= ABANDON_DELAY_MS
    ) {
      try {
        await sendAbandonedCheckoutEmail(lead);
        lead.abandonedEmailSent = true;
        lead.abandonedEmailSentAt = new Date().toISOString();
        sent++;
      } catch (err) {
        console.error(`[abandonedCheckout] Failed to email ${lead.email}:`, err.message);
      }
    }
  }

  if (sent > 0) {
    writeLeadsRaw(leads);
    console.log(`[abandonedCheckout] Sent ${sent} recovery email(s).`);
  } else {
    console.log("[abandonedCheckout] No abandoned checkouts to email.");
  }
}

function startAbandonedCheckoutJob() {
  // Run once at startup (catches anything that piled up if server was restarted)
  runAbandonedCheckoutJob().catch((err) =>
    console.error("[abandonedCheckout] Startup run failed:", err.message)
  );
  // Then run on a schedule
  setInterval(() => {
    runAbandonedCheckoutJob().catch((err) =>
      console.error("[abandonedCheckout] Scheduled run failed:", err.message)
    );
  }, JOB_INTERVAL_MS);
  console.log("[abandonedCheckout] Job scheduled — checks every 30 minutes.");
}

module.exports = { startAbandonedCheckoutJob };
