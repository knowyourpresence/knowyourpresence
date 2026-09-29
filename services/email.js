// services/email.js
// Sends customer report email + owner sale notification.
// Uses Resend API — set RESEND_API_KEY in Render environment variables.

const { Resend } = require("resend");
const fs = require("fs");

const resend = new Resend(process.env.RESEND_API_KEY);

const OWNER_EMAIL = process.env.OWNER_EMAIL || "support@knowyourpresence.com";

// ── 1. Customer email with PDF attached ───────────────────────────────────────
async function sendReportEmail({ to, businessName, city, score, grade, reportId, pdfPath, toolkitUrl }) {
  // Attach PDF only if the file actually exists — if PDF generation failed on
  // the server, we still send the email with a link to the web report rather
  // than crashing here and sending nothing at all.
  let attachments = [];
  const hasPdf = pdfPath && fs.existsSync(pdfPath);
  if (hasPdf) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString("base64");
    const fileName  = `KYP_Report_${businessName.replace(/\s+/g, "_")}_${reportId}.pdf`;
    attachments = [{ filename: fileName, content: pdfBase64 }];
  } else {
    console.warn(`sendReportEmail: PDF not found at "${pdfPath}" — sending email without attachment.`);
  }

  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://knowyourpresence.com";
  const webReportUrl = `${PUBLIC_BASE_URL}/api/report/${reportId}/view`;

  const { data, error } = await resend.emails.send({
    from:    "Know Your Presence <reports@knowyourpresence.com>",
    to:      [to],
    subject: `Your Presence Report is ready — ${businessName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e2da;">

        <!-- Header -->
        <tr><td style="background:#152030;padding:24px 36px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;margin-bottom:4px;">Know Your Presence</div>
          <div style="font-size:20px;font-weight:700;color:#fff;">Your report is ready.</div>
        </td></tr>

        <!-- Score row -->
        <tr><td style="padding:28px 36px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:8px;border:1px solid #e5e2da;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;border-right:1px solid #e5e2da;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Business</div>
                <div style="font-size:16px;font-weight:700;color:#1a2332;">${businessName}</div>
                <div style="font-size:12px;color:#6b7280;">${city}</div>
              </td>
              <td style="padding:16px 20px;border-right:1px solid #e5e2da;text-align:center;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Presence Score</div>
                <div style="font-size:36px;font-weight:700;color:#1a2332;line-height:1;">${score}</div>
                <div style="font-size:12px;color:#6b7280;">/ 100</div>
              </td>
              <td style="padding:16px 20px;text-align:center;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Grade</div>
                <div style="font-size:36px;font-weight:700;color:#1f6b45;line-height:1;">${grade}</div>
                <div style="font-size:11px;color:#6b7280;">${reportId}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 36px;">
          <p style="font-size:14px;color:#1a2332;line-height:1.65;margin:0 0 14px;">
            Your full Presence Report for <strong>${businessName}</strong> is ready.
            It includes your score breakdown, ranked opportunities, AI visibility signals, competitor comparison,
            and a 90-day roadmap — everything in one place.
          </p>
          <p style="font-size:14px;color:#6b7280;line-height:1.65;margin:0 0 20px;">
            ${hasPdf
              ? `Your PDF report is attached. We recommend starting with <strong>Section 09 — Start Here</strong> for the seven actions that move the needle fastest.`
              : `Your full interactive report is live and ready to view right now — click below. We recommend starting with <strong>Section 09 — Start Here</strong> for the seven actions that move the needle fastest.`
            }
          </p>

          <!-- Primary CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr>
            <td style="background:#152030;border-radius:6px;padding-right:10px;">
              <a href="${webReportUrl}" style="display:block;padding:14px 32px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:.3px;">
                View Your Full Report →
              </a>
            </td>
            ${toolkitUrl ? `<td style="background:#1f6b45;border-radius:6px;">
              <a href="${toolkitUrl}" style="display:block;padding:14px 28px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:.3px;">
                Download Toolkit →
              </a>
            </td>` : ""}
          </tr></table>

          ${!hasPdf ? `
          <!-- PDF tip -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr><td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#166534;line-height:1.6;">
                <strong>📄 Need a PDF?</strong> Open your report and click <strong>"Download PDF"</strong> — it saves instantly from your browser. Works on any device.
              </p>
            </td></tr>
          </table>` : ""}
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 36px;"><div style="border-top:1px solid #e5e2da;"></div></td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px 28px;">
          <p style="font-size:11px;color:#9ca3af;line-height:1.6;margin:0;">
            Questions? Reply to this email or contact <a href="mailto:support@knowyourpresence.com" style="color:#1f6b45;">support@knowyourpresence.com</a><br/>
            Know Your Presence · Decision-ready visibility for independent local businesses.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    attachments,
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  console.log(`Report email sent to ${to} — id: ${data.id}`);
  return data;
}

// ── 2. Owner sale notification ────────────────────────────────────────────────
async function sendOwnerNotification({ customerEmail, businessName, city, score, grade, reportId, amount }) {
  const { data, error } = await resend.emails.send({
    from:    "Know Your Presence <reports@knowyourpresence.com>",
    to:      [OWNER_EMAIL],
    subject: `💰 New sale — ${businessName} (${grade} · ${score}/100)`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f2ec;font-family:'Inter',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e2da;">

        <!-- Header -->
        <tr><td style="background:#152030;padding:20px 32px;">
          <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;margin-bottom:4px;">Know Your Presence — Owner Alert</div>
          <div style="font-size:18px;font-weight:700;color:#fff;">New report sold 🎉</div>
        </td></tr>

        <!-- Details -->
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ec;border-radius:8px;border:1px solid #e5e2da;margin-bottom:20px;">
            <tr>
              <td style="padding:14px 18px;border-right:1px solid #e5e2da;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Business</div>
                <div style="font-size:15px;font-weight:700;color:#1a2332;">${businessName}</div>
                <div style="font-size:12px;color:#6b7280;">${city || "—"}</div>
              </td>
              <td style="padding:14px 18px;border-right:1px solid #e5e2da;text-align:center;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Score</div>
                <div style="font-size:32px;font-weight:700;color:#1a2332;line-height:1;">${score}</div>
                <div style="font-size:11px;color:#6b7280;">/ 100</div>
              </td>
              <td style="padding:14px 18px;border-right:1px solid #e5e2da;text-align:center;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Grade</div>
                <div style="font-size:32px;font-weight:700;color:#1f6b45;line-height:1;">${grade}</div>
              </td>
              <td style="padding:14px 18px;text-align:center;">
                <div style="font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">Amount</div>
                <div style="font-size:20px;font-weight:700;color:#1f6b45;line-height:1;">${amount || "—"}</div>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;"><strong style="color:#1a2332;">Customer:</strong> ${customerEmail}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;"><strong style="color:#1a2332;">Report ID:</strong> ${reportId}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;"><strong style="color:#1a2332;">Time:</strong> ${new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC</td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e2da;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">PDF report sent to customer automatically. Check Resend dashboard for delivery status.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("Owner notification error:", error);
    // Don't throw — owner email failure shouldn't break customer flow
  } else {
    console.log(`Owner notification sent — id: ${data.id}`);
  }
}

// ── 3. Customer confirmation (alias used by server.js) ────────────────────────
async function sendCustomerConfirmation(order, reportUrl, toolkitUrl) {
  const sc = order.scores || {};
  const rep  = Math.round(sc.reputation ?? sc.rep ?? 60);
  const gb   = Math.round(sc.google    ?? 60);
  const web  = Math.round(sc.website   ?? 60);
  const soc  = Math.round(sc.social    ?? 60);
  const overall = Math.round((rep*0.20)+(gb*0.35)+(web*0.20)+(soc*0.25));
  const grade = overall>=90?"A+":overall>=80?"A":overall>=70?"B":overall>=60?"C":"D";

  return sendReportEmail({
    to:           order.customerEmail || order.email,
    businessName: order.businessName,
    city:         order.city,
    score:        overall,
    grade,
    reportId:     order.reportId,
    pdfPath:      order.pdfPath,
    toolkitUrl,
  });
}

module.exports = { sendReportEmail, sendOwnerNotification, sendCustomerConfirmation };
