// services/website.js
// Website health score via Google PageSpeed Insights (free, public API key).

const axios = require("axios");

async function fetchWebsiteHealth(websiteUrl) {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey || !websiteUrl) return mockWebsiteData();

  try {
    const url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
    const { data } = await axios.get(url, {
      params: { url: websiteUrl, key: apiKey, category: "PERFORMANCE", strategy: "MOBILE" },
      timeout: 20000,
    });

    const perfScore = (data.lighthouseResult?.categories?.performance?.score || 0) * 100;
    const isHttps = websiteUrl.startsWith("https://");
    const hasViewportMeta =
      data.lighthouseResult?.audits?.viewport?.score === 1;

    let score = perfScore * 0.7;
    score += isHttps ? 15 : 0;
    score += hasViewportMeta ? 15 : 0;

    return {
      score: Math.round(Math.min(100, score)),
      raw: { perfScore: Math.round(perfScore), isHttps, hasViewportMeta },
    };
  } catch (err) {
    console.error("PageSpeed fetch failed:", err.message);
    return mockWebsiteData();
  }
}

function mockWebsiteData() {
  return { score: 55, raw: { perfScore: 48, isHttps: true, hasViewportMeta: true } };
}

module.exports = { fetchWebsiteHealth };
