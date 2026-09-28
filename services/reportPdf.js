// services/reportPdf.js
// Generates a print-optimised A4 PDF for every paid KYP report.
// Called from server.js webhook handler as:
//   generateReportPdf(reportData)  → saves  <REPORTS_DIR>/<reportId>.pdf
//   generateToolkitZip(reportData) → saves  <REPORTS_DIR>/<reportId>-toolkit.zip
//   makeReportId()                 → returns a unique ID string
//   REPORTS_DIR                    → the directory where reports are saved

const { chromium } = require("playwright");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const archiver = require("archiver"); // already in your package.json

// ── Paths ─────────────────────────────────────────────────────────────────────
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, "../reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// On Render: set CHROMIUM_PATH env var, or let Playwright find its own build.
// On local dev: falls back to the pre-installed path in the Claude container.
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  (() => {
    // Try Playwright's own installed chromium first
    try {
      const { execSync } = require("child_process");
      const p = execSync("node -e \"console.log(require('playwright').chromium.executablePath())\"", { timeout: 5000 }).toString().trim();
      if (p && require("fs").existsSync(p)) return p;
    } catch (_) {}
    // Fallback for local Claude container
    return "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  })();

// ── Unique report ID ──────────────────────────────────────────────────────────
function makeReportId() {
  return "KYP-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(n) {
  if (n >= 75) return "#1f6b45";
  if (n >= 55) return "#b87d1a";
  return "#c0392b";
}
function pillClass(n) {
  if (n >= 75) return "pill-green";
  if (n >= 55) return "pill-amber";
  return "pill-red";
}
function pillLabel(n) {
  if (n >= 75) return "STRONG";
  if (n >= 55) return "NEEDS WORK";
  return "NEEDS WORK";
}
function grade(overall) {
  if (overall >= 90) return "A+";
  if (overall >= 80) return "A";
  if (overall >= 70) return "B";
  if (overall >= 60) return "C";
  return "D";
}
function gradeRank(overall, city) {
  if (overall >= 85) return `Top 10% of local businesses in ${city}`;
  if (overall >= 75) return `Top 25% of local businesses in ${city}`;
  if (overall >= 65) return `Top 40% of local businesses in ${city}`;
  return `Growing — room to climb in ${city}`;
}

// ── Build sub-scores from server.js reportData.scores ────────────────────────
// server.js passes: { google, social, website, reputation }
function getScores(reportData) {
  const s = reportData.scores || {};
  const rep  = Math.round(s.reputation ?? s.rep ?? 60);
  const gb   = Math.round(s.google    ?? 60);
  const web  = Math.round(s.website   ?? 60);
  const soc  = Math.round(s.social    ?? 60);
  const overall = Math.round((rep * 0.20) + (gb * 0.35) + (web * 0.20) + (soc * 0.25));
  return { rep, gb, web, soc, overall };
}

// ── Category cards HTML ───────────────────────────────────────────────────────
function buildCatCards(sc, scanDetails) {
  const d = scanDetails || {};
  const reviewCount = d.reviewCount || d.totalReviews || 0;
  const rating      = d.rating      || d.googleRating || "—";
  const unanswered  = d.unansweredReviews || Math.round(reviewCount * 0.4);
  const photoCount  = d.photoCount  || 0;
  const perfScore   = d.perfScore   || d.pageSpeed || "—";

  return `
  <div class="cat-card">
    <div class="cat-top">
      <div><div class="cat-title">Reputation <span style="font-weight:400;color:var(--muted);font-size:11px;">${sc.rep}/100 · 20% weight</span></div>
      <div class="cat-meta">${rating}★ · ${reviewCount} reviews · ~${unanswered} unanswered</div></div>
      <span class="pill ${pillClass(sc.rep)}">${pillLabel(sc.rep)}</span>
    </div>
    <div class="cat-next"><b>Next:</b> Respond to all unanswered reviews — push average rating higher and unlock ranking lift.</div>
  </div>
  <div class="cat-card">
    <div class="cat-top">
      <div><div class="cat-title">Google Business <span style="font-weight:400;color:var(--muted);font-size:11px;">${sc.gb}/100 · 35% weight</span></div>
      <div class="cat-meta">Profile ${d.isVerified ? "claimed" : "check claimed status"} · ${photoCount > 0 ? photoCount + " photos" : "Low photo count"}</div></div>
      <span class="pill ${pillClass(sc.gb)}">${pillLabel(sc.gb)}</span>
    </div>
    <div class="cat-next"><b>Next:</b> Add 10 new photos, create weekly Google Posts, complete all profile sections.</div>
  </div>
  <div class="cat-card">
    <div class="cat-top">
      <div><div class="cat-title">Website &amp; Technical <span style="font-weight:400;color:var(--muted);font-size:11px;">${sc.web}/100 · 20% weight</span></div>
      <div class="cat-meta">SSL: ${d.isHttps ? "pass" : "missing"} · Mobile: ${d.hasViewportMeta ? "pass" : "check"} · PageSpeed: ${perfScore}/100 · Schema: ${d.hasSchema ? "found" : "missing"}</div></div>
      <span class="pill ${pillClass(sc.web)}">${pillLabel(sc.web)}</span>
    </div>
    <div class="cat-next"><b>Next:</b> ${sc.web < 75 ? "Compress images for page speed; install LocalBusiness schema for rich search results." : "Maintain current technical health — monitor monthly."}</div>
  </div>
  <div class="cat-card">
    <div class="cat-top">
      <div><div class="cat-title">Social Media <span style="font-weight:400;color:var(--muted);font-size:11px;">${sc.soc}/100 · 25% weight</span></div>
      <div class="cat-meta">${sc.soc >= 75 ? "Consistent posting cadence" : "Posting frequency needs improvement"}</div></div>
      <span class="pill ${pillClass(sc.soc)}">${pillLabel(sc.soc)}</span>
    </div>
    <div class="cat-next"><b>Next:</b> ${sc.soc < 75 ? "Increase posting to 5× per week. Reels get 3× higher organic reach in your category." : "Keep up the posting cadence — focus on Reels for wider reach."}</div>
  </div>`;
}

// ── Opportunities HTML ────────────────────────────────────────────────────────
function buildOpportunities(sc, scanDetails, aiInsights, businessName) {
  const d = scanDetails || {};
  const opps = [];

  // Pull from AI insights if available
  const aiOpps = aiInsights?.opportunities?.opportunities || aiInsights?.actionPlan?.items || null;

  if (aiOpps && Array.isArray(aiOpps) && aiOpps.length > 0) {
    aiOpps.slice(0, 5).forEach((o, i) => {
      const impact = i === 0 ? "pill-red" : i <= 2 ? "pill-amber" : "pill-gray";
      const timing = i === 0 ? "WEEK 1" : i <= 2 ? "WEEK 2–4" : "MONTH 2";
      opps.push(`
      <div class="opp">
        <div class="opp-num" style="color:${i===0?'var(--red)':i<=2?'var(--amber)':'var(--muted2)'};">0${i+1}</div>
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">
            <div class="opp-title">${o.title || o.action || o.item}</div>
          </div>
          <div class="opp-body">${o.description || o.detail || o.why || ""}</div>
          <div class="opp-tags"><span class="pill ${impact}">${i===0?'HIGH':i<=2?'MEDIUM':'LOW'} IMPACT</span><span class="pill pill-gray">${timing}</span></div>
        </div>
      </div>`);
    });
  } else {
    // Fallback: generate from scores
    if (sc.rep < 80) opps.push({ title: "Respond to unanswered reviews", body: "Unanswered reviews signal low engagement to both guests and Google's ranking algorithm. Aim for 100% response rate.", impact: "pill-red", timing: "WEEK 1", color: "var(--red)" });
    if (sc.soc < 75) opps.push({ title: "Increase social media posting frequency", body: "Posting 2–3× per week vs the 5–7× recommended cadence for your category. Inconsistent posting leaves organic reach on the table.", impact: "pill-red", timing: "WEEK 1", color: "var(--amber)" });
    if (!d.hasSchema) opps.push({ title: "Add Schema.org markup", body: "LocalBusiness schema lets Google show ratings, hours and menu directly in search results — without it, you're invisible in rich results.", impact: "pill-amber", timing: "WEEK 4", color: "var(--amber)" });
    if (sc.web < 75) opps.push({ title: "Fix website mobile page speed", body: "Slow mobile load times directly impact Google ranking and visitor drop-off. Target 80+ on PageSpeed Insights.", impact: "pill-amber", timing: "WEEK 2", color: "var(--amber)" });
    opps.push({ title: "Set up recurring Google Posts", body: "2 posts per week keeps your profile fresh and boosts local pack click-through rate measurably.", impact: "pill-gray", timing: "WEEK 2", color: "var(--muted2)" });

    opps.slice(0, 5).forEach((o, i) => {
      if (o.title) {
        const html = `
        <div class="opp">
          <div class="opp-num" style="color:${o.color};">0${i+1}</div>
          <div>
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;"><div class="opp-title">${o.title}</div></div>
            <div class="opp-body">${o.body}</div>
            <div class="opp-tags"><span class="pill ${o.impact}">${o.impact==='pill-red'?'HIGH':o.impact==='pill-amber'?'MEDIUM':'LOW'} IMPACT</span><span class="pill pill-gray">${o.timing}</span></div>
          </div>
        </div>`;
        opps[i] = html;
      }
    });
    return opps.filter(o => typeof o === 'string').join('');
  }
  return opps.join('');
}

// ── AI card helper ─────────────────────────────────────────────────────────────
function aiCard(status, name, action) {
  return `<div class="ai-card ${status}"><div class="ai-status ${status}">${status.toUpperCase()}</div><div class="ai-name">${name}</div><div class="ai-action"><b>Action:</b> ${action}</div></div>`;
}

function buildAiCards(scanDetails, aiInsights) {
  const d = scanDetails || {};
  const hasSchema  = d.hasSchema  || false;
  const hasReviews = (d.reviewCount || 0) > 20;
  const hasNap     = true; // assume consistent unless told otherwise

  const row1 = [
    aiCard(hasReviews ? "pass" : "missing", "Mentioned by AI assistants", hasReviews ? "Maintain review volume and recency" : "Build review count to 20+ to appear in AI answers"),
    aiCard(hasNap    ? "pass" : "partial",  "Consistent NAP",             hasNap    ? "No action needed — keep consistent" : "Fix name/address/phone inconsistencies across directories"),
    aiCard(hasSchema ? "pass" : "missing",  "Schema.org LocalBusiness markup", hasSchema ? "Schema found — keep it updated" : "Install plugin — highest AI leverage"),
  ].join("");

  const row2 = [
    aiCard("missing", "Google Q&amp;A section answered", "Add 5 Q&amp;As — AI pulls these directly into answers"),
    aiCard(hasReviews ? "pass" : "partial", "Review velocity (30-day)", "Aim for 8+ reviews/month to maintain AI visibility"),
  ].join("");

  return { row1, row2 };
}

// ── Competitor rows HTML ───────────────────────────────────────────────────────
function buildCompetitorSection(reportData, sc) {
  const comp = reportData.competitor;
  const businessName = reportData.businessName;

  if (!comp || !comp.name) {
    return {
      compRows: `<tr><td colspan="5" style="color:var(--muted);font-style:italic;padding:16px 9px;">No competitor was specified at checkout — add one on your next report for a head-to-head comparison.</td></tr>`,
      usefulGapTitle: "Add a competitor",
      usefulGapSub: "Next report",
      usefulGapBody: "Enter a competitor name at checkout to see a full side-by-side comparison of scores, reviews, and social reach.",
    };
  }

  const compGb  = comp.google  || 65;
  const compWeb = comp.website || 60;
  const gbDiff  = sc.gb  - compGb;
  const webDiff = sc.web - compWeb;

  const row = (metric, you, them, diff, unit="") => {
    const lead = diff >= 0;
    return `<tr>
      <td>${metric}</td>
      <td style="font-weight:700;color:${lead?'var(--green)':'var(--red)'};">${you}${unit}</td>
      <td style="color:var(--muted);">${them}${unit}</td>
      <td><span class="pill ${lead?'pill-green':'pill-red'}">${lead?'You +':'Behind −'}${Math.abs(diff)}${unit}</span></td>
      <td style="font-weight:700;color:${lead?'var(--green)':'var(--red)'};">${lead?'LEAD':'GAP'}</td>
    </tr>`;
  };

  const compRows = [
    row("Google score",    sc.gb,  compGb,  gbDiff),
    row("Website score",   sc.web, compWeb, webDiff),
    row("Reputation score",sc.rep, Math.round(comp.reputation||60), sc.rep - Math.round(comp.reputation||60)),
  ].join("");

  const biggestGap = gbDiff < webDiff ? "Google Business" : "Website";
  const gapVal     = Math.min(gbDiff, webDiff);

  return {
    compRows,
    usefulGapTitle: gapVal < 0 ? biggestGap : "Strong across the board",
    usefulGapSub:   gapVal < 0 ? `Behind by ${Math.abs(gapVal)} points` : `You lead ${comp.name}`,
    usefulGapBody:  gapVal < 0
      ? `${comp.name} has a lead in ${biggestGap}. Closing this gap is your highest-leverage competitive move.`
      : `You outperform ${comp.name} on the metrics that matter most — keep improving to widen the lead.`,
  };
}

// ── Website checks HTML ───────────────────────────────────────────────────────
function buildWebChecks(scanDetails) {
  const d = scanDetails || {};
  const check = (label, pass, impact, note) =>
    `<div class="check-row"><span style="font-size:12.5px;font-weight:500;">${label}</span><span class="pill ${pass?'pill-green':'pill-red'}">${pass?'PASS':'FAIL'}</span><span class="check-impact">${impact}<br/><span style="font-weight:400;">${note}</span></span></div>`;

  return [
    check("SSL / HTTPS",      d.isHttps       !== false, "CRITICAL", d.isHttps !== false ? "Certificate valid." : "Fix immediately — kills trust."),
    check("Mobile-friendly",  d.hasViewportMeta !== false, "HIGH", "Google mobile usability."),
    check("Mobile PageSpeed", d.perfScore >= 80, "HIGH", `Score: ${d.perfScore || "—"}/100. Target 80+.`),
    check("Schema.org markup",d.hasSchema || false, "HIGH", d.hasSchema ? "Rich results enabled." : "No star ratings in search."),
  ].join("");
}

// ── Platform rows HTML ────────────────────────────────────────────────────────
function buildPlatRows(scanDetails) {
  const d = scanDetails || {};
  const rating = d.rating || d.googleRating || "—";
  const reviews = d.reviewCount || 0;
  const unanswered = Math.round(reviews * 0.4);

  const row = (letter, name, detail, pillCls, pillTxt) =>
    `<div class="plat-row"><div class="plat-letter">${letter}</div><div><div style="font-size:12.5px;font-weight:600;">${name}</div><div style="font-size:11px;color:var(--muted);">${detail}</div></div><span class="pill ${pillCls}">${pillTxt}</span></div>`;

  return [
    row("G", `Google Business <span style="color:var(--green);">${rating}★</span>`, `${reviews} reviews · ~${unanswered} unanswered`, reviews > 50 ? "pill-green" : "pill-amber", reviews > 50 ? "GOOD" : "BUILD"),
    row("Y", "Yelp", "Check and claim — high traffic in food/service category", "pill-amber", "CHECK"),
    row("F", "Facebook", "Low engagement — consolidate into primary social channel", "pill-amber", "LOW"),
    row("T", "TripAdvisor", "Not yet actively managed", "pill-gray", "OPTIONAL"),
  ].join("");
}

// ── Ad stats HTML ─────────────────────────────────────────────────────────────
function buildAdStats(metaAds, businessName) {
  const m = metaAds || {};
  const bizAds  = m.business?.adCount || 0;
  const compAds = m.competitor?.adCount || "—";

  const stat = (lbl, val, sub, dark=false) =>
    `<div class="ad-stat${dark?' dark':''}"><div class="ad-stat-lbl" ${dark?'style="color:#64748b;"':''}>${lbl}</div><div class="ad-stat-val" style="${dark?'font-size:11.5px;color:#94a3b8;line-height:1.5;margin-top:3px;':''}">${dark?val:`<span style="color:${bizAds===0?'var(--muted)':'var(--green)'};">${val}</span>`}</div>${dark?'':`<div class="ad-stat-sub">${sub}</div>`}</div>`;

  return [
    stat("Your Active Ads", bizAds === 0 ? "0" : bizAds, bizAds === 0 ? "None detected" : "Active campaigns"),
    stat("Competitor Ads",  compAds, "Est. active campaigns"),
    stat("Suggested Test Budget", "$5/day", "Start with 7-day test"),
    stat("Opportunity", `With your reputation and reviews, a paid ad converts far more efficiently than competitors with weaker social proof.`, "", true),
  ].join("");
}

// ── Phase cards HTML ──────────────────────────────────────────────────────────
function buildPhases(aiInsights, sc) {
  const roadmap = aiInsights?.roadmap?.phases || null;

  if (roadmap && Array.isArray(roadmap) && roadmap.length >= 3) {
    return roadmap.slice(0,3).map((phase, i) => {
      const colors = ["pc1","pc2","pc3"];
      const tasks = (phase.tasks || phase.actions || []).slice(0,4).map(t => `
        <div class="pc ${colors[i]}">
          <div class="pc-task">${t.title || t.task || t}</div>
          <div class="pc-detail">${t.detail || t.description || ""}</div>
          <div class="pc-meta"><span style="color:${i===0?'var(--green)':i===1?'var(--amber)':'#6366f1'};">${t.time || t.effort || "—"}</span><span style="color:var(--green);">${t.points ? '+'+t.points+' pts' : ''}</span></div>
        </div>`).join("");
      return `<div>
        <div class="phase-hdr"><div class="phase-num">0${i+1}</div><div><div class="phase-range">${phase.range || `Days ${i===0?'1–14':i===1?'15–42':'43–90'}`}</div><div class="phase-name">${phase.name || phase.title}</div></div></div>
        <div class="phase-cards">${tasks}</div>
      </div>`;
    }).join("");
  }

  // Fallback generic phases
  return `
  <div>
    <div class="phase-hdr"><div class="phase-num">01</div><div><div class="phase-range">Days 1–14</div><div class="phase-name">Quick Wins</div></div></div>
    <div class="phase-cards">
      <div class="pc pc1"><div class="pc-task">Respond to all unanswered reviews</div><div class="pc-detail">Target 100% response rate on Google and Yelp.</div><div class="pc-meta"><span style="color:var(--green);">3 hrs</span><span style="color:var(--green);">+2 pts</span></div></div>
      <div class="pc pc1"><div class="pc-task">Post 3 short-form social videos</div><div class="pc-detail">Behind-the-scenes content — phone video is fine.</div><div class="pc-meta"><span style="color:var(--green);">2 hrs</span><span style="color:var(--green);">+1 pt</span></div></div>
      <div class="pc pc1"><div class="pc-task">Update Google Business Profile</div><div class="pc-detail">Hours, description, 10 new photos.</div><div class="pc-meta"><span style="color:var(--green);">30 min</span><span style="color:var(--green);">+1 pt</span></div></div>
    </div>
  </div>
  <div>
    <div class="phase-hdr"><div class="phase-num">02</div><div><div class="phase-range">Days 15–42</div><div class="phase-name">Build Momentum</div></div></div>
    <div class="phase-cards">
      <div class="pc pc2"><div class="pc-task">Fix website mobile page speed</div><div class="pc-detail">Compress images, enable caching. Target: &lt;2.5s load.</div><div class="pc-meta"><span style="color:var(--amber);">2 hrs</span><span style="color:var(--green);">+2 pts</span></div></div>
      <div class="pc pc2"><div class="pc-task">Weekly social content series</div><div class="pc-detail">One themed post every Monday — builds habit and reach.</div><div class="pc-meta"><span style="color:var(--amber);">Weekly</span><span style="color:var(--green);">+1 pt</span></div></div>
      <div class="pc pc2"><div class="pc-task">Set up recurring Google Posts</div><div class="pc-detail">2 posts per week, seasonal focus.</div><div class="pc-meta"><span style="color:var(--amber);">30 min</span><span style="color:var(--green);">+1 pt</span></div></div>
    </div>
  </div>
  <div>
    <div class="phase-hdr"><div class="phase-num">03</div><div><div class="phase-range">Days 43–90</div><div class="phase-name">Compound Growth</div></div></div>
    <div class="phase-cards">
      <div class="pc pc3"><div class="pc-task">Add LocalBusiness schema markup</div><div class="pc-detail">Homepage and contact page — star ratings appear in 24–48 hrs.</div><div class="pc-meta"><span style="color:#6366f1;">2 hrs</span><span style="color:var(--green);">+2 pts</span></div></div>
      <div class="pc pc3"><div class="pc-task">Run a UGC tag campaign</div><div class="pc-detail">Encourage customers to tag you — 2 week campaign.</div><div class="pc-meta"><span style="color:#6366f1;">1 hr</span><span style="color:var(--green);">+1 pt</span></div></div>
      <div class="pc pc3"><div class="pc-task">Re-scan on KYP</div><div class="pc-detail">Measure progress against your potential score target.</div><div class="pc-meta"><span style="color:#6366f1;">5 min</span><span style="color:var(--green);">Validate</span></div></div>
    </div>
  </div>`;
}

// ── Benchmark rows HTML ────────────────────────────────────────────────────────
function buildBenchRows(sc, scanDetails) {
  const d = scanDetails || {};
  const rating  = d.rating  || "—";
  const reviews = d.reviewCount || 0;
  const perf    = d.perfScore || "—";

  const row = (metric, you, median, top, pillCls, pillTxt, insight) =>
    `<tr><td>${metric}</td><td style="font-weight:700;color:var(--${pillCls==='pill-green'?'green':pillCls==='pill-red'?'red':'amber'});">${you}</td><td style="color:var(--muted);">${median}</td><td style="color:var(--muted);">${top}</td><td><span class="pill ${pillCls}">${pillTxt}</span></td><td style="font-size:11.5px;color:var(--muted);">${insight}</td></tr>`;

  return [
    row("Google rating",       `${rating}★`,  "4.1★", "4.4+",  rating >= 4.4 ? "pill-green":"pill-amber", rating >= 4.4?"LEAD":"ON TRACK", "Protect and grow review count."),
    row("Total reviews",       reviews,       "80–150","250+",  reviews >= 250?"pill-green":reviews>=80?"pill-amber":"pill-red", reviews>=250?"TOP":reviews>=80?"ON TRACK":"BUILD", "More reviews = stronger social proof."),
    row("Mobile PageSpeed",    perf,          "55–70","80+",    perf>=80?"pill-green":perf>=55?"pill-amber":"pill-red", perf>=80?"PASS":perf>=55?"AT MEDIAN":"BEHIND", "Aim for 80+ this quarter."),
    row("Review response rate","~"+(sc.rep>=80?"90%":sc.rep>=70?"70%":"50%"), "70–80%","95%+", sc.rep>=80?"pill-green":"pill-red", sc.rep>=80?"STRONG":"BEHIND", "Top performers reply within 24 hrs."),
    row("Social posting/month",sc.soc>=75?"20+":sc.soc>=55?"8–12":"<8","8–12","20+", sc.soc>=75?"pill-green":sc.soc>=55?"pill-amber":"pill-red", sc.soc>=75?"TOP":"BEHIND", "5–7× per week reaches top quartile."),
  ].join("");
}

// ── Checklist items HTML ───────────────────────────────────────────────────────
function buildChecklist(aiInsights, sc, scanDetails) {
  const d = scanDetails || {};
  const aiItems = aiInsights?.quickWins?.items || aiInsights?.checklist?.items || null;

  if (aiItems && Array.isArray(aiItems) && aiItems.length >= 4) {
    return aiItems.slice(0,7).map((item, i) => `
    <div class="check-item">
      <div class="check-num">0${i+1}</div>
      <div><div class="check-task">${item.task || item.title || item}</div><div class="check-detail">${item.detail || item.description || ""}</div></div>
      <div class="check-time">${item.time || item.effort || "—"}</div>
    </div>`).join("");
  }

  // Fallback from scores
  const items = [];
  items.push({ task: "Respond to all unanswered Google &amp; Yelp reviews", detail: "Target 100% response rate — visible immediately to every new visitor.", time: "3 HOURS" });
  items.push({ task: "Post 3 short-form videos — behind-the-scenes content", detail: "Roasting, cooking, service intro. Phone video is fine.", time: "2 HOURS" });
  items.push({ task: "Update Google Business profile completely", detail: "Hours, description, 10 new high-quality photos of space and products.", time: "30 MIN" });
  if (sc.web < 75) items.push({ task: "Fix website mobile page speed", detail: "Compress images, enable caching. Target: under 2.5 second load time.", time: "2 HOURS" });
  items.push({ task: "Set up recurring Google Posts — 2 per week", detail: "Seasonal product focus. Boosts local pack click-through rate measurably.", time: "20 MIN" });
  if (!d.hasSchema) items.push({ task: "Add FAQ schema markup to homepage", detail: "Hours, parking, WiFi, pet policy. Star ratings appear in 24–48 hours.", time: "1 HOUR" });
  items.push({ task: "Claim and complete Yelp profile", detail: "Check photos, hours, and respond to any reviews there too.", time: "20 MIN" });

  return items.slice(0,7).map((item, i) => `
  <div class="check-item">
    <div class="check-num">0${i+1}</div>
    <div><div class="check-task">${item.task}</div><div class="check-detail">${item.detail}</div></div>
    <div class="check-time">${item.time}</div>
  </div>`).join("");
}

// ── Executive summary copy ─────────────────────────────────────────────────────
function buildExecSummary(sc, aiInsights, businessName, city) {
  // Use AI insights if available
  const aiExec = aiInsights?.executiveSummary || aiInsights?.summary || null;
  if (aiExec && typeof aiExec === 'object') {
    return {
      headline: aiExec.headline || aiExec.title || `Score: ${sc.overall}/100 — ${sc.overall >= 75 ? "Strong foundation with clear upside" : "Clear opportunities identified"}`,
      body: aiExec.body || aiExec.content || `<p class="body-t">${aiExec.text || ""}</p>`,
      pull: aiExec.pull || aiExec.insight || "The data is in — now make it impossible to overlook.",
    };
  }
  if (typeof aiExec === 'string') {
    return {
      headline: `${sc.overall >= 75 ? "Strong" : "Growing"} presence. Clear gaps identified.`,
      body: `<p class="body-t">${aiExec}</p>`,
      pull: "The data is in — now make it impossible to overlook.",
    };
  }

  // Fallback from scores
  const strengths = [];
  const gaps = [];
  if (sc.rep >= 75) strengths.push("Reputation"); else gaps.push("Reputation");
  if (sc.gb  >= 75) strengths.push("Google Business"); else gaps.push("Google Business");
  if (sc.web >= 75) strengths.push("Website"); else gaps.push("Website");
  if (sc.soc >= 75) strengths.push("Social Media"); else gaps.push("Social Media");

  const headline = strengths.length >= 2
    ? `Strong ${strengths.slice(0,2).join(" and ")}. Clear gaps in <em style="color:var(--green);font-style:italic;">${(gaps[0]||"paid visibility")}.</em>`
    : `Room to grow across <em style="color:var(--green);font-style:italic;">several key channels.</em>`;

  const body = `
    <p class="body-t" style="margin-bottom:7px;">${businessName} scored <strong>${sc.overall}/100</strong> overall.
    ${strengths.length > 0 ? `<strong>${strengths.join(" and ")}</strong> ${strengths.length===1?"is":"are"} your strongest ${strengths.length===1?"area":"areas"}.` : ""}
    ${gaps.length > 0 ? `<strong>${gaps.join(" and ")}</strong> ${gaps.length===1?"is":"are"} the biggest opportunity.` : ""}</p>
    <p class="body-t">Your upside potential is <strong>${Math.min(sc.overall + 14, 98)}/100</strong> — achievable in 60–90 days with targeted fixes.</p>`;

  return {
    headline,
    body,
    pull: `The read: ${sc.overall >= 75 ? "your quality is already proven — now make it impossible to overlook." : "focus on the highest-impact fixes first and the score climbs fast."}`,
  };
}

// ── Ad copy ───────────────────────────────────────────────────────────────────
function buildAdCopy(aiInsights, businessName, city, scanDetails) {
  const d = scanDetails || {};
  const reviews = d.reviewCount || 0;
  const rating  = d.rating || "4.5";
  const aiAd = aiInsights?.adIntelligence || aiInsights?.ads || null;

  if (aiAd?.recommendedAd) {
    return {
      headline: aiAd.recommendedAd.headline || `"${reviews > 100 ? reviews + " happy customers can't be wrong." : "Your neighbourhood's hidden gem."}"`,
      copy: aiAd.recommendedAd.copy || aiAd.recommendedAd.body || "",
      cta: aiAd.recommendedAd.cta || "Test on Instagram Stories — 7 days at $5/day",
    };
  }

  return {
    headline: reviews > 50 ? `"${reviews} ${city} customers can't be wrong."` : `"${businessName} — discover why locals choose us."`,
    copy: `"${businessName}. ${rating}★ from ${reviews > 0 ? reviews + " real guests" : "satisfied customers"}. ${city}'s choice for ${d.businessType || "quality service"}."`,
    cta: "Test on Instagram Stories — 7 days at $5/day",
  };
}

// ── MAIN: build full print HTML ───────────────────────────────────────────────
function buildPrintHtml(reportData) {
  const {
    businessName = "Your Business",
    city         = "",
    reportId     = "KYP-000000",
    reportDate   = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" }),
    aiInsights   = null,
    scanDetails  = null,
    metaAds      = null,
  } = reportData;

  const sc      = getScores(reportData);
  const g       = grade(sc.overall);
  const gRank   = gradeRank(sc.overall, city);
  const potential = Math.min(sc.overall + 14, 98);
  const scoreOffset = (301.6 * (1 - sc.overall / 100)).toFixed(1);

  const exec    = buildExecSummary(sc, aiInsights, businessName, city);
  const catCards = buildCatCards(sc, scanDetails);
  const opps    = buildOpportunities(sc, scanDetails, aiInsights, businessName);
  const ai      = buildAiCards(scanDetails, aiInsights);
  const comp    = buildCompetitorSection(reportData, sc);
  const webChks = buildWebChecks(scanDetails);
  const platRows = buildPlatRows(scanDetails);
  const adStats = buildAdStats(metaAds, businessName);
  const adCopy  = buildAdCopy(aiInsights, businessName, city, scanDetails);
  const phases  = buildPhases(aiInsights, sc);
  const bench   = buildBenchRows(sc, scanDetails);
  const checks  = buildChecklist(aiInsights, sc, scanDetails);

  const d = scanDetails || {};
  const reviews = d.reviewCount || 0;
  const unanswered = Math.round(reviews * 0.4);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>KYP Report — ${businessName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f2ec;--surface:#fff;--ink:#1a2332;--muted:#6b7280;--muted2:#9ca3af;
  --rule:#e5e2da;--cream:#f0ede6;--navy:#152030;
  --green:#1f6b45;--green-lt:#e8f4ed;--amber:#b87d1a;
  --amber-lt:#fdf6e3;--red:#c0392b;--red-lt:#fdecea;
  --serif:'EB Garamond',Georgia,serif;--sans:'Inter',system-ui,sans-serif;
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
  <div class="rh-title">${businessName}${city ? ` &nbsp;·&nbsp; ${city}` : ""}</div>
  <div class="rh-meta">${reportDate}<br/>${reportId} &nbsp;·&nbsp; <span class="rh-score">${sc.overall}/100 &nbsp;Grade ${g}</span></div>
</div>

<!-- 00 COVER -->
<div class="section">
  <div class="sec-label">Know Your Presence / Decision-Ready Readout</div>
  <div class="h1">The shape of<br/><em>${businessName}'s</em> presence.</div>
  <p class="lead" style="max-width:580px;margin-top:8px;">A practical scan of how ${city || "your market"} discovers, evaluates, and chooses your business — with the next move made clear.</p>
  <hr class="rule"/>
  <div class="cover-hero">
    <div class="score-dark">
      <div class="lbl">Presence Score</div>
      <svg viewBox="0 0 120 120" width="100" height="100" style="display:block;margin:0 auto;">
        <circle cx="60" cy="60" r="48" fill="none" stroke="#1e3040" stroke-width="18"/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="#d4a843" stroke-width="18"
          stroke-dasharray="301.6" stroke-dashoffset="${scoreOffset}"
          stroke-linecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="55" text-anchor="middle" font-size="28" font-weight="700" fill="white" font-family="EB Garamond,serif">${sc.overall}</text>
        <text x="60" y="71" text-anchor="middle" font-size="11" fill="#94a3b8" font-family="Inter,sans-serif">/ 100</text>
      </svg>
      <div class="grade">Grade ${g}</div>
      <div class="rank">${gRank}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:7px;">Executive Summary</div>
      <div class="h3" style="margin-bottom:10px;">${exec.headline}</div>
      ${exec.body}
      <div style="margin-top:12px;padding:9px 11px;background:var(--cream);border-radius:6px;font-size:12px;color:var(--muted);font-style:italic;font-family:var(--serif);">${exec.pull}</div>
    </div>
  </div>
  <div class="metric-row">
    <div class="metric-cell"><div class="metric-lbl">Presence Score</div><div class="metric-val">${sc.overall}/100</div><div class="metric-sub">Grade ${g}</div></div>
    <div class="metric-cell"><div class="metric-lbl">Potential Score</div><div class="metric-val">${potential}/100</div><div class="metric-sub">${potential - sc.overall} points above today</div></div>
    <div class="metric-cell"><div class="metric-lbl">Google Rating</div><div class="metric-val">${d.rating || "—"}/5</div><div class="metric-sub">${reviews} reviews</div></div>
    <div class="metric-cell"><div class="metric-lbl">Unanswered Reviews</div><div class="metric-val" style="color:var(--amber);">~${unanswered}</div><div class="metric-sub">${reviews > 0 ? Math.round((unanswered/reviews)*100) : 40}% response gap</div></div>
  </div>
</div>

<!-- 01 SCORE BREAKDOWN -->
<div class="section">
  <div class="sec-label">01 / Read the Signal</div>
  <div class="h2">Score breakdown</div>
  <p class="lead">Averages hide the story. These category scores show where presence compounds — and where one weak link can cost the click.</p>
  <div class="two-col">
    <div>
      <div class="pull" style="margin-bottom:12px;">"The constraint is not quality. It is <em>signal density</em>."</div>
      <p class="body-t" style="margin-bottom:8px;">Your score is carried by <strong>${sc.rep >= 75 ? "Reputation" : ""}${sc.gb >= 75 ? (sc.rep >= 75 ? " and " : "") + "Google Business" : ""}</strong>${sc.rep < 75 && sc.gb < 75 ? "scores that have clear room to grow" : " — strong foundations to build on"}.</p>
      <p class="body-t" style="margin-bottom:8px;">The next move: fix <strong>${sc.soc < sc.web ? "Social Media consistency" : "Website &amp; Technical gaps"}</strong>, then leverage that activity across all channels.</p>
      <div style="background:var(--cream);border-radius:6px;padding:9px 12px;font-size:12px;color:var(--ink);"><span style="color:var(--green);">›</span> <strong>Sequence:</strong> ${sc.soc < 65 ? "social → website speed → review responses." : "review responses → website speed → social."}</div>
    </div>
    <div>
      <div class="bar-chart">
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Reputation</span><span class="bar-val" style="color:${scoreColor(sc.rep)};">${sc.rep}</span></div><div class="bar-track"><div class="bar-fill" style="width:${sc.rep}%;background:${scoreColor(sc.rep)};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Google Business</span><span class="bar-val" style="color:${scoreColor(sc.gb)};">${sc.gb}</span></div><div class="bar-track"><div class="bar-fill" style="width:${sc.gb}%;background:${scoreColor(sc.gb)};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Website &amp; Technical</span><span class="bar-val" style="color:${scoreColor(sc.web)};">${sc.web}</span></div><div class="bar-track"><div class="bar-fill" style="width:${sc.web}%;background:${scoreColor(sc.web)};"></div></div></div>
        <div class="bar-row"><div class="bar-top"><span class="bar-name">Social Media</span><span class="bar-val" style="color:${scoreColor(sc.soc)};">${sc.soc}</span></div><div class="bar-track"><div class="bar-fill" style="width:${sc.soc}%;background:${scoreColor(sc.soc)};"></div></div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <span class="pill pill-green">Strong ≥75</span>
        <span class="pill pill-amber">Leverage 55–74</span>
        <span class="pill pill-red">Needs work &lt;55</span>
      </div>
    </div>
  </div>
  <div style="margin-top:16px;">${catCards}</div>
</div>

<!-- 02 OPPORTUNITIES -->
<div class="section">
  <div class="sec-label">02 / Make It Actionable</div>
  <div class="h2">The ranked opportunity list</div>
  <p class="lead">Ordered by likely customer impact and the time window in which the fix begins paying back.</p>
  <div>${opps}</div>
</div>

<!-- 03 AI VISIBILITY -->
<div class="section">
  <div class="sec-label">03 / The New Front Door</div>
  <div class="h2">AI visibility</div>
  <p class="lead">When a guest asks an assistant where to find great ${reportData.businessType || "local services"} in ${city || "your city"}, these signals shape whether ${businessName} enters the answer.</p>
  <div class="ai-info">
    <div class="ai-circle"><div class="ai-circle-text">AI<br/>READINESS</div></div>
    <div><p class="body-t" style="font-weight:600;margin-bottom:3px;">AI systems are learning the same public evidence your guests see.</p><p class="body-t">Consistency, specificity, and fresh proof make it easier for an answer engine to describe you accurately.</p></div>
  </div>
  <div class="ai-grid">${ai.row1}</div>
  <div class="ai-grid-r2">${ai.row2}</div>
</div>

<!-- 04 COMPETITOR -->
<div class="section">
  <div class="sec-label">04 / Relative Position</div>
  <div class="h2">Competitive comparison${reportData.competitor?.name ? ` — vs ${reportData.competitor.name}` : ""}</div>
  <p class="lead">A competitor comparison is useful when it leads to a specific response — this one shows where the gap is behavioral, not just numerical.</p>
  <div class="comp-layout">
    <table class="comp-table">
      <thead><tr><th>Metric</th><th>${businessName}</th><th>${reportData.competitor?.name || "Competitor"}</th><th>Gap</th><th>Read</th></tr></thead>
      <tbody>${comp.compRows}</tbody>
    </table>
    <div class="gap-box">
      <div class="gap-lbl">The Useful Gap</div>
      <div class="gap-val">${comp.usefulGapTitle}</div>
      <div class="gap-sub">${comp.usefulGapSub}</div>
      <div class="gap-body">${comp.usefulGapBody}</div>
    </div>
  </div>
</div>

<!-- 05 WEBSITE & REPUTATION -->
<div class="section">
  <div class="sec-label">05 / Trust at the Click</div>
  <div class="h2">Website &amp; reputation findings</div>
  <p class="lead">The handoff from search result to confident visit happens here. Every detail either keeps momentum or quietly leaks it.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;">
    <div><div style="font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;">Website Checks</div>${webChks}</div>
    <div><div style="font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;">Review Platforms</div>${platRows}</div>
  </div>
</div>

<!-- 06 ADS -->
<div class="section">
  <div class="sec-label">06 / Paid Signal</div>
  <div class="h2">Ad intelligence</div>
  <p class="lead">Competitor ad activity reveals which promises are being repeated in the ${city || "local"} market — and where your opportunity sits.</p>
  <div class="ad-stats">${adStats}</div>
  <div class="reco-box">
    <div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--green);margin-bottom:7px;">Recommended First Ad</div>
    <div style="font-family:var(--serif);font-size:17px;font-weight:700;color:var(--ink);margin-bottom:5px;">${adCopy.headline}</div>
    <p style="font-size:12px;font-style:italic;color:var(--muted);margin-bottom:7px;">${adCopy.copy}</p>
    <div style="font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--green);">${adCopy.cta}</div>
  </div>
</div>

<!-- 07 ROADMAP -->
<div class="section">
  <div class="sec-label">07 / Turn Insight Into Motion</div>
  <div class="h2">A 90-day roadmap</div>
  <p class="lead">The sequence is intentionally narrow: make the foundation trustworthy, then make the signal easier to discover, then measure the lift.</p>
  <div class="prog-row">
    <div class="prog-cell"><div class="prog-lbl">Current</div><div class="prog-val" style="color:var(--muted);">${sc.overall}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${sc.overall}%;background:var(--muted2);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 1</div><div class="prog-val" style="color:var(--green);">${Math.min(sc.overall+4,98)}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${Math.min(sc.overall+4,98)}%;background:var(--green);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 2</div><div class="prog-val" style="color:var(--green);">${Math.min(sc.overall+9,98)}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${Math.min(sc.overall+9,98)}%;background:var(--green);"></div></div></div>
    <div class="prog-cell"><div class="prog-lbl">After Phase 3</div><div class="prog-val" style="color:var(--green);">${potential}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${potential}%;background:var(--green);"></div></div></div>
  </div>
  <div class="phase-cols">${phases}</div>
</div>

<!-- 08 BENCHMARKS -->
<div class="section">
  <div class="sec-label">08 / Context, Not Comparison Theatre</div>
  <div class="h2">Benchmark context</div>
  <p class="lead">Median tells you where the market sits. Top quartile shows what a more disciplined presence makes possible.</p>
  <table class="bench-table">
    <thead><tr><th>Metric</th><th>You</th><th>Median</th><th>Top Quartile</th><th>Status</th><th>Insight</th></tr></thead>
    <tbody>${bench}</tbody>
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
      <div>${checks}</div>
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
  <div style="font-size:11px;color:var(--muted);margin-top:2px;">${businessName}${city ? ` &nbsp;·&nbsp; ${city}` : ""} &nbsp;·&nbsp; ${reportDate} &nbsp;·&nbsp; ${reportId}</div>
</div>

</div>
</body>
</html>`;
}

// ── generateReportPdf — called from server.js ─────────────────────────────────
async function generateReportPdf(reportData) {
  const reportId = reportData.reportId || makeReportId();
  const pdfPath  = path.join(REPORTS_DIR, `${reportId}.pdf`);
  const tmpHtml  = path.join(os.tmpdir(), `kyp_${reportId}.html`);

  fs.writeFileSync(tmpHtml, buildPrintHtml(reportData), "utf8");

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500); // Google Fonts

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
    displayHeaderFooter: false,
  });

  await browser.close();
  try { fs.unlinkSync(tmpHtml); } catch (_) {}

  console.log("PDF saved:", pdfPath);
  return pdfPath;
}

// ── generateToolkitZip — called from server.js ────────────────────────────────
async function generateToolkitZip(reportData) {
  const reportId  = reportData.reportId || makeReportId();
  const zipPath   = path.join(REPORTS_DIR, `${reportId}-toolkit.zip`);
  const businessName = reportData.businessName || "Your Business";

  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => { console.log("Toolkit ZIP saved:", zipPath); resolve(zipPath); });
    archive.on("error", reject);
    archive.pipe(output);

    // Checklist PDF text file
    const checklist = `KNOW YOUR PRESENCE — ACTION CHECKLIST
${businessName}  ·  ${reportData.city || ""}  ·  ${reportData.reportDate || ""}

YOUR PRESENCE SCORE: ${getScores(reportData).overall}/100

FIRST 7 DAYS
□ Respond to all unanswered Google & Yelp reviews (target 100%)
□ Post 3 short-form social videos (behind-the-scenes)
□ Update Google Business Profile (hours, photos, description)
□ Fix website mobile page speed (target <2.5s)
□ Set up 2 Google Posts per week
□ Publish first local SEO blog post
□ Add FAQ schema markup to homepage

MONTH 1–3
□ Claim and complete all review platform profiles
□ Increase social posting to 5× per week
□ Run a UGC tag campaign
□ Test first paid ad ($5/day for 7 days)
□ Re-scan on Know Your Presence

Support: support@knowyourpresence.com
`;

    archive.append(checklist, { name: "KYP_Action_Checklist.txt" });

    // Response templates
    const templates = `KNOW YOUR PRESENCE — REVIEW RESPONSE TEMPLATES
${businessName}

POSITIVE REVIEW TEMPLATE
"Thank you so much for the kind words! We're thrilled you had a great experience.
We look forward to welcoming you back soon. — The ${businessName} Team"

CRITICAL REVIEW TEMPLATE
"Thank you for taking the time to share your feedback. We're sorry to hear your
experience didn't meet expectations. We'd love the chance to make it right —
please reach out to us directly at [your email]. — The ${businessName} Team"

NEUTRAL REVIEW TEMPLATE
"Thank you for your feedback! We're always looking to improve and your comments
help us do that. Hope to see you again soon. — The ${businessName} Team"
`;

    archive.append(templates, { name: "KYP_Review_Response_Templates.txt" });
    archive.finalize();
  });
}

module.exports = { generateReportPdf, generateToolkitZip, makeReportId, REPORTS_DIR };
