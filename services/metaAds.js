// services/metaAds.js
// Meta Ads Library API integration.
//
// The Ads Library is PUBLIC — no OAuth, no business login needed.
// It shows ANY active Facebook/Instagram ad for any page, worldwide.
// This is the same data at https://www.facebook.com/ads/library
//
// What KYP uses it for:
//   1. Check if the scanned business is running any active Facebook/Instagram ads
//   2. Check if their named competitor is running ads (and how many / how long)
//   3. Pull ad creative summaries for the report's "Ad Intelligence" section
//
// This adds a GENUINELY unique section no $129 audit tool currently includes.
// "Your competitor has been running 6 ads for 90+ days. You have none."
// is an immediate, undeniable gap that justifies the report price alone.
//
// SETUP:
//   1. Go to https://developers.facebook.com → create a new App (type: "Other")
//   2. Under "Tools" → "Graph API Explorer" — generate an App Access Token
//      (App ID + App Secret → /oauth/access_token?grant_type=client_credentials)
//   3. Request access to the "Ad Library API" product on your app dashboard
//      (takes ~24h to get approved, but most developers are approved automatically)
//
// Requires in .env:
//   META_ADS_ACCESS_TOKEN=<your app access token>
//
// Rate limits: 200 calls/hour per access token (App Access Token, not user token)
// Cost: completely free

const axios = require("axios");

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

// Ad categories we search — ISSUES_ELECTIONS_POLITICS is restricted,
// but ALL (general commercial ads) covers almost all small businesses.
const AD_CATEGORY = "ALL";

// ---------------------------------------------------------------------------
// Search the Ads Library for a given search term (business name or page name).
// Returns up to `limit` active ads.
// ---------------------------------------------------------------------------
async function searchAdsLibrary(searchTerm, { limit = 10, countryCode = "US" } = {}) {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token || !searchTerm) {
    return { checked: false, reason: !token ? "no_token" : "no_search_term" };
  }

  try {
    const { data } = await axios.get(`${GRAPH_BASE}/ads_archive`, {
      params: {
        access_token: token,
        ad_reached_countries: countryCode,
        ad_active_status: "ACTIVE",
        ad_type: "ALL",
        search_terms: searchTerm,
        fields: [
          "id",
          "ad_creation_time",
          "ad_creative_bodies",
          "ad_creative_link_captions",
          "ad_creative_link_descriptions",
          "ad_creative_link_titles",
          "page_name",
          "page_id",
          "impressions",
          "spend",
          "currency",
          "publisher_platforms",
        ].join(","),
        limit,
      },
      timeout: 15000,
    });

    const ads = data.data || [];

    if (ads.length === 0) {
      return { checked: true, found: false, adCount: 0, ads: [] };
    }

    const parsed = ads.map((ad) => {
      const createdAt = ad.ad_creation_time ? new Date(ad.ad_creation_time) : null;
      const daysRunning = createdAt
        ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Impressions come as a range string like "1000-4999"; take the midpoint
      let impressionsMid = null;
      if (ad.impressions) {
        const parts = String(ad.impressions).replace(/,/g, "").split("-");
        if (parts.length === 2) {
          impressionsMid = Math.round((parseInt(parts[0]) + parseInt(parts[1])) / 2);
        } else if (parts.length === 1 && !isNaN(parseInt(parts[0]))) {
          impressionsMid = parseInt(parts[0]);
        }
      }

      // Spend comes similarly as a range
      let spendMid = null;
      if (ad.spend) {
        const parts = String(ad.spend).replace(/,/g, "").split("-");
        if (parts.length === 2) {
          spendMid = Math.round((parseInt(parts[0]) + parseInt(parts[1])) / 2);
        }
      }

      const platforms = ad.publisher_platforms || [];
      const bodies = ad.ad_creative_bodies || [];
      const titles = ad.ad_creative_link_titles || [];

      return {
        id: ad.id,
        pageName: ad.page_name || null,
        pageId: ad.page_id || null,
        createdAt: createdAt ? createdAt.toISOString().split("T")[0] : null,
        daysRunning,
        platforms, // ["facebook", "instagram", "messenger", ...]
        headline: titles[0] || null,
        bodyText: bodies[0] ? bodies[0].slice(0, 300) : null, // truncate long copy
        impressionsMid,
        spendMid,
        currency: ad.currency || null,
      };
    });

    // Sort by daysRunning desc — longest-running ads are likely the best performers
    parsed.sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0));

    const longestRunning = parsed[0]?.daysRunning || 0;
    const onInstagram = parsed.some((a) => a.platforms.includes("instagram"));
    const onFacebook = parsed.some((a) => a.platforms.includes("facebook"));

    return {
      checked: true,
      found: true,
      adCount: parsed.length,
      longestRunningDays: longestRunning,
      onInstagram,
      onFacebook,
      ads: parsed.slice(0, 5), // keep top 5 for the report
    };
  } catch (err) {
    // A 400 with "Unsupported get request" usually means the page name
    // doesn't map to a page in the Ad Library — treat as not found, not an error.
    if (err.response?.status === 400) {
      return { checked: true, found: false, adCount: 0, ads: [] };
    }
    console.error("Meta Ads Library search failed:", err.response?.data || err.message);
    return { checked: false, reason: "api_error", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Run ad intelligence for both the scanned business AND their competitor.
// Called from server.js during the paid report fulfillment.
// countryCode: ISO 3166-1 alpha-2, defaults to "US"
// ---------------------------------------------------------------------------
async function runAdIntelligence(businessName, competitorName, countryCode = "US") {
  if (!process.env.META_ADS_ACCESS_TOKEN) {
    return {
      business: { checked: false, reason: "no_token" },
      competitor: { checked: false, reason: "no_token" },
    };
  }

  const [business, competitor] = await Promise.allSettled([
    businessName ? searchAdsLibrary(businessName, { limit: 5, countryCode }) : Promise.resolve({ checked: false, reason: "no_name" }),
    competitorName ? searchAdsLibrary(competitorName, { limit: 5, countryCode }) : Promise.resolve({ checked: false, reason: "no_competitor" }),
  ]);

  return {
    business: business.status === "fulfilled" ? business.value : { checked: false, reason: "error" },
    competitor: competitor.status === "fulfilled" ? competitor.value : { checked: false, reason: "error" },
  };
}

module.exports = { runAdIntelligence, searchAdsLibrary };
