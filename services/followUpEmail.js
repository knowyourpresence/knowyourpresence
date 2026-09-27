// services/followUpEmail.js
// Sends a single upsell follow-up email to free-scan leads who haven't
// converted to a paid report within 24 hours.
// Called exclusively by followUpJob.js — do not call directly from routes.

"use strict";

const axios = require("axios");

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = process.env.EMAIL_FROM || "reports@knowyourpresence.com";

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends the 24-hour follow-up upsell email to an unconverted free-scan lead.
 *
 * @param {object} lead - { email, businessName, countryCode, scannedAt }
 * @returns {Promise}
 */
async function sendFollowUpEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[followUp] RESEND_API_KEY not set — skipping follow-up email.");
    console.log(`[followUp] Would send to: ${lead.email}`);
    return { skipped: true };
  }

  const safeName = escapeHtml(lead.businessName || "your business");
  const checkoutUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL}/#pricing`
    : "https://knowyourpresence.com/#pricing";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Your KYP scan results are waiting</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:Inter,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

    <!-- HEADER -->
    <tr><td style="background:#152030;border-radius:10px 10px 0 0;padding:22px 32px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;">KNOW YOUR PRESENCE</span>
      <span style="color:#374151;margin:0 8px;">/</span>
      <span style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#64748b;">FOLLOW-UP</span>
    </td></tr>

    <!-- HERO -->
    <tr><td style="background:#1a2535;padding:32px 32px 28px;text-align:center;">
      <div style="font-size:13px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Your scan is still on file</div>
      <div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#ffffff;line-height:1.2;margin-bottom:8px;">
        What's holding ${safeName}<br>back online?
      </div>
      <div style="font-size:14px;color:#94a3b8;margin-top:12px;line-height:1.6;">
        You ran a free presence scan yesterday.<br>
        Your full report — with the answers — is one step away.
      </div>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#ffffff;padding:32px 32px 8px;">

      <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 20px;">
        Hey — we noticed you scanned <strong>${safeName}</strong> but didn't grab the full report yet.
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.75;margin:0 0 24px;">
        That's fine. But here's what you're missing right now:
      </p>

      <!-- What's inside list -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        ${[
          ["📊", "Executive Summary", "AI-written overview of your exact digital gaps"],
          ["🏁", "Competitor Landscape", "How you stack up against local rivals"],
          ["⭐", "Review Intelligence", "What your customers are saying — and what to fix"],
          ["🔍", "SEO & Content Ideas", "Keywords and content angles your competitors are missing"],
          ["📱", "Social Media Audit", "Platform-by-platform action recommendations"],
          ["🎯", "30-Day Priority Plan", "A personalised roadmap — start Monday, see results by month-end"],
          ["📄", "PDF Report + Toolkit ZIP", "10 ready-to-use templates and checklists"],
        ].map(([icon, title, desc]) => `
        <tr>
          <td style="padding:8px 12px 8px 0;vertical-align:top;width:28px;font-size:18px;">${icon}</td>
          <td style="padding:8px 0;vertical-align:top;border-bottom:1px solid #f3f4f6;">
            <div style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(title)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(desc)}</div>
          </td>
        </tr>`).join("")}
      </table>

      <!-- Price callout -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:18px 20px;text-align:center;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#16a34a;margin-bottom:6px;">ONE-TIME REPORT</div>
            <div style="font-family:Georgia,serif;font-size:36px;font-weight:700;color:#111827;line-height:1;">$129</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">No subscription · No recurring charges · Yours forever</div>
          </td>
        </tr>
      </table>

      <!-- CTA button -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td align="center">
            <a href="${checkoutUrl}"
               style="display:inline-block;background:#1f6b45;color:#ffffff;font-family:Inter,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:.3px;">
              Get My Full Report →
            </a>
          </td>
        </tr>
        <tr><td style="height:10px;"></td></tr>
        <tr>
          <td align="center" style="font-size:11px;color:#9ca3af;">
            Takes 2 minutes · Instant delivery · Secure checkout via Dodo Payments
          </td>
        </tr>
      </table>

    </td></tr>

    <!-- AI HIGHLIGHT STRIP -->
    <tr><td style="background:#faf5ff;border-top:1px solid #e9d5ff;border-bottom:1px solid #e9d5ff;padding:20px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:36px;vertical-align:top;font-size:22px;padding-top:2px;">✦</td>
          <td style="vertical-align:top;">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px;">Included: 6 AI-Written Insight Modules</div>
            <div style="font-size:12px;color:#6b7280;line-height:1.65;">
              Every paid report now includes six intelligence sections written by Claude AI — specifically for your business, not a generic template.
              No other local business tool gives you this level of personalised analysis at this price.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- BODY CLOSE -->
    <tr><td style="background:#ffffff;padding:24px 32px 28px;">
      <p style="font-size:13px;color:#9ca3af;line-height:1.7;margin:0 0 8px;">
        This is the only follow-up email we'll send — we don't do spam.
        If the timing isn't right, no worries at all.
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">
        Questions? Reply to this email or reach us at
        <a href="mailto:support@knowyourpresence.com" style="color:#1f6b45;">support@knowyourpresence.com</a>
      </p>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#f0ede6;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center;border-top:1px solid #e5e2da;">
      <p style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9ca3af;margin:0 0 4px;">Know Your Presence</p>
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        Decision-ready visibility for independent local businesses · knowyourpresence.com
      </p>
      <p style="font-size:10px;color:#d1d5db;margin:8px 0 0;">
        You received this because you ran a free scan at knowyourpresence.com.
        <a href="${checkoutUrl}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    const { data } = await axios.post(
      RESEND_API_URL,
      {
        from: FROM_ADDRESS,
        to: lead.email,
        subject: `${lead.businessName || "Your business"} — your free scan results are still waiting`,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`[followUp] Sent to ${lead.email} — id: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`[followUp] Failed for ${lead.email}:`, err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendFollowUpEmail };
