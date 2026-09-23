// services/actionPlan.js
// This is the heart of the ₹599 report: turns raw scores into a
// prioritized, dated, done-for-them 90-day plan. The weakest category
// gets the most attention; nothing generic is shown for a category
// that's already strong.

function generateActionPlan(subScores, businessName = "your business") {
  const plan = { quickWins: [], momentum: [], compound: [] };

  const weakest = Object.entries(subScores)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort((a, b) => a[1] - b[1]);

  for (const [category, score] of weakest) {
    addCategoryActions(plan, category, score, businessName);
  }

  return plan;
}

function addCategoryActions(plan, category, score, businessName) {
  const low = score < 50;
  const mid = score >= 50 && score < 75;

  switch (category) {
    case "google":
      if (low) {
        plan.quickWins.push(
          `Claim and fully complete ${businessName}'s Google Business Profile - hours, category, phone, and at least 10 photos.`
        );
        plan.quickWins.push(
          "Reply to every existing review this week, even old ones - a late reply still counts."
        );
      }
      if (low || mid) {
        plan.momentum.push(
          "Post a Google Business update 1x/week (offer, new product, behind-the-scenes)."
        );
      }
      plan.compound.push(
        "Set up a review-generation system: QR code at checkout + WhatsApp follow-up asking for a review 24hrs after purchase."
      );
      break;

    case "social":
      if (low) {
        plan.quickWins.push(
          "Post at least once this week on your most active platform - consistency matters more than polish right now."
        );
      }
      if (low || mid) {
        plan.momentum.push(
          "Build a 4-week content calendar: 2 product/service posts, 1 behind-the-scenes, 1 customer story per week."
        );
        plan.momentum.push(
          "Respond to every comment/DM within 24 hours for 30 days straight - this alone measurably lifts engagement rate."
        );
      }
      plan.compound.push(
        "Start a short-form video series (Reels/Shorts) - 1 per week for 12 weeks, repurposed across platforms."
      );
      break;

    case "website":
      if (low) {
        plan.quickWins.push(
          "Fix broken links and add SSL (https) if missing - both are one-time technical fixes."
        );
      }
      if (low || mid) {
        plan.momentum.push(
          "Compress images and enable browser caching to improve mobile load speed."
        );
      }
      plan.compound.push(
        "Add basic schema markup and optimize meta titles/descriptions for your top 5 service pages."
      );
      break;

    case "reputation":
      if (low || mid) {
        plan.quickWins.push(
          "Address any unresolved negative reviews publicly and politely - offer to resolve offline."
        );
        plan.momentum.push(
          "Ask your last 20 happy customers directly for a review via WhatsApp/email."
        );
      }
      plan.compound.push(
        "Set a standing process: every completed order/service triggers a review request within 24 hours."
      );
      break;

    case "competitive":
      if (low || mid) {
        plan.momentum.push(
          "Identify your top competitor's best-performing content type and adapt it (not copy) for your brand voice."
        );
      }
      break;
  }
}

module.exports = { generateActionPlan };
