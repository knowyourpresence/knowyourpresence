// services/socialMedia.js
// Cross-platform social presence scoring.
//
// IMPORTANT: Instagram & Facebook require the business owner to connect
// their account via Meta's OAuth flow (Graph API) - you can't pull a
// stranger's private engagement data with just a username. YouTube's
// public stats ARE accessible with just an API key, so that one is
// wired up live below as a working example. Wire up Meta the same way
// once you have OAuth set up in the KYP onboarding flow.

const axios = require("axios");

async function fetchYouTubeData(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !channelId) return mockPlatform("YouTube");

  try {
    const url = `https://www.googleapis.com/youtube/v3/channels`;
    const { data } = await axios.get(url, {
      params: { part: "statistics,snippet", id: channelId, key: apiKey },
    });

    const stats = data.items?.[0]?.statistics;
    if (!stats) return mockPlatform("YouTube");

    const subs = parseInt(stats.subscriberCount || 0, 10);
    const views = parseInt(stats.viewCount || 0, 10);
    const videos = parseInt(stats.videoCount || 0, 10);

    const score = Math.min(
      100,
      Math.log10(subs + 1) * 12 + Math.log10(views + 1) * 8 + Math.min(20, videos)
    );

    return { platform: "YouTube", score: Math.round(score), raw: { subs, views, videos } };
  } catch (err) {
    console.error("YouTube fetch failed:", err.message);
    return mockPlatform("YouTube");
  }
}

// Placeholder for Meta Graph API (Instagram Business + Facebook Page).
// Once you have a META_ACCESS_TOKEN scoped to the business's connected
// accounts, call e.g.:
//   GET https://graph.facebook.com/v19.0/{ig-user-id}?fields=followers_count,media_count&access_token=...
// and compute engagement_rate = avg(likes+comments on last 10 posts) / followers
async function fetchInstagramData(/* igUserId */) {
  return mockPlatform("Instagram");
}

async function fetchFacebookData(/* pageId */) {
  return mockPlatform("Facebook");
}

function mockPlatform(name) {
  // Deterministic-ish placeholder so the demo dashboard looks alive
  // until real credentials are wired in.
  const seed = name.length * 7;
  return {
    platform: name,
    score: 40 + (seed % 40),
    raw: { note: "mock data - connect API for live numbers" },
  };
}

/**
 * Combines all connected platforms into one social sub-score (0-100).
 * @param {object} handles - { youtubeChannelId, instagramUserId, facebookPageId }
 */
async function calculateSocialScore(handles = {}) {
  const results = await Promise.all([
    fetchYouTubeData(handles.youtubeChannelId),
    fetchInstagramData(handles.instagramUserId),
    fetchFacebookData(handles.facebookPageId),
  ]);

  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  return { score: Math.round(avg), platforms: results };
}

module.exports = { calculateSocialScore };
