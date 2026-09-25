// services/apify.js
// Apify enrichment for KYP Scanner — 6 actors running in parallel.
//
// ACTORS:
//   1. apify/website-content-crawler   — on-page SEO (title, schema, alt, h1)
//   2. compass/crawler-google-places   — Google Maps: reviews, Q&A, photos, categories
//   3. compass/google-maps-reviews-scraper — real review texts + reply status (unanswered)
//   4. apify/instagram-scraper         — real post frequency, follower count, last post date
//   5. prodiger/facebook-ads-library-v2 — competitor active ads, copy, days running
//   6. maxcopell/tripadvisor           — TripAdvisor rating, review count, claim status
//
// All calls are parallel, all fail gracefully — a single actor timeout never blocks the scan.
// Free tier: $5/month credit. Typical KYP scan costs ~$0.08–0.15 across all 6 actors.
//
// Requires: APIFY_API_TOKEN in .env

const axios = require("axios");
const APIFY_BASE = "https://api.apify.com/v2";

// ---------------------------------------------------------------------------
// Core helper — start an actor, poll until done, return dataset items.
// Each actor gets its own timeout so slow actors don't kill fast ones.
// ---------------------------------------------------------------------------
async function runApifyActor(actorId, input, timeoutMs = 90000) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  try {
    const { data: runData } = await axios.post(
      `${APIFY_BASE}/acts/${actorId.replace("/","~")}/runs?token=${token}`,
      input,
      { timeout: 15000, headers: { "Content-Type": "application/json" } }
    );

    const runId = runData.data?.id;
    if (!runId) return null;

    const deadline = Date.now() + timeoutMs;
    let status = "RUNNING";

    while (["RUNNING", "READY"].includes(status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: s } = await axios.get(
        `${APIFY_BASE}/actor-runs/${runId}?token=${token}`,
        { timeout: 10000 }
      );
      status = s.data?.status;
    }

    if (status !== "SUCCEEDED") {
      console.warn(`[Apify] ${actorId} ended with status: ${status}`);
      return null;
    }

    const { data: dataset } = await axios.get(
      `${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${token}&clean=true`,
      { timeout: 15000 }
    );

    return Array.isArray(dataset) ? dataset : null;
  } catch (err) {
    console.error(`[Apify] ${actorId} failed:`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. ON-PAGE SEO
// Crawls up to 3 pages — extracts title, description, h1, schema, alt coverage.
// ---------------------------------------------------------------------------
async function scrapeWebsiteSeo(websiteUrl) {
  if (!websiteUrl) return null;

  const items = await runApifyActor(
    "apify/website-content-crawler",
    {
      startUrls: [{ url: websiteUrl }],
      maxCrawlPages: 3,
      maxCrawlDepth: 1,
      crawlerType: "cheerio",
      saveMarkdown: false,
      saveHtml: false,
      saveFiles: false,
    },
    60000
  );

  if (!items?.length) return null;

  const meta = items[0].metadata || {};
  let totalImages = 0, missingAlt = 0, hasSchema = false;

  for (const page of items) {
    const html = page.html || "";
    const imgs = html.match(/<img[^>]*/gi) || [];
    totalImages += imgs.length;
    missingAlt += imgs.filter(
      (t) => !t.includes("alt=") || /alt=[\"']\s*[\"']/.test(t)
    ).length;
    if (html.includes("application/ld+json")) hasSchema = true;
  }

  const altCoverage =
    totalImages > 0
      ? Math.round(((totalImages - missingAlt) / totalImages) * 100)
      : null;

  let score = 0;
  if (meta.title?.length >= 30 && meta.title?.length <= 65) score += 25;
  else if (meta.title) score += 12;
  if (meta.description?.length >= 100 && meta.description?.length <= 160) score += 25;
  else if (meta.description) score += 12;
  if (meta.h1) score += 20;
  if (hasSchema) score += 15;
  if (altCoverage != null) score += Math.round((altCoverage / 100) * 15);

  return {
    checked: true,
    score: Math.min(100, score),
    title: meta.title || null,
    description: meta.description || null,
    h1: meta.h1 || null,
    hasSchema,
    altCoverage,
    pagesCrawled: items.length,
  };
}

// ---------------------------------------------------------------------------
// 2. GOOGLE MAPS ENRICHMENT
// compass/crawler-google-places — richer than Places API:
//   photos count, Q&A count, categories, "people also search for" competitors,
//   5 review snippets with sentiment.
// city + country both passed for accurate geo-narrowing.
// ---------------------------------------------------------------------------
async function scrapeGoogleMapsEnrichment(businessName, city, country) {
  if (!businessName) return null;

  const parts = [businessName, city, country].filter(Boolean);
  const query = parts.join(", ");

  const items = await runApifyActor(
    "compass/crawler-google-places",
    {
      searchStringsArray: [query],
      maxCrawledPlacesPerSearch: 1,
      language: "en",
      maxReviews: 5,
      scrapeReviews: true,
      scrapeImageUrls: false,
      maxImages: 0,
    },
    90000
  );

  if (!items?.length) return null;
  const place = items[0];

  return {
    checked: true,
    reviews: (place.reviews || []).slice(0, 5).map((r) => ({
      rating: r.stars,
      text: r.text?.slice(0, 200) || null,
      timeAgo: r.publishAt || null,
      ownerReply: r.reviewerNumberOfReviews ? !!r.reviewerId : null,
    })),
    qAndACount: (place.questionsAndAnswers || []).length,
    imageCount: place.imageCount || 0,
    categories: place.categories || [],
    plusCode: place.plusCode || null,
    address: place.address || null,
    website: place.website || null,
    openNow: place.openingHours?.openNow ?? null,
    peoplAlsoSearch: (place.peopleAlsoSearch || []).slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// 3. GOOGLE MAPS REVIEWS — actual review text + unanswered flag
// compass/google-maps-reviews-scraper
// Returns the most recent 10 reviews with owner reply status.
// Tells us exactly which reviews are unanswered (huge action item in report).
// ---------------------------------------------------------------------------
async function scrapeGoogleReviews(businessName, city, country) {
  if (!businessName) return null;

  const query = [businessName, city, country].filter(Boolean).join(", ");

  const items = await runApifyActor(
    "compass/google-maps-reviews-scraper",
    {
      startUrls: [{ url: `https://www.google.com/maps/search/${encodeURIComponent(query)}` }],
      maxReviews: 10,
      language: "en",
      sort: "newest",
      reviewsTranslation: "originalAndTranslated",
    },
    90000
  );

  if (!items?.length) return null;

  const reviews = items.slice(0, 10).map((r) => ({
    rating: r.stars || r.rating || null,
    text: r.text?.slice(0, 300) || null,
    timeAgo: r.publishedAtDate || r.relativePublishedDate || null,
    hasOwnerReply: !!(r.responseFromOwnerText || r.ownerAnswer),
    ownerReplyText: r.responseFromOwnerText?.slice(0, 200) || null,
  }));

  const unanswered = reviews.filter((r) => r.rating <= 3 && !r.hasOwnerReply);
  const avgRating = reviews.reduce((s, r) => s + (r.rating || 0), 0) / (reviews.length || 1);
  const recentNegative = reviews.filter((r) => r.rating <= 2).slice(0, 2);

  return {
    checked: true,
    reviews,
    unansweredCount: unanswered.length,
    unansweredExamples: unanswered.slice(0, 2).map((r) => r.text), // shown verbatim in report
    recentNegative,
    avgRating: Math.round(avgRating * 10) / 10,
    totalFetched: reviews.length,
  };
}

// ---------------------------------------------------------------------------
// 4. INSTAGRAM SCRAPER — real activity, not estimated
// apify/instagram-scraper (official, 277K users)
// Pulls: follower count, post count in last 30 days, last post date,
//        avg engagement rate, bio. Makes social score accurate.
// ---------------------------------------------------------------------------
async function scrapeInstagram(businessName, city) {
  if (!businessName) return null;

  // Search Instagram by keyword — returns public profiles matching the name
  const items = await runApifyActor(
    "apify/instagram-scraper",
    {
      search: `${businessName}${city ? " " + city : ""}`,
      searchType: "user",
      searchLimit: 3,
      resultsLimit: 3,
    },
    60000
  );

  if (!items?.length) return null;

  // Pick most relevant result — highest follower count with name match
  const match = items
    .filter((u) =>
      (u.username || u.fullName || "")
        .toLowerCase()
        .includes(businessName.toLowerCase().split(" ")[0].toLowerCase())
    )
    .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))[0] || items[0];

  if (!match) return null;

  // Calculate post frequency in last 30 days from recent posts array
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const recentPosts = (match.latestPosts || match.posts || [])
    .filter((p) => p.timestamp && now - new Date(p.timestamp).getTime() < thirtyDays);

  const lastPostDate = (match.latestPosts?.[0]?.timestamp) || null;
  const daysSincePost = lastPostDate
    ? Math.round((now - new Date(lastPostDate).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const avgLikes = recentPosts.length
    ? Math.round(recentPosts.reduce((s, p) => s + (p.likesCount || 0), 0) / recentPosts.length)
    : null;

  const engagementRate =
    match.followersCount && avgLikes
      ? Math.round((avgLikes / match.followersCount) * 10000) / 100
      : null;

  return {
    checked: true,
    username: match.username || null,
    followersCount: match.followersCount || 0,
    followingCount: match.followingCount || 0,
    postsCount: match.postsCount || 0,
    postsLast30Days: recentPosts.length,
    daysSinceLastPost: daysSincePost,
    avgLikesPerPost: avgLikes,
    engagementRate,
    bio: match.biography?.slice(0, 150) || null,
    isVerified: match.verified || false,
    profileUrl: match.url || `https://instagram.com/${match.username}`,
  };
}

// ---------------------------------------------------------------------------
// 5. FACEBOOK ADS LIBRARY — competitor active ads
// prodiger/facebook-ads-library-v2 (99.1% success rate)
// Replaces / supplements meta ads API (which requires app review).
// Pulls: ad count, copy, days running, media type, call to action.
// ---------------------------------------------------------------------------
async function scrapeFacebookAds(competitorName, countryCode) {
  if (!competitorName) return null;

  const items = await runApifyActor(
    "scrapesmith/facebook-ad-library-scraper",
    {
      searchQueries: [competitorName],
      country: countryCode || "US",
      adActiveStatus: "active",
      adType: "all",
      maxItems: 10,
    },
    60000
  );

  if (!items?.length) return null;

  const ads = items.slice(0, 6).map((ad) => ({
    id: ad.adArchiveID || ad.id || null,
    headline: ad.snapshot?.title || ad.adTitle || null,
    body: (ad.snapshot?.body?.markup?.["__html"] || ad.adBody || "").replace(/<[^>]+>/g, "").slice(0, 200),
    platform: (ad.publisherPlatforms || ["Facebook"]).join(" + "),
    daysRunning: ad.startDate
      ? Math.round((Date.now() - new Date(ad.startDate).getTime()) / (24 * 60 * 60 * 1000))
      : null,
    startDate: ad.startDate || null,
    callToAction: ad.snapshot?.cta_text || null,
    mediaType: ad.snapshot?.videos?.length ? "video" : ad.snapshot?.images?.length ? "image" : "text",
    status: ad.isActive ? "active" : "inactive",
  }));

  const activeAds = ads.filter((a) => a.status === "active");
  const longestRunning = activeAds.reduce((m, a) => Math.max(m, a.daysRunning || 0), 0);

  return {
    checked: true,
    totalActive: activeAds.length,
    totalFound: ads.length,
    longestRunningDays: longestRunning,
    estimatedMonthlySpend: activeAds.length > 4 ? "~$500–1,200" : activeAds.length > 1 ? "~$200–600" : "~$50–200",
    ads: activeAds.length ? activeAds : ads.slice(0, 3),
  };
}

// ---------------------------------------------------------------------------
// 6. TRIPADVISOR — claim status, ranking, rating, reviews
// maxcopell/tripadvisor
// Perfect for cafes, restaurants, hotels — adds a 6th data source to score.
// ---------------------------------------------------------------------------
async function scrapeTripAdvisor(businessName, city, country) {
  if (!businessName) return null;

  const query = [businessName, city, country].filter(Boolean).join(" ");

  const items = await runApifyActor(
    "maxcopell/tripadvisor",
    {
      query,
      maxItems: 1,
      includeReviews: true,
      maxReviews: 5,
    },
    60000
  );

  if (!items?.length) return null;
  const place = items[0];

  return {
    checked: true,
    name: place.name || null,
    rating: place.rating || null,
    reviewCount: place.numberOfReviews || place.reviewCount || 0,
    ranking: place.rankingString || null,     // e.g. "#3 of 142 Restaurants in Austin"
    ratingDistribution: place.ratingHistogram || null,
    isClaimed: place.claimed ?? null,
    url: place.url || null,
    recentReviews: (place.reviews || []).slice(0, 3).map((r) => ({
      rating: r.rating,
      title: r.title?.slice(0, 80) || null,
      text: r.text?.slice(0, 200) || null,
      date: r.publishedDate || null,
    })),
  };
}

// ---------------------------------------------------------------------------
// MASTER FUNCTION — runs all 6 actors in parallel.
// Called from server.js as: runApifyEnrichment(websiteUrl, businessName, city, country, competitorName)
// Any individual failure returns null for that field — never blocks the scan.
// ---------------------------------------------------------------------------
async function runApifyEnrichment(websiteUrl, businessName, city, countryCode, competitorName) {
  if (!process.env.APIFY_API_TOKEN) {
    return { checked: false, reason: "no_token" };
  }

  console.log(`[Apify] Starting enrichment for: ${businessName}, ${city}, ${countryCode}`);

  // Free scrapers — no Apify credits needed
  const { checkWebsiteSeo } = require("./seoChecker");
  const { scrapeFacebookAdsLibrary: freeScrapeFacebookAds } = require("./facebookAds");
  const { checkInstagramPresence } = require("./instagramChecker");

  const [seoR, googleMapsR, reviewsR, instagramR, facebookAdsR, tripadvisorR] =
    await Promise.allSettled([
      checkWebsiteSeo(websiteUrl), // FREE — no Apify credits
      scrapeGoogleMapsEnrichment(businessName, city, countryCode),
      scrapeGoogleReviews(businessName, city, countryCode),
      scrapeInstagram(businessName, city),
      freeScrapeFacebookAds(competitorName || businessName, countryCode),
      scrapeTripAdvisor(businessName, city, countryCode),
    ]);

  const result = {
    checked: true,
    seo:          seoR.status === "fulfilled"          ? seoR.value          : null,
    googleMaps:   googleMapsR.status === "fulfilled"   ? googleMapsR.value   : null,
    reviews:      reviewsR.status === "fulfilled"      ? reviewsR.value      : null,
    instagram:    instagramR.status === "fulfilled"    ? instagramR.value    : null,
    facebookAds:  facebookAdsR.status === "fulfilled"  ? facebookAdsR.value  : null,
    tripadvisor:  tripadvisorR.status === "fulfilled"  ? tripadvisorR.value  : null,
  };

  // Log what succeeded
  const succeeded = Object.entries(result)
    .filter(([k, v]) => k !== "checked" && v?.checked)
    .map(([k]) => k);
  console.log(`[Apify] Enrichment complete. Succeeded: ${succeeded.join(", ") || "none"}`);

  return result;
}


// ---------------------------------------------------------------------------
// YELP via Apify — no official API needed
// Uses Apify's Yelp scraper to pull rating, review count, unanswered reviews
// ---------------------------------------------------------------------------
async function scrapeYelpViaApify(businessName, city) {
  if (!businessName) return null;
  const query = city ? `${businessName} ${city}` : businessName;
  const items = await runApifyActor(
    "petr_cermak/yelp-scraper",
    {
      searchTerms: [query],
      searchLocation: city || "United States",
      maxResults: 1,
    },
    60000
  );
  if (!items?.length) return null;
  const biz = items[0];
  return {
    checked: true,
    rating: biz.rating || null,
    reviewCount: biz.reviewCount || 0,
    categories: biz.categories || [],
    url: biz.url || null,
  };
}

module.exports = {
  runApifyEnrichment,
  scrapeWebsiteSeo,
  scrapeGoogleMapsEnrichment,
  scrapeGoogleReviews,
  scrapeInstagram,
  scrapeFacebookAds,
  scrapeTripAdvisor,
  scrapeYelpViaApify,
};
