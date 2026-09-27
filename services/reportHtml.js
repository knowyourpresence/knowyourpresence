// services/reportHtml.js
// Generates the hosted web report HTML page customers see after purchase.
// Called from server.js: const htmlContent = generateWebReport(reportData);
// Saved to REPORTS_DIR/{reportId}.html and served at /api/report/{reportId}

"use strict";

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(n) {
  if (n >= 80) return "#22c55e"; // green
  if (n >= 60) return "#f59e0b"; // amber
  return "#ef4444";              // red
}

function scoreLabel(n) {
  if (n >= 80) return "Strong";
  if (n >= 60) return "Average";
  return "Needs Work";
}

function gradeBadge(grade) {
  const colors = { A: "#22c55e", B: "#84cc16", C: "#f59e0b", D: "#ef4444", F: "#dc2626" };
  const g = (grade || "C")[0].toUpperCase();
  return `<span style="background:${colors[g] || "#6b7280"};color:#fff;padding:4px 14px;border-radius:6px;font-size:1.4rem;font-weight:700;">${g}</span>`;
}

// Convert markdown-style **bold** and \n to HTML
function mdToHtml(text) {
  if (!text) return "";
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// Render a numbered/bulleted list from text that has lines starting with 1. 2. or - •
function listToHtml(text) {
  if (!text) return "";
  const lines = text.split("\n").filter(l => l.trim());
  const items = lines.map(l => {
    const clean = l.replace(/^[\d]+\.\s*/, "").replace(/^[-•*]\s*/, "").trim();
    return `<li>${mdToHtml(clean)}</li>`;
  });
  return `<ul style="margin:0;padding-left:1.2rem;line-height:1.8">${items.join("")}</ul>`;
}

// ─── score ring SVG ───────────────────────────────────────────────────────────

function scoreRing(value, size = 80) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100) / 100;
  const dash = circ * pct;
  const color = scoreColor(value);
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
  <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="7"/>
  <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="7"
    stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
    stroke-dashoffset="${(circ * 0.25).toFixed(1)}"
    stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
  <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
    font-size="${size < 70 ? 13 : 16}" font-weight="700" fill="${color}">${value}</text>
</svg>`;
}

// ─── AI Insights section ──────────────────────────────────────────────────────

function renderAiInsights(ai) {
  if (!ai) return `
<div class="section ai-section" style="border:2px dashed #d1d5db;text-align:center;padding:2.5rem;border-radius:12px;">
  <p style="color:#9ca3af;font-size:.95rem;margin:0">
    AI Insights not available for this report.<br>
    <small>Contact support if you expected AI analysis.</small>
  </p>
</div>`;

  const modules = [
    {
      key: "narrative",
      icon: "📊",
      title: "Executive Summary",
      sub: "AI-written overview of your digital presence",
      content: ai.narrative,
      type: "prose"
    },
    {
      key: "competitor",
      icon: "🏁",
      title: "Competitor Landscape",
      sub: "How you compare to local competitors",
      content: ai.competitor,
      type: "prose"
    },
    {
      key: "reviewAnalysis",
      icon: "⭐",
      title: "Review Intelligence",
      sub: "What your customers are really saying",
      content: ai.reviewAnalysis,
      type: "prose"
    },
    {
      key: "seoContent",
      icon: "🔍",
      title: "SEO & Content Ideas",
      sub: "Keywords and content angles to pursue",
      content: ai.seoContent,
      type: "list"
    },
    {
      key: "socialAudit",
      icon: "📱",
      title: "Social Media Audit",
      sub: "Platform-by-platform recommendations",
      content: ai.socialAudit,
      type: "prose"
    },
    {
      key: "priorityPlan",
      icon: "🎯",
      title: "30-Day Priority Plan",
      sub: "Your personalised action roadmap",
      content: ai.priorityPlan,
      type: "list"
    }
  ];

  const cards = modules.map(({ icon, title, sub, content, type }) => {
    const body = content
      ? (type === "list" ? listToHtml(content) : `<p style="margin:0;line-height:1.75;color:#374151">${mdToHtml(content)}</p>`)
      : `<p style="margin:0;color:#9ca3af;font-style:italic">Analysis not available.</p>`;

    return `
<div class="ai-module-card">
  <div class="ai-module-head">
    <span class="ai-module-icon">${icon}</span>
    <div>
      <div class="ai-module-title">${esc(title)}</div>
      <div class="ai-module-sub">${esc(sub)}</div>
    </div>
  </div>
  <div class="ai-module-body">${body}</div>
</div>`;
  }).join("");

  return `
<div class="section ai-section">
  <div class="section-header">
    <h2 class="section-title">✦ AI-Written Insights</h2>
    <span class="section-badge">Powered by Claude AI</span>
  </div>
  <p style="color:#6b7280;margin:0 0 1.5rem;font-size:.95rem">
    Six intelligence modules written specifically for ${esc(ai._businessName || "your business")} based on your digital presence data.
  </p>
  <div class="ai-modules-grid">${cards}</div>
</div>`;
}

// ─── score cards ──────────────────────────────────────────────────────────────

function renderScores(scores) {
  const cats = [
    { key: "google",     label: "Google Business",  icon: "🗺️" },
    { key: "social",     label: "Social Media",      icon: "📱" },
    { key: "website",    label: "Website",           icon: "🌐" },
    { key: "reputation", label: "Reputation",        icon: "⭐" },
  ];
  return cats.map(({ key, label, icon }) => {
    const v = scores?.[key] ?? 0;
    return `
<div class="score-card">
  <div class="score-card-top">
    <span class="score-icon">${icon}</span>
    <span class="score-label">${label}</span>
  </div>
  ${scoreRing(v, 90)}
  <div class="score-status" style="color:${scoreColor(v)}">${scoreLabel(v)}</div>
</div>`;
  }).join("");
}

// ─── reviews section ──────────────────────────────────────────────────────────

function renderReviews(reviews) {
  // Normalise: Apify sometimes returns an object instead of an array
  const reviewsNorm = Array.isArray(reviews)
    ? reviews
    : (reviews?.reviews || reviews?.results || reviews?.items || []);
  if (!reviewsNorm || reviewsNorm.length === 0) return "";
  const shown = reviewsNorm.slice(0, 5);
  const stars = n => "★".repeat(Math.min(n, 5)) + "☆".repeat(Math.max(5 - n, 0));
  const cards = shown.map(r => `
<div class="review-card">
  <div class="review-stars" style="color:#f59e0b">${stars(r.rating || 5)}</div>
  <p class="review-text">"${esc(r.text || r.snippet || r.body || "")}"</p>
  <div class="review-author">— ${esc(r.author || r.name || "Customer")}</div>
</div>`).join("");
  return `
<div class="section">
  <div class="section-header">
    <h2 class="section-title">Customer Reviews Sample</h2>
  </div>
  <div class="reviews-grid">${cards}</div>
</div>`;
}

// ─── main export ──────────────────────────────────────────────────────────────

function generateWebReport(data) {
  const {
    businessName = "Your Business",
    businessType = "",
    city = "",
    reportId = "",
    reportDate = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
    scores = {},
    scanDetails = {},
    competitor,
    apify,
    urlscan,
    metaAds,
    aiInsights,
  } = data;

  // FIX: only average non-zero scores; fall back to scanDetails.overall if scores are empty
  const validScores = Object.values(scores).filter(v => typeof v === "number" && v > 0);
  const overall = scanDetails?.overall
    ?? (validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : null)
    ?? 0;
  const grade = scanDetails?.grade ?? (overall >= 80 ? "A" : overall >= 65 ? "B" : overall >= 50 ? "C" : "D");

  // Patch business name into AI insights for personalisation in render
  if (aiInsights) aiInsights._businessName = businessName;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(businessName)} — Digital Presence Report | Know Your Presence</title>
<style>
/* ── reset & tokens ─────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --purple: #8b5cf6;
  --purple-light: #ede9fe;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-900: #111827;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06);
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--gray-50); color: var(--gray-900); line-height: 1.6; }
a { color: var(--purple); text-decoration: none; }

/* ── layout ─────────────────────────────────── */
.wrap { max-width: 900px; margin: 0 auto; padding: 0 1.25rem; }

/* ── header ─────────────────────────────────── */
.report-header {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%);
  color: #fff; padding: 2.5rem 0 2rem;
}
.report-header .wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 1.5rem; }
.header-brand { font-size: .8rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; opacity: .7; margin-bottom: .3rem; }
.header-biz { font-size: 1.9rem; font-weight: 800; line-height: 1.2; }
.header-meta { font-size: .9rem; opacity: .75; margin-top: .3rem; }
.header-score-wrap { margin-left: auto; text-align: center; background: rgba(255,255,255,.1); border-radius: var(--radius); padding: 1.2rem 2rem; }
.header-score-label { font-size: .75rem; text-transform: uppercase; letter-spacing: .1em; opacity: .7; margin-bottom: .4rem; }
.header-score-num { font-size: 3rem; font-weight: 800; line-height: 1; }
.header-grade { margin-top: .5rem; }

/* ── nav strip ──────────────────────────────── */
.report-nav {
  background: #fff; border-bottom: 1px solid var(--gray-200);
  position: sticky; top: 0; z-index: 100;
}
.report-nav .wrap { display: flex; gap: 0; overflow-x: auto; }
.report-nav a {
  flex-shrink: 0; padding: .75rem 1.1rem; font-size: .82rem; font-weight: 600;
  color: var(--gray-600); border-bottom: 2px solid transparent; white-space: nowrap;
}
.report-nav a:hover, .report-nav a.active { color: var(--purple); border-bottom-color: var(--purple); }

/* ── content ────────────────────────────────── */
.report-body { padding: 2.5rem 0 4rem; }
.section { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 2rem; margin-bottom: 1.5rem; }
.section-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.section-title { font-size: 1.15rem; font-weight: 700; }
.section-badge {
  font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  background: var(--purple-light); color: var(--purple); padding: .3rem .75rem; border-radius: 99px;
}

/* ── score cards ────────────────────────────── */
.scores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; }
.score-card { background: var(--gray-50); border-radius: 10px; padding: 1.2rem; text-align: center; border: 1px solid var(--gray-200); }
.score-card-top { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-bottom: .75rem; }
.score-icon { font-size: 1.1rem; }
.score-label { font-size: .8rem; font-weight: 600; color: var(--gray-700); }
.score-status { font-size: .78rem; font-weight: 700; margin-top: .5rem; }

/* ── overall banner ─────────────────────────── */
.overall-banner {
  border-radius: var(--radius); padding: 1.5rem 2rem;
  display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.overall-banner.good  { background: #f0fdf4; border: 1px solid #bbf7d0; }
.overall-banner.avg   { background: #fffbeb; border: 1px solid #fde68a; }
.overall-banner.poor  { background: #fef2f2; border: 1px solid #fecaca; }
.overall-label { font-size: .8rem; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; opacity: .7; }
.overall-num { font-size: 2.5rem; font-weight: 800; line-height: 1; }
.overall-tagline { font-size: 1rem; font-weight: 600; margin-top: .2rem; }
.overall-desc { font-size: .9rem; color: var(--gray-600); margin-top: .35rem; }

/* ── ai section ─────────────────────────────── */
.ai-section { border: 2px solid var(--purple-light); }
.ai-section .section-title { color: var(--purple); }
.ai-modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
.ai-module-card { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 10px; overflow: hidden; }
.ai-module-head { display: flex; align-items: flex-start; gap: .75rem; padding: 1rem 1rem .75rem; border-bottom: 1px solid var(--gray-200); background: #fff; }
.ai-module-icon { font-size: 1.4rem; flex-shrink: 0; margin-top: .05rem; }
.ai-module-title { font-weight: 700; font-size: .95rem; }
.ai-module-sub { font-size: .77rem; color: var(--gray-600); margin-top: .15rem; }
.ai-module-body { padding: 1rem; font-size: .88rem; }
.ai-module-body ul { list-style: none; }
.ai-module-body li { padding: .25rem 0; padding-left: 1.1rem; position: relative; }
.ai-module-body li::before { content: "→"; position: absolute; left: 0; color: var(--purple); font-weight: 700; }

/* ── reviews ────────────────────────────────── */
.reviews-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.review-card { background: var(--gray-50); border-radius: 10px; padding: 1.1rem; border: 1px solid var(--gray-200); }
.review-stars { font-size: 1rem; margin-bottom: .4rem; }
.review-text { font-size: .88rem; color: var(--gray-700); line-height: 1.6; margin-bottom: .5rem; }
.review-author { font-size: .78rem; color: var(--gray-600); font-weight: 600; }

/* ── detail tables ──────────────────────────── */
.detail-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
.detail-table th { text-align: left; padding: .5rem .75rem; background: var(--gray-100); font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; color: var(--gray-600); }
.detail-table td { padding: .6rem .75rem; border-bottom: 1px solid var(--gray-100); }
.detail-table tr:last-child td { border-bottom: none; }
.chk-yes { color: var(--green); font-weight: 700; }
.chk-no  { color: var(--red);   font-weight: 700; }

/* ── footer ─────────────────────────────────── */
.report-footer { background: #1e1b4b; color: rgba(255,255,255,.65); text-align: center; padding: 2rem; font-size: .8rem; }
.report-footer strong { color: #fff; }

/* ── print ──────────────────────────────────── */
@media print {
  .report-nav { display: none; }
  .section { break-inside: avoid; box-shadow: none; border: 1px solid var(--gray-200); }
}

/* ── responsive ─────────────────────────────── */
@media (max-width: 600px) {
  .header-biz { font-size: 1.4rem; }
  .header-score-wrap { margin-left: 0; width: 100%; }
  .ai-modules-grid { grid-template-columns: 1fr; }
  .scores-grid { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>

<!-- ═══ HEADER ═══════════════════════════════════════════════════════════ -->
<header class="report-header">
  <div class="wrap">
    <div>
      <div class="header-brand">Know Your Presence — Digital Audit Report</div>
      <div class="header-biz">${esc(businessName)}</div>
      <div class="header-meta">
        ${city ? `📍 ${esc(city)}` : ""}
        ${businessType ? ` &nbsp;·&nbsp; ${esc(businessType)}` : ""}
        &nbsp;·&nbsp; ${esc(reportDate)}
      </div>
      <div style="margin-top:.75rem;font-size:.8rem;opacity:.6">Report ID: ${esc(reportId)}</div>
    </div>
    <div class="header-score-wrap">
      <div class="header-score-label">Overall Score</div>
      <div class="header-score-num" style="color:${scoreColor(overall)}">${overall}</div>
      <div class="header-grade">${gradeBadge(grade)}</div>
      <div style="margin-top:.5rem;font-size:.75rem;opacity:.7">out of 100</div>
    </div>
  </div>
</header>

<!-- ═══ NAV ══════════════════════════════════════════════════════════════ -->
<nav class="report-nav">
  <div class="wrap">
    <a href="#overview">Overview</a>
    <a href="#scores">Scores</a>
    ${aiInsights ? '<a href="#ai-insights">✦ AI Insights</a>' : ""}
    <a href="#details">Details</a>
    <a href="#next-steps">Next Steps</a>
  </div>
</nav>

<!-- ═══ BODY ══════════════════════════════════════════════════════════════ -->
<main class="report-body">
<div class="wrap">

<!-- overall banner -->
<div id="overview" class="overall-banner ${overall >= 75 ? "good" : overall >= 50 ? "avg" : "poor"}">
  <div>
    ${scoreRing(overall, 100)}
  </div>
  <div>
    <div class="overall-label">Overall Presence Score</div>
    <div class="overall-num" style="color:${scoreColor(overall)}">${overall} / 100 &nbsp;${gradeBadge(grade)}</div>
    <div class="overall-tagline">${scoreLabel(overall)} Digital Presence</div>
    <div class="overall-desc">
      ${overall >= 75
        ? `${esc(businessName)} has a solid digital footprint. Focus on maintaining consistency and amplifying strengths.`
        : overall >= 50
        ? `${esc(businessName)} has room to grow. Address the priority actions below to unlock real growth.`
        : `${esc(businessName)}'s digital presence needs attention. The action plan below gives you a clear path forward.`}
    </div>
  </div>
</div>

<!-- ── Scores ──────────────────────────────────────────────────────── -->
<div id="scores" class="section">
  <div class="section-header">
    <h2 class="section-title">Category Scores</h2>
  </div>
  <div class="scores-grid">${renderScores(scores)}</div>
</div>

<!-- ── AI Insights ─────────────────────────────────────────────────── -->
<div id="ai-insights">
  ${renderAiInsights(aiInsights)}
</div>

<!-- ── Details ─────────────────────────────────────────────────────── -->
<div id="details" class="section">
  <div class="section-header">
    <h2 class="section-title">Presence Checklist</h2>
  </div>
  <table class="detail-table">
    <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
    <tbody>
      ${[
        ["Google Business Profile", scanDetails?.hasGBP,        scanDetails?.gbpStatus || ""],
        ["Website Detected",        scanDetails?.hasWebsite,     scanDetails?.websiteUrl || ""],
        ["SSL Certificate",         scanDetails?.hasSSL,         ""],
        ["Mobile Friendly",         scanDetails?.isMobile,       ""],
        ["Facebook Page",           scanDetails?.hasFacebook,    ""],
        ["Instagram Account",       scanDetails?.hasInstagram,   ""],
        ["Reviews Present",         scanDetails?.hasReviews,     scanDetails?.reviewCount ? `${scanDetails.reviewCount} reviews` : ""],
        ["Meta Ads Running",        metaAds?.adsFound,           metaAds?.adsFound ? `${metaAds.adCount || ""} active ads found` : "Not running ads"],
      ].map(([label, status, detail]) => `
      <tr>
        <td>${esc(label)}</td>
        <td class="${status ? "chk-yes" : "chk-no"}">${status ? "✓ Yes" : "✗ No"}</td>
        <td style="color:#6b7280">${esc(detail)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

<!-- ── Competitor ──────────────────────────────────────────────────── -->
${competitor ? `
<div class="section">
  <div class="section-header">
    <h2 class="section-title">Top Competitor Snapshot</h2>
  </div>
  <table class="detail-table">
    <tbody>
      <tr><td><strong>Name</strong></td><td>${esc(competitor.name || "")}</td></tr>
      <tr><td><strong>Rating</strong></td><td>${esc(competitor.rating || "")}</td></tr>
      <tr><td><strong>Reviews</strong></td><td>${esc(competitor.reviewCount || "")}</td></tr>
      <tr><td><strong>Address</strong></td><td>${esc(competitor.address || "")}</td></tr>
    </tbody>
  </table>
</div>` : ""}

<!-- ── URL Scan ────────────────────────────────────────────────────── -->
${urlscan ? `
<div class="section">
  <div class="section-header">
    <h2 class="section-title">Website Security Scan</h2>
    <span class="section-badge">URLScan.io</span>
  </div>
  <table class="detail-table">
    <tbody>
      ${urlscan.screenshotUrl ? `<tr><td colspan="2"><img src="${esc(urlscan.screenshotUrl)}" alt="Website screenshot" style="max-width:100%;border-radius:8px;border:1px solid var(--gray-200)"></td></tr>` : ""}
      <tr><td><strong>URL Scanned</strong></td><td>${esc(urlscan.url || "")}</td></tr>
      <tr><td><strong>Malicious Flags</strong></td><td class="${urlscan.malicious ? "chk-no" : "chk-yes"}">${urlscan.malicious ? "⚠ Flagged" : "✓ Clean"}</td></tr>
      ${urlscan.country ? `<tr><td><strong>Server Country</strong></td><td>${esc(urlscan.country)}</td></tr>` : ""}
    </tbody>
  </table>
</div>` : ""}

<!-- ── Reviews ─────────────────────────────────────────────────────── -->
${renderReviews(apify?.reviews)}

<!-- ── Next Steps ──────────────────────────────────────────────────── -->
<div id="next-steps" class="section" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:none">
  <div class="section-header">
    <h2 class="section-title" style="color:#5b21b6">Your Next Steps</h2>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem">
    ${[
      ["📞", "Book a Free Strategy Call", "Get a 30-min walkthrough of your results with a KYP advisor."],
      ["🔄", "Re-Scan in 30 Days", "After implementing fixes, run a new scan to measure improvement."],
      ["📧", "Share This Report", "Forward this link to your team or marketing agency."],
      ["📥", "Download PDF", "Check your email for the PDF attached to your purchase receipt."],
    ].map(([icon, title, desc]) => `
    <div style="background:#fff;border-radius:10px;padding:1.1rem;border:1px solid #ddd6fe">
      <div style="font-size:1.3rem;margin-bottom:.4rem">${icon}</div>
      <div style="font-weight:700;font-size:.9rem;margin-bottom:.3rem">${title}</div>
      <div style="font-size:.83rem;color:var(--gray-600)">${desc}</div>
    </div>`).join("")}
  </div>
</div>

</div><!-- /wrap -->
</main>

<!-- ═══ FOOTER ════════════════════════════════════════════════════════════ -->
<footer class="report-footer">
  <strong>Know Your Presence</strong> — Digital Presence Audit &nbsp;·&nbsp;
  Report ID: ${esc(reportId)} &nbsp;·&nbsp; Generated ${esc(reportDate)}<br>
  <span style="margin-top:.4rem;display:block">
    This report is confidential and prepared exclusively for ${esc(businessName)}.
    Powered by AI analysis, live data enrichment and professional scoring.
  </span>
</footer>

</body>
</html>`;
}

module.exports = { generateWebReport };
