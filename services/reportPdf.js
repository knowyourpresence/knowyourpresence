// services/reportPdf.js
// Generates a print-optimised PDF for a KYP report.
// Call: generateReportPdf(data) → returns local file path of the PDF.
//
// data shape:
//   { businessName, city, state, reportId, date,
//     score, grade, gradeRank, potentialScore, googleRating, googleReviews,
//     unansweredReviews, unansweredPct,
//     repScore, gbScore, webScore, socialScore,
//     competitor, executiveSummary, opportunities, ... }
//
// For the sample / demo, all values are hard-coded to Intelligentsia Coffee.
// In production, pass real data from your scoring engine.

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ── Chromium path (works on Render with @playwright/browser-chromium) ────────
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// ── Build the full-page print HTML (no sidebar, single column, A4-safe) ─────
function buildPrintHtml(d) {
  const scoreOffset = 301.6 * (1 - d.score / 100); // SVG donut

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>KYP Report — ${d.businessName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f2ec; --surface:#fff; --ink:#1a2332; --muted:#6b7280; --muted2:#9ca3af;
  --rule:#e5e2da; --cream:#f0ede6; --navy:#152030;
  --green:#1f6b45; --green-lt:#e8f4ed; --amber:#b87d1a;
  --amber-lt:#fdf6e3; --red:#c0392b; --red-lt:#fdecea;
  --serif:'EB Garamond',Georgia,serif; --sans:'Inter',system-ui,sans-serif;
}
html,body{font-family:var(--sans);background:var(--bg);color:var(--ink);font-size:13px;line-height:1.55;}
.page{width:100%;max-width:760px;margin:0 auto;padding:0 0 40px;}
.report-header{background:var(--navy);padding:16px 36px;display:flex;justify-content:space-between;align-items:center;}
.rh-brand{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;}
.rh-title{font-size:13px;font-weight:600;color:#fff;}
.rh-meta{font-size:10px;color:#64748b;text-align:right;}
.rh-score{color:#4ade80;font-weight:700;}
.section{padding:28px 36px 0;page-break-inside:avoid;}
.section+.section{border-top:1px solid var(--rule);margin-top:4px;}
.sec-label{font-size:9.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--green);margin-bottom:5px;}
.h1{font-family:var(--serif);font-size:32px;font-weight:700;line-height:1.1;color:var(--ink);}
.h1 em{font-style:italic;color:var(--green);}
.h2{font-family:var(--serif);font-size:22px;font-weight:700;line-height:1.2;color:var(--ink);margin-bottom:5px;}
.h3{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink);margin-bottom:4px;}
.lead{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:14px;}
.body-t{font-size:13px;line-height:1.65;color:var(--ink);}
.pull{font-family:var(--serif);font-size:17px;font-weight:700;line-height:1.4;color:var(--ink);}
.pull em{font-style:italic;color:var(--green);}
hr.rule{border:none;border-top:1px solid var(--rule);margin:10px 0;}
.pill{display:inline-block;font-size:9.5px;font-weight:600;letter-spacing:.4px;padding:2px 8px;border-radius:4px;text-transform:uppercase;white-space:nowrap;}
.pill-green{background:#c8e6d4;color:#0f4526;}
.pill-amber{background:#fde8c0;color:#6b420a;}
.pill-red{background:#fdd4d0;color:#7a1717;}
.pill-gray{background:var(--cream);color:var(--muted);border:1px solid var(--rule);}
.cover-hero{display:grid;grid-template-columns:150px 1fr;gap:24px;align-items:start;margin:16px 0 18px;}
.score-dark{background:var(--navy);border-radius:10px;padding:20px 16px;text-align:center;}
.score-dark .lbl{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;}
.score-dark .grade{font-size:13px;font-weight:700;color:#4ade80;margin-top:6px;}
.score-dark .rank{font-size:10.5px;color:#94a3b8;line-height:1.4;margin-top:3px;}
.metric-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--rule);border-radius:8px;overflow:hidden;background:var(--surface);margin:16px 0;}
.metric-cell{padding:13px 14px;border-right:1px solid var(--rule);}
.metric-cell:last-child{border-right:none;}
.metric-lbl{font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted2);margin-bottom:3px;}
.metric-val{font-family:var(--serif);font-size:22px;font-weight:700;color:var(--ink);line-height:1.1;}
.metric-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}
.two-col{display:grid;grid-template-columns:1fr 1.1fr;gap:24px;margin-top:14px;}
.bar-chart{margin:12px 0;}
.bar-row{margin-bottom:10px;}
.bar-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}
.bar-name{font-size:12px;font-weight:500;}
.bar-val{font-size:13px;font-weight:700;}
.bar-track{height:9px;background:var(--cream);border-radius:4px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.cat-card{background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:12px 14px;margin-bottom:7px;}
.cat-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;}
.cat-title{font-size:13px;font-weight:600;color:var(--ink);}
.cat-meta{font-size:11px;color:var(--muted);margin-top:1px;}
.cat-next{font-size:12px;color:var(--ink);margin-top:7px;padding-top:7px;border-top:1px solid var(--rule);}
.cat-next b{color:var(--green);}
.opp{display:grid;grid-template-columns:40px 1fr;gap:0;padding:16px 0;border-bottom:1px solid var(--rule);}
.opp:last-child{border-bottom:none;}
.opp-num{font-family:var(--serif);font-size:13px;color:var(--muted2);padding-top:2px;}
.opp-title{font-family:var(--serif);font-size:19px;font-weight:700;color:var(--ink);line-height:1.2;margin-bottom:4px;}
.opp-body{font-size:12.5px;color:var(--muted);line-height:1.55;margin-bottom:8px;}
.opp-tags{display:flex;gap:6px;flex-wrap:wrap;}
.ai-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:12px 0;}
.ai-grid-r2{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:12px;}
.ai-card{border:1px solid var(--rule);border-radius:7px;padding:12px 14px;background:var(--surface);}
.ai-card.pass{border-color:#a3d4b5;background:var(--green-lt);}
.ai-card.missing{border-color:#f5b8b2;background:var(--red-lt);}
.ai-card.partial{border-color:#f0d49a;background:var(--amber-lt);}
.ai-status{font-size:8.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:5px;}
.ai-status.pass{color:var(--green);}.ai-status.missing{color:var(--red);}.ai-status.partial{color:var(--amber);}
.ai-name{font-family:var(--serif);font-size:15px;font-weight:700;color:var(--ink);line-height:1.3;margin-bottom:5px;}
.ai-action{font-size:11px;color:var(--muted);}
.ai-action b{color:var(--ink);}
.ai-info{background:var(--cream);border-radius:7px;padding:14px 16px;margin-bottom:12px;display:flex;gap:14px;align-items:center;}
.ai-circle{width:52px;height:52px;border-radius:50%;border:2px solid var(--green);display:flex;align-items:center;justify-content:center;text-align:center;flex-shrink:0;}
.ai-circle-text{font-size:8px;font-weight:700;letter-spacing:.4px;color:var(--green);line-height:1.2;text-transform:uppercase;}
.comp-layout{display:grid;grid-template-columns:1fr 185px;gap:16px;margin-top:14px;}
.comp-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.comp-table th{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:7px 9px;border-bottom:2px solid var(--rule);text-align:left;}
.comp-table td{padding:8px 9px;border-bottom:1px solid var(--rule);vertical-align:middle;}
.comp-table tr:last-child td{border-bottom:none;}
.gap-box{background:var(--cream);border-radius:7px;padding:16px;}
.gap-lbl{font-size:8.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}
.gap-val{font-family:var(--serif);font-size:19px;font-weight:700;color:var(--ink);margin-bottom:3px;}
.gap-sub{font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;}
.gap-body{font-size:11.5px;color:var(--muted);line-height:1.5;}
.check-row{display:grid;grid-template-columns:1fr 80px 110px;gap:7px;padding:8px 0;border-bottom:1px solid var(--rule);align-items:center;}
.check-row:last-child{border-bottom:none;}
.check-impact{font-size:9.5px;font-weight:600;color:var(--muted2);}
.plat-row{display:grid;grid-template-columns:26px 1fr 100px;gap:9px;padding:9px 0;border-bottom:1px solid var(--rule);align-items:center;}
.plat-row:last-child{border-bottom:none;}
.plat-letter{width:22px;height:22px;background:var(--ink);color:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;}
.ad-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:14px;}
.ad-stat{background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:12px;}
.ad-stat.dark{background:var(--navy);border-color:var(--navy);}
.ad-stat-lbl{font-size:8.5px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted2);margin-bottom:4px;}
.ad-stat-val{font-family:var(--serif);font-size:24px;font-weight:700;line-height:1;}
.ad-stat-sub{font-size:10.5px;color:var(--muted);margin-top:2px;}
.reco-box{background:var(--cream);border-radius:7px;padding:16px;border:1px solid var(--rule);}
.prog-row{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;background:var(--surface);border:1px solid var(--rule);border-radius:7px;padding:14px;margin-bottom:14px;}
.prog-cell{text-align:center;}
.prog-lbl{font-size:9.5px;color:var(--muted);margin-bottom:3px;}
.prog-val{font-family:var(--serif);font-size:20px;font-weight:700;line-height:1;margin-bottom:4px;}
.prog-bar-t{height:4px;background:var(--cream);border-radius:2px;}
.prog-bar-f{height:100%;border-radius:2px;}
.phase-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;}
.phase-hdr{background:var(--navy);color:#fff;border-radius:7px 7px 0 0;padding:11px 12px;display:flex;align-items:center;gap:10px;}
.phase-num{font-family:var(--serif);font-size:20px;font-weight:700;color:#fff;line-height:1;}
.phase-range{font-size:8px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;}
.phase-name{font-size:11px;font-weight:600;color:#fff;}
.phase-cards{border:1px solid var(--rule);border-top:none;border-radius:0 0 7px 7px;overflow:hidden;}
.pc{padding:9px 11px;border-bottom:1px solid var(--rule);}
.pc:last-child{border-bottom:none;}
.pc1{background:var(--green-lt);}.pc2{background:var(--amber-lt);}.pc3{background:#f0f0ff;}
.pc-task{font-size:12px;font-weight:600;color:var(--ink);line-height:1.3;margin-bottom:2px;}
.pc-detail{font-size:10.5px;color:var(--muted);line-height:1.35;margin-bottom:4px;}
.pc-meta{display:flex;justify-content:space-between;font-size:9.5px;font-weight:600;}
.bench-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.bench-table th{font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--rule);text-align:left;}
.bench-table td{padding:9px 10px;border-bottom:1px solid var(--rule);vertical-align:middle;}
.bench-table tr:last-child td{border-bottom:none;}
.checklist-dark{background:var(--navy);border-radius:10px;padding:24px 24px 20px;margin-bottom:10px;}
.checklist-hl{font-family:var(--serif);font-size:30px;font-weight:700;color:#fff;line-height:1.1;margin-bottom:10px;}
.checklist-sub{font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:10px;}
.checklist-keep{font-size:12px;color:var(--amber);display:flex;align-items:center;gap:8px;}
.checklist-keep::before{content:'';display:block;width:18px;height:1.5px;background:var(--amber);}
.check-grid{display:grid;grid-template-columns:200px 1fr;gap:24px;}
.check-item{display:grid;grid-template-columns:28px 1fr 75px;gap:9px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);align-items:start;}
.check-item:last-child{border-bottom:none;}
.check-num{font-family:var(--serif);font-size:14px;color:#64748b;}
.check-task{font-family:var(--serif);font-size:14px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:2px;}
.check-detail{font-size:11px;color:#94a3b8;line-height:1.4;}
.check-time{font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--amber);text-align:right;padding-top:2px;}
.refund-box{background:var(--cream);border:1px solid var(--rule);border-radius:7px;padding:12px 14px;display:grid;grid-template-columns:70px 1fr;gap:10px;margin-top:14px;}
.refund-lbl{font-size:11.5px;font-weight:600;color:var(--ink);}
.refund-body{font-size:11px;color:var(--muted);line-height:1.55;}
.report-footer{padding:20px 36px 28px;text-align:center;border-top:1px solid var(--rule);margin-top:8px;}
</style>
</head>
<body>
<div class="page">

<!-- HEADER -->
<div class="report-header">
  <div class="rh-brand">Know Your Presence</div>
  <div class="rh-title">${d.businessName} &nbsp;·&nbsp; ${d.city}, ${d.state}</div>
  <div class="rh-meta">${d.date}<br/>${d.reportId} &nbsp;·&nbsp; <span class="rh-score">${d.score}/100 &nbsp;Grade ${d.grade}</span></div>
</div>

<!-- 00 COVER -->
<div class="section">
  <div class="sec-label">Know Your Presence / Decision-Ready Readout</div>
  <div class="h1">The shape of<br/><em>${d.businessName}'s</em> presence.</div>
  <p class="lead" style="max-width:580px;margin-top:8px;">A practical scan of how ${d.city}, ${d.state} discovers, evaluates, and chooses your business — with the next move made clear.</p>
  <hr class="rule"/>
  <div class="cover-hero">
    <div class="score-dark">
      <div class="lbl">Presence Score</div>
      <svg viewBox="0 0 120 120" width="100" height="100" style="display:block;margin:0 auto;">
        <circle cx="60" cy="60" r="48" fill="none" stroke="#1e3040" stroke-width="18"/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="#d4a843" stroke-width="18"
          stroke-dasharray="301.6" stroke-dashoffset="${scoreOffset.toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="55" text-anchor="middle" font-size="28" font-weight="700" fill="white" font-family="EB Garamond,serif">${d.score}</text>
        <text x="60" y="71" text-anchor="middle" font-size="11" fill="#94a3b8" font-family="Inter,sans-serif">/ 100</text>
      </svg>
      <div class="grade">Grade ${d.grade}</div>
      <div class="rank">${d.gradeRank}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:7px;">Executive Summary</div>
      <div class="h3" style="margin-bottom:10px;">${d.execHeadline}</div>
      ${d.execBody}
      <div style="margin-top:12px;padding:9px 11px;background:var(--cream);border-radius:6px;font-size:12px;color:var(--muted);font-style:italic;font-family:var(--serif);">${d.execPull}</div>
    </div>
  </div>
  <div class="metric-row">
    <div class="metric-cell"><div class="metric-lbl">Presence Score</div><div class="metric-val">${d.score}/100</div><div class="metric-sub">Grade ${d.grade} · ${d.gradeRank}</div></div>
    <div class="metric-cell"><div class="metric-lbl">Potential Score</div><div class="metric-val">${d.potentialScore}/100</div><div class="metric-sub">${d.potentialScore - d.score} points above today</div></div>
    <div class="metric-cell"><div class="metric-lbl">Google Rating</div><div class="metric-val">${d.googleRating}/5</div><div class="metric-sub">${d.googleReviews} reviews</div></div>
    <div class="metric-cell"><div class="metric-lbl">Unanswered Reviews</div><div class="metric-val" style="color:var(--amber);">~${d.unansweredReviews}</div><div class="metric-sub">${d.unansweredPct}% response gap</div></div>
  </div>
</div>

<!-- 01 SCORE BREAKDOWN -->
<div class="section">
  <div class="sec-label">01 / Read the Signal</div>
  <div class="h2">Score breakdown</div>
  <p class="lead">Averages hide the story. These category scores show where presence compounds — and where one weak link can cost the click.</p>
  <div class="two-col">
    <div>
      <div class="pull" style="margin-bottom:12px;">${d.scoreBreakdownPull}</div>
      <p class="body-t" style="margin-bottom:8px;">${d.scoreBreakdownBody1}</p>
      <p class="body-t" style="margin-bottom:8px;">${d.scoreBreakdownBody2}</p>
      <div style="background:var(--cream);border-radius:6px;padding:9px 12px;font-size:12px;color:var(--ink);"><span style="color:var(--green);">›</span> <strong>Sequence:</strong> ${d.sequence}</div>
    </div>
    <div>
      <div class="bar-chart">
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Reputation</span><span class="bar-val" style="color:${d.repScore>=75?'#1f6b45':'#b87d1a'};">${d.repScore}</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.repScore}%;background:${d.repScore>=75?'#1f6b45':'#b87d1a'};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Google Business</span><span class="bar-val" style="color:${d.gbScore>=75?'#1f6b45':'#b87d1a'};">${d.gbScore}</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.gbScore}%;background:${d.gbScore>=75?'#1f6b45':'#b87d1a'};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Website &amp; Technical</span><span class="bar-val" style="color:${d.webScore>=75?'#1f6b45':'#b87d1a'};">${d.webScore}</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.webScore}%;background:${d.webScore>=75?'#1f6b45':'#b87d1a'};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Social Media</span><span class="bar-val" style="color:${d.socialScore>=75?'#1f6b45':d.socialScore>=55?'#b87d1a':'#c0392b'};">${d.socialScore}</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.socialScore}%;background:${d.socialScore>=75?'#1f6b45':d.socialScore>=55?'#b87d1a':'#c0392b'};"></div></div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <span class="pill pill-green">Strong ≥75</span>
        <span class="pill pill-amber">Leverage 55–74</span>
        <span class="pill pill-red">Needs work &lt;55</span>
      </div>
    </div>
  </div>
  <div style="margin-top:16px;">${d.catCards}</div>
</div>

<!-- 02 OPPORTUNITIES -->
<div class="section">
  <div class="sec-label">02 / Make It Actionable</div>
  <div class="h2">The ranked opportunity list</div>
  <p class="lead">Ordered by likely customer impact and the time window in which the fix begins paying back.</p>
  <div>${d.opportunities}</div>
</div>

<!-- 03 AI VISIBILITY -->
<div class="section">
  <div class="sec-label">03 / The New Front Door</div>
  <div class="h2">AI visibility</div>
  <p class="lead">When a guest asks an assistant where to find great ${d.category} in ${d.city}, these signals shape whether ${d.businessName} enters the answer.</p>
  <div class="ai-info">
    <div class="ai-circle"><div class="ai-circle-text">AI<br/>READINESS</div></div>
    <div><p class="body-t" style="font-weight:600;margin-bottom:3px;">AI systems are learning the same public evidence your guests see.</p><p class="body-t">Consistency, specificity, and fresh proof make it easier for an answer engine to describe you accurately.</p></div>
  </div>
  <div class="ai-grid">${d.aiCardsRow1}</div>
  <div class="ai-grid-r2">${d.aiCardsRow2}</div>
</div>

<!-- 04 COMPETITOR -->
<div class="section">
  <div class="sec-label">04 / Relative Position</div>
  <div class="h2">Against ${d.competitor}</div>
  <p class="lead">A competitor comparison is useful when it leads to a specific response — this one shows where the gap is behavioral, not just numerical.</p>
  <div class="comp-layout">
    <table class="comp-table">
      <thead><tr><th>Metric</th><th>${d.businessName}</th><th>${d.competitor}</th><th>Gap</th><th>Read</th></tr></thead>
      <tbody>${d.compRows}</tbody>
    </table>
    <div class="gap-box">
      <div class="gap-lbl">The Useful Gap</div>
      <div class="gap-val">${d.usefulGapTitle}</div>
      <div class="gap-sub">${d.usefulGapSub}</div>
      <div class="gap-body">${d.usefulGapBody}</div>
    </div>
  </div>
</div>

<!-- 05 WEBSITE & REPUTATION -->
<div class="section">
  <div class="sec-label">05 / Trust at the Click</div>
  <div class="h2">Website &amp; reputation findings</div>
  <p class="lead">The handoff from search result to confident visit happens here. Every detail either keeps momentum or quietly leaks it.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;">
    <div>
      <div style="font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;">Website Checks</div>
      ${d.webChecks}
    </div>
    <div>
      <div style="font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;">Review Platforms</div>
      ${d.platRows}
    </div>
  </div>
</div>

<!-- 06 ADS -->
<div class="section">
  <div class="sec-label">06 / Paid Signal</div>
  <div class="h2">Ad intelligence</div>
  <p class="lead">No paid ads were found for ${d.businessName}. Competitor activity reveals which promises are being repeated in the ${d.city} market.</p>
  <div class="ad-stats">${d.adStats}</div>
  <div class="reco-box">
    <div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--green);margin-bottom:7px;">Recommended First Ad</div>
    <div style="font-family:var(--serif);font-size:17px;font-weight:700;color:var(--ink);margin-bottom:5px;">${d.adHeadline}</div>
    <p style="font-size:12px;font-style:italic;color:var(--muted);margin-bottom:7px;">${d.adCopy}</p>
    <div style="font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--green);">${d.adCta}</div>
  </div>
</div>

<!-- 07 ROADMAP -->
<div class="section">
  <div class="sec-label">07 / Turn Insight Into Motion</div>
  <div class="h2">A 90-day roadmap</div>
  <p class="lead">The sequence is intentionally narrow: make the foundation trustworthy, then make the signal easier to discover, then measure the lift.</p>
  <div class="prog-row">
    <div class="prog-cell"><div class="prog-lbl">Current</div><div class="prog-val" style="color:var(--muted);">${d.score}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${d.score}%;background:var(--muted2);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 1</div><div class="prog-val" style="color:var(--green);">${d.phase1Score}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${d.phase1Score}%;background:var(--green);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 2</div><div class="prog-val" style="color:var(--green);">${d.phase2Score}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${d.phase2Score}%;background:var(--green);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 3</div><div class="prog-val" style="color:var(--green);">${d.potentialScore}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${d.potentialScore}%;background:var(--green);"></div></div></div>
  </div>
  <div class="phase-cols">${d.phases}</div>
</div>

<!-- 08 BENCHMARKS -->
<div class="section">
  <div class="sec-label">08 / Context, Not Comparison Theatre</div>
  <div class="h2">Benchmark context</div>
  <p class="lead">Median tells you where the market sits. Top quartile shows what a more disciplined presence makes possible.</p>
  <table class="bench-table">
    <thead><tr><th>Metric</th><th>You</th><th>Median</th><th>Top Quartile</th><th>Status</th><th>Insight</th></tr></thead>
    <tbody>${d.benchRows}</tbody>
  </table>
</div>

<!-- 09 START HERE -->
<div class="section">
  <div class="sec-label">09 / Start Here</div>
  <div class="checklist-dark">
    <div class="check-grid">
      <div>
        <div class="checklist-hl">The first<br/>seven<br/>days.</div>
        <p class="checklist-sub">Momentum is a design decision. These quick wins are deliberately small enough to complete, visible enough to matter, and ordered so each one makes the next easier.</p>
        <div class="checklist-keep">Keep the promise specific.</div>
      </div>
      <div>${d.checklistItems}</div>
    </div>
  </div>
  <div class="refund-box">
    <div class="refund-lbl">Refund Policy</div>
    <div class="refund-body">Refunds are issued only for technical failures where the report could not be generated or delivered. Successfully delivered reports are non-refundable. Email support@knowyourpresence.com within 48 hours with your order ID.</div>
  </div>
</div>

<!-- FOOTER -->
<div class="report-footer">
  <div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--ink);margin-bottom:3px;">Know Your Presence Report</div>
  <div style="font-size:11px;color:var(--muted);">Decision-ready visibility for independent local businesses.</div>
  <div style="font-size:11px;color:var(--muted);margin-top:2px;">${d.businessName} &nbsp;·&nbsp; ${d.city}, ${d.state} &nbsp;·&nbsp; ${d.date} &nbsp;·&nbsp; ${d.reportId}</div>
</div>

</div>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
async function generateReportPdf(data) {
  const tmpDir  = os.tmpdir();
  const htmlPath = path.join(tmpDir, `kyp_${data.reportId}.html`);
  const pdfPath  = path.join(tmpDir, `kyp_${data.reportId}.pdf`);

  const html = buildPrintHtml(data);
  fs.writeFileSync(htmlPath, html, "utf8");

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500); // Google Fonts settle time

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
    displayHeaderFooter: false,
  });

  await browser.close();
  fs.unlinkSync(htmlPath); // clean up temp HTML
  return pdfPath; // caller reads & deletes this
}

module.exports = { generateReportPdf };
