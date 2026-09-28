// services/email.js
// Sends the KYP confirmation email with the PDF report attached.
// Uses Resend API — set RESEND_API_KEY in Render environment variables.

const { Resend } = require("resend");
const fs = require("fs");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * sendReportEmail
 * @param {object} opts
 * @param {string} opts.to            - Customer email address
 * @param {string} opts.businessName  - e.g. "Intelligentsia Coffee"
 * @param {string} opts.city          - e.g. "Chicago"
 * @param {string} opts.score         - e.g. "74"
 * @param {string} opts.grade         - e.g. "B"
 * @param {string} opts.reportId      - e.g. "KYP-024E3760F584"
 * @param {string} opts.pdfPath       - Absolute local path to the generated PDF file
 */
async function sendReportEmail({ to, businessName, city, score, grade, reportId, pdfPath }) {
  // Read PDF and encode as base64 for attachment
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");
  const fileName  = `KYP_Report_${businessName.replace(/\s+/g, "_")}_${reportId}.pdf`;

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
            Your full Presence Report for <strong>${businessName}</strong> is attached to this email as a PDF.
            It includes your score breakdown, ranked opportunities, AI visibility signals, competitor comparison,
            and a 90-day roadmap — everything in one place.
          </p>
          <p style="font-size:14px;color:#6b7280;line-height:1.65;margin:0 0 20px;">
            Open the attachment to read the full report. We recommend starting with <strong>Section 09 — Start Here</strong>
            for the seven actions that move the needle fastest.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#152030;border-radius:6px;">
            <a href="https://knowyourpresence.com" style="display:block;padding:12px 28px;font-size:13px;font-weight:600;color:#fff;text-decoration:none;letter-spacing:.3px;">
              Visit Know Your Presence →
            </a>
          </td></tr></table>
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
</html>
    `,
    attachments: [
      {
        filename: fileName,
        content:  pdfBase64,
      },
    ],
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  console.log(`Report email sent to ${to} — id: ${data.id}`);
  return data;
}

module.exports = { sendReportEmail };
