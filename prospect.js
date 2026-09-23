#!/usr/bin/env node
/**
 * prospect.js - Finds local businesses with weak online presence, ranked
 * worst-first, with the public contact details needed to reach them.
 *
 * WHY THIS EXISTS: cold outreach fails when you have nothing specific to say.
 * This produces the opposite - a list where you already know exactly what is
 * wrong with each business's Google profile before you ever contact them.
 *
 * USAGE:
 *   node prospect.js "coffee shops" "Austin, TX" [maxResults]
 *   node prospect.js "dentists" "Manchester, UK" 40
 *
 * OUTPUT: data/prospects-<slug>.csv - open it in any spreadsheet.
 *
 * ---------------------------------------------------------------------------
 * LEGAL / ETHICAL NOTES - READ BEFORE USING THE OUTPUT
 *
 * This only collects business contact details that are ALREADY PUBLIC on
 * Google Business Profiles - the same information a customer sees. It does
 * not scrape personal emails or bypass any access control.
 *
 * Cold B2B email rules differ sharply by country:
 *   - US (CAN-SPAM): permitted, but you MUST include a working opt-out and a
 *     real physical postal address in every email.
 *   - Australia (Spam Act): permitted for B2B with an opt-out and accurate
 *     sender details.
 *   - UK / EU (GDPR + PECR): significantly stricter. "Legitimate interest"
 *     can cover B2B outreach, but the bar is higher and enforcement is real.
 *     Do not treat this as equivalent to the US position.
 *
 * Role addresses (info@, contact@, hello@) are much safer ground than
 * personal ones (firstname.lastname@), which attract stricter GDPR treatment.
 *
 * COST WARNING: each business costs a Google Places API call. The Enterprise
 * tier (needed for ratings/reviews) is ~$40 per 1,000 calls with only 1,000
 * free per month. Scanning 500 businesses is roughly $20. Start small.
 * ---------------------------------------------------------------------------
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OUT_DIR = path.join(__dirname, "data");

/** Searches Google Places for businesses matching a query in an area. */
async function searchBusinesses(query, location, maxResults) {
  const results = [];
  let pageToken = null;

  while (results.length < maxResults) {
    const body = {
      textQuery: `${query} in ${location}`,
      maxResultCount: Math.min(20, maxResults - results.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const { data } = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      body,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating," +
            "places.userRatingCount,places.websiteUri,places.nationalPhoneNumber," +
            "places.regularOpeningHours,places.photos,nextPageToken",
        },
      }
    );

    const places = data.places || [];
    results.push(...places);

    pageToken = data.nextPageToken;
    if (!pageToken || places.length === 0) break;

    // Google requires a short pause before a page token becomes valid
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results.slice(0, maxResults);
}

/**
 * Scores a profile 0-100 and lists what is concretely wrong.
 * The issues array is the valuable part - it is what makes outreach specific.
 */
function scoreProfile(place) {
  const rating = place.rating || 0;
  const reviews = place.userRatingCount || 0;
  const photos = (place.photos || []).length;
  const hasHours = !!place.regularOpeningHours;
  const hasWebsite = !!place.websiteUri;
  const hasPhone = !!place.nationalPhoneNumber;

  let score = 0;
  const issues = [];

  // Rating quality - up to 30
  score += Math.min(30, (rating / 5) * 30);
  if (rating > 0 && rating < 4.0) issues.push(`Rating is only ${rating.toFixed(1)}`);

  // Review volume - up to 30 (100+ reviews is the practical benchmark)
  score += Math.min(30, (reviews / 100) * 30);
  if (reviews === 0) issues.push("No reviews at all");
  else if (reviews < 20) issues.push(`Only ${reviews} reviews`);

  // Photos - up to 20
  score += Math.min(20, (photos / 10) * 20);
  if (photos === 0) issues.push("No photos on the profile");
  else if (photos < 5) issues.push(`Only ${photos} photo${photos === 1 ? "" : "s"}`);

  // Completeness - 10 each
  if (hasHours) score += 10; else issues.push("Opening hours not listed");
  if (hasWebsite) score += 10; else issues.push("No website linked");
  if (!hasPhone) issues.push("No phone number listed");

  return { score: Math.round(score), issues };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const [query, location, maxArg] = process.argv.slice(2);
  const maxResults = Number(maxArg) || 20;

  if (!query || !location) {
    console.log('Usage: node prospect.js "<industry>" "<city>" [maxResults]');
    console.log('   eg: node prospect.js "coffee shops" "Austin, TX" 30');
    process.exit(1);
  }
  if (!API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY is not set in .env - cannot search.");
    process.exit(1);
  }

  console.log(`Searching: ${query} in ${location} (up to ${maxResults})...`);
  console.log(`Estimated API cost: ~$${((maxResults / 1000) * 40).toFixed(2)}\n`);

  let places;
  try {
    places = await searchBusinesses(query, location, maxResults);
  } catch (err) {
    console.error("Search failed:", err.response?.data?.error?.message || err.message);
    process.exit(1);
  }

  const scored = places
    .map((p) => {
      const { score, issues } = scoreProfile(p);
      return {
        name: p.displayName?.text || "Unknown",
        address: p.formattedAddress || "",
        score,
        rating: p.rating || 0,
        reviews: p.userRatingCount || 0,
        photos: (p.photos || []).length,
        website: p.websiteUri || "",
        phone: p.nationalPhoneNumber || "",
        issues: issues.join("; "),
        placeId: p.id,
      };
    })
    .sort((a, b) => a.score - b.score); // worst first - these are your buyers

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const slug = `${query}-${location}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const outPath = path.join(OUT_DIR, `prospects-${slug}.csv`);

  const headers = ["Score", "Business", "Address", "Rating", "Reviews", "Photos", "Website", "Phone", "Issues Found", "PlaceId"];
  const rows = scored.map((r) =>
    [r.score, r.name, r.address, r.rating, r.reviews, r.photos, r.website, r.phone, r.issues, r.placeId]
      .map(csvEscape).join(",")
  );
  fs.writeFileSync(outPath, [headers.join(","), ...rows].join("\n"));

  // Console summary of the best opportunities
  console.log("Weakest profiles (your best prospects):\n");
  scored.slice(0, 10).forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${String(r.score).padStart(3)}/100] ${r.name}`);
    if (r.issues) console.log(`      ${r.issues}`);
    if (r.website) console.log(`      ${r.website}`);
  });

  const noWebsite = scored.filter((r) => !r.website).length;
  console.log(`\nSaved ${scored.length} businesses to ${outPath}`);
  console.log(`\nNOTE: ${noWebsite} have no website listed - you will need to find`);
  console.log("their contact details another way (their Facebook page, or by phone).");
  console.log("For the rest, visit each site and look for a public info@ or contact@ address.");
}

main();
