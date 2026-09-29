'use strict';

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function calcOverall(scores) {
  const rep = typeof scores.reputation === 'number' ? scores.reputation : null;
  const gb  = typeof scores.google    === 'number' ? scores.google    : null;
  const web = typeof scores.website   === 'number' ? scores.website   : null;
  const soc = typeof scores.social    === 'number' ? scores.social    : null;
  if (rep !== null && gb !== null && web !== null && soc !== null) {
    return Math.round((rep * 0.20) + (gb * 0.35) + (web * 0.20) + (soc * 0.25));
  }
  const vals = [rep, gb, web, soc].filter(v => v !== null && v > 0);
  if (vals.length > 0) return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return 0;
}

function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function scoreColor(score) {
  if (score >= 75) return '#1f6b45';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function getInsightText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.summary || val.text || val.content || JSON.stringify(val);
  }
  return String(val);
}

function scoreBar(score, color) {
  const s = Math.max(0, Math.min(100, score || 0));
  return `<div class="bar-wrap"><div class="bar-fill" style="width:${s}%;background:${color || scoreColor(s)}"></div></div>`;
}

function generateWebReport(data) {
  const scores   = data.scores || {};
  const overall  = calcOverall(scores);
  const grade    = getGrade(overall);
  const ai       = data.aiInsights || {};
  const comp     = data.competitor || {};
  const apify    = data.apify || {};
  const urlscan  = data.urlscan || {};
  const metaAds  = data.metaAds || {};
  const scan     = data.scanDetails || {};
  const reportId = data.reportId || '';

  const gScore   = scores.google     || 0;
  const sScore   = scores.social     || 0;
  const wScore   = scores.website    || 0;
  const rScore   = scores.reputation || 0;

  // Donut ring calc
  const circ   = 2 * Math.PI * 54; // ≈339.29
  const offset = circ * (1 - overall / 100) + circ * 0.25;
  const ringColor = scoreColor(overall);

  // Reviews
  const reviews = Array.isArray(apify.reviews) ? apify.reviews : [];
  const reviewCount = reviews.length;
  const sampleReviews = reviews.slice(0, 3);

  // Priority plan split into phases
  const priorityPlanRaw = getInsightText(ai.priorityPlan) || '';
  function splitPhases(text) {
    if (!text) return { p1: 'No data available.', p2: 'No data available.', p3: 'No data available.' };
    const lines = text.split('\n').filter(l => l.trim());
    const third = Math.ceil(lines.length / 3);
    return {
      p1: lines.slice(0, third).join('\n') || 'No data available.',
      p2: lines.slice(third, third * 2).join('\n') || 'No data available.',
      p3: lines.slice(third * 2).join('\n') || 'No data available.',
    };
  }
  const phases = splitPhases(priorityPlanRaw);

  // Minimal markdown → HTML: bold, italic, headings, bullets, numbered lists
  function mdToHtml(raw) {
    if (!raw) return '';
    const lines = raw.split('\n');
    const out = [];
    let inUl = false, inOl = false;
    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };
    const inline = s => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
    for (const raw of lines) {
      const l = raw.trimEnd();
      if (!l.trim()) { closeList(); continue; }
      // Headings
      const h = l.match(/^(#{1,3})\s+(.+)/);
      if (h) { closeList(); const tag = 'h' + (parseInt(h[1].length) + 2); out.push(`<${tag} style="margin:14px 0 4px;font-size:${h[1].length===1?'1.05rem':'0.95rem'};font-weight:700">${inline(h[2])}</${tag}>`); continue; }
      // Bullet list
      const ul = l.match(/^[\-\*]\s+(.+)/);
      if (ul) { if (!inUl) { closeList(); out.push('<ul style="margin:6px 0 6px 18px;padding:0">'); inUl = true; } out.push(`<li style="margin-bottom:4px">${inline(ul[1])}</li>`); continue; }
      // Numbered list
      const ol = l.match(/^\d+[\.\)]\s+(.+)/);
      if (ol) { if (!inOl) { closeList(); out.push('<ol style="margin:6px 0 6px 18px;padding:0">'); inOl = true; } out.push(`<li style="margin-bottom:4px">${inline(ol[1])}</li>`); continue; }
      // Paragraph
      closeList();
      out.push(`<p style="margin:0 0 10px;line-height:1.65">${inline(l)}</p>`);
    }
    closeList();
    return out.join('');
  }

  function renderTextBlock(text, fallback) {
    const t = text || fallback || 'Data not available.';
    return mdToHtml(t);
  }

  function renderPriorityItems(text) {
    if (!text) return '<li>Data not available.</li>';
    const lines = text.split('\n').filter(l => l.trim()).slice(0, 7);
    return lines.map((l, i) => {
      // Strip leading markdown list markers and bold markers for clean display
      const clean = l.replace(/^[\d\.\-\*#]+\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1');
      return `<li><span class="num">${String(i+1).padStart(2,'0')}</span>${esc(clean)}</li>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="en" data-mode="light">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(data.businessName)} — Digital Presence Report | Know Your Presence</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet"/>
<style>
:root {
  --navy:#152030;
  --green:#1f6b45;
  --bg:#f5f2ec;
  --serif:'EB Garamond',Georgia,serif;
  --sans:'Inter',system-ui,sans-serif;
  --sidebar-w:260px;
  --text:#1a1a1a;
  --muted:#6b7280;
  --border:#e2ddd6;
  --card-bg:#ffffff;
  --topbar-bg:#ffffff;
  --section-bg:#f5f2ec;
}
[data-mode="dark"] {
  --bg:#0f1923;
  --text:#e8e3da;
  --muted:#9ca3af;
  --border:#2a3a4a;
  --card-bg:#1a2535;
  --topbar-bg:#152030;
  --section-bg:#0f1923;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--bg);color:var(--text);display:flex;min-height:100vh;transition:background .2s,color .2s}

/* SIDEBAR */
#sidebar{
  position:fixed;top:0;left:0;width:var(--sidebar-w);height:100vh;
  background:var(--navy);color:#fff;display:flex;flex-direction:column;
  overflow-y:auto;z-index:100;transition:transform .3s;
}
.sb-brand{padding:24px 20px 8px;border-bottom:1px solid rgba(255,255,255,.1)}
.sb-kyp{font-family:var(--serif);font-size:28px;font-weight:700;color:#1f6b45;letter-spacing:-.5px}
.sb-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.5);margin-top:2px}
.sb-biz{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1)}
.sb-biz-name{font-size:14px;font-weight:600;color:#fff;line-height:1.3}
.sb-biz-city{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}

/* Donut */
.sb-donut{padding:20px;display:flex;flex-direction:column;align-items:center;border-bottom:1px solid rgba(255,255,255,.1)}
.donut-wrap{position:relative;width:120px;height:120px}
.donut-wrap svg{transform:rotate(-90deg)}
.donut-track{fill:none;stroke:rgba(255,255,255,.1);stroke-width:10}
.donut-ring{fill:none;stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset .8s ease}
.donut-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.donut-score{font-size:28px;font-weight:700;color:#fff;line-height:1}
.donut-grade{font-size:12px;color:rgba(255,255,255,.6);margin-top:2px;letter-spacing:1px}

/* Nav */
.sb-nav{flex:1;padding:8px 0}
.sb-nav a{display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:12px;color:rgba(255,255,255,.6);text-decoration:none;letter-spacing:.5px;transition:background .15s,color .15s;border-left:3px solid transparent}
.sb-nav a:hover,.sb-nav a.active{background:rgba(255,255,255,.07);color:#fff;border-left-color:#1f6b45}
.sb-nav a .nav-num{font-size:10px;color:rgba(255,255,255,.35);font-variant-numeric:tabular-nums;min-width:18px}

/* Sidebar bottom */
.sb-bottom{padding:16px 20px;border-top:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:8px}
.sb-btn{display:block;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;text-align:center;text-decoration:none;cursor:pointer;border:none;font-family:var(--sans);transition:opacity .15s}
.sb-btn-primary{background:#1f6b45;color:#fff}
.sb-btn-secondary{background:rgba(255,255,255,.1);color:rgba(255,255,255,.8)}
.sb-btn:hover{opacity:.85}

/* Hamburger */
#hamburger{display:none;position:fixed;top:14px;left:14px;z-index:200;background:var(--navy);border:none;border-radius:6px;padding:8px;cursor:pointer}
#hamburger span{display:block;width:20px;height:2px;background:#fff;margin:4px 0;transition:.3s}

/* MAIN */
#main{margin-left:var(--sidebar-w);flex:1;display:flex;flex-direction:column;min-height:100vh}

/* TOPBAR */
#topbar{position:sticky;top:0;z-index:50;background:var(--topbar-bg);border-bottom:1px solid var(--border);padding:12px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.topbar-left{display:flex;flex-direction:column}
.topbar-name{font-size:15px;font-weight:600;color:var(--text)}
.topbar-id{font-size:11px;color:var(--muted);letter-spacing:.5px}
.topbar-right{display:flex;align-items:center;gap:10px}
.btn-icon{background:none;border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--text);font-family:var(--sans);transition:background .15s}
.btn-icon:hover{background:var(--border)}

/* SECTIONS */
section{padding:48px 32px;border-bottom:1px solid var(--border)}
section:last-child{border-bottom:none}
.section-tag{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--green);font-weight:600;margin-bottom:8px}
.section-title{font-family:var(--serif);font-size:32px;font-weight:700;color:var(--text);margin-bottom:24px;line-height:1.2}

/* CARDS */
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px}
.card-label{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.card-value{font-size:28px;font-weight:700;color:var(--text);line-height:1}
.card-sub{font-size:12px;color:var(--muted);margin-top:4px}

/* Score bar */
.bar-wrap{height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:8px}
.bar-fill{height:100%;border-radius:4px;transition:width .6s ease}

/* Hero (cover) */
.hero{background:var(--navy);color:#fff;padding:40px 32px;margin:-48px -32px 32px}
.hero-tag{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#1f6b45;font-weight:600;margin-bottom:8px}
.hero-name{font-family:var(--serif);font-size:40px;font-weight:700;line-height:1.1;margin-bottom:4px}
.hero-city{font-size:16px;color:rgba(255,255,255,.6);margin-bottom:20px}
.hero-score-row{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}
.hero-score{font-size:72px;font-weight:700;line-height:1;font-family:var(--serif)}
.hero-grade{font-size:36px;color:rgba(255,255,255,.6)}
.hero-date{font-size:12px;color:rgba(255,255,255,.4);margin-top:8px}

/* Export bar */
.export-bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px}
.export-btn{padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;font-family:var(--sans);text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:opacity .15s}
.export-btn-primary{background:#1f6b45;color:#fff}
.export-btn-secondary{background:var(--card-bg);color:var(--text);border:1px solid var(--border)}
.export-btn:hover{opacity:.85}

/* Narrative */
.narrative{font-size:15px;line-height:1.8;color:var(--text);max-width:72ch}
.narrative p{margin-bottom:12px}

/* Score breakdown */
.score-row{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--border)}
.score-row:last-child{border-bottom:none}
.score-row-label{min-width:160px;font-size:14px;font-weight:600}
.score-row-val{min-width:40px;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.score-row-bar{flex:1}
.weight-badge{font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(31,107,69,.12);color:#1f6b45;font-weight:600;margin-left:auto}

/* Priority list */
.priority-list{list-style:none;display:flex;flex-direction:column;gap:12px}
.priority-list li{display:flex;align-items:flex-start;gap:14px;padding:14px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;font-size:14px;line-height:1.5}
.priority-list .num{font-size:10px;font-weight:700;letter-spacing:1px;color:#1f6b45;min-width:22px;padding-top:2px}

/* AI badge */
.ai-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:linear-gradient(135deg,#1f6b45,#152030);color:#fff;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:16px}

/* Comparison table */
.comp-table{width:100%;border-collapse:collapse;margin-top:16px}
.comp-table th{text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);padding:10px 14px;border-bottom:2px solid var(--border);font-weight:600}
.comp-table td{padding:12px 14px;border-bottom:1px solid var(--border);font-size:14px}
.comp-table tr:last-child td{border-bottom:none}
.comp-table .you{font-weight:600;color:var(--green)}

/* Review card */
.review-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px}
.review-meta{font-size:12px;color:var(--muted);margin-bottom:6px}
.review-text{font-size:14px;line-height:1.6;font-style:italic}
.stars{color:#f59e0b;letter-spacing:1px}

/* Roadmap */
.phase-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;margin-top:16px}
.phase-card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px}
.phase-label{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#1f6b45;font-weight:700;margin-bottom:6px}
.phase-title{font-size:16px;font-weight:700;margin-bottom:12px}
.phase-body{font-size:13px;line-height:1.7;color:var(--muted)}
.phase-body p{margin-bottom:6px}

/* Refund box */
.refund-box{background:var(--card-bg);border:1px solid var(--border);border-left:4px solid #1f6b45;border-radius:8px;padding:20px;margin-top:32px;font-size:14px;line-height:1.7}
.refund-box strong{color:var(--green)}

/* Footer */
.footer{padding:32px;font-size:12px;color:var(--muted);border-top:1px solid var(--border);line-height:1.7}
.footer strong{color:var(--text)}

/* Toast */
#toast{position:fixed;bottom:24px;right:24px;background:#1f6b45;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;pointer-events:none;z-index:9999}
#toast.show{opacity:1;transform:translateY(0)}

/* Overlay */
#overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:90}

/* Responsive */
@media(max-width:768px){
  #sidebar{transform:translateX(-100%)}
  #sidebar.open{transform:translateX(0)}
  #main{margin-left:0}
  #topbar{padding:12px 16px;padding-left:56px}
  section{padding:32px 16px}
  .hero{margin:-32px -16px 24px;padding:28px 16px}
  .hero-name{font-size:28px}
  .hero-score{font-size:52px}
  #hamburger{display:block}
  #overlay.show{display:block}
  .section-title{font-size:24px}
  .phase-grid{grid-template-columns:1fr}
}
@media print{
  #sidebar,#topbar,#hamburger,#overlay,.export-bar,.sb-bottom{display:none!important}
  #main{margin-left:0}
  section{page-break-inside:avoid}
}
</style>
</head>
<body>

<!-- Hamburger -->
<button id="hamburger" aria-label="Menu" onclick="toggleSidebar()">
  <span></span><span></span><span></span>
</button>
<div id="overlay" onclick="toggleSidebar()"></div>

<!-- SIDEBAR -->
<nav id="sidebar">
  <div class="sb-brand">
    <div class="sb-kyp">KYP</div>
    <div class="sb-label">Know Your Presence</div>
  </div>
  <div class="sb-biz">
    <div class="sb-biz-name">${esc(data.businessName)}</div>
    <div class="sb-biz-city">${esc(data.city)}</div>
  </div>
  <div class="sb-donut">
    <div class="donut-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle class="donut-track" cx="60" cy="60" r="54"/>
        <circle class="donut-ring" cx="60" cy="60" r="54"
          stroke="${esc(ringColor)}"
          stroke-dasharray="${circ.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          id="donutRing"/>
      </svg>
      <div class="donut-inner">
        <div class="donut-score">${overall}</div>
        <div class="donut-grade">${grade}</div>
      </div>
    </div>
  </div>
  <div class="sb-nav">
    <a href="#cover"      class="active"><span class="nav-num">00</span>Overview</a>
    <a href="#scores"            ><span class="nav-num">01</span>Scores</a>
    <a href="#opportunities"     ><span class="nav-num">02</span>Opportunities</a>
    <a href="#ai"                ><span class="nav-num">03</span>AI Visibility</a>
    <a href="#competitor"        ><span class="nav-num">04</span>Competitor</a>
    <a href="#website"           ><span class="nav-num">05</span>Website &amp; Reputation</a>
    <a href="#ads"               ><span class="nav-num">06</span>Ad Intelligence</a>
    <a href="#roadmap"           ><span class="nav-num">07</span>90-Day Roadmap</a>
    <a href="#benchmarks"        ><span class="nav-num">08</span>Benchmarks</a>
    <a href="#start"             ><span class="nav-num">09</span>Start Here</a>
  </div>
  <div class="sb-bottom">
    <button class="sb-btn sb-btn-primary" onclick="resendPdf(this)">⬇ Send PDF to Email</button>
    <button class="sb-btn sb-btn-secondary" onclick="toggleDark()">◐ Toggle Dark Mode</button>
    <button class="sb-btn sb-btn-secondary" onclick="window.print()">⎙ Print</button>
  </div>
</nav>

<!-- MAIN -->
<div id="main">

  <!-- TOPBAR -->
  <div id="topbar">
    <div class="topbar-left">
      <div class="topbar-name">${esc(data.businessName)}</div>
      <div class="topbar-id">Report ID: ${esc(reportId)}</div>
    </div>
    <div class="topbar-right">
      <button class="btn-icon" onclick="toggleDark()">◐ Dark</button>
    </div>
  </div>

  <!-- 00 COVER / OVERVIEW -->
  <section id="cover">
    <div class="hero">
      <div class="hero-tag">00 — Digital Presence Report</div>
      <div class="hero-name">${esc(data.businessName)}</div>
      <div class="hero-city">${esc(data.city)}${data.businessType ? ' · ' + esc(data.businessType) : ''}</div>
      <div class="hero-score-row">
        <div class="hero-score" style="color:${esc(ringColor)}">${overall}</div>
        <div class="hero-grade">${grade}</div>
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:4px">Overall Digital Presence Score</div>
      <div class="hero-date">Report Date: ${esc(data.reportDate)}</div>
    </div>

    <div class="export-bar">
      <button class="export-btn export-btn-primary" onclick="resendPdf(this)">⬇ Send PDF to Email</button>
      <button class="export-btn export-btn-secondary" onclick="copyLink()">🔗 Copy Link</button>
      <button class="export-btn export-btn-secondary" onclick="window.print()">⎙ Print</button>
    </div>

    <div class="narrative">
      ${renderTextBlock(getInsightText(ai.narrative), 'This report provides a comprehensive analysis of your business\'s digital presence.')}
    </div>

    <div class="card-grid" style="margin-top:32px">
      <div class="card">
        <div class="card-label">Google Business</div>
        <div class="card-value" style="color:${scoreColor(gScore)}">${gScore}</div>
        <div class="card-sub">35% weight</div>
        ${scoreBar(gScore, scoreColor(gScore))}
      </div>
      <div class="card">
        <div class="card-label">Social Media</div>
        <div class="card-value" style="color:${scoreColor(sScore)}">${sScore}</div>
        <div class="card-sub">25% weight</div>
        ${scoreBar(sScore, scoreColor(sScore))}
      </div>
      <div class="card">
        <div class="card-label">Website</div>
        <div class="card-value" style="color:${scoreColor(wScore)}">${wScore}</div>
        <div class="card-sub">20% weight</div>
        ${scoreBar(wScore, scoreColor(wScore))}
      </div>
      <div class="card">
        <div class="card-label">Reputation</div>
        <div class="card-value" style="color:${scoreColor(rScore)}">${rScore}</div>
        <div class="card-sub">20% weight</div>
        ${scoreBar(rScore, scoreColor(rScore))}
      </div>
    </div>
  </section>

  <!-- 01 SCORES -->
  <section id="scores">
    <div class="section-tag">01 — Score Breakdown</div>
    <div class="section-title">Your Digital Scores</div>

    <div class="score-row">
      <div class="score-row-label">Google Business</div>
      <div class="score-row-val" style="color:${scoreColor(gScore)}">${gScore}</div>
      <div class="score-row-bar">${scoreBar(gScore, scoreColor(gScore))}</div>
      <div class="weight-badge">35%</div>
    </div>
    <div class="score-row">
      <div class="score-row-label">Social Media</div>
      <div class="score-row-val" style="color:${scoreColor(sScore)}">${sScore}</div>
      <div class="score-row-bar">${scoreBar(sScore, scoreColor(sScore))}</div>
      <div class="weight-badge">25%</div>
    </div>
    <div class="score-row">
      <div class="score-row-label">Website</div>
      <div class="score-row-val" style="color:${scoreColor(wScore)}">${wScore}</div>
      <div class="score-row-bar">${scoreBar(wScore, scoreColor(wScore))}</div>
      <div class="weight-badge">20%</div>
    </div>
    <div class="score-row">
      <div class="score-row-label">Reputation</div>
      <div class="score-row-val" style="color:${scoreColor(rScore)}">${rScore}</div>
      <div class="score-row-bar">${scoreBar(rScore, scoreColor(rScore))}</div>
      <div class="weight-badge">20%</div>
    </div>

    <div class="card" style="margin-top:28px;background:var(--card-bg)">
      <div class="card-label">Weighted Overall</div>
      <div class="card-value" style="color:${ringColor};font-size:40px">${overall} <span style="font-size:20px;color:var(--muted)">${grade}</span></div>
      <div class="card-sub" style="margin-top:8px;font-size:12px;line-height:1.6">
        Formula: (Google × 0.35) + (Social × 0.25) + (Website × 0.20) + (Reputation × 0.20)
      </div>
    </div>

    ${scan && Object.keys(scan).length > 0 ? `
    <div style="margin-top:24px">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase">Scan Details</div>
      <div class="card-grid">
        ${Object.entries(scan).slice(0, 6).map(([k, v]) => `
          <div class="card">
            <div class="card-label">${esc(k.replace(/([A-Z])/g,' $1').trim())}</div>
            <div class="card-value" style="font-size:16px;font-weight:600">${typeof v === 'object' ? (v && v.value !== undefined ? esc(String(v.value)) : '—') : esc(String(v ?? '—'))}</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  </section>

  <!-- 02 OPPORTUNITIES -->
  <section id="opportunities">
    <div class="section-tag">02 — Opportunities</div>
    <div class="section-title">Where to Win</div>
    <div class="narrative" style="margin-bottom:28px">
      ${renderTextBlock(getInsightText(ai.seoContent) || getInsightText(ai.narrative), 'Identifying key opportunities to improve your digital presence.')}
    </div>
    <div style="font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:12px">Priority Opportunities</div>
    <ul class="priority-list">
      ${renderPriorityItems(getInsightText(ai.priorityPlan) || getInsightText(ai.narrative))}
    </ul>
  </section>

  <!-- 03 AI VISIBILITY -->
  <section id="ai">
    <div class="section-tag">03 — AI Visibility</div>
    <div class="section-title">AI &amp; Search Presence</div>
    <div class="ai-badge">✦ Powered by All AI's</div>

    <div style="margin-bottom:28px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Narrative Analysis</div>
      <div class="narrative">${renderTextBlock(getInsightText(ai.narrative), 'AI visibility analysis not available.')}</div>
    </div>

    ${getInsightText(ai.seoContent) ? `
    <div style="margin-bottom:28px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">SEO &amp; Content Insights</div>
      <div class="narrative">${renderTextBlock(getInsightText(ai.seoContent))}</div>
    </div>` : ''}

    ${getInsightText(ai.socialAudit) ? `
    <div>
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Social Media Audit</div>
      <div class="narrative">${renderTextBlock(getInsightText(ai.socialAudit))}</div>
    </div>` : ''}
  </section>

  <!-- 04 COMPETITOR -->
  <section id="competitor">
    <div class="section-tag">04 — Competitor Analysis</div>
    <div class="section-title">Competitive Landscape</div>

    ${getInsightText(ai.competitor) ? `
    <div class="narrative" style="margin-bottom:28px">
      ${renderTextBlock(getInsightText(ai.competitor))}
    </div>` : ''}

    ${comp && Object.keys(comp).length > 0 ? `
    <table class="comp-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>You (${esc(data.businessName)})</th>
          <th>Competitor</th>
        </tr>
      </thead>
      <tbody>
        ${(() => {
          const rows = [];
          const keys = ['name','rating','reviewCount','website','googleScore','socialScore'];
          keys.forEach(k => {
            const cv = comp[k];
            if (cv !== undefined && cv !== null) {
              const myVal = k === 'rating' ? (scan.rating || '—') : k === 'reviewCount' ? (reviewCount || '—') : k === 'name' ? data.businessName : '—';
              rows.push(`<tr><td>${esc(k.replace(/([A-Z])/g,' $1').trim())}</td><td class="you">${esc(String(myVal))}</td><td>${esc(String(cv))}</td></tr>`);
            }
          });
          if (rows.length === 0) {
            rows.push(`<tr><td colspan="3" style="color:var(--muted);font-style:italic">Competitor data not available.</td></tr>`);
          }
          return rows.join('');
        })()}
      </tbody>
    </table>` : `<div style="color:var(--muted);font-style:italic">Competitor data not available.</div>`}
  </section>

  <!-- 05 WEBSITE & REPUTATION -->
  <section id="website">
    <div class="section-tag">05 — Website &amp; Reputation</div>
    <div class="section-title">Online Presence Quality</div>

    <div class="card-grid" style="margin-bottom:28px">
      <div class="card">
        <div class="card-label">Website Score</div>
        <div class="card-value" style="color:${scoreColor(wScore)}">${wScore}</div>
        ${scoreBar(wScore, scoreColor(wScore))}
      </div>
      <div class="card">
        <div class="card-label">Reputation Score</div>
        <div class="card-value" style="color:${scoreColor(rScore)}">${rScore}</div>
        ${scoreBar(rScore, scoreColor(rScore))}
      </div>
      ${reviewCount > 0 ? `
      <div class="card">
        <div class="card-label">Reviews Found</div>
        <div class="card-value">${reviewCount}</div>
        <div class="card-sub">from scan</div>
      </div>` : ''}
      ${urlscan && urlscan.score !== undefined ? `
      <div class="card">
        <div class="card-label">URL Scan Score</div>
        <div class="card-value">${esc(String(urlscan.score))}</div>
      </div>` : ''}
    </div>

    ${getInsightText(ai.reviewAnalysis) ? `
    <div style="margin-bottom:28px">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Review Analysis</div>
      <div class="narrative">${renderTextBlock(getInsightText(ai.reviewAnalysis))}</div>
    </div>` : ''}

    ${sampleReviews.length > 0 ? `
    <div>
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">Sample Reviews</div>
      ${sampleReviews.map(r => `
        <div class="review-card">
          <div class="review-meta">
            ${r.author ? `<strong>${esc(r.author)}</strong> · ` : ''}
            ${r.rating ? `<span class="stars">${'★'.repeat(Math.min(5, Math.round(r.rating)))}</span> · ` : ''}
            ${r.date ? esc(r.date) : ''}
          </div>
          <div class="review-text">${esc(r.text || r.review || r.body || '—')}</div>
        </div>
      `).join('')}
    </div>` : ''}
  </section>

  <!-- 06 AD INTELLIGENCE -->
  <section id="ads">
    <div class="section-tag">06 — Ad Intelligence</div>
    <div class="section-title">Advertising Presence</div>

    ${(() => {
      const biz  = metaAds?.business  || {};
      const comp = metaAds?.competitor || {};
      const hasData = biz.checked;
      if (!hasData) return `
    <div class="card" style="max-width:480px">
      <div class="card-label">Status</div>
      <div style="font-size:15px;color:var(--muted);margin-top:6px">No Meta Ads data was collected for this business.</div>
    </div>`;
      const isRunning = biz.found && biz.adCount > 0;
      const compRunning = comp.found && comp.adCount > 0;
      return `
    <div class="card-grid" style="margin-bottom:24px">
      <div class="card">
        <div class="card-label">Running Meta Ads</div>
        <div class="card-value" style="font-size:18px;color:${isRunning ? '#1f6b45' : '#dc2626'}">${isRunning ? '✓ Yes' : '✗ No'}</div>
      </div>
      <div class="card">
        <div class="card-label">Active Ads Found</div>
        <div class="card-value">${biz.adCount || 0}</div>
      </div>
      ${biz.adCount > 0 ? `
      <div class="card">
        <div class="card-label">Longest Running</div>
        <div class="card-value">${biz.longestRunningDays || 0} days</div>
      </div>` : ''}
      ${comp.checked ? `
      <div class="card">
        <div class="card-label">Competitor Ads</div>
        <div class="card-value" style="color:${compRunning ? '#dc2626' : '#1f6b45'}">${comp.adCount || 0}</div>
      </div>` : ''}
    </div>
    ${!isRunning && compRunning ? `<div class="narrative">⚠️ Your competitor is running ${comp.adCount} active ad${comp.adCount !== 1 ? 's' : ''} on Facebook/Instagram — and you have none. This is a gap that can be closed quickly with even a small ad budget.</div>` : ''}
    ${isRunning ? `<div class="narrative">✅ You are actively advertising on Meta platforms with ${biz.adCount} active ad${biz.adCount !== 1 ? 's' : ''}${biz.longestRunningDays > 30 ? `, including ads running for ${biz.longestRunningDays}+ days` : ''}.</div>` : ''}
    ${!isRunning && !compRunning ? `<div class="narrative">No active Facebook or Instagram ads were found for your business. Running even a small awareness campaign ($5–$10/day) can significantly increase local visibility.</div>` : ''}
    `;
    })()}
  </section>

  <!-- 07 90-DAY ROADMAP -->
  <section id="roadmap">
    <div class="section-tag">07 — 90-Day Roadmap</div>
    <div class="section-title">Your Action Plan</div>
    <div class="phase-grid">
      <div class="phase-card">
        <div class="phase-label">Phase 1</div>
        <div class="phase-title">Days 1–30: Foundation</div>
        <div class="phase-body">${renderTextBlock(phases.p1)}</div>
      </div>
      <div class="phase-card">
        <div class="phase-label">Phase 2</div>
        <div class="phase-title">Days 31–60: Growth</div>
        <div class="phase-body">${renderTextBlock(phases.p2)}</div>
      </div>
      <div class="phase-card">
        <div class="phase-label">Phase 3</div>
        <div class="phase-title">Days 61–90: Scale</div>
        <div class="phase-body">${renderTextBlock(phases.p3)}</div>
      </div>
    </div>
  </section>

  <!-- 08 BENCHMARKS -->
  <section id="benchmarks">
    <div class="section-tag">08 — Benchmarks</div>
    <div class="section-title">Industry Context</div>
    <div class="card-grid" style="margin-bottom:28px">
      <div class="card">
        <div class="card-label">Your Overall Score</div>
        <div class="card-value" style="color:${ringColor}">${overall}</div>
        <div class="card-sub">Grade: ${grade}</div>
      </div>
      <div class="card">
        <div class="card-label">Industry Average</div>
        <div class="card-value" style="color:var(--muted)">52</div>
        <div class="card-sub">Typical local business</div>
      </div>
      <div class="card">
        <div class="card-label">Top Performer</div>
        <div class="card-value" style="color:#1f6b45">85+</div>
        <div class="card-sub">Best-in-class benchmark</div>
      </div>
      <div class="card">
        <div class="card-label">vs Industry Avg</div>
        <div class="card-value" style="color:${overall >= 52 ? '#1f6b45' : '#dc2626'}">${overall >= 52 ? '+' : ''}${overall - 52}</div>
        <div class="card-sub">${overall >= 52 ? 'Above average' : 'Below average'}</div>
      </div>
    </div>
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">Score Interpretation</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div style="display:flex;align-items:center;gap:10px"><span style="min-width:30px;font-weight:700;color:#1f6b45">A+</span><span>90–100 — Exceptional. Top 10% of all local businesses.</span></div>
        <div style="display:flex;align-items:center;gap:10px"><span style="min-width:30px;font-weight:700;color:#1f6b45">A</span><span>80–89 — Excellent. Well above average.</span></div>
        <div style="display:flex;align-items:center;gap:10px"><span style="min-width:30px;font-weight:700;color:#d97706">B</span><span>70–79 — Good. Above average with room to grow.</span></div>
        <div style="display:flex;align-items:center;gap:10px"><span style="min-width:30px;font-weight:700;color:#d97706">C</span><span>60–69 — Average. Significant opportunities available.</span></div>
        <div style="display:flex;align-items:center;gap:10px"><span style="min-width:30px;font-weight:700;color:#dc2626">D</span><span>Below 60 — Below average. Immediate action recommended.</span></div>
      </div>
    </div>
  </section>

  <!-- 09 START HERE -->
  <section id="start">
    <div class="section-tag">09 — Start Here</div>
    <div class="section-title">Top Priority Actions</div>
    <ul class="priority-list" style="margin-bottom:32px">
      ${renderPriorityItems(getInsightText(ai.priorityPlan) || getInsightText(ai.narrative))}
    </ul>

    <div class="export-bar">
      <button class="export-btn export-btn-primary" onclick="resendPdf(this)">⬇ Send PDF to Email</button>
      <button class="export-btn export-btn-secondary" onclick="copyLink()">🔗 Copy Link</button>
      <button class="export-btn export-btn-secondary" onclick="window.print()">⎙ Print</button>
    </div>

    <div class="refund-box">
      <strong>Satisfaction Guarantee</strong><br/>
      This report represents a thorough analysis of your business's digital presence at the time of scan. All data is collected from publicly available sources.
    </div>

    <div class="footer" style="margin-top:40px">
      <strong>Know Your Presence</strong><br/>
      Report ID: ${esc(reportId)} · Generated: ${esc(data.reportDate)}<br/>
      Business: ${esc(data.businessName)} · ${esc(data.city)}<br/><br/>
      This report is for the exclusive use of the purchaser. All scores are based on publicly available data collected at the time of scan and are subject to change. © ${new Date().getFullYear()} Know Your Presence. All rights reserved.
    </div>
  </section>

</div><!-- /main -->

<div id="toast"></div>

<script>
(function(){
  // Dark mode auto-detect
  if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches){
    document.documentElement.setAttribute('data-mode','dark');
  }

  // Toggle dark mode
  window.toggleDark = function(){
    var el = document.documentElement;
    el.setAttribute('data-mode', el.getAttribute('data-mode') === 'dark' ? 'light' : 'dark');
  };

  // Sidebar toggle (mobile)
  window.toggleSidebar = function(){
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
  };

  // Toast
  function showToast(msg){
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2000);
  }

  // Copy link
  window.copyLink = function(){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(window.location.href).then(function(){
        showToast('✓ Link copied!');
      }).catch(function(){
        showToast('Copy failed — please copy the URL manually.');
      });
    } else {
      showToast('Copy failed — please copy the URL manually.');
    }
  };

  // Smooth scroll for nav
  document.querySelectorAll('#sidebar .sb-nav a').forEach(function(a){
    a.addEventListener('click', function(e){
      var href = a.getAttribute('href');
      if(href && href.startsWith('#')){
        e.preventDefault();
        var target = document.getElementById(href.slice(1));
        if(target){
          target.scrollIntoView({behavior:'smooth'});
          // close mobile sidebar
          document.getElementById('sidebar').classList.remove('open');
          document.getElementById('overlay').classList.remove('show');
        }
      }
    });
  });

  // IntersectionObserver: active nav link
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('#sidebar .sb-nav a');
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        var id = entry.target.id;
        navLinks.forEach(function(link){
          link.classList.remove('active');
          if(link.getAttribute('href') === '#' + id){
            link.classList.add('active');
          }
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  sections.forEach(function(s){ observer.observe(s); });
})();

// "Send PDF to Email" button — regenerates the styled PDF server-side
// and emails it to the address on the order. No browser print needed.
function resendPdf(btn) {
  const reportId = ${JSON.stringify(reportId)};
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Sending…';
  fetch('/api/report/' + reportId + '/resend-pdf', { method: 'POST' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) {
        btn.textContent = '✅ Check your email in ~2 minutes';
        setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 8000);
      } else {
        btn.textContent = '⚠ ' + (d.error || 'Failed — try again');
        setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 4000);
      }
    })
    .catch(function(){
      btn.textContent = '⚠ Network error — try again';
      setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 4000);
    });
}
</script>
</body>
</html>`;

  return html;
}

module.exports = { generateWebReport };
