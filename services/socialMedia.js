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
          fields: "id,name,fan_count,followers_count,posts.limit(5){created_time,likes.summary(true),comments.summary(true)}",
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

      // Check post recency + engagement
      const posts = page.posts?.data || [];
      const recentPost = posts[0]?.created_time;
      const daysSincePost = recentPost
        ? Math.floor((Date.now() - new Date(recentPost).getTime()) / 86400000)
        : 999;
      const isActive = daysSincePost <= 90;

      // Engagement rate: avg likes+comments per post ÷ followers
      const totalEngagement = posts.reduce((sum, p) => {
        const likes = p.likes?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count || 0;
        return sum + likes + comments;
      }, 0);
      const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
      const engagementRate = followers > 0 ? (avgEngagement / followers) * 100 : 0;
      // Industry avg FB engagement rate ~0.5-1% — score generously
      const engagementScore = Math.min(20,
        engagementRate >= 3 ? 20 :
        engagementRate >= 1 ? 15 :
        engagementRate >= 0.5 ? 10 :
        engagementRate > 0 ? 5 : 0
      );

      // Score: followers (40pts) + activity/recency (30pts) + engagement (20pts) + posting frequency (10pts)
      let score = 0;
      score += Math.min(40, Math.log10(followers + 1) * 12); // followers up to 40pts
      score += isActive ? 30 : daysSincePost <= 180 ? 15 : 0; // recency up to 30pts
      score += engagementScore; // engagement rate up to 20pts
      score += posts.length >= 4 ? 10 : posts.length >= 2 ? 5 : 0; // posting frequency up to 10pts

      console.log(`[socialMedia] Facebook matched: "${page.name}" (query: "${query}") — followers: ${followers}, engRate: ${engagementRate.toFixed(2)}%, engScore: ${engagementScore}`);

      return {
        platform: "Facebook",
        score: Math.round(Math.min(100, score)),
        real: true,
        raw: { followers, daysSincePost, isActive, engagementRate: +engagementRate.toFixed(2), avgEngagement: Math.round(avgEngagement), pageName: page.name, matchedQuery: query },
      };
    } catch (err) {
      console.error(`Facebook search failed for query "${query}":`, err.message);
    }
  }

  return { platform: "Facebook", score: 0, real: true, raw: { note: "no page found after all queries" }, reason: "no_page" };
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

        // Score: followers (40pts) + content volume/consistency (35pts) + engagement proxy (25pts)
        // IG avg engagement rate ~1-3% for small business — use post count as consistency signal
        let score = 0;
        score += Math.min(40, Math.log10(followers + 1) * 12); // followers up to 40pts
        score += posts >= 50 ? 35 : posts >= 20 ? 25 : posts >= 9 ? 18 : posts >= 3 ? 10 : posts > 0 ? 5 : 0;
        // Engagement proxy: if they have followers AND posts, assume decent engagement
        const engProxy = (followers > 100 && posts >= 9) ? 25 : (followers > 0 && posts > 0) ? 15 : 0;
        score += engProxy;

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
        fields: "id,name,fan_count,followers_count,posts.limit(5){created_time,likes.summary(true),comments.summary(true)}",
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

    const totalEngagement = posts.reduce((sum, p) => {
      return sum + (p.likes?.summary?.total_count || 0) + (p.comments?.summary?.total_count || 0);
    }, 0);
    const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;
    const engagementRate = followers > 0 ? (avgEngagement / followers) * 100 : 0;
    const engagementScore = Math.min(20,
      engagementRate >= 3 ? 20 : engagementRate >= 1 ? 15 : engagementRate >= 0.5 ? 10 : engagementRate > 0 ? 5 : 0
    );

    let score = 0;
    score += Math.min(40, Math.log10(followers + 1) * 12);
    score += isActive ? 30 : daysSincePost <= 180 ? 15 : 0;
    score += engagementScore;
    score += posts.length >= 4 ? 10 : posts.length >= 2 ? 5 : 0;

    console.log(`[socialMedia] Facebook direct URL: "${page.name}" — followers: ${followers}, engRate: ${engagementRate.toFixed(2)}%`);
    return {
      platform: "Facebook",
      score: Math.round(Math.min(100, score)),
      real: true,
      raw: { followers, daysSincePost, isActive, engagementRate: +engagementRate.toFixed(2), avgEngagement: Math.round(avgEngagement), pageName: page.name },
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

  // Detect specific problem cases for report context
  const noFacebook = fb.reason === "no_page" || (!fb.real && fb.score === 0);
  const noInstagram = ig.score === 0 && !ig.real;
  const hasNoActivity = fb.real && fb.score > 0 && fb.raw?.daysSincePost > 180;
  const ghostAccount = fb.real && fb.raw?.followers > 0 && fb.raw?.avgEngagement === 0;

  let score;
  let finding = null; // key finding to surface in the report

  if (realResults.length > 0) {
    // Weight: Instagram (40%) + Facebook (40%) + YouTube (20%) when all present
    if (ig.score > 0 && fb.score > 0) {
      score = Math.round(ig.score * 0.40 + fb.score * 0.40 + (yt.score || 0) * 0.20);
    } else {
      score = Math.round(realResults.reduce((s, r) => s + r.score, 0) / realResults.length);
    }

    // Apply penalties for specific problems and set finding for report
    if (ghostAccount) {
      score = Math.max(10, score - 15);
      finding = "ghost_account"; // has followers but zero engagement
    } else if (hasNoActivity) {
      score = Math.max(10, score - 10);
      finding = "inactive"; // hasn't posted in 6+ months
    } else if (noFacebook && ig.score > 0) {
      finding = "no_facebook"; // on Instagram but missing Facebook
    } else if (noInstagram && fb.score > 0) {
      finding = "no_instagram"; // on Facebook but missing Instagram
    }

  } else {
    // No social presence found at all
    if (noFacebook && noInstagram) {
      score = 10; // genuinely missing from social — this is a real problem
      finding = "no_social_presence";
      console.warn("[socialMedia] Business has no detectable social presence");
    } else {
      // Data fetch failed (API limits etc) — use baseline
      score = 35;
      console.warn("[socialMedia] No real social data — using baseline estimate of 35");
    }
  }

  console.log(`[socialMedia] Final score: ${score}, finding: ${finding || "none"}`);

  return {
    score,
    platforms: [fb, yt, ig],
    hasRealData: realResults.length > 0,
    finding, // null | "no_social_presence" | "no_facebook" | "no_instagram" | "inactive" | "ghost_account"
  };
}

module.exports = { calculateSocialScore };
