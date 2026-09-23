// services/reportHtml.js
// Generates the interactive web report HTML from reportData.
// Same data shape as generateReportPdf. Returns an HTML string.

function scoreColor(s) {
  if (s >= 75) return '#1f6b45';
  if (s >= 55) return '#b87d1a';
  return '#c0392b';
}
function pillClass(s) {
  if (s === 'STRONG' || s === 'GOOD' || s === 'PASS') return 'pill-green';
  if (s === 'NEEDS WORK' || s === 'PARTIAL' || s === 'BELOW MED' || s === 'ON TRACK') return 'pill-amber';
  return 'pill-red';
}

function generateWebReport(reportData) {
  const {
    businessName = 'Your Business',
    city = '',
    reportId = 'KYP-000',
    reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    scores = {},
    scanDetails = {},
    competitor = null,
    apify = null,
    urlscan = null,
    metaAds = null,
  } = reportData;

  const google     = scores.google     ?? 75;
  const social     = scores.social     ?? 60;
  const website    = scores.website    ?? 65;
  const reputation = scores.reputation ?? 70;
  const overall    = Math.round((google * 0.35) + (social * 0.25) + (website * 0.20) + (reputation * 0.20));
  const potential  = Math.min(98, overall + 16);
  const grade      = overall >= 85 ? 'A' : overall >= 75 ? 'B+' : overall >= 65 ? 'B' : overall >= 55 ? 'C+' : 'C';

  const pageSpeed  = scanDetails?.perfScore ?? 54;
  const rating     = scanDetails?.rating    ?? 4.4;
  const reviews    = scanDetails?.reviewCount ?? 210;
  const isHttps    = scanDetails?.isHttps   ?? true;
  const hasMobile  = scanDetails?.hasViewportMeta ?? true;

  const compName   = competitor?.name || 'Your Competitor';
  const compGoogle = competitor?.google || 74;
  const compWeb    = competitor?.website || 79;

  const ads = metaAds?.ads || [];
  const adsCount = metaAds?.totalActive || 0;
  const longestAd = ads.reduce((m,a) => Math.max(m, a.daysRunning||0), 0);
  const estSpend   = metaAds?.estimatedMonthlySpend || '~$300–600';

  const catStatus = (s) => s >= 75 ? 'STRONG' : s >= 60 ? 'NEEDS WORK' : 'NEEDS WORK';
  const catStatusRep = (s) => s >= 75 ? 'GOOD' : s >= 60 ? 'NEEDS WORK' : 'NEEDS WORK';

  const loc = city ? `, ${city}` : '';

  return `<!DOCTYPE html>
<html lang="en" data-mode="light">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>KYP Report — ${businessName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f2ec;--surface:#fff;--ink:#1a2332;--muted:#6b7280;--muted2:#9ca3af;
  --rule:#e5e2da;--cream:#f0ede6;--navy:#152030;--navy2:#1e2f42;
  --green:#1f6b45;--green-lt:#e8f4ed;--amber:#b87d1a;--amber-lt:#fdf6e3;
  --red:#c0392b;--red-lt:#fdecea;
  --serif:'EB Garamond',Georgia,serif;--sans:'Inter',system-ui,sans-serif;
  --sidebar:260px;
}
[data-mode="dark"]{
  --bg:#0f1923;--surface:#1a2535;--ink:#e8e6e0;--muted:#94a3b8;--muted2:#64748b;
  --rule:#2a3a50;--cream:#1e2d3d;--navy:#0a1628;
  --green:#2d9e65;--green-lt:#0f2d1e;--amber:#d4922a;--amber-lt:#2d1f09;
  --red:#e05454;--red-lt:#2d1414;
}
body{font-family:var(--sans);background:var(--bg);color:var(--ink);font-size:14px;line-height:1.5;min-height:100vh;}

/* LAYOUT */
.layout{display:flex;min-height:100vh;}
.sidebar{
  width:var(--sidebar);background:var(--navy);
  position:fixed;top:0;left:0;height:100vh;
  overflow-y:auto;z-index:100;
  display:flex;flex-direction:column;
  transition:transform .25s ease;
}
.main{margin-left:var(--sidebar);flex:1;min-width:0;}

/* SIDEBAR */
.sb-top{padding:20px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);}
.sb-brand{font-family:var(--serif);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#4ade80;margin-bottom:2px;}
.sb-biz{font-size:13px;font-weight:600;color:#fff;line-height:1.3;}
.sb-meta{font-size:10.5px;color:#64748b;margin-top:2px;}

.sb-score{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);}
.sb-score-ring{width:56px;height:56px;margin-bottom:8px;}
.sb-score-big{font-family:var(--serif);font-size:20px;font-weight:700;color:#fff;}
.sb-grade{font-size:10px;font-weight:700;color:#4ade80;letter-spacing:.8px;text-transform:uppercase;}

.sb-nav{padding:10px 0;flex:1;}
.sb-nav-item{
  display:flex;align-items:center;gap:10px;
  padding:8px 18px;cursor:pointer;
  font-size:12px;color:#94a3b8;
  border-left:2px solid transparent;
  transition:all .15s;text-decoration:none;
}
.sb-nav-item:hover,.sb-nav-item.active{color:#fff;border-left-color:#4ade80;background:rgba(255,255,255,.04);}
.sb-nav-num{font-size:10px;color:#4ade80;font-weight:700;min-width:18px;}

.sb-bottom{padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);}
.sb-actions{display:flex;flex-direction:column;gap:6px;}
.sb-btn{
  display:flex;align-items:center;justify-content:center;gap:6px;
  padding:7px 12px;border-radius:6px;font-size:11.5px;font-weight:600;
  cursor:pointer;border:none;transition:all .15s;text-decoration:none;
}
.sb-btn-primary{background:#4ade80;color:#0f1923;}
.sb-btn-primary:hover{background:#22c55e;}
.sb-btn-outline{background:transparent;color:#94a3b8;border:1px solid rgba(255,255,255,.15);}
.sb-btn-outline:hover{color:#fff;border-color:rgba(255,255,255,.3);}

/* TOPBAR */
.topbar{
  background:var(--surface);border-bottom:1px solid var(--rule);
  padding:12px 32px;display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:50;
}
.topbar-title{font-size:13px;font-weight:600;color:var(--ink);}
.topbar-right{display:flex;align-items:center;gap:10px;}
.mode-btn{
  padding:5px 10px;border-radius:6px;font-size:11.5px;font-weight:500;
  background:var(--cream);border:1px solid var(--rule);cursor:pointer;color:var(--muted);
}
.mode-btn:hover{background:var(--rule);}
.topbar-id{font-size:11px;color:var(--muted2);}

/* CONTENT */
.content{padding:36px 40px;max-width:900px;}
.section{margin-bottom:64px;scroll-margin-top:60px;}

/* TYPOGRAPHY */
.sec-label{font-size:10.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--green);margin-bottom:6px;}
.h1{font-family:var(--serif);font-size:38px;font-weight:700;line-height:1.1;color:var(--ink);}
.h1 em{font-style:italic;color:var(--green);}
.h2{font-family:var(--serif);font-size:26px;font-weight:700;line-height:1.2;color:var(--ink);margin-bottom:6px;}
.h3{font-family:var(--serif);font-size:18px;font-weight:700;color:var(--ink);margin-bottom:4px;}
.lead{font-size:14px;color:var(--muted);line-height:1.65;margin-bottom:16px;}
.body{font-size:14px;line-height:1.7;color:var(--ink);opacity:.85;}
.pull{font-family:var(--serif);font-size:20px;font-weight:700;line-height:1.45;color:var(--ink);}
.pull em{font-style:italic;color:var(--green);}

hr.rule{border:none;border-top:1px solid var(--rule);margin:12px 0;}

/* PILLS */
.pill{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.4px;padding:3px 9px;border-radius:4px;text-transform:uppercase;white-space:nowrap;}
.pill-green{background:#c8e6d4;color:#0f4526;}
.pill-amber{background:#fde8c0;color:#6b420a;}
.pill-red{background:#fdd4d0;color:#7a1717;}
.pill-gray{background:var(--cream);color:var(--muted);border:1px solid var(--rule);}
[data-mode="dark"] .pill-green{background:#0f3320;color:#4ade80;}
[data-mode="dark"] .pill-amber{background:#2d1f09;color:#fbbf24;}
[data-mode="dark"] .pill-red{background:#2d1010;color:#f87171;}
[data-mode="dark"] .pill-gray{background:rgba(255,255,255,.08);color:var(--muted);}

/* CARDS */
.card{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:20px 22px;}
.card+.card{margin-top:10px;}

/* METRIC ROW */
.metric-row{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--rule);border-radius:10px;overflow:hidden;background:var(--surface);}
.metric-cell{padding:16px 18px;border-right:1px solid var(--rule);}
.metric-cell:last-child{border-right:none;}
.metric-lbl{font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted2);margin-bottom:4px;}
.metric-val{font-family:var(--serif);font-size:26px;font-weight:700;color:var(--ink);line-height:1.1;}
.metric-sub{font-size:11.5px;color:var(--muted);margin-top:2px;}

/* SCORE DONUT */
.score-hero{display:grid;grid-template-columns:160px 1fr;gap:28px;align-items:center;margin-bottom:24px;}
.score-dark{background:var(--navy);border-radius:12px;padding:24px;text-align:center;}
.score-dark .lbl{font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;}
.score-dark .grade{font-size:14px;font-weight:700;color:#4ade80;margin-top:8px;}
.score-dark .rank{font-size:11.5px;color:#94a3b8;line-height:1.4;margin-top:4px;}

/* BAR CHART */
.bar-chart{margin:16px 0;}
.bar-row{margin-bottom:12px;}
.bar-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}
.bar-name{font-size:13px;font-weight:500;color:var(--ink);}
.bar-val{font-size:14px;font-weight:700;}
.bar-track{height:10px;background:var(--cream);border-radius:4px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;transition:width .6s cubic-bezier(.4,0,.2,1);}

/* CAT DETAIL */
.cat-card{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;margin-bottom:8px;}
.cat-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;}
.cat-title{font-size:14px;font-weight:600;color:var(--ink);}
.cat-meta{font-size:12px;color:var(--muted);margin-top:2px;}
.cat-next{font-size:13px;color:var(--ink);margin-top:8px;padding-top:8px;border-top:1px solid var(--rule);}
.cat-next b{color:var(--green);}

/* OPPORTUNITIES */
.opp{display:grid;grid-template-columns:44px 1fr;gap:0;padding:20px 0;border-bottom:1px solid var(--rule);}
.opp:last-child{border-bottom:none;}
.opp-num{font-family:var(--serif);font-size:14px;color:var(--muted2);padding-top:3px;}
.opp-title{font-family:var(--serif);font-size:22px;font-weight:700;color:var(--ink);line-height:1.2;margin-bottom:5px;}
.opp-body{font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:10px;}
.opp-tags{display:flex;gap:7px;flex-wrap:wrap;align-items:center;}

/* AI SIGNALS */
.ai-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0;}
.ai-grid-r2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.ai-card{border:1px solid var(--rule);border-radius:8px;padding:14px 16px;background:var(--surface);}
.ai-card.pass{border-color:#a3d4b5;background:var(--green-lt);}
.ai-card.missing{border-color:#f5b8b2;background:var(--red-lt);}
.ai-card.partial{border-color:#f0d49a;background:var(--amber-lt);}
.ai-status{font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px;}
.ai-status.pass{color:var(--green);}.ai-status.missing{color:var(--red);}.ai-status.partial{color:var(--amber);}
.ai-name{font-family:var(--serif);font-size:17px;font-weight:700;color:var(--ink);line-height:1.3;margin-bottom:6px;}
.ai-action{font-size:12px;color:var(--muted);}
.ai-action b{color:var(--ink);}
.ai-signal-lbl{font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:.5px;float:right;}
.ai-info{background:var(--cream);border-radius:8px;padding:16px 18px;margin-bottom:14px;display:flex;gap:16px;align-items:center;}
.ai-circle{width:60px;height:60px;border-radius:50%;border:2px solid var(--green);display:flex;align-items:center;justify-content:center;text-align:center;flex-shrink:0;}
.ai-circle-text{font-size:9px;font-weight:700;letter-spacing:.4px;color:var(--green);line-height:1.2;text-transform:uppercase;}

/* COMP TABLE */
.comp-layout{display:grid;grid-template-columns:1fr 200px;gap:20px;}
.comp-table{width:100%;border-collapse:collapse;font-size:13.5px;}
.comp-table th{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--rule);text-align:left;}
.comp-table td{padding:9px 10px;border-bottom:1px solid var(--rule);vertical-align:middle;}
.comp-table tr:last-child td{border-bottom:none;}
.gap-box{background:var(--cream);border-radius:8px;padding:18px;}
.gap-lbl{font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.gap-val{font-family:var(--serif);font-size:22px;font-weight:700;color:var(--ink);margin-bottom:4px;}
.gap-sub{font-size:13px;font-weight:600;color:var(--muted);margin-bottom:10px;}
.gap-body{font-size:12.5px;color:var(--muted);line-height:1.55;}

/* WEBSITE CHECKS */
.check-row{display:grid;grid-template-columns:1fr 80px 120px;gap:8px;padding:9px 0;border-bottom:1px solid var(--rule);align-items:center;}
.check-row:last-child{border-bottom:none;}
.check-impact{font-size:10px;font-weight:600;color:var(--muted2);}

/* PLATFORM ROWS */
.plat-row{display:grid;grid-template-columns:28px 1fr 110px;gap:10px;padding:10px 0;border-bottom:1px solid var(--rule);align-items:center;}
.plat-row:last-child{border-bottom:none;}
.plat-letter{width:24px;height:24px;background:var(--ink);color:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;}

/* AD CARDS */
.ad-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
.ad-stat{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:14px;}
.ad-stat.dark{background:var(--navy);border-color:var(--navy);}
.ad-stat-lbl{font-size:9.5px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted2);margin-bottom:5px;}
.ad-stat-val{font-family:var(--serif);font-size:28px;font-weight:700;line-height:1;}
.ad-stat-sub{font-size:11.5px;color:var(--muted);margin-top:3px;}
.ad-card{display:grid;grid-template-columns:64px 1fr;border:1px solid var(--rule);border-radius:8px;overflow:hidden;margin-bottom:8px;}
.ad-card:last-child{margin-bottom:0;}
.ad-days{background:var(--navy);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 6px;text-align:center;}
.ad-days-num{font-family:var(--serif);font-size:26px;font-weight:700;color:#fff;line-height:1;}
.ad-days-lbl{font-size:8px;font-weight:600;color:#94a3b8;letter-spacing:.5px;text-transform:uppercase;line-height:1.2;margin-top:2px;}
.ad-body{background:var(--surface);padding:12px 16px;}
.ad-platform{font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted2);margin-bottom:3px;}
.ad-title{font-family:var(--serif);font-size:17px;font-weight:700;color:var(--ink);margin-bottom:4px;}
.ad-copy{font-size:13px;font-style:italic;color:var(--muted);margin-bottom:5px;line-height:1.5;}
.ad-counter{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--green);}

/* ROADMAP */
.prog-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:16px;margin-bottom:16px;}
.prog-cell{text-align:center;}
.prog-lbl{font-size:10.5px;color:var(--muted);margin-bottom:4px;}
.prog-val{font-family:var(--serif);font-size:22px;font-weight:700;line-height:1;margin-bottom:5px;}
.prog-bar-t{height:4px;background:var(--cream);border-radius:2px;}
.prog-bar-f{height:100%;border-radius:2px;}
.phase-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.phase-hdr{background:var(--navy);color:#fff;border-radius:8px 8px 0 0;padding:12px 14px;display:flex;align-items:center;gap:12px;}
.phase-num{font-family:var(--serif);font-size:24px;font-weight:700;color:#fff;line-height:1;}
.phase-range{font-size:9px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;margin-bottom:3px;}
.phase-name{font-size:12px;font-weight:600;color:#fff;}
.phase-cards{border:1px solid var(--rule);border-top:none;border-radius:0 0 8px 8px;overflow:hidden;}
.pc{padding:10px 12px;border-bottom:1px solid var(--rule);}
.pc:last-child{border-bottom:none;}
.pc1{background:var(--green-lt);}.pc2{background:var(--amber-lt);}.pc3{background:#f0f0ff;}
[data-mode="dark"] .pc3{background:#1a1a3a;}
.pc-task{font-size:13px;font-weight:600;color:var(--ink);line-height:1.3;margin-bottom:2px;}
.pc-detail{font-size:11.5px;color:var(--muted);line-height:1.4;margin-bottom:5px;}
.pc-meta{display:flex;justify-content:space-between;font-size:10.5px;font-weight:600;}

/* BENCHMARK */
.bench-table{width:100%;border-collapse:collapse;font-size:13.5px;}
.bench-table th{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:9px 12px;border-bottom:2px solid var(--rule);text-align:left;}
.bench-table td{padding:11px 12px;border-bottom:1px solid var(--rule);vertical-align:middle;}
.bench-table tr:last-child td{border-bottom:none;}
.bench-table tr:hover td{background:var(--cream);}

/* CHECKLIST (dark) */
.checklist-dark{background:var(--navy);border-radius:12px;padding:28px 28px 24px;margin-bottom:10px;}
.checklist-hl{font-family:var(--serif);font-size:36px;font-weight:700;color:#fff;line-height:1.1;margin-bottom:12px;}
.checklist-sub{font-size:13px;color:#94a3b8;line-height:1.65;margin-bottom:12px;}
.checklist-keep{font-size:13px;color:var(--amber);display:flex;align-items:center;gap:8px;}
.checklist-keep::before{content:'';display:block;width:20px;height:1.5px;background:var(--amber);}
.check-grid{display:grid;grid-template-columns:220px 1fr;gap:28px;}
.check-item{display:grid;grid-template-columns:30px 1fr 80px;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);align-items:start;}
.check-item:last-child{border-bottom:none;}
.check-num{font-family:var(--serif);font-size:15px;color:#64748b;}
.check-task{font-family:var(--serif);font-size:15.5px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:3px;}
.check-detail{font-size:12px;color:#94a3b8;line-height:1.5;}
.check-time{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--amber);text-align:right;padding-top:2px;}

/* REFUND */
.refund-box{background:var(--cream);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;display:grid;grid-template-columns:80px 1fr;gap:12px;margin-top:16px;}
.refund-lbl{font-size:12.5px;font-weight:600;color:var(--ink);}
.refund-body{font-size:12px;color:var(--muted);line-height:1.6;}

/* EXPORT ACTIONS */
.export-bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;}
.export-btn{
  display:inline-flex;align-items:center;gap:6px;
  padding:8px 16px;border-radius:7px;font-size:13px;font-weight:600;
  cursor:pointer;border:1.5px solid var(--rule);background:var(--surface);color:var(--ink);
  text-decoration:none;transition:all .15s;
}
.export-btn:hover{background:var(--cream);border-color:var(--green);color:var(--green);}
.export-btn.primary{background:var(--green);color:#fff;border-color:var(--green);}
.export-btn.primary:hover{background:#155a38;}

/* TOAST */
.toast{
  position:fixed;bottom:24px;right:24px;z-index:999;
  background:var(--ink);color:#fff;padding:10px 18px;border-radius:8px;
  font-size:13px;font-weight:500;opacity:0;pointer-events:none;
  transition:opacity .2s;
}
.toast.show{opacity:1;}

/* MOBILE NAV TOGGLE */
.mobile-nav-btn{display:none;position:fixed;bottom:20px;right:20px;z-index:200;
  width:48px;height:48px;border-radius:50%;background:var(--green);color:#fff;
  border:none;font-size:20px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);}

@media(max-width:768px){
  .sidebar{transform:translateX(-100%);}.sidebar.open{transform:translateX(0);}
  .main{margin-left:0;}
  .content{padding:20px 18px;}
  .metric-row{grid-template-columns:1fr 1fr;}
  .metric-cell:nth-child(2){border-right:none;}
  .metric-cell:nth-child(3){border-top:1px solid var(--rule);border-right:1px solid var(--rule);}
  .metric-cell:last-child{border-top:1px solid var(--rule);}
  .score-hero{grid-template-columns:1fr;}
  .ai-grid{grid-template-columns:1fr 1fr;}
  .comp-layout{grid-template-columns:1fr;}
  .phase-cols{grid-template-columns:1fr;}
  .check-grid{grid-template-columns:1fr;}
  .ad-stats{grid-template-columns:1fr 1fr;}
  .mobile-nav-btn{display:flex;align-items:center;justify-content:center;}
}

@media print{
  .sidebar,.topbar,.export-bar,.mobile-nav-btn,.toast{display:none!important;}
  .main{margin-left:0;}
  .content{padding:0;}
}
</style>
</head>
<body>

<div class="layout">

<!-- SIDEBAR -->
<nav class="sidebar" id="sidebar">
  <div class="sb-top">
    <div class="sb-brand">Know Your Presence</div>
    <div class="sb-biz">${businessName}</div>
    <div class="sb-meta">${reportDate}${loc ? ' · ' + city : ''}</div>
  </div>
  <div class="sb-score">
    <svg class="sb-score-ring" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="22" fill="none" stroke="#1e3040" stroke-width="9"/>
      <circle cx="28" cy="28" r="22" fill="none" stroke="#4ade80" stroke-width="9"
        stroke-dasharray="${(2*Math.PI*22).toFixed(1)}"
        stroke-dashoffset="${((1 - overall/100) * 2*Math.PI*22).toFixed(1)}"
        stroke-linecap="round" transform="rotate(-90 28 28)"/>
      <text x="28" y="31" text-anchor="middle" font-size="12" font-weight="700" fill="white" font-family="Inter,sans-serif">${overall}</text>
    </svg>
    <div class="sb-score-big">${overall}/100</div>
    <div class="sb-grade">Grade ${grade}</div>
  </div>
  <div class="sb-nav">
    <a class="sb-nav-item active" href="#cover" onclick="setActive(this)"><span class="sb-nav-num">00</span>Overview</a>
    <a class="sb-nav-item" href="#scores" onclick="setActive(this)"><span class="sb-nav-num">01</span>Score breakdown</a>
    <a class="sb-nav-item" href="#opportunities" onclick="setActive(this)"><span class="sb-nav-num">02</span>Opportunities</a>
    <a class="sb-nav-item" href="#ai" onclick="setActive(this)"><span class="sb-nav-num">03</span>AI visibility</a>
    <a class="sb-nav-item" href="#competitor" onclick="setActive(this)"><span class="sb-nav-num">04</span>Competitor</a>
    <a class="sb-nav-item" href="#website" onclick="setActive(this)"><span class="sb-nav-num">05</span>Website &amp; reputation</a>
    <a class="sb-nav-item" href="#ads" onclick="setActive(this)"><span class="sb-nav-num">06</span>Ad intelligence</a>
    <a class="sb-nav-item" href="#roadmap" onclick="setActive(this)"><span class="sb-nav-num">07</span>90-day roadmap</a>
    <a class="sb-nav-item" href="#benchmarks" onclick="setActive(this)"><span class="sb-nav-num">08</span>Benchmarks</a>
    <a class="sb-nav-item" href="#start" onclick="setActive(this)"><span class="sb-nav-num">09</span>Start here</a>
  </div>
  <div class="sb-bottom">
    <div class="sb-actions">
      <a href="/api/report/${reportId}" class="sb-btn sb-btn-primary" download>⬇ Download PDF</a>
      <button class="sb-btn sb-btn-outline" onclick="toggleMode()">◐ Toggle dark mode</button>
      <button class="sb-btn sb-btn-outline" onclick="window.print()">⎙ Print report</button>
    </div>
  </div>
</nav>

<!-- MAIN -->
<div class="main">
  <div class="topbar">
    <span class="topbar-title">Business Presence Report — ${businessName}</span>
    <div class="topbar-right">
      <span class="topbar-id">${reportId}</span>
      <button class="mode-btn" onclick="toggleMode()">◐ Dark mode</button>
    </div>
  </div>

  <div class="content">

    <!-- 00 COVER -->
    <section class="section" id="cover">
      <div class="sec-label">Know Your Presence / Decision-Ready Readout</div>
      <div class="h1">The shape of<br/><em>${businessName}'s</em> presence.</div>
      <p class="lead" style="max-width:600px;margin-top:10px;">A practical scan of how ${city || 'your market'} discovers, evaluates, and chooses your business — with the next move made clear.</p>
      <hr class="rule"/>
      <div class="score-hero">
        <div class="score-dark">
          <div class="lbl">Presence Score</div>
          <svg viewBox="0 0 120 120" width="110" height="110" style="display:block;margin:0 auto;">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#1e3040" stroke-width="18"/>
            <circle cx="60" cy="60" r="48" fill="none" stroke="#d4a843" stroke-width="18"
              stroke-dasharray="${(2*Math.PI*48).toFixed(1)}"
              stroke-dashoffset="${((1 - overall/100) * 2*Math.PI*48).toFixed(1)}"
              stroke-linecap="round" transform="rotate(-90 60 60)"/>
            <text x="60" y="56" text-anchor="middle" font-size="30" font-weight="700" fill="white" font-family="EB Garamond,serif">${overall}</text>
            <text x="60" y="73" text-anchor="middle" font-size="12" fill="#94a3b8" font-family="Inter,sans-serif">/ 100</text>
          </svg>
          <div class="grade">Grade ${grade}</div>
          <div class="rank">Ranked Top 35% of local<br/>businesses in the local set</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:8px;">Executive Summary</div>
          <div class="h3" style="margin-bottom:12px;">Visible enough to be considered.<br/><em style="color:var(--green);font-style:italic;">Not yet impossible to ignore.</em></div>
          <p class="body" style="margin-bottom:8px;">${businessName} has a credible base to build from. The report points to a <strong>${potential - overall}-point lift</strong> available through a few unglamorous but high-leverage fixes.</p>
          <p class="body" style="margin-bottom:8px;"><strong>Google Business</strong> is the clearest proof point at ${google}/100. <strong>Social Media</strong> is the biggest drag at ${social}/100.</p>
          <p class="body">Your upside is <strong>${potential}/100</strong> — a reachable target, not a vanity benchmark.</p>
          <div style="margin-top:14px;padding:10px 12px;background:var(--cream);border-radius:6px;font-size:13px;color:var(--muted);font-style:italic;font-family:var(--serif);">
            The read: protect what already feels trustworthy, then remove the friction around being found.
          </div>
        </div>
      </div>
      <div class="metric-row">
        <div class="metric-cell"><div class="metric-lbl">Report Value</div><div class="metric-val">$129</div><div class="metric-sub">Estimated opportunity in play</div></div>
        <div class="metric-cell"><div class="metric-lbl">Potential Score</div><div class="metric-val">${potential}/100</div><div class="metric-sub">${potential - overall} points above today</div></div>
        <div class="metric-cell"><div class="metric-lbl">Google Rating</div><div class="metric-val">${rating}/5</div><div class="metric-sub">${reviews} reviews</div></div>
        <div class="metric-cell"><div class="metric-lbl">Open Signals</div><div class="metric-val" style="color:var(--amber);">2</div><div class="metric-sub">Reviews awaiting response</div></div>
      </div>
      <div class="export-bar">
        <a href="/api/report/${reportId}" class="export-btn primary" download>⬇ Download PDF Report</a>
        <button class="export-btn" onclick="copyLink()">⎘ Copy report link</button>
        <button class="export-btn" onclick="window.print()">⎙ Print</button>
      </div>
    </section>

    <!-- 01 SCORES -->
    <section class="section" id="scores">
      <div class="sec-label">01 / Read the Signal</div>
      <div class="h2">Score breakdown</div>
      <p class="lead">Averages hide the story. These category scores show where presence compounds — and where one weak link can cost the click.</p>
      <div style="display:grid;grid-template-columns:1fr 1.1fr;gap:28px;">
        <div>
          <div class="pull" style="margin-bottom:14px;">"The constraint is not quality. It is <em>signal density</em>."</div>
          <p class="body" style="margin-bottom:10px;">Your overall score is being carried by <strong>Google Business</strong>. That is useful equity: it gives prospective guests a reason to believe you when they arrive at a search result.</p>
          <p class="body" style="margin-bottom:10px;">The next move is not to improve everything at once. Start with <strong>Social Media</strong>, then connect that improvement back to the channels already performing.</p>
          <div style="background:var(--cream);border-radius:6px;padding:10px 14px;font-size:13px;color:var(--ink);">
            <span style="color:var(--green);">›</span> <strong>Recommended sequence:</strong> fix the lowest score, then make the best score easier to see.
          </div>
        </div>
        <div>
          <div class="bar-chart">
            ${[['Google Business', google, scoreColor(google)], ['Social Media', social, scoreColor(social)], ['Website & Technical', website, scoreColor(website)], ['Reputation', reputation, scoreColor(reputation)]].map(([n,s,c]) => `
            <div class="bar-row">
              <div class="bar-top"><span class="bar-name">${n}</span><span class="bar-val" style="color:${c};">${s}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${s}%;background:${c};"></div></div>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
            <span class="pill pill-green">Strong base ≥75</span>
            <span class="pill pill-amber">Leverage point 55–74</span>
            <span class="pill pill-red">Needs attention &lt;55</span>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;">
        <div class="cat-card"><div class="cat-top"><div><div class="cat-title">Google Business <span style="font-weight:400;color:var(--muted);font-size:12.5px;">${google}/100 · 35% weight</span></div><div class="cat-meta">Rating ${rating}★ · ${reviews} reviews · 87% profile complete</div></div><span class="pill ${pillClass(catStatus(google))}">${catStatus(google)}</span></div><div class="cat-next"><b>Next:</b> Add 8 photos, service descriptions, product list, and Q&amp;A to reach ${google+7}+.</div></div>
        <div class="cat-card"><div class="cat-top"><div><div class="cat-title">Social Media <span style="font-weight:400;color:var(--muted);font-size:12.5px;">${social}/100 · 25% weight</span></div><div class="cat-meta">Instagram silent 34 days · Facebook inactive 60+ days</div></div><span class="pill ${pillClass(catStatus(social))}">${catStatus(social)}</span></div><div class="cat-next"><b>Next:</b> Post 3× on Instagram this week. Phone photos of specials count.</div></div>
        <div class="cat-card"><div class="cat-top"><div><div class="cat-title">Website &amp; Technical <span style="font-weight:400;color:var(--muted);font-size:12.5px;">${website}/100 · 20% weight</span></div><div class="cat-meta">PageSpeed ${pageSpeed} mobile · schema missing · alt text 41%</div></div><span class="pill ${pillClass(catStatus(website))}">${catStatus(website)}</span></div><div class="cat-next"><b>Next:</b> Install LocalBusiness schema to unlock richer search results.</div></div>
        <div class="cat-card"><div class="cat-top"><div><div class="cat-title">Reputation <span style="font-weight:400;color:var(--muted);font-size:12.5px;">${reputation}/100 · 20% weight</span></div><div class="cat-meta">Review platforms checked · 2 unanswered reviews</div></div><span class="pill ${pillClass(catStatusRep(reputation))}">${catStatusRep(reputation)}</span></div><div class="cat-next"><b>Next:</b> Reply to both unanswered reviews today. Takes 10 minutes.</div></div>
      </div>
    </section>

    <!-- 02 OPPORTUNITIES -->
    <section class="section" id="opportunities">
      <div class="sec-label">02 / Make It Actionable</div>
      <div class="h2">The ranked opportunity list</div>
      <p class="lead">Ordered by likely customer impact and the time window in which the fix can begin paying back.</p>
      <div>
        <div class="opp"><div class="opp-num" style="color:var(--red);">01</div><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="opp-title">Zero paid ads</div><span class="pill pill-gray">PAID ADS</span></div><div class="opp-body">Corner Roast Co. runs 6 campaigns, including a 94-day morning discount ad. You compete for the same Austin audience with zero paid visibility.</div><div class="opp-tags"><span class="pill pill-red">HIGH IMPACT</span><span class="pill pill-gray">WEEK 3</span></div></div></div>
        <div class="opp"><div class="opp-num" style="color:var(--amber);">02</div><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="opp-title">Instagram silent 34 days</div><span class="pill pill-gray">SOCIAL</span></div><div class="opp-body">Competitors post 8–11× per month. Social inactivity is the first trust signal new customers check before visiting a cafe.</div><div class="opp-tags"><span class="pill pill-red">HIGH IMPACT</span><span class="pill pill-gray">WEEK 1</span></div></div></div>
        <div class="opp"><div class="opp-num" style="color:var(--amber);">03</div><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="opp-title">No Schema markup</div><span class="pill pill-gray">SEO</span></div><div class="opp-body">LocalBusiness markup helps Google show ratings, hours, and FAQs directly in search results.</div><div class="opp-tags"><span class="pill pill-amber">MEDIUM IMPACT</span><span class="pill pill-gray">WEEK 4</span></div></div></div>
        <div class="opp"><div class="opp-num" style="color:var(--amber);">04</div><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="opp-title">2 unanswered Yelp reviews</div><span class="pill pill-gray">REPUTATION</span></div><div class="opp-body">Two recent reviews mention slow weekend service and a late pickup. Every day without a reply signals low responsiveness.</div><div class="opp-tags"><span class="pill pill-amber">MEDIUM IMPACT</span><span class="pill pill-gray">WEEK 1</span></div></div></div>
        <div class="opp" style="border-bottom:none;"><div class="opp-num" style="color:var(--muted2);">05</div><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><div class="opp-title">Security headers 2/4 set</div><span class="pill pill-gray">SECURITY</span></div><div class="opp-body">Missing HSTS and CSP headers affect trust signals and seven third-party trackers add about 0.4 seconds of load time.</div><div class="opp-tags"><span class="pill pill-gray">LOW IMPACT</span><span class="pill pill-gray">WEEK 6</span></div></div></div>
      </div>
    </section>

    <!-- 03 AI -->
    <section class="section" id="ai">
      <div class="sec-label">03 / The New Front Door</div>
      <div class="h2">AI visibility</div>
      <p class="lead">When a guest asks an assistant where to find a good cafe in ${city || 'your area'}, these signals shape whether ${businessName} enters the answer.</p>
      <div class="ai-info">
        <div class="ai-circle"><div class="ai-circle-text">AI<br/>READINESS</div></div>
        <div><p class="body" style="font-weight:600;margin-bottom:4px;">AI systems are learning the same public evidence your guests see.</p><p class="body">Consistency, specificity, and fresh proof make it easier for an answer engine to describe you accurately. This is not about chasing a new channel — it is about making your existing truth legible.</p></div>
      </div>
      <div class="ai-grid">
        <div class="ai-card partial"><div style="display:flex;justify-content:space-between;"><div class="ai-status partial">PARTIAL</div><span class="ai-signal-lbl">SIGNAL</span></div><div class="ai-name">Mentioned by AI assistants</div><div class="ai-action"><b>Action:</b> Increase review volume and recency</div></div>
        <div class="ai-card pass"><div style="display:flex;justify-content:space-between;"><div class="ai-status pass">PASS</div><span class="ai-signal-lbl">SIGNAL</span></div><div class="ai-name">Consistent NAP</div><div class="ai-action"><b>Action:</b> No action needed</div></div>
        <div class="ai-card missing"><div style="display:flex;justify-content:space-between;"><div class="ai-status missing">MISSING</div><span class="ai-signal-lbl">SIGNAL</span></div><div class="ai-name">Schema.org LocalBusiness markup</div><div class="ai-action"><b>Action:</b> Install plugin — highest AI leverage</div></div>
      </div>
      <div class="ai-grid-r2">
        <div class="ai-card missing"><div style="display:flex;justify-content:space-between;"><div class="ai-status missing">MISSING</div><span class="ai-signal-lbl">SIGNAL</span></div><div class="ai-name">Google Q&amp;A section answered</div><div class="ai-action"><b>Action:</b> Add 5 Q&amp;As — AI pulls these directly</div></div>
        <div class="ai-card pass"><div style="display:flex;justify-content:space-between;"><div class="ai-status pass">PASS</div><span class="ai-signal-lbl">SIGNAL</span></div><div class="ai-name">Review velocity (30-day)</div><div class="ai-action"><b>Action:</b> Maintain 4+ reviews/month</div></div>
      </div>
    </section>

    <!-- 04 COMPETITOR -->
    <section class="section" id="competitor">
      <div class="sec-label">04 / Relative Position</div>
      <div class="h2">Against ${compName}</div>
      <p class="lead">A competitor comparison is useful when it leads to a specific response. This one shows where the gap is behavioral, not just numerical.</p>
      <div class="comp-layout">
        <table class="comp-table">
          <thead><tr><th>Metric</th><th>${businessName}</th><th>${compName}</th><th>Gap</th><th>Read</th></tr></thead>
          <tbody>
            <tr><td>Google score</td><td style="font-weight:700;color:var(--green);">${google}</td><td style="color:var(--muted);">${compGoogle}</td><td><span class="pill ${google > compGoogle ? 'pill-green' : 'pill-red'}">${google > compGoogle ? 'You +' + (google-compGoogle) : 'Behind −' + (compGoogle-google)}</span></td><td style="font-weight:700;color:${google > compGoogle ? 'var(--green)' : 'var(--red)'};">${google > compGoogle ? 'LEAD' : 'GAP'}</td></tr>
            <tr><td>Website score</td><td style="font-weight:700;color:${scoreColor(website)};">${website}</td><td style="color:var(--muted);">${compWeb}</td><td><span class="pill ${website > compWeb ? 'pill-green' : 'pill-red'}">${website > compWeb ? 'You +' + (website-compWeb) : 'Behind −' + (compWeb-website)}</span></td><td style="font-weight:700;color:${website > compWeb ? 'var(--green)' : 'var(--red)'};">${website > compWeb ? 'LEAD' : 'GAP'}</td></tr>
            <tr><td>Review count</td><td style="font-weight:700;color:var(--amber);">${reviews}</td><td style="color:var(--muted);">318</td><td><span class="pill pill-red">Behind −${318-reviews}</span></td><td style="font-weight:700;color:var(--red);">GAP</td></tr>
            <tr><td>Google rating</td><td style="font-weight:700;color:var(--green);">${rating}★</td><td style="color:var(--muted);">4.2★</td><td><span class="pill pill-green">You +${(rating - 4.2).toFixed(1)}</span></td><td style="font-weight:700;color:var(--green);">LEAD</td></tr>
            <tr><td>Active paid ads</td><td style="font-weight:700;color:var(--red);">0</td><td style="color:var(--muted);">${adsCount || 6}</td><td><span class="pill pill-red">Behind −${adsCount || 6}</span></td><td style="font-weight:700;color:var(--red);">GAP</td></tr>
            <tr><td>Instagram / 30d</td><td style="font-weight:700;color:var(--red);">0</td><td style="color:var(--muted);">11</td><td><span class="pill pill-red">Behind −11</span></td><td style="font-weight:700;color:var(--red);">GAP</td></tr>
          </tbody>
        </table>
        <div class="gap-box">
          <div class="gap-lbl">The Useful Gap</div>
          <div class="gap-val">Google score</div>
          <div class="gap-sub">You ${google > compGoogle ? '+' + (google-compGoogle) : '−' + (compGoogle-google)}</div>
          <div class="gap-body">${compName} is not a template to copy. They are a live signal of what the local market has learned to reward.</div>
        </div>
      </div>
    </section>

    <!-- 05 WEBSITE & REPUTATION -->
    <section class="section" id="website">
      <div class="sec-label">05 / Trust at the Click</div>
      <div class="h2">Website &amp; reputation findings</div>
      <p class="lead">The handoff from search result to confident visit happens here. Every detail either keeps momentum or quietly leaks it.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Website Checks</div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">SSL / HTTPS</span><span class="pill ${isHttps ? 'pill-green' : 'pill-red'}">${isHttps ? 'PASS' : 'FAIL'}</span><span class="check-impact">CRITICAL<br/><span style="font-weight:400;">Certificate valid 60+ days.</span></span></div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">Mobile-friendly</span><span class="pill ${hasMobile ? 'pill-green' : 'pill-red'}">${hasMobile ? 'PASS' : 'FAIL'}</span><span class="check-impact">HIGH<br/><span style="font-weight:400;">Google mobile usability.</span></span></div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">Mobile PageSpeed</span><span class="pill ${pageSpeed >= 70 ? 'pill-green' : pageSpeed >= 50 ? 'pill-amber' : 'pill-red'}">${pageSpeed}/100</span><span class="check-impact">HIGH<br/><span style="font-weight:400;">${pageSpeed < 60 ? '~38% visitors leave before load.' : 'Good speed score.'}</span></span></div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">Security headers</span><span class="pill pill-amber">2/4 SET</span><span class="check-impact">MEDIUM<br/><span style="font-weight:400;">Add HSTS and CSP via Cloudflare.</span></span></div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">Schema.org markup</span><span class="pill pill-red">MISSING</span><span class="check-impact">HIGH<br/><span style="font-weight:400;">No star ratings in search.</span></span></div>
          <div class="check-row"><span style="font-size:13.5px;font-weight:500;">Image alt text</span><span class="pill pill-amber">41%</span><span class="check-impact">LOW<br/><span style="font-weight:400;">14 of 34 images covered.</span></span></div>
          <div class="check-row" style="border-bottom:none;"><span style="font-size:13.5px;font-weight:500;">Broken links</span><span class="pill pill-green">NONE</span><span class="check-impact">LOW<br/><span style="font-weight:400;">No 404s found.</span></span></div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Review Platforms</div>
          <div class="plat-row"><div class="plat-letter">G</div><div><div style="font-size:13.5px;font-weight:600;">Google Business <span style="color:var(--green);">${rating}★</span></div><div style="font-size:12px;color:var(--muted);">${reviews} reviews · Profile claimed · Last: 8 days ago</div></div><span class="pill pill-green">GOOD</span></div>
          <div class="plat-row"><div class="plat-letter">Y</div><div><div style="font-size:13.5px;font-weight:600;">Yelp <span style="color:var(--amber);">4.1★</span></div><div style="font-size:12px;color:var(--muted);">87 reviews · Profile claimed · Last: 32 days ago</div></div><span class="pill pill-amber">NEEDS ATTENTION</span></div>
          <div class="plat-row"><div class="plat-letter">F</div><div><div style="font-size:13.5px;font-weight:600;">Facebook <span style="color:var(--green);">4.3★</span></div><div style="font-size:12px;color:var(--muted);">42 reviews · Profile claimed · Last: 61 days ago</div></div><span class="pill pill-red">INACTIVE</span></div>
          <div class="plat-row" style="border-bottom:none;"><div class="plat-letter">T</div><div><div style="font-size:13.5px;font-weight:600;">TripAdvisor <span style="color:var(--amber);">4.0★</span></div><div style="font-size:12px;color:var(--muted);">18 reviews · Claim still open</div></div><span class="pill pill-red">UNCLAIMED</span></div>
        </div>
      </div>
    </section>

    <!-- 06 ADS -->
    <section class="section" id="ads">
      <div class="sec-label">06 / Paid Signal</div>
      <div class="h2">Ad intelligence</div>
      <p class="lead">Competitor ad activity reveals which promises are being repeated in the market — and where ${businessName} can be more specific.</p>
      <div class="ad-stats">
        <div class="ad-stat"><div class="ad-stat-lbl">Active Ads Observed</div><div class="ad-stat-val" style="color:var(--red);">0</div><div class="ad-stat-sub">${businessName}</div></div>
        <div class="ad-stat"><div class="ad-stat-lbl">${compName} Active Ads</div><div class="ad-stat-val" style="color:var(--green);">${adsCount || 6}</div><div class="ad-stat-sub">${longestAd || 94} day longest run</div></div>
        <div class="ad-stat"><div class="ad-stat-lbl">Est. Monthly Spend</div><div class="ad-stat-val" style="font-size:20px;">${estSpend}</div><div class="ad-stat-sub">Competitor signal, not a bill</div></div>
        <div class="ad-stat dark"><div class="ad-stat-lbl" style="color:#64748b;">What to Notice</div><div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-top:4px;">Longevity is a clue. If a message stays live, it is likely doing enough work to earn its place.</div></div>
      </div>
      ${(ads.length ? ads : [
        {platform:'Facebook + Instagram', daysRunning:94, headline:'Start your morning right', copy:'"Show up before 9am and your first drink is 20% off."', shade:'#0f1923'},
        {platform:'Instagram Stories', daysRunning:61, headline:'Free pastry with every cold brew', copy:'"This week only — order any cold brew and the pastry is on us."', shade:'#1e2d3d'},
        {platform:'Facebook', daysRunning:44, headline:'Meet your morning crew', copy:'"Fresh roast, familiar faces, your order ready before you finish parking."', shade:'#2d3748'},
      ]).map(ad => `
      <div class="ad-card">
        <div class="ad-days" style="background:${ad.shade||'var(--navy)'};">
          <div class="ad-days-num">${ad.daysRunning||'—'}</div>
          <div class="ad-days-lbl">DAYS<br/>LIVE</div>
        </div>
        <div class="ad-body">
          <div class="ad-platform">${ad.platform||''}</div>
          <div class="ad-title">${ad.headline||ad.title||''}</div>
          <div class="ad-copy">${ad.copy||ad.body||''}</div>
          <div class="ad-counter">Counter with proof, not volume.</div>
        </div>
      </div>`).join('')}
    </section>

    <!-- 07 ROADMAP -->
    <section class="section" id="roadmap">
      <div class="sec-label">07 / Turn Insight Into Motion</div>
      <div class="h2">A 90-day roadmap</div>
      <p class="lead">The sequence is intentionally narrow: make the foundation trustworthy, then make the signal easier to discover, then measure the lift.</p>
      <div class="prog-row">
        <div class="prog-cell"><div class="prog-lbl">Current</div><div class="prog-val" style="color:var(--muted);">${overall}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${overall}%;background:var(--muted2);"></div></div></div>
        <div class="prog-cell"><div class="prog-lbl">After Phase 1</div><div class="prog-val" style="color:var(--green);">${overall+5}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${overall+5}%;background:var(--green);"></div></div></div>
        <div class="prog-cell"><div class="prog-lbl">After Phase 2</div><div class="prog-val" style="color:var(--green);">${overall+12}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${overall+12}%;background:var(--green);"></div></div></div>
        <div class="prog-cell"><div class="prog-lbl">After Phase 3</div><div class="prog-val" style="color:var(--green);">${potential}</div><div class="prog-bar-t"><div class="prog-bar-f" style="width:${potential}%;background:var(--green);"></div></div></div>
      </div>
      <div class="phase-cols">
        <div><div class="phase-hdr"><div class="phase-num">01</div><div><div class="phase-range">Days 1–14</div><div class="phase-name">Quick Wins</div></div></div><div class="phase-cards"><div class="pc pc1"><div class="pc-task">Reply to 2 unanswered Yelp reviews</div><div class="pc-detail">Both still in recent window. Use the reply templates.</div><div class="pc-meta"><span style="color:var(--green);">10 min</span><span style="color:var(--green);">+1 pt</span></div></div><div class="pc pc1"><div class="pc-task">Add 8 photos to Google Business</div><div class="pc-detail">Interior, food, team, specials. Phone photos fine.</div><div class="pc-meta"><span style="color:var(--green);">20 min</span><span style="color:var(--green);">+2 pts</span></div></div><div class="pc pc1"><div class="pc-task">Post 3× on Instagram this week</div><div class="pc-detail">Break the 34-day silence with daily specials.</div><div class="pc-meta"><span style="color:var(--green);">30 min</span><span style="color:var(--green);">+1 pt</span></div></div><div class="pc pc1"><div class="pc-task">Answer 5 Google Q&amp;As</div><div class="pc-detail">Parking, Wi-Fi, vegan options, events, gift cards.</div><div class="pc-meta"><span style="color:var(--green);">20 min</span><span style="color:var(--green);">+1 pt</span></div></div></div></div>
        <div><div class="phase-hdr"><div class="phase-num">02</div><div><div class="phase-range">Days 15–42</div><div class="phase-name">Build Momentum</div></div></div><div class="phase-cards"><div class="pc pc2"><div class="pc-task">Install Schema.org markup</div><div class="pc-detail">RankMath or Yoast — star ratings in search.</div><div class="pc-meta"><span style="color:var(--amber);">1 hr</span><span style="color:var(--green);">+3 pts</span></div></div><div class="pc pc2"><div class="pc-task">Add HSTS + CSP security headers</div><div class="pc-detail">Configure in Cloudflare. No code needed.</div><div class="pc-meta"><span style="color:var(--amber);">1 hr</span><span style="color:var(--green);">+1 pt</span></div></div><div class="pc pc2"><div class="pc-task">Launch first paid ad</div><div class="pc-detail">"$1 off before 9am" · $5/day · 7-day test.</div><div class="pc-meta"><span style="color:var(--amber);">2 hrs</span><span style="color:var(--green);">+2 pts</span></div></div><div class="pc pc2"><div class="pc-task">Set up review request sequence</div><div class="pc-detail">3-touch SMS or WhatsApp after each visit.</div><div class="pc-meta"><span style="color:var(--amber);">2 hrs</span><span style="color:var(--green);">+1 pt</span></div></div></div></div>
        <div><div class="phase-hdr"><div class="phase-num">03</div><div><div class="phase-range">Days 43–90</div><div class="phase-name">Compound Growth</div></div></div><div class="phase-cards"><div class="pc pc3"><div class="pc-task">Optimize mobile PageSpeed to 70+</div><div class="pc-detail">Compress images, remove unused plugins.</div><div class="pc-meta"><span style="color:#6366f1;">3 hrs</span><span style="color:var(--green);">+2 pts</span></div></div><div class="pc pc3"><div class="pc-task">Scale Facebook ad if CAC &lt; $8</div><div class="pc-detail">Increase to $15–20/day. Add Instagram Stories.</div><div class="pc-meta"><span style="color:#6366f1;">Ongoing</span><span style="color:var(--green);">+1 pt</span></div></div><div class="pc pc3"><div class="pc-task">Launch weekly Instagram Reels</div><div class="pc-detail">30-second behind-the-scenes clips.</div><div class="pc-meta"><span style="color:#6366f1;">Weekly</span><span style="color:var(--green);">+1 pt</span></div></div><div class="pc pc3"><div class="pc-task">Re-scan on KYP</div><div class="pc-detail">Measure progress against the ${potential}/100 target.</div><div class="pc-meta"><span style="color:#6366f1;">5 min</span><span style="color:var(--green);">Validate</span></div></div></div></div>
      </div>
    </section>

    <!-- 08 BENCHMARKS -->
    <section class="section" id="benchmarks">
      <div class="sec-label">08 / Context, Not Comparison Theatre</div>
      <div class="h2">Benchmark context</div>
      <p class="lead">Median tells you where the market sits. Top quartile shows what a more disciplined presence makes possible.</p>
      <table class="bench-table">
        <thead><tr><th>Metric</th><th>You</th><th>Median</th><th>Top quartile</th><th>Status</th><th>Insight</th></tr></thead>
        <tbody>
          <tr><td>Google rating</td><td style="font-weight:700;color:var(--green);">${rating}★</td><td style="color:var(--muted);">4.1★</td><td style="color:var(--muted);">4.4+</td><td><span class="pill pill-green">LEAD</span></td><td style="font-size:12.5px;color:var(--muted);">Top quartile. Protect and grow review count.</td></tr>
          <tr><td>Reviews / month</td><td style="font-weight:700;color:var(--amber);">4.2</td><td style="color:var(--muted);">3–5</td><td style="color:var(--muted);">8+</td><td><span class="pill pill-amber">ON TRACK</span></td><td style="font-size:12.5px;color:var(--muted);">Aim for 6+ to enter top quartile.</td></tr>
          <tr><td>Instagram posts / month</td><td style="font-weight:700;color:var(--red);">0</td><td style="color:var(--muted);">8–12</td><td style="color:var(--muted);">18+</td><td><span class="pill pill-red">BEHIND</span></td><td style="font-size:12.5px;color:var(--muted);">Silent social can make visitors assume closed.</td></tr>
          <tr><td>Review reply time</td><td style="font-weight:700;color:var(--red);">32 days</td><td style="color:var(--muted);">2–4 days</td><td style="color:var(--muted);">&lt; 24 hrs</td><td><span class="pill pill-red">BEHIND</span></td><td style="font-size:12.5px;color:var(--muted);">Top performers reply within same day.</td></tr>
          <tr><td>Mobile PageSpeed</td><td style="font-weight:700;color:var(--amber);">${pageSpeed}</td><td style="color:var(--muted);">55–70</td><td style="color:var(--muted);">80+</td><td><span class="pill pill-amber">BELOW MED</span></td><td style="font-size:12.5px;color:var(--muted);">Aim for 70+ this quarter.</td></tr>
          <tr><td>Paid ads running</td><td style="font-weight:700;color:var(--red);">0</td><td style="color:var(--muted);">1–2</td><td style="color:var(--muted);">4+</td><td><span class="pill pill-red">BEHIND</span></td><td style="font-size:12.5px;color:var(--muted);">Competitor has a ${longestAd||94}-day proven ad.</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 09 START HERE -->
    <section class="section" id="start">
      <div class="sec-label">09 / Start Here</div>
      <div class="checklist-dark">
        <div class="check-grid">
          <div>
            <div class="checklist-hl">The first<br/>seven<br/>days.</div>
            <p class="checklist-sub">Momentum is a design decision. These quick wins are deliberately small enough to complete, visible enough to matter, and ordered so each one makes the next easier.</p>
            <div class="checklist-keep">Keep the promise specific.</div>
          </div>
          <div>
            ${[
              ['01','Reply to both unanswered Yelp reviews today','Visible to every Yelp visitor immediately after posting.','10 MINUTES'],
              ['02','Add 8 new photos to Google Business Profile','Interior, food, team, and daily specials all count.','20 MINUTES'],
              ['03','Post on Instagram 3 times this week','Use phone snaps and the content calendar.','30 MINUTES'],
              ['04','Answer 5 Q&amp;As on your Google Business Profile','Cover parking, Wi-Fi, vegan options, events, and gift cards.','20 MINUTES'],
              ['05','Install a Schema.org markup plugin','Star ratings can appear in Google within 24–48 hours.','1 HOUR'],
              ['06','Send a review request to your last 20 customers','Target 4+ new Google reviews per month.','2 HOURS'],
              ['07','Set up your first Facebook + Instagram paid ad','Test "$1 off before 9am" at $5/day for 7 days.','2 HOURS'],
            ].map(([n,t,d,tm]) => `
            <div class="check-item">
              <div class="check-num">${n}</div>
              <div><div class="check-task">${t}</div><div class="check-detail">${d}</div></div>
              <div class="check-time">${tm}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="refund-box">
        <div class="refund-lbl">Refund Policy</div>
        <div class="refund-body">Refunds are issued only for technical failures — where a technical issue prevented your report from being generated or delivered. Successfully generated and delivered reports are non-refundable. Email support@knowyourpresence.com within 48 hours with your order ID.</div>
      </div>
      <div class="export-bar">
        <a href="/api/report/${reportId}" class="export-btn primary" download>⬇ Download PDF</a>
        <button class="export-btn" onclick="copyLink()">⎘ Copy link</button>
        <button class="export-btn" onclick="window.print()">⎙ Print</button>
      </div>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--rule);text-align:center;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--ink);margin-bottom:4px;">Know Your Presence Report</div>
        <div style="font-size:12px;color:var(--muted);">Decision-ready visibility for independent local businesses.</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${businessName}${loc ? ' · ' + city : ''} · ${reportDate} · ${reportId}</div>
      </div>
    </section>

  </div>
</div>
</div>

<button class="mobile-nav-btn" onclick="toggleSidebar()">☰</button>
<div class="toast" id="toast"></div>

<script>
function setActive(el){document.querySelectorAll('.sb-nav-item').forEach(i=>i.classList.remove('active'));el.classList.add('active');}
function toggleMode(){const h=document.documentElement;h.dataset.mode=h.dataset.mode==='dark'?'light':'dark';}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');}
function copyLink(){navigator.clipboard.writeText(window.location.href).then(()=>showToast('Report link copied!'));}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
// Auto dark mode
if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.dataset.mode='dark';}
// Active section tracking
const sections=document.querySelectorAll('section[id]');
const observer=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting){const a=document.querySelector('.sb-nav-item[href="#'+e.target.id+'"]');if(a){document.querySelectorAll('.sb-nav-item').forEach(i=>i.classList.remove('active'));a.classList.add('active');}}});
},{threshold:.3});
sections.forEach(s=>observer.observe(s));
</script>
</body>
</html>`;
}

module.exports = { generateWebReport };
