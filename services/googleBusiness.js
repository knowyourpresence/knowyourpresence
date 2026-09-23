// services/googleBusiness.js
// Pulls Google Business Profile signals via the Places API (New).
// Requires GOOGLE_PLACES_API_KEY in .env with "Places API (New)" enabled.

const axios = require("axios");

async function fetchGoogleBusinessData(placeId) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey || !placeId) {
    return mockGoogleData(); // fallback so the app still runs without keys set
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const { data } = await axios.get(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "rating,userRatingCount,photos,regularOpeningHours,websiteUri,reviews",
      },
    });

    const rating = data.rating || 0;
    const reviewCount = data.userRatingCount || 0;
    const photoCount = (data.photos || []).length;
    const hasHours = !!data.regularOpeningHours;
    const hasWebsite = !!data.websiteUri;

    return buildGoogleScore({ rating, reviewCount, photoCount, hasHours, hasWebsite });
  } catch (err) {
    console.error("Google Places fetch failed:", err.message);
    return mockGoogleData();
  }
}

function buildGoogleScore({ rating, reviewCount, photoCount, hasHours, hasWebsite }) {
  // Simple point model out of 100 - tune weights as you gather real data.
  let score = 0;
  score += Math.min(40, (rating / 5) * 40); // rating quality: up to 40 pts
  score += Math.min(30, Math.log10(reviewCount + 1) * 15); // review volume: up to 30 pts
  score += Math.min(15, photoCount * 1.5); // photos: up to 15 pts
  score += hasHours ? 7.5 : 0;
  score += hasWebsite ? 7.5 : 0;

  return {
    score: Math.round(Math.min(100, score)),
    raw: { rating, reviewCount, photoCount, hasHours, hasWebsite },
  };
}

function mockGoogleData() {
  // Used when no API key/placeId is provided, so the dashboard is demoable.
  return buildGoogleScore({
    rating: 4.1,
    reviewCount: 37,
    photoCount: 9,
    hasHours: true,
    hasWebsite: false,
  });
}

module.exports = { fetchGoogleBusinessData, searchCompetitorByName };

/**
 * Finds a competitor business by name (+ optional city) via Places Text
 * Search, then scores their PUBLIC Google signals the exact same way we
 * score the paying customer's own business.
 *
 * HONEST LIMITATION: this only covers what's genuinely public for any
 * business - Google rating, review count, photos, hours, website. It does
 * NOT cover their social media or a true "reputation" score, since those
 * require account-level access we only have for the paying customer, not a
 * random third party. The report should compare only Google + Website for
 * the competitor, not claim a full 4-category comparison.
 *
 * @param {string} name - competitor business name as the customer typed it
 * @param {string} city - optional, improves search accuracy
 * @returns {Promise<{found: boolean, name?: string, google?: object}>}
 */
async function searchCompetitorByName(name, city) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !name) return { found: false };

  try {
    const query = city ? `${name} in ${city}` : name;
    const { data } = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { textQuery: query, maxResultCount: 1 },
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.websiteUri",
        },
      }
    );

    const place = data.places?.[0];
    if (!place) return { found: false };

    const google = buildGoogleScore({
      rating: place.rating || 0,
      reviewCount: place.userRatingCount || 0,
      photoCount: (place.photos || []).length,
      hasHours: !!place.regularOpeningHours,
      hasWebsite: !!place.websiteUri,
    });

    return {
      found: true,
      name: place.displayName?.text || name,
      websiteUri: place.websiteUri || null,
      google,
    };
  } catch (err) {
    console.error("Competitor search failed:", err.message);
    return { found: false };
  }
}
