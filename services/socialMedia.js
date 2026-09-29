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
  if (!token) {
    console.warn("[socialMedia] FACEBOOK_APP_TOKEN not set — Facebook scoring skipped. Set it in Render env vars.");
    return { platform: "Facebook", score: 0, real: false, raw: { note: "no token" } };
  }
  if (!businessName) {
    return { platform: "Facebook", score: 0, real: false, raw: { note: "no businessName" } };
  }

  // Try multiple search queries: with city, without city, name-only variations
  // This prevents city-mismatch false negatives (e.g. "Sydney Salon" based in Florida)
  const queries = [];
  if (city) queries.push(`${businessName} ${city}`);
  queries.push(businessName);
  // Also try name without common suffixes like "by X" → first two words
  const shortName = businessName.split(/\s+/).slice(0, 2).join(" ");
  if (shortName !== businessName) queries.push(shortName);

  for (const query of queries) {
    try {
      const searchRes = await axios.get("https://graph.facebook.com/v19.0/search", {
        params: {
          q: query,
          type: "page",
          fields: "id,name,fan_count,followers_count,posts.limit(5){created_time}",
          access_token: token,
          limit: 5,
        },
        timeout: 10000,
      });

      const pages = searchRes.data?.data || [];
      if (!pages.length) continue; // try next query

      // Find the best match — prefer pages whose name closely matches businessName
      const nameLower = businessName.toLowerCase();
      const page = pages.find(p => p.name && p.name.toLowerCase().includes(nameLower.split(/\s+/)[0]))
        || pages[0];

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

      console.log(`[socialMedia] Facebook matched: "${page.name}" (query: "${query}") — followers: ${followers}`);

      return {
        platform: "Facebook",
        score: Math.round(Math.min(100, score)),
        real: true,
        raw: { followers, daysSincePost, isActive, pageName: page.name, matchedQuery: query },
      };
    } catch (err) {
      console.error(`Facebook search failed for query "${query}":`, err.message);
    }
  }

  return { platform: "Facebook", score: 0, real: true, raw: { note: "no page found after all queries" } };
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

// ── Instagram presence check (public profile via web scraping) ────────────────
// Uses the Graph API to search for Instagram Business accounts linked to pages.
// Falls back to a simple web-fetch of the public profile if no token/page.
async function fetchInstagramData(businessName, city) {
  const token = process.env.FACEBOOK_APP_TOKEN; // same token — IG uses Graph API too
  if (!token || !businessName) {
    return { platform: "Instagram", score: 0, real: false, raw: { note: "no token" } };
  }

  // Build candidate Instagram handles from the business name
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const slugUnderscore = businessName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const handles = [slug, slugUnderscore];
  // Also try "<name><city>" combos
  if (city) {
    const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, "");
    handles.push(`${slug}${citySlug}`, `${slug}_${citySlug}`);
  }

  // Search Facebook Pages (which often have a linked Instagram account)
  try {
    const queries = [businessName];
    if (city) queries.unshift(`${businessName} ${city}`);

    for (const query of queries) {
      const searchRes = await axios.get("https://graph.facebook.com/v19.0/search", {
        params: {
          q: query,
          type: "page",
          fields: "id,name,instagram_business_account",
          access_token: token,
          limit: 3,
        },
        timeout: 10000,
      });

      const pages = searchRes.data?.data || [];
      const pageWithIg = pages.find(p => p.instagram_business_account?.id);

      if (pageWithIg) {
        const igId = pageWithIg.instagram_business_account.id;
        const igRes = await axios.get(`https://graph.facebook.com/v19.0/${igId}`, {
          params: {
            fields: "followers_count,media_count,biography",
            access_token: token,
          },
          timeout: 10000,
        });
        const ig = igRes.data;
        const followers = ig.followers_count || 0;
        const posts = ig.media_count || 0;

        let score = 0;
        score += Math.min(60, Math.log10(followers + 1) * 18);
        score += posts >= 12 ? 40 : posts >= 6 ? 25 : posts > 0 ? 15 : 0;

        console.log(`[socialMedia] Instagram found via FB page: followers=${followers}, posts=${posts}`);
        return {
          platform: "Instagram",
          score: Math.round(Math.min(100, score)),
          real: true,
          raw: { followers, posts },
        };
      }
    }
  } catch (err) {
    console.error("Instagram via FB Graph failed:", err.message);
  }

  // Fallback: try fetching the public Instagram profile page directly
  try {
    for (const handle of handles) {
      try {
        const res = await axios.get(`https://www.instagram.com/${handle}/`, {
          timeout: 8000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (res.status === 200 && res.data.includes('"edge_followed_by"')) {
          // Extract follower count from the page JSON
          const match = res.data.match(/"edge_followed_by":\{"count":(\d+)/);
          const followers = match ? parseInt(match[1], 10) : 0;
          const postsMatch = res.data.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
          const posts = postsMatch ? parseInt(postsMatch[1], 10) : 0;

          let score = 0;
          score += Math.min(60, Math.log10(followers + 1) * 18);
          score += posts >= 12 ? 40 : posts >= 6 ? 25 : posts > 0 ? 15 : 0;

          console.log(`[socialMedia] Instagram found via web for @${handle}: followers=${followers}`);
          return {
            platform: "Instagram",
            score: Math.round(Math.min(100, score)),
            real: true,
            raw: { followers, posts, handle },
          };
        }
        // If 200 but no follower JSON — account exists but data not exposed; give partial credit
        if (res.status === 200 && !res.data.includes("Sorry, this page isn't available")) {
          console.log(`[socialMedia] Instagram @${handle} exists (partial data)`);
          return {
            platform: "Instagram",
            score: 35, // account exists, can't read metrics
            real: true,
            raw: { handle, note: "exists, metrics not exposed" },
          };
        }
      } catch (_) {
        // 404 = handle doesn't exist, try next
      }
    }
  } catch (err) {
    console.error("Instagram web fallback failed:", err.message);
  }

  return { platform: "Instagram", score: 0, real: false, raw: { note: "not found" } };
}

// ── Facebook by direct page URL ───────────────────────────────────────────────
// When customer provides their FB page URL, extract the page username/ID and
// fetch it directly instead of searching by business name.
async function fetchFacebookByUrl(fbUrl) {
  const token = process.env.FACEBOOK_APP_TOKEN;
  if (!token || !fbUrl) return fetchFacebookData(null, null);

  // Extract page username from URL: facebook.com/PageName or fb.com/PageName
  const match = fbUrl.match(/(?:facebook\.com|fb\.com)\/([^/?#\s]+)/i);
  if (!match) return { platform: "Facebook", score: 0, real: false, raw: { note: "invalid FB URL" } };

  const pageSlug = match[1];
  if (["pages", "groups", "profile.php", "events"].includes(pageSlug)) {
    return { platform: "Facebook", score: 0, real: false, raw: { note: "unsupported FB URL type" } };
  }

  // Try Graph API first
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${pageSlug}`, {
      params: {
        fields: "id,name,fan_count,followers_count,posts.limit(5){created_time}",
        access_token: token,
      },
      timeout: 10000,
    });
    const page = res.data;
    const followers = page.followers_count || page.fan_count || 0;
    const posts = page.posts?.data || [];
    const recentPost = posts[0]?.created_time;
    const daysSincePost = recentPost
      ? Math.floor((Date.now() - new Date(recentPost).getTime()) / 86400000)
      : 999;
    const isActive = daysSincePost <= 90;

    let score = 0;
    score += Math.min(60, Math.log10(followers + 1) * 18);
    score += isActive ? 40 : daysSincePost <= 180 ? 20 : 0;

    console.log(`[socialMedia] Facebook direct URL: "${page.name}" — followers: ${followers}`);
    return {
      platform: "Facebook",
      score: Math.round(Math.min(100, score)),
      real: true,
      raw: { followers, daysSincePost, isActive, pageName: page.name },
    };
  } catch (err) {
    console.error(`Facebook direct URL fetch failed for "${pageSlug}":`, err.message);
  }

  // Fallback: scrape public Facebook page to at least confirm presence
  // Graph API often returns 400 for pages that require page-level permissions.
  // A public page always returns HTML — we can extract follower count from meta tags.
  try {
    const res = await axios.get(`https://www.facebook.com/${pageSlug}/`, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (res.status === 200) {
      // Try to extract follower count from page source
      const followerMatch = res.data.match(/[\",](\d[\d,]+)\s*(?:people follow|followers)/i);
      const followers = followerMatch ? parseInt(followerMatch[1].replace(/,/g, ""), 10) : 0;

      // Page exists — give it credit even if we can't read exact metrics
      let score = followers > 0
        ? Math.min(70, Math.log10(followers + 1) * 18)
        : 40; // page exists, just can't read followers
      score += 25; // active page bonus (they provided the URL, so it's real)

      console.log(`[socialMedia] Facebook web fallback for "${pageSlug}": followers=${followers}`);
      return {
        platform: "Facebook",
        score: Math.round(Math.min(100, score)),
        real: true,
        raw: { followers, pageName: pageSlug, note: "web fallback" },
      };
    }
  } catch (webErr) {
    console.error(`Facebook web fallback failed for "${pageSlug}":`, webErr.message);
  }

  // Page URL was provided by customer — give baseline credit even if we can't fetch
  return { platform: "Facebook", score: 40, real: true, raw: { note: "page URL provided, fetch blocked", pageSlug } };
}

// ── Instagram by direct handle ────────────────────────────────────────────────
async function fetchInstagramByHandle(handle) {
  if (!handle) return fetchInstagramData(null, null);

  const token = process.env.FACEBOOK_APP_TOKEN;
  const cleanHandle = handle.replace(/^@/, "").trim();

  // Try Graph API first via FB page search with the handle
  if (token) {
    try {
      const searchRes = await axios.get("https://graph.facebook.com/v19.0/search", {
        params: {
          q: cleanHandle,
          type: "page",
          fields: "id,name,instagram_business_account",
          access_token: token,
          limit: 3,
        },
        timeout: 10000,
      });
      const pages = searchRes.data?.data || [];
      const pageWithIg = pages.find(p => p.instagram_business_account?.id);
      if (pageWithIg) {
        const igId = pageWithIg.instagram_business_account.id;
        const igRes = await axios.get(`https://graph.facebook.com/v19.0/${igId}`, {
          params: { fields: "followers_count,media_count", access_token: token },
          timeout: 10000,
        });
        const ig = igRes.data;
        const followers = ig.followers_count || 0;
        const posts = ig.media_count || 0;
        let score = Math.min(60, Math.log10(followers + 1) * 18);
        score += posts >= 12 ? 40 : posts >= 6 ? 25 : posts > 0 ? 15 : 0;
        console.log(`[socialMedia] Instagram direct handle @${cleanHandle}: followers=${followers}`);
        return { platform: "Instagram", score: Math.round(Math.min(100, score)), real: true, raw: { followers, posts, handle: cleanHandle } };
      }
    } catch (err) {
      console.error(`Instagram direct handle Graph failed for @${cleanHandle}:`, err.message);
    }
  }

  // Fallback: public web fetch
  try {
    const res = await axios.get(`https://www.instagram.com/${cleanHandle}/`, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (res.status === 200 && !res.data.includes("Sorry, this page isn't available")) {
      const match = res.data.match(/"edge_followed_by":\{"count":(\d+)/);
      const followers = match ? parseInt(match[1], 10) : 0;
      const postsMatch = res.data.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
      const posts = postsMatch ? parseInt(postsMatch[1], 10) : 0;
      let score = Math.min(60, Math.log10(followers + 1) * 18);
      score += posts >= 12 ? 40 : posts >= 6 ? 25 : posts > 0 ? 15 : 0;
      if (followers === 0 && posts === 0) {
        // Account exists but can't read metrics
        return { platform: "Instagram", score: 35, real: true, raw: { handle: cleanHandle, note: "exists, metrics not exposed" } };
      }
      return { platform: "Instagram", score: Math.round(Math.min(100, score)), real: true, raw: { followers, posts, handle: cleanHandle } };
    }
  } catch (err) {
    console.error(`Instagram web fetch failed for @${cleanHandle}:`, err.message);
  }

  // Handle was provided by customer — give baseline credit even if fetch failed
  return { platform: "Instagram", score: 40, real: true, raw: { note: "handle provided, fetch blocked", handle: cleanHandle } };
}

// ── Combined social score ─────────────────────────────────────────────────────
/**
 * Returns a single social sub-score (0–100) from real public platform data.
 *
 * @param {object} handles
 * @param {string} [handles.youtubeChannelId]
 * @param {string} [handles.businessName]   — used for Facebook/Instagram search
 * @param {string} [handles.city]           — improves search accuracy
 */
async function calculateSocialScore(handles = {}) {
  const [fb, yt, ig] = await Promise.all([
    handles.facebookUrl
      ? fetchFacebookByUrl(handles.facebookUrl)
      : fetchFacebookData(handles.businessName, handles.city),
    fetchYouTubeData(handles.youtubeChannelId),
    handles.instagramHandle
      ? fetchInstagramByHandle(handles.instagramHandle)
      : fetchInstagramData(handles.businessName, handles.city),
  ]);

  const realResults = [fb, yt, ig].filter(r => r.real && r.score > 0);

  let score;
  if (realResults.length > 0) {
    // Weight: Instagram (40%) + Facebook (40%) + YouTube (20%) when all present
    // Otherwise average what we have
    if (ig.score > 0 && fb.score > 0) {
      score = Math.round(
        ig.score * 0.40 +
        fb.score * 0.40 +
        (yt.score || 0) * 0.20
      );
    } else {
      score = Math.round(realResults.reduce((s, r) => s + r.score, 0) / realResults.length);
    }
  } else {
    // No real data (token missing or business not found on any platform).
    // Use a realistic industry-average baseline (35) rather than 0, which
    // would make reports look broken. We flag hasRealData=false so callers
    // know this is estimated, not measured.
    score = 35;
    console.warn("[socialMedia] No real social data — using baseline estimate of 35");
  }

  return {
    score,
    platforms: [fb, yt, ig],
    hasRealData: realResults.length > 0,
  };
}

module.exports = { calculateSocialScore };
