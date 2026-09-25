// services/seoChecker.js
// Free SEO checker — no API needed, no credits used.
// Fetches the website homepage directly using axios and checks:
// title, meta description, h1, schema markup, alt tags, robots, canonical
// Replaces apify/website-content-crawler entirely.

const axios = require("axios");

async function checkWebsiteSeo(websiteUrl) {
  if (!websiteUrl) return null;

  // Make sure URL has protocol
  const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

  try {
    const { data: html } = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KYPBot/1.0; +https://knowyourpresence.com)",
        "Accept": "text/html",
      },
      maxRedirects: 5,
    });

    // --- TITLE ---
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const titleScore = title
      ? title.length >= 30 && title.length <= 65 ? 25 : 12
      : 0;

    // --- META DESCRIPTION ---
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : null;
    const descScore = description
      ? description.length >= 100 && description.length <= 160 ? 25 : 12
      : 0;

    // --- H1 ---
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim() : null;
    const h1Score = h1 ? 15 : 0;

    // --- SCHEMA MARKUP ---
    const hasSchema = html.includes("application/ld+json") || html.includes("schema.org");
    const schemaScore = hasSchema ? 15 : 0;

    // --- IMAGE ALT TAGS ---
    const allImgs = (html.match(/<img[^>]*/gi) || []);
    const missingAlt = allImgs.filter(
      img => !img.includes("alt=") || /alt=["']\s*["']/.test(img)
    ).length;
    const altCoverage = allImgs.length > 0
      ? Math.round(((allImgs.length - missingAlt) / allImgs.length) * 100)
      : 100;
    const altScore = Math.round((altCoverage / 100) * 10);

    // --- CANONICAL ---
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    const canonicalScore = hasCanonical ? 5 : 0;

    // --- ROBOTS META ---
    const hasNoIndex = /<meta[^>]+content=["'][^"']*noindex[^"']*["']/i.test(html);

    // --- VIEWPORT ---
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const viewportScore = hasViewport ? 5 : 0;

    const totalScore = Math.min(100,
      titleScore + descScore + h1Score + schemaScore + altScore + canonicalScore + viewportScore
    );

    return {
      checked: true,
      score: totalScore,
      title,
      description,
      h1,
      hasSchema,
      hasCanonical,
      hasNoIndex,
      hasViewport,
      altCoverage,
      totalImages: allImgs.length,
      missingAlt,
      issues: [
        !title && "Missing page title",
        title && title.length < 30 && "Title too short (under 30 chars)",
        title && title.length > 65 && "Title too long (over 65 chars)",
        !description && "Missing meta description",
        !h1 && "Missing H1 heading",
        !hasSchema && "No Schema.org markup — star ratings won't show in Google",
        !hasCanonical && "No canonical tag",
        hasNoIndex && "⚠️ Page is set to noindex — hidden from Google!",
        missingAlt > 0 && `${missingAlt} image(s) missing alt text`,
      ].filter(Boolean),
    };
  } catch (err) {
    console.error("SEO check failed:", err.message);
    return { checked: false, score: null, error: err.message };
  }
}

module.exports = { checkWebsiteSeo };
