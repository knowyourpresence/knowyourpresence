// services/facebookAds.js
// Free Facebook Ads Library scraper — no API key, no Apify credits.
// Facebook Ads Library is fully public at facebook.com/ads/library
// We fetch the page directly and parse the ad data from the JSON embedded in the HTML.

const axios = require("axios");

async function scrapeFacebookAdsLibrary(businessName, countryCode) {
  if (!businessName) return null;

  const country = countryCode || "US";
  const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(businessName)}&search_type=keyword_unordered`;

  try {
    const { data: html } = await axios.get(searchUrl, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    // Extract ad count from page
    const adCountMatch = html.match(/"total_count":(\d+)/);
    const totalAds = adCountMatch ? parseInt(adCountMatch[1]) : null;

    // Extract ad data from embedded JSON
    const adDataMatch = html.match(/"ads":\s*(\[.*?\])/s);
    let ads = [];

    if (adDataMatch) {
      try {
        ads = JSON.parse(adDataMatch[1]).slice(0, 6);
      } catch (e) {
        // JSON parse failed — use count only
      }
    }

    // Check if any ads found via page content
    const hasAds = html.includes('"ad_archive_id"') ||
                   html.includes('"adArchiveID"') ||
                   totalAds > 0;

    const isRunningAds = hasAds || html.includes("active_status=active");

    // Try to extract ad snippets from HTML
    const adTexts = [];
    const adTextMatches = html.match(/"body":\{"__html":"([^"]+)"/g) || [];
    adTextMatches.slice(0, 3).forEach(match => {
      const text = match.replace(/"body":\{"__html":"/, '').replace(/"$/, '')
        .replace(/\\u003c[^\\]*\\u003e/g, '') // strip HTML tags
        .replace(/\\n/g, ' ')
        .replace(/\\"/g, '"')
        .slice(0, 200);
      if (text.length > 10) adTexts.push(text);
    });

    return {
      checked: true,
      isRunningAds,
      totalActive: totalAds || (isRunningAds ? 1 : 0),
      adSnippets: adTexts,
      searchUrl,
      source: "facebook_ads_library_direct",
    };

  } catch (err) {
    // Facebook blocked us — return basic info
    console.error("Facebook Ads direct scrape failed:", err.message);

    // Fallback: try the public API endpoint
    try {
      const apiUrl = `https://www.facebook.com/ads/library/async/search_typeahead/?q=${encodeURIComponent(businessName)}&session_id=1&country=${country}&ad_type=ALL`;
      const { data } = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const hasResults = data && (data.includes(businessName) || data.length > 100);
      return {
        checked: true,
        isRunningAds: hasResults,
        totalActive: hasResults ? 1 : 0,
        adSnippets: [],
        source: "facebook_ads_typeahead",
      };
    } catch (e) {
      return { checked: false, error: err.message };
    }
  }
}

module.exports = { scrapeFacebookAdsLibrary };
