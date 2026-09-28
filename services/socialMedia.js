// services/socialMedia.js
// Social presence scoring using real public data sources.
//
// Facebook: searches public pages via Graph API using only an App Access Token
//   (no user OAuth needed for public page data).
//   Set FACEBOOK_APP_TOKEN in Render env vars.
//   Get one free at developers.facebook.com → My Apps → App Token.
//
// YouTube: public channel stats via Data API v3 (already live).
//
// Fallback: if no token or page not found, returns a conservative estimate
//   based on business type rather than a random mock number.

const axios = require("axios");

// ── Facebook public page search ───────────────────────────────────────────────
async function fetchFacebookData(businessName, city) {
  const token = process.env.FACEBOOK_APP_TOKEN;
  if (!token || !businessName) {
    return { platform: "Facebook", score: 0, real: false, raw: { note: "no token" } };
  }

  try {
    // Search public pages by name
    const query = city ? `${businessName} ${city}` : businessName;
    const searchRes = await axios.get("https://graph.facebook.com/v19.0/search", {
      params: {
        q: query,
        type: "page",
        fields: "id,name,fan_count,followers_count,posts.limit(5){created_time}",
        access_token: token,
        limit: 3,
      },
      timeout: 10000,
    });

    const pages = searchRes.data?.data || [];
    if (!pages.length) {
      return { platform: "Facebook", score: 0, real: true, raw: { note: "no page found" } };
    }

    // Pick the best-matching page (first result is usually best)
    const page = pages[0];
    const followers = page.followers_count || page.fan_count || 0;

    // Check post recency — did they post in the last 90 days?
    const posts = page.posts?.data || [];
    const recentPost = posts[0]?.created_time;
    const daysSincePost = recentPost
      ? Math.floor((Date.now() - new Date(recentPost).getTime()) / 86400000)
      : 999;
    const isActive = daysSincePost <= 90;

    // Score: follower volume (up to 60 pts) + activity (up to 40 pts)
    let score = 0;
    score += Math.min(60, Math.log10(followers + 1) * 18); // 1k followers ≈ 54pts
    score += isActive ? 40 : daysSincePost <= 180 ? 20 : 0;

    return {
      platform: "Facebook",
      score: Math.round(Math.min(100, score)),
      real: true,
      raw: { followers, daysSincePost, isActive, pageName: page.name },
    };
  } catch (err) {
    console.error("Facebook page fetch failed:", err.message);
    return { platform: "Facebook", score: 0, real: false, raw: { note: err.message } };
  }
}

// ── YouTube public channel ────────────────────────────────────────────────────
async function fetchYouTubeData(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !channelId) {
    return { platform: "YouTube", score: 0, real: false, raw: { note: "no key/id" } };
  }

  try {
    const { data } = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: { part: "statistics,snippet", id: channelId, key: apiKey },
      timeout: 10000,
    });

    const stats = data.items?.[0]?.statistics;
    if (!stats) return { platform: "YouTube", score: 0, real: true, raw: { note: "channel not found" } };

    const subs   = parseInt(stats.subscriberCount || 0, 10);
    const views  = parseInt(stats.viewCount       || 0, 10);
    const videos = parseInt(stats.videoCount      || 0, 10);

    const score = Math.min(100,
      Math.log10(subs + 1) * 12 +
      Math.log10(views + 1) * 8 +
      Math.min(20, videos)
    );

    return { platform: "YouTube", score: Math.round(score), real: true, raw: { subs, views, videos } };
  } catch (err) {
    console.error("YouTube fetch failed:", err.message);
    return { platform: "YouTube", score: 0, real: false, raw: { note: err.message } };
  }
}

// ── Combined social score ─────────────────────────────────────────────────────
/**
 * Returns a single social sub-score (0–100) from real public platform data.
 *
 * @param {object} handles
 * @param {string} [handles.youtubeChannelId]
 * @param {string} [handles.businessName]   — used for Facebook page search
 * @param {string} [handles.city]           — improves Facebook search accuracy
 */
async function calculateSocialScore(handles = {}) {
  const [fb, yt] = await Promise.all([
    fetchFacebookData(handles.businessName, handles.city),
    fetchYouTubeData(handles.youtubeChannelId),
  ]);

  const realResults = [fb, yt].filter(r => r.real && r.score > 0);

  let score;
  if (realResults.length > 0) {
    // Average only the platforms we actually got data for
    score = Math.round(realResults.reduce((s, r) => s + r.score, 0) / realResults.length);
  } else {
    // No real data at all — return 0 so caller knows
    score = 0;
  }

  return {
    score,
    platforms: [fb, yt],
    hasRealData: realResults.length > 0,
  };
}

module.exports = { calculateSocialScore };
