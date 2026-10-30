/**
 * aiInsights.js
 * Six AI-powered insight modules for paid KYP reports.
 * All use Claude (Haiku) by default — cheap, fast, great writing.
 *
 * Exports:
 *   generateAllInsights(reportData) → { narrative, competitor, reviewAnalysis,
 *                                       seoContent, socialAudit, priorityPlan }
 */

const axios = require("axios");

// NOTE: read from process.env at call time (not module load time) so the key
// is picked up even if set after the process started / module was cached.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1200;

// ─── Core Claude caller ───────────────────────────────────────────────────────

// Rules applied to every prompt. These reports are paid deliverables, so the
// model must never invent facts or leave template placeholders behind.
const GROUNDING = `STRICT RULES (apply to everything you write):
- Use ONLY the facts provided below. If something is not provided, say it was "not measured" or skip it. Never guess.
- Never output bracketed placeholders such as [Address], [Phone], [Link], [Name], [QR code]. Write complete text a customer can use as-is, or leave that item out.
- Do NOT include any percentage or numeric statistic unless it appears in VERIFIED FACTS. Never write claims like "X% higher click-through".
- Never invent customer reviews, testimonials, names of customers, statistics, percentages, benchmarks or competitor names.
- Do not use hedging like "likely", "probably" or "possibly" about the business's own accounts; state what was found, or say it was not measured.
- Sample captions, posts or ad copy must not assert facts about the business that are not in VERIFIED FACTS (e.g. "handmade", "made fresh daily", "near [landmark]"). Use neutral wording or tell the owner to edit it to match their business.
- Do not name landmarks, neighbourhood features or cuisine details that are not in VERIFIED FACTS.
- Mobile PageSpeed guide: 90-100 good, 50-89 moderate (room to improve), below 50 slow. Never call a score of 50 or higher "slow".
- Write for a business owner in the United States. Do not mention any other country.
`;

function factsBlock(reportData) {
  const f = reportData.facts || {};
  const lines = [];
  if (f.websiteUrl) lines.push(`Website: ${f.websiteUrl}`); else lines.push("Website: none provided");
  if (f.rating != null) lines.push(`Google rating: ${f.rating} stars`);
  if (f.reviewCount != null) lines.push(`Google reviews: ${f.reviewCount}`);
  if (f.photoCount != null) lines.push(`Google profile photos: ${f.photoCount}`);
  if (f.perfScore != null) lines.push(`Mobile PageSpeed: ${f.perfScore}/100`); else lines.push("Mobile PageSpeed: not measured");
  if (f.isHttps != null) lines.push(`HTTPS: ${f.isHttps ? "yes" : "no"}`);
  if (f.hasViewportMeta != null) lines.push(f.hasViewportMeta ? "Mobile viewport tag: detected" : "Mobile viewport tag: NOT detected by the automated test (word this as \"our test did not detect it, please verify\"; never state the site is not mobile-friendly as fact)");
  lines.push(f.facebookUrl ? `Facebook given: ${f.facebookUrl}` : "Facebook: none provided");
  lines.push(f.instagramHandle ? `Instagram given: @${String(f.instagramHandle).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")}` : "Instagram: none provided");
  if (f.social) lines.push(`Social platform readings: ${JSON.stringify(f.social)}`);
  else lines.push("Social platform readings: not available (do not guess their content or activity)");
  return "VERIFIED FACTS:\n" + lines.join("\n");
}

// Safety net: drop sentences that still carry a percentage figure; the model
// has no sourced statistics to cite, so any such claim is unverifiable.
function stripUnsourcedStats(text) {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!/\d\s?%/.test(line)) return line;
      const kept = line.split(/(?<=[.!?])\s+/).filter((sent) => !/\d\s?%/.test(sent));
      return kept.join(" ");
    })
    .join("\n");
}

async function askClaude(prompt, reportData) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;
  try {
    const { data } = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: GROUNDING + "\n" + (reportData ? factsBlock(reportData) + "\n\n" : "") + prompt }],
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 25000,
      }
    );
    return stripUnsourcedStats(data.content?.[0]?.text || null);
  } catch (err) {
    console.error("Claude insight error:", err.message);
    return null;
  }
}

// ─── 1. AI Report Narrative ───────────────────────────────────────────────────
// Plain-English summary of the full report — makes it feel premium

async function generateNarrative(reportData) {
  const { businessName, city, businessType, scores } = reportData;

  const scoreLines = Object.entries(scores || {})
    .map(([k, v]) => `${k}: ${v}/100`)
    .join(", ");

  const prompt = `You are a digital marketing expert writing a personalized report summary for a local business owner. Be warm, direct and actionable. No fluff.

Business: "${businessName}"
Location: ${city}
Type: ${businessType || "local business"}
Scores: ${scoreLines}

Write a 3-paragraph summary:
1. Overall digital health assessment (2-3 sentences, honest)
2. Their biggest strength based on the scores (1-2 sentences)
3. The single most important thing they should fix first and why (2-3 sentences)

Write as if speaking directly to the business owner. Use "your business" not "the business".`;

  const text = await askClaude(prompt, reportData);
  return text || "Unable to generate narrative at this time.";
}

// ─── 2. Competitor Summary ────────────────────────────────────────────────────
// Top competitors in their city + category

async function generateCompetitorSummary(reportData) {
  const { businessName, city, businessType } = reportData;
  const type = businessType || "business";

  const prompt = `Write a short guide (under 200 words) on how "${businessName}", a ${type} in ${city}, can size up its local competitors. Do NOT name or invent any specific businesses. Cover: what to compare on Google (rating, review count, photos, response to reviews), what to check on their websites and social accounts, and one way to find the top 3 local competitors themselves by searching "${type} in ${city}" on Google Maps.`;

  const text = await askClaude(prompt, reportData);
  return text || "Competitor guidance unavailable.";
}

// ─── 3. Review Analyser ───────────────────────────────────────────────────────
// Analyses review text for themes, sentiment, opportunities

async function analyzeReviews(reportData) {
  const { businessName, city, reviews } = reportData;

  // reviews can be an array of strings or a single summary string
  let reviewText = "";
  if (Array.isArray(reviews) && reviews.length > 0) {
    const reviewsArr = Array.isArray(reviews) ? reviews : (reviews?.reviews || reviews?.results || reviews?.items || []);
reviewText = reviewsArr.filter(r => (typeof r === 'string' ? r : (r?.text || r?.snippet || r?.comment || '')).trim().length > 0).slice(0, 20).map(r => typeof r === "string" ? r : (r?.text || r?.snippet || r?.comment || JSON.stringify(r))).join("\n---\n");
  } else if (typeof reviews === "string" && reviews.length > 0) {
    reviewText = reviews;
  } else {
    // No reviews passed — ask AI to comment generically
    reviewText = `No review text available. Provide general advice for a ${reportData.businessType || "local business"} in ${city}.`;
  }

  const textReviews = Array.isArray(reviews) ? reviews.filter((r) => (typeof r === 'string' ? r : (r?.text || r?.snippet || r?.comment || '')).trim().length > 0) : [];
  const sampleN = textReviews.length;
  const sampleNote = sampleN > 0 ? `You have only ${sampleN} sample review(s) that contain written text out of ${reportData.facts?.reviewCount ?? 'many'} total. State clearly that this is a sample, and never say there are no complaints overall; say none appeared in the sample.` : `No review text was available. Do NOT describe what customers say. Only give general advice on collecting and responding to reviews.`;

  const prompt = `You are a reputation analyst. ${sampleNote} Analyse these customer reviews for "${businessName}" in ${city}:

${reviewText}

Only mention dishes, themes or complaints that literally appear in the review text above; if the sample is too small, say so rather than generalising.

Provide:
1. OVERALL SENTIMENT: (Positive / Mixed / Negative) with one sentence explanation
2. TOP 3 THINGS CUSTOMERS LOVE: (bullet points)
3. TOP 3 RECURRING COMPLAINTS: (bullet points, or "None detected" if absent)
4. ONE ACTIONABLE TIP: to improve their review score

Keep it concise and honest.`;

  const text = await askClaude(prompt, reportData);
  return text || "Review analysis unavailable.";
}

// ─── 4. SEO Content Suggestions ──────────────────────────────────────────────
// 5 blog/FAQ ideas to rank locally

async function generateSeoContent(reportData) {
  const { businessName, city, businessType } = reportData;
  const type = businessType || "local business";

  const prompt = `You are a local SEO expert. Generate 5 blog post or FAQ page ideas for "${businessName}", a ${type} in ${city}.

Each idea should:
- Target a local search query people actually type
- Be realistic for a small business to write
- Help them rank on Google for "${type} in ${city}" type searches

Format:
1. [Title] — [One sentence on why this will rank and attract customers]

Make titles specific, not generic.`;

  const text = await askClaude(prompt, reportData);
  return text || "SEO content suggestions unavailable.";
}

// ─── 5. Social Media Audit ────────────────────────────────────────────────────
// Scores their social consistency + suggestions

async function auditSocialMedia(reportData) {
  const { businessName, city, businessType, socialData } = reportData;

  // socialData can include bios, post samples etc. if available
  const context = socialData
    ? `Social media data: ${JSON.stringify(socialData)}`
    : `No social data provided. Give general advice for a ${businessType || "local business"} in ${city}.`;

  const prompt = `You are a social media strategist for local businesses. Audit the social media presence of "${businessName}" in ${city}.

${context}

Provide:
1. CONSISTENCY CHECK: Are they mentioning their city and business category clearly? (Yes/No/Partial + reason)
2. PROFILE STATUS: what was found on their accounts, using only the verified facts (do NOT give a numeric score and do NOT claim how active they are unless activity data is provided)
3. TOP 3 QUICK WINS: specific things they can fix in their bio or posts this week
4. CONTENT IDEA: One post idea they should publish this week that will get local engagement

Be specific to their business type: ${businessType || "local business"}.`;

  const text = await askClaude(prompt, reportData);
  return text || "Social media audit unavailable.";
}

// ─── 6. Priority Action Plan ─────────────────────────────────────────────────
// Ranked "fix these first" based on all scores

async function generatePriorityPlan(reportData) {
  const { businessName, city, businessType, scores, aiVisibility } = reportData;

  const scoreLines = Object.entries(scores || {})
    .map(([k, v]) => `${k}: ${v}/100`)
    .join("\n");

  const aiScore = aiVisibility?.score ?? "unknown";
  const aiGrade = aiVisibility?.grade ?? "";

  const prompt = `You are a digital marketing consultant. Based on this business's audit scores, create a prioritized 30-day action plan.

Business: "${businessName}" — ${businessType || "local business"} in ${city}

SCORES:
${scoreLines}
AI Visibility: ${aiScore}/100 (${aiGrade})

Create a clear "Fix These First" action plan:

WEEK 1 — URGENT (highest impact, easiest wins):
- [2-3 specific tasks]

WEEK 2 — IMPORTANT (takes a bit more effort):
- [2-3 specific tasks]

WEEK 3-4 — GROWTH (longer term):
- [2-3 specific tasks]

Be very specific. Name the exact platform or action. No generic advice.`;

  const text = await askClaude(prompt, reportData);
  return text || "Priority plan unavailable.";
}

// ─── Master export ────────────────────────────────────────────────────────────

async function generateAllInsights(reportData) {
  console.log(`AI Insights: Generating all 6 modules for "${reportData.businessName}"...`);

  // Run all 6 in parallel
  const [
    narrative,
    competitor,
    reviewAnalysis,
    seoContent,
    socialAudit,
    priorityPlan,
  ] = await Promise.all([
    generateNarrative(reportData),
    generateCompetitorSummary(reportData),
    analyzeReviews(reportData),
    generateSeoContent(reportData),
    auditSocialMedia(reportData),
    generatePriorityPlan(reportData),
  ]);

  console.log("AI Insights: All 6 modules complete.");

  return {
    narrative,
    competitor,
    reviewAnalysis,
    seoContent,
    socialAudit,
    priorityPlan,
  };
}

module.exports = { generateAllInsights };
