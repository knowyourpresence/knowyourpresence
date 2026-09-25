// services/instagramChecker.js
// Free Instagram presence checker — no API, no Apify credits.
// Checks if a business has an Instagram profile and gets basic public data.
// Instagram blocks heavy scraping but basic profile existence checks work fine.

const axios = require("axios");

async function checkInstagramPresence(businessName, websiteUrl) {
  if (!businessName) return null;

  // Clean business name to generate likely Instagram handle
  const handle = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);

  const handles = [
    handle,
    handle.replace(/\s/g, ''),
    businessName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30),
    businessName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '').slice(0, 30),
  ].filter((h, i, arr) => h.length >= 3 && arr.indexOf(h) === i);

  // Try Instagram's oEmbed API — free, no auth needed
  for (const h of handles) {
    try {
      const profileUrl = `https://www.instagram.com/${h}/`;
      const { data: html } = await axios.get(profileUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
          "Accept": "text/html",
        },
      });

      // Profile exists — extract basic data from meta tags
      const followerMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/) ||
                            html.match(/(\d+(?:,\d+)*)\s*Followers/i);
      const followers = followerMatch
        ? parseInt(followerMatch[1].replace(/,/g, ''))
        : null;

      const postMatch = html.match(/"edge_owner_to_timeline_media":\{"count":(\d+)\}/);
      const postCount = postMatch ? parseInt(postMatch[1]) : null;

      const isPrivate = html.includes('"is_private":true');
      const profileExists = html.includes('"@type":"ProfilePage"') ||
                            html.includes('instagram.com/') ||
                            html.includes('"pageType":"ProfilePage"');

      if (profileExists) {
        return {
          checked: true,
          found: true,
          handle: h,
          profileUrl,
          followers,
          postCount,
          isPrivate,
          source: "instagram_direct",
        };
      }
    } catch (e) {
      // Try next handle
      continue;
    }
  }

  // Check website for Instagram link
  if (websiteUrl) {
    try {
      const { data: siteHtml } = await axios.get(websiteUrl, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const igMatch = siteHtml.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
      if (igMatch) {
        return {
          checked: true,
          found: true,
          handle: igMatch[1],
          profileUrl: `https://instagram.com/${igMatch[1]}`,
          source: "found_on_website",
        };
      }
    } catch (e) {
      // Website check failed
    }
  }

  return {
    checked: true,
    found: false,
    triedHandles: handles,
    source: "not_found",
  };
}

module.exports = { checkInstagramPresence };
