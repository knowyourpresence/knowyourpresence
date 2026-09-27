// services/email.js
// Sends two emails per successful purchase, using Resend (resend.com) -
// their free tier covers 3,000 emails/month, which is plenty to start.
// Sign up at resend.com, verify a sending domain (or use their test domain
// while developing), and put your API key in .env as RESEND_API_KEY.

const axios = require("axios");

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = process.env.EMAIL_FROM || "reports@knowyourpresence.com";
const OWNER_EMAIL = process.env.OWNER_EMAIL; // your own inbox, set in .env

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Convert markdown **bold** and newlines to email-safe HTML
function mdToEmailHtml(text) {
  if (!text) return "";
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// Render a bulleted / numbered list from AI text into email-safe <li> items
function listToEmailHtml(text) {
  if (!text) return "";
  const lines = text.split("\n").filter(l => l.trim());
  const items = lines.map(l => {
    const clean = l.replace(/^[\d]+\.\s*/, "").replace(/^[-•*]\s*/, "").trim();
    return `<li style="padding:3px 0;color:#374151;font-size:13px;line-height:1.65">${mdToEmailHtml(clean)}</li>`;
  });
  return `<ul style="margin:0;padding-left:18px">${items.join("")}</ul>`;
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

// ─── AI Insights block for email ─────────────────────────────────────────────
// Returns an HTML string for the 6 AI modules, or empty string if no insights.

function buildAiInsightsHtml(aiInsights) {
  if (!aiInsights) return "";

  const modules = [
    {
      icon: "📊",
      title: "Executive Summary",
      content: aiInsights.narrative,
      type: "prose",
    },
    {
      icon: "🏁",
      title: "Competitor Landscape",
      content: aiInsights.competitor,
      type: "prose",
    },
    {
      icon: "⭐",
      title: "Review Intelligence",
      content: aiInsights.reviewAnalysis,
      type: "prose",
    },
    {
      icon: "🔍",
      title: "SEO & Content Ideas",
      content: aiInsights.seoContent,
      type: "list",
    },
    {
      icon: "📱",
      title: "Social Media Audit",
      content: aiInsights.socialAudit,
      type: "prose",
    },
    {
      icon: "🎯",
      title: "30-Day Priority Plan",
      content: aiInsights.priorityPlan,
      type: "list",
    },
  ];

  const moduleCards = modules.map(({ icon, title, content, type }) => {
    const body = content
      ? (type === "list" ? listToEmailHtml(content) : `<p style="margin:0;font-size:13px;line-height:1.7;color:#374151">${mdToEmailHtml(content)}</p>`)
      : `<p style="margin:0;font-size:13px;color:#9ca3af;font-style:italic">Analysis not available for this report.</p>`;

    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:0;overflow:hidden;">
          <!-- module header -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#f3e8ff;border-bottom:1px solid #e9d5ff;padding:10px 16px;">
                <span style="font-size:16px;vertical-align:middle;">${icon}</span>
                <span style="font-size:12px;font-weight:700;color:#6b21a8;vertical-align:middle;margin-left:8px;text-transform:uppercase;letter-spacing:.6px;">${escapeHtml(title)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;">
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  }).join("");

  return `
  <!-- AI INSIGHTS DIVIDER -->
  <tr><td style="background:#ffffff;padding:0 32px;">
    <hr style="border:none;border-top:1px solid #e5e2da;margin:0;"/>
  </td></tr>

  <!-- AI INSIGHTS SECTION -->
  <tr><td style="background:#ffffff;padding:28px 32px 24px;">

    <!-- section label -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td>
          <span style="display:inline-block;background:#f3e8ff;color:#7c3aed;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 12px;border-radius:99px;border:1px solid #e9d5ff;">✦ New · AI-Written Insights</span>
        </td>
      </tr>
      <tr><td style="height:10px;"></td></tr>
      <tr>
        <td style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#1e1b4b;">
          6 Intelligence Modules — Written by Claude AI
        </td>
      </tr>
      <tr><td style="height:6px;"></td></tr>
      <tr>
        <td style="font-size:13px;color:#6b7280;line-height:1.6;">
          These insights were generated specifically for your business using your live presence data.
          Each module is unique to your audit — not a generic template.
        </td>
      </tr>
    </table>

    <!-- module cards -->
    ${moduleCards}

    <!-- view full report CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td align="center" style="padding:8px 0 0;">
          <span style="font-size:12px;color:#9ca3af;">
            Full formatted insights with visuals are in your interactive report →
          </span>
        </td>
      </tr>
    </table>

  </td></tr>`;
}

// ─── Customer confirmation email ──────────────────────────────────────────────

/**
 * Sends the customer their confirmation + report link.
 * @param {object} order        - { email, businessName, id, scores, grade }
 * @param {string} reportUrl    - PDF download link
 * @param {string} toolkitUrl   - Toolkit ZIP link
 * @param {string} webReportUrl - Hosted interactive report link
 * @param {object} aiInsights   - AI insight modules object (or null)
 */
async function sendCustomerConfirmation(order, reportUrl, toolkitUrl, webReportUrl, aiInsights) {
  const safeName = escapeHtml(order.businessName);

  // Overall score from order (passed from reportData.scores)
  const scores = order.scores || {};
  const overallScore = order.overallScore
    || Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(Object.keys(scores).length, 1))
    || 75;
  const grade = order.grade || (overallScore >= 80 ? "A" : overallScore >= 65 ? "B" : overallScore >= 50 ? "C" : "D");

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

  // Score breakdown mini-table (4 categories)
  const catRows = [
    ["🗺️", "Google Business", scores.google],
    ["📱", "Social Media",    scores.social],
    ["🌐", "Website",         scores.website],
    ["⭐", "Reputation",      scores.reputation],
  ].filter(([, , v]) => v != null).map(([icon, label, v]) => {
    const color = v >= 80 ? "#22c55e" : v >= 60 ? "#f59e0b" : "#ef4444";
    return `<tr>
      <td style="padding:5px 0;font-size:12px;color:#94a3b8;">${icon} ${label}</td>
      <td style="padding:5px 0;text-align:right;font-size:13px;font-weight:700;color:${color};">${v}<span style="font-size:10px;color:#64748b;">/100</span></td>
    </tr>`;
  }).join("");

  const aiInsightsBlock = buildAiInsightsHtml(aiInsights);

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
            <!-- Overall score -->
            <td style="background:#0f2d1e;border:1.5px solid #1f6b45;border-radius:8px;padding:14px 24px;text-align:center;vertical-align:top;">
              <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#4ade80;margin-bottom:6px;">PRESENCE SCORE</div>
              <div style="font-family:Georgia,serif;font-size:48px;font-weight:700;color:#ffffff;line-height:1;">${overallScore}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:4px;">/ 100 · Grade ${escapeHtml(grade)}</div>
            </td>
            <td style="width:16px;"></td>
            <!-- Category breakdown -->
            <td style="background:#0f2d1e;border:1px solid rgba(74,222,128,.2);border-radius:8px;padding:12px 18px;vertical-align:top;">
              <div style="font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">CATEGORY SCORES</div>
              <table cellpadding="0" cellspacing="0" width="150">
                ${catRows}
              </table>
            </td>
          </tr>
        </table>
        ${aiInsights ? `
        <div style="margin-top:18px;display:inline-block;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4);border-radius:99px;padding:5px 16px;">
          <span style="font-size:11px;font-weight:700;color:#c4b5fd;letter-spacing:.5px;">✦ Includes 6 AI-Written Insight Modules</span>
        </div>` : ""}
      </td></tr>

      <!-- BODY INTRO -->
      <tr><td style="background:#ffffff;padding:32px 32px 24px;">
        <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 16px;">
          Your full <strong>Business Presence Report</strong> for <strong>${safeName}</strong> is ready. It covers your Google Business health, social media pulse, website audit, reputation findings, competitor intelligence${aiInsights ? ", 6 AI-written insight modules," : ""} and a custom action plan.
        </p>
        <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 28px;">
          The interactive report lets you navigate by section and share directly. The PDF is available to download and print.
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

      ${aiInsightsBlock}

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

// ─── Owner notification ───────────────────────────────────────────────────────

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
