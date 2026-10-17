// scripts/test-pdf.js
// Regenerates a report PDF without any payment or email.
//   node scripts/test-pdf.js            → sample data (no AI insights, so shorter)
//   node scripts/test-pdf.js KYP-XXXX   → a real past order's saved data (full report)
require("dotenv").config();
const { generateReportPdf, makeReportId } = require("../services/reportPdf");
const { getOrderByReportId } = require("../services/orders");

function sampleReportData() {
  return {
    reportId: makeReportId(),
    businessName: "Test Coffee Co",
    businessType: "Coffee shop",
    city: "Chennai",
    country: "IN",
    reportDate: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
    waNumber: "",
    scores: { google: 80, social: 60, website: 55, reputation: 85 },
    scanDetails: { businessName: "Test Coffee Co", city: "Chennai", websiteUrl: "https://example.com", googleRating: 4.6, googleReviewCount: 120 },
    competitor: null, apify: null, urlscan: null, metaAds: null, aiInsights: null,
  };
}

(async () => {
  const reportId = process.argv[2];
  if (reportId === "list") {
    const { getAllOrders } = require("../services/orders");
    const withAi = getAllOrders().filter(o => o.reportData && o.reportData.aiInsights);
    console.log("Orders with AI insights:", withAi.map(o => o.reportId).join(", ") || "none");
    process.exit(0);
  }
  let reportData;
  if (reportId) {
    const order = getOrderByReportId(reportId);
    if (!order || !order.reportData) {
      console.error(`No saved report data for ${reportId}`);
      process.exit(1);
    }
    reportData = { ...order.reportData, reportId };
    console.log("Using saved data for", reportId, "— AI insights:", reportData.aiInsights ? "yes" : "no");
  } else {
    reportData = sampleReportData();
  }

  try {
    const pdfPath = await generateReportPdf(reportData);
    console.log("TEST PDF OK:", pdfPath);
    process.exit(0);
  } catch (err) {
    console.error("TEST PDF FAILED:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
