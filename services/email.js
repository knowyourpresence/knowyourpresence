// services/email.js
// Sends two emails per successful purchase, using Resend (resend.com) -
// their free tier covers 3,000 emails/month, which is plenty to start.
// Sign up at resend.com, verify a sending domain (or use their test domain
// while developing), and put your API key in .env as RESEND_API_KEY.

const axios = require("axios");

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = process.env.EMAIL_FROM || "reports@knowyourpresence.com";
const OWNER_EMAIL = process.env.OWNER_EMAIL; // your own inbox, set in .env

// Escapes HTML special characters in user-controlled input (like businessName)
// before it goes into an HTML email template. Without this, a business name
// containing < > & etc. could break the email's layout or inject unintended
// HTML/links into an email you or your customer receives.
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set - skipping email send (dev mode).");
    console.log(`[would send] To: ${to} | Subject: ${subject}`);
    return { skipped: true };
  }
  try {
    const { data } = await axios.post(
      RESEND_API_URL,
      { from: FROM_ADDRESS, to, subject, html },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
    );
    return data;
  } catch (err) {
    console.error("Email send failed:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * Sends the customer their confirmation + report link.
 * @param {object} order - { email, businessName, id }
 * @param {string} reportUrl - link to the generated report
 */
async function sendCustomerConfirmation(order, reportUrl, toolkitUrl, webReportUrl) {
  const safeName = escapeHtml(order.businessName);
  const webBtn = webReportUrl
    ? `<tr><td align="center" style="padding-bottom:10px;">
        <a href="${webReportUrl}" style="display:inline-block;background:#1f6b45;color:#ffffff;font-family:Inter,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:.3px;">
          View Interactive Report →
        </a>
       </td></tr>`
    : "";
  const pdfBtn = reportUrl
    ? `<tr><td align="center" style="padding-bottom:24px;">
        <a href="${reportUrl}" style="display:inline-block;background:transparent;color:#1f6b45;font-family:Inter,Helvetica,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:9px 24px;border-radius:8px;border:1.5px solid #1f6b45;">
          ↓ Download PDF Report
        </a>
       </td></tr>`
    : "";

  return sendEmail({
    to: order.email,
    subject: `Your Know Your Presence report for ${order.businessName} is ready`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Your KYP Report</title></head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:Inter,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:#152030;border-radius:10px 10px 0 0;padding:22px 32px;text-align:left;">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;">KNOW YOUR PRESENCE</span>
        <span style="color:#374151;margin:0 8px;">/</span>
        <span style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#64748b;">DECISION-READY READOUT</span>
      </td></tr>

      <!-- SCORE HERO -->
      <tr><td style="background:#1a2535;padding:32px 32px 28px;text-align:center;">
        <div style="font-family:Georgia,serif;font-size:40px;font-weight:700;color:#ffffff;line-height:1;margin-bottom:6px;">Your Report Is Ready</div>
        <div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:#4ade80;margin-bottom:20px;">${safeName}</div>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="background:#0f2d1e;border:1.5px solid #1f6b45;border-radius:8px;padding:14px 24px;text-align:center;">
              <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#4ade80;margin-bottom:6px;">PRESENCE SCORE</div>
              <div style="font-family:Georgia,serif;font-size:48px;font-weight:700;color:#ffffff;line-height:1;">75</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">/ 100 · Grade B+</div>
            </td>
            <td style="width:20px;"></td>
            <td style="vertical-align:middle;">
              <table cellpadding="0" cellspacing="0">
                <tr><td style="background:#0f2d1e;border:1px solid rgba(74,222,128,.2);border-radius:6px;padding:10px 16px;margin-bottom:6px;display:block;margin-bottom:6px;">
                  <div style="font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748b;">POTENTIAL</div>
                  <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#4ade80;">91/100</div>
                  <div style="font-size:10px;color:#94a3b8;">+16 points available</div>
                </td></tr>
                <tr><td style="height:8px;"></td></tr>
                <tr><td style="background:#0f2d1e;border:1px solid rgba(74,222,128,.2);border-radius:6px;padding:10px 16px;">
                  <div style="font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748b;">OPEN SIGNALS</div>
                  <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#d4a843;">2</div>
                  <div style="font-size:10px;color:#94a3b8;">Reviews awaiting reply</div>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- BODY -->
      <tr><td style="background:#ffffff;padding:32px 32px 24px;">
        <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 16px;">
          Your full <strong>Business Presence Report</strong> for <strong>${safeName}</strong> is ready. It covers your Google Business health, social media pulse, website audit, reputation findings, competitor intelligence, and a custom 90-day action plan.
        </p>
        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 28px;">
          The interactive report lets you navigate by section, toggle dark mode, and share directly. The PDF is available to download and print.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${webBtn}
          ${pdfBtn}
        </table>
        <hr style="border:none;border-top:1px solid #e5e2da;margin:24px 0;"/>
        <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;"><strong style="color:#374151;">Order reference:</strong> ${escapeHtml(order.id || "")}</p>
        ${toolkitUrl ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 6px;"><strong style="color:#374151;">Toolkit ZIP:</strong> <a href="${toolkitUrl}" style="color:#1f6b45;">Download 10 ready-to-use files</a></p>` : ""}
        <p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">Questions? Reply to this email or contact <a href="mailto:support@knowyourpresence.com" style="color:#1f6b45;">support@knowyourpresence.com</a></p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#f0ede6;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center;border-top:1px solid #e5e2da;">
        <p style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9ca3af;margin:0 0 4px;">Know Your Presence</p>
        <p style="font-size:11px;color:#9ca3af;margin:0;">Decision-ready visibility for independent local businesses · knowyourpresence.com</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`,
  });
}

/**
 * Notifies the business owner (you) of a new sale.
 * @param {object} order - { email, businessName, amount, currency, countryCode, id }
 */
async function sendOwnerNotification(order) {
  if (!OWNER_EMAIL) {
    console.warn("OWNER_EMAIL not set - skipping owner notification.");
    return { skipped: true };
  }
  const safeName = escapeHtml(order.businessName);
  return sendEmail({
    to: OWNER_EMAIL,
    subject: `New sale: ${order.businessName} (${order.currency} ${order.amount})`,
    html: `
      <p><strong>New sale!</strong></p>
      <ul>
        <li>Business scanned: ${safeName}</li>
        <li>Customer email: ${escapeHtml(order.email)}</li>
        <li>Amount: ${escapeHtml(order.currency)} ${order.amount}</li>
        <li>Country: ${escapeHtml(order.countryCode)}</li>
        <li>Order ID: ${escapeHtml(order.id)}</li>
      </ul>
    `,
  });
}

module.exports = { sendCustomerConfirmation, sendOwnerNotification };
