// scripts/test-pdf.js
// Generates one sample report PDF without any payment or email.
// Run on the VPS from /home/app:  node scripts/test-pdf.js
require("dotenv").config();
const { generateReportPdf, makeReportId } = require("../services/reportPdf");

(async () => {
  const reportId = makeReportId();
  const reportData = {
    reportId,
    businessName: "Test Coffee Co",
    businessType: "Coffee shop",
    city: "Chennai",
    country: "IN",
    reportDate: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
    waNumber: "",
    scores: { google: 80, social: 60, website: 55, reputation: 85 },
    scanDetails: {
      businessName: "Test Coffee Co",
      city: "Chennai",
      websiteUrl: "https://example.com",
      googleRating: 4.6,
      googleReviewCount: 120,
    },
    competitor: null,
    apify: null,
    urlscan: null,
    metaAds: null,
    aiInsights: null,
  };

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
