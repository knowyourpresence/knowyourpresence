// services/abandonedCheckoutEmail.js
// Sends a 1-hour abandoned checkout recovery email.
// Called by abandonedCheckoutJob.js for people who started checkout but didn't pay.

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

async function sendAbandonedCheckoutEmail(lead) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[abandoned] RESEND_API_KEY not set — skipping.");
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
  <title>You left something behind</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:Inter,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

    <!-- HEADER -->
    <tr><td style="background:#152030;border-radius:10px 10px 0 0;padding:22px 32px;">
      <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;">KNOW YOUR PRESENCE</span>
      <span style="color:#374151;margin:0 8px;">/</span>
      <span style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#64748b;">YOU LEFT SOMETHING BEHIND</span>
    </td></tr>

    <!-- HERO -->
    <tr><td style="background:#1a2535;padding:32px 32px 28px;text-align:center;">
      <div style="font-size:13px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Your report is ready to generate</div>
      <div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:#ffffff;line-height:1.2;margin-bottom:8px;">
        Did something go wrong<br>at checkout?
      </div>
      <div style="font-size:14px;color:#94a3b8;margin-top:12px;line-height:1.6;">
        You were one step away from your full<br>
        <strong style="color:#fff;">${safeName}</strong> Digital Presence Report.
      </div>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:#ffffff;padding:32px 32px 8px;">

      <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 20px;">
        Hey — you started the checkout for your <strong>${safeName}</strong> report but didn't complete it.
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.75;margin:0 0 24px;">
        Your scan data is saved. Click below and you'll be back at checkout in seconds — no need to re-scan.
      </p>

      <!-- Urgency box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:18px 20px;">
            <div style="font-size:13px;font-weight:700;color:#c2410c;margin-bottom:6px;">⏰ Your scan data expires in 24 hours</div>
            <div style="font-size:12px;color:#6b7280;line-height:1.6;">
              After that you'll need to run a new free scan. Complete your report now while your data is fresh.
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA button -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td align="center">
            <a href="${checkoutUrl}"
               style="display:inline-block;background:#1f6b45;color:#ffffff;font-family:Inter,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:.3px;">
              Complete My Report — $129 →
            </a>
          </td>
        </tr>
        <tr><td style="height:10px;"></td></tr>
        <tr>
          <td align="center" style="font-size:11px;color:#9ca3af;">
            One-time payment · No subscription · Instant delivery
          </td>
        </tr>
      </table>

      <!-- What's inside -->
      <p style="font-size:13px;font-weight:700;color:#111827;margin:0 0 12px;">What's waiting for you:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        ${[
          ["📊", "Full Digital Presence Score with breakdown"],
          ["🏁", "Competitor comparison — see exactly where they beat you"],
          ["⭐", "Review intelligence + reputation fix plan"],
          ["🎯", "30-day personalised action roadmap"],
          ["📄", "PDF report + toolkit ZIP (10 templates)"],
          ["✦",  "6 AI-written insight modules for your specific business"],
        ].map(([icon, desc]) => `
        <tr>
          <td style="padding:6px 10px 6px 0;vertical-align:top;width:28px;font-size:16px;">${icon}</td>
          <td style="padding:6px 0;vertical-align:top;border-bottom:1px solid #f3f4f6;">
            <div style="font-size:13px;color:#374151;">${escapeHtml(desc)}</div>
          </td>
        </tr>`).join("")}
      </table>

      <p style="font-size:13px;color:#9ca3af;line-height:1.7;margin:0 0 8px;">
        If you had a payment issue or any questions, reply to this email — we're happy to help.
      </p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">
        <a href="mailto:support@knowyourpresence.com" style="color:#1f6b45;">support@knowyourpresence.com</a>
      </p>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#f0ede6;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center;border-top:1px solid #e5e2da;">
      <p style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9ca3af;margin:0 0 4px;">Know Your Presence</p>
      <p style="font-size:11px;color:#9ca3af;margin:0;">knowyourpresence.com</p>
      <p style="font-size:10px;color:#d1d5db;margin:8px 0 0;">
        You received this because you started a checkout at knowyourpresence.com.
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
        subject: `Did something go wrong? Your ${lead.businessName || "business"} report is still waiting`,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`[abandoned] Sent to ${lead.email} — id: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`[abandoned] Failed for ${lead.email}:`, err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendAbandonedCheckoutEmail };
