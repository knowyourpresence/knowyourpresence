// services/scoring.js
// Core weighted-scoring engine for the Business Pulse Score.
// Each sub-score comes in as 0-100 from its own module, and gets
// combined here using the weights we defined in the blueprint.

const WEIGHTS = {
  google: 0.25,
  social: 0.30,
  website: 0.20,
  reputation: 0.15,
  competitive: 0.10,
};

/**
 * @param {object} subScores - { google, social, website, reputation, competitive }
 *   each a number 0-100 (competitive can be null if no competitor supplied)
 * @returns {object} { overall, breakdown, grade }
 */
function calculateOverallScore(subScores) {
  const usedKeys = Object.keys(WEIGHTS).filter(
    (k) => subScores[k] !== null && subScores[k] !== undefined
  );

  // Re-normalize weights if competitive data wasn't available,
  // so the score isn't unfairly dragged down by a missing input.
  const totalWeight = usedKeys.reduce((sum, k) => sum + WEIGHTS[k], 0);

  const overall = usedKeys.reduce((sum, k) => {
    return sum + (subScores[k] * (WEIGHTS[k] / totalWeight));
  }, 0);

  return {
    overall: Math.round(overall),
    breakdown: usedKeys.map((k) => ({
      category: k,
      score: Math.round(subScores[k]),
      weight: WEIGHTS[k],
    })),
    grade: gradeFor(overall),
  };
}

function gradeFor(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Needs Attention";
  return "Critical";
}

/**
 * Simple "potential score in 90 days" projection.
 * Assumes each weak category (below 60) can realistically climb
 * by ~25-35 points with focused effort; strong categories nudge up slightly.
 */
function projectPotentialScore(subScores) {
  const projected = {};
  for (const key of Object.keys(subScores)) {
    const val = subScores[key];
    if (val === null || val === undefined) continue;
    if (val < 40) projected[key] = Math.min(100, val + 35);
    else if (val < 60) projected[key] = Math.min(100, val + 25);
    else if (val < 80) projected[key] = Math.min(100, val + 12);
    else projected[key] = Math.min(100, val + 5);
  }
  return calculateOverallScore(projected).overall;
}

module.exports = { calculateOverallScore, projectPotentialScore, WEIGHTS };
