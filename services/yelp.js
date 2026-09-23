// services/yelp.js
// Pulls real public Yelp data via the Fusion API - same pattern as Google
// Places (public directory data, just needs an API key, no OAuth from the
// business owner required). Particularly relevant for US/Canada, where
// Yelp is a major independent trust signal alongside Google reviews.
//
// Requires YELP_API_KEY in .env. Sign up at yelp.com/developers.

const axios = require("axios");

/**
 * Searches for a business by name + location and returns its real public
 * Yelp data. Returns { found: false } if no API key, no match, or the
 * request fails - callers should treat that as "not on Yelp / couldn't
 * check" rather than blocking the rest of the scan.
 *
 * @param {string} businessName
 * @param {string} location - city, or "city, state" for best match accuracy
 */
async function fetchYelpData(businessName, location) {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey || !businessName || !location) {
    return { found: false };
  }

  try {
    const { data } = await axios.get("https://api.yelp.com/v3/businesses/search", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { term: businessName, location, limit: 1 },
    });

    const biz = data.businesses?.[0];
    if (!biz) return { found: false };

    return {
      found: true,
      name: biz.name,
      rating: biz.rating || 0,
      reviewCount: biz.review_count || 0,
      isClaimed: biz.is_claimed ?? null, // null if the field isn't present for this account tier
      categories: (biz.categories || []).map((c) => c.title),
      url: biz.url || null,
    };
  } catch (err) {
    console.error("Yelp fetch failed:", err.response?.data?.error?.description || err.message);
    return { found: false };
  }
}

module.exports = { fetchYelpData };
