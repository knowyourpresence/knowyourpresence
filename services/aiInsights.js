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

async function askClaude(prompt) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return null;
  try {
    const { data } = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
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
    return data.content?.[0]?.text || null;
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

  const text = await askClaude(prompt);
  return text || "Unable to generate narrative at this time.";
}

// ─── 2. Competitor Summary ────────────────────────────────────────────────────
// Top competitors in their city + category

async function generateCompetitorSummary(reportData) {
  const { businessName, city, businessType } = reportData;
  const type = businessType || "business";

  const prompt = `List the top 5 competitors or similar businesses to "${businessName}" in ${city} that are in the ${type} category.

For each competitor, give:
- Business name
- One sentence on why they are strong competition (online presence, reviews, visibility)

Format as a clean numbered list. If you don't know specific competitors, describe the competitive landscape generally for ${type}s in ${city}.`;

  const text = await askClaude(prompt);
  return text || "Competitor data unavailable.";
}

// ─── 3. Review Analyser ───────────────────────────────────────────────────────
// Analyses review text for themes, sentiment, opportunities

async function analyzeReviews(reportData) {
  const { businessName, city, reviews } = reportData;

  // reviews can be an array of strings or a single summary string
  let reviewText = "";
  if (Array.isArray(reviews) && reviews.length > 0) {
    const reviewsArr = Array.isArray(reviews) ? reviews : (reviews?.reviews || reviews?.results || reviews?.items || []);
reviewText = reviewsArr.slice(0, 20).map(r => typeof r === "string" ? r : (r?.text || r?.snippet || r?.comment || JSON.stringify(r))).join("\n---\n");
  } else if (typeof reviews === "string" && reviews.length > 0) {
    reviewText = reviews;
  } else {
    // No reviews passed — ask AI to comment generically
    reviewText = `No review text available. Provide general advice for a ${reportData.businessType || "local business"} in ${city}.`;
  }

  const prompt = `You are a reputation analyst. Analyse these customer reviews for "${businessName}" in ${city}:

${reviewText}

Provide:
1. OVERALL SENTIMENT: (Positive / Mixed / Negative) with one sentence explanation
2. TOP 3 THINGS CUSTOMERS LOVE: (bullet points)
3. TOP 3 RECURRING COMPLAINTS: (bullet points, or "None detected" if absent)
4. ONE ACTIONABLE TIP: to improve their review score

Keep it concise and honest.`;

  const text = await askClaude(prompt);
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

  const text = await askClaude(prompt);
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
2. PROFILE OPTIMIZATION SCORE: /10 with explanation
3. TOP 3 QUICK WINS: specific things they can fix in their bio or posts this week
4. CONTENT IDEA: One post idea they should publish this week that will get local engagement

Be specific to their business type: ${businessType || "local business"}.`;

  const text = await askClaude(prompt);
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

  const text = await askClaude(prompt);
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
