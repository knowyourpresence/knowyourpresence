// services/toolkitDocx.js
// Generates 10 styled DOCX toolkit files for each KYP report.
// Uses the 'docx' npm package (v8) for rich Word-compatible output.

const fs   = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, ShadingType,
  WidthType, TableLayoutType, PageOrientation,
  convertInchesToTwip, convertMillimetersToTwip,
  CheckBox, LevelFormat, NumberFormat,
} = require("docx");

// ── Brand colours (hex without #) ─────────────────────────────────────────────
const NAVY   = "0F1E3C";
const BLUE   = "3B6EF8";
const GREEN  = "16A34A";
const AMBER  = "D97706";
const WHITE  = "FFFFFF";
const LIGHT  = "F1F5F9";
const RULE   = "E2E8F0";
const GRAY   = "64748B";
const DARK   = "1E293B";

// ── Helpers ────────────────────────────────────────────────────────────────────
function darkHeader(text, sub = "") {
  const rows = [
    new TableRow({
      children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: NAVY, fill: NAVY },
        margins: { top: 280, bottom: 160, left: 320, right: 320 },
        children: [
          new Paragraph({
            children: [new TextRun({ text, font: "Calibri", size: 40, bold: true, color: WHITE })],
          }),
          ...(sub ? [new Paragraph({
            children: [new TextRun({ text: sub, font: "Calibri", size: 20, color: "94A3B8" })],
            spacing: { before: 60 },
          })] : []),
        ],
      })],
    }),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows,
    margins: { bottom: 240 },
  });
}

function sectionHeader(text, color = BLUE) {
  return new Paragraph({
    children: [new TextRun({ text: `  ${text}  `, font: "Calibri", size: 24, bold: true, color: WHITE })],
    shading: { type: ShadingType.SOLID, color, fill: color },
    spacing: { before: 320, after: 120 },
    indent: { left: 0 },
  });
}

function body(text, { bold = false, color = DARK, size = 22, before = 80, after = 80 } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Calibri", size, bold, color })],
    spacing: { before, after },
  });
}

function bullet(text, { color = BLUE, indent = 360 } = {}) {
  return new Paragraph({
    children: [
      new TextRun({ text: "▸  ", font: "Calibri", size: 22, bold: true, color }),
      new TextRun({ text, font: "Calibri", size: 22, color: DARK }),
    ],
    spacing: { before: 60, after: 60 },
    indent: { left: indent },
  });
}

function checkItem(text, { done = false } = {}) {
  return new Paragraph({
    children: [
      new TextRun({ text: done ? "☑  " : "☐  ", font: "Calibri", size: 22, color: done ? GREEN : GRAY }),
      new TextRun({ text, font: "Calibri", size: 22, color: DARK }),
    ],
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { color: RULE, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 160, after: 160 },
    children: [],
  });
}

function scoreChip(label, score, color = BLUE) {
  return new Table({
    width: { size: 30, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color, fill: color },
        margins: { top: 80, bottom: 80, left: 180, right: 180 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${score}/100`, font: "Calibri", size: 28, bold: true, color: WHITE }),
            new TextRun({ text: `  ${label}`, font: "Calibri", size: 18, color: "C7D2FE" }),
          ],
        })],
      }),
    ]})],
    margins: { bottom: 200 },
  });
}

function twoColRow(left, right, headerRow = false) {
  const shade = headerRow ? { type: ShadingType.SOLID, color: NAVY, fill: NAVY } : {};
  const tc = (txt, w) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    shading: headerRow ? shade : {},
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    borders: {
      top: { style: BorderStyle.SINGLE, color: RULE, size: 4 },
      bottom: { style: BorderStyle.SINGLE, color: RULE, size: 4 },
      left: { style: BorderStyle.SINGLE, color: RULE, size: 4 },
      right: { style: BorderStyle.SINGLE, color: RULE, size: 4 },
    },
    children: [new Paragraph({
      children: [new TextRun({ text: txt, font: "Calibri", size: headerRow ? 20 : 20,
        bold: headerRow, color: headerRow ? WHITE : DARK })],
    })],
  });
  return new TableRow({ children: [tc(left, 40), tc(right, 60)] });
}

function infoBox(text, color = LIGHT, textColor = DARK) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color, fill: color },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: {
        left: { style: BorderStyle.THICK, color: BLUE, size: 24 },
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      },
      children: [new Paragraph({ children: [new TextRun({ text, font: "Calibri", size: 21, color: textColor, italics: true })] })],
    })]})],
    margins: { top: 120, bottom: 200 },
  });
}

function footer(business) {
  return [
    divider(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Know Your Presence", font: "Calibri", size: 18, bold: true, color: BLUE }),
        new TextRun({ text: "  ·  support@knowyourpresence.com  ·  knowyourpresence.com", font: "Calibri", size: 18, color: GRAY }),
      ],
      spacing: { before: 80 },
    }),
  ];
}

async function makeDoc(children) {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: DARK },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });
}

// ── FILE 1: Action Checklist ───────────────────────────────────────────────────
async function docChecklist(d) {
  const sc = d.sc;
  const children = [
    darkHeader("Action Checklist", `${d.name}  ·  ${d.city}  ·  ${d.date}`),
    scoreChip("Presence Score", sc.overall, sc.overall >= 70 ? GREEN : sc.overall >= 45 ? AMBER : "DC2626"),
    infoBox("Momentum is a design decision. These quick wins are small enough to complete, visible enough to matter, and ordered so each one makes the next easier."),
    sectionHeader("⚡  FIRST 7 DAYS", BLUE),
    checkItem("Respond to ALL unanswered Google & Yelp reviews (target 100%)"),
    checkItem("Post 3 short-form social videos — behind-the-scenes content"),
    checkItem("Update Google Business Profile: hours, photos, description"),
    checkItem("Fix website mobile page speed (target under 2.5 seconds)"),
    checkItem("Set up 2 Google Posts per week schedule"),
    checkItem("Publish your first local SEO blog post"),
    checkItem("Add FAQ schema markup to your homepage"),
    sectionHeader("📅  MONTH 1–3", AMBER),
    checkItem("Claim and complete all review platform profiles"),
    checkItem("Increase social posting to 5× per week"),
    checkItem("Launch a UGC tag campaign ('Tag us to be featured')"),
    checkItem("Test your first paid ad ($5/day for 7 days)"),
    checkItem("Re-scan on Know Your Presence and compare scores"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 2: Review Response Templates ─────────────────────────────────────────
async function docReviewTemplates(d) {
  const children = [
    darkHeader("Review Response Templates", d.name),
    infoBox("Responding to every review — positive and negative — boosts your Google ranking and builds customer trust. Aim to reply within 24 hours."),
    sectionHeader("⭐  POSITIVE REVIEW TEMPLATE", GREEN),
    body("Use when a customer leaves 4–5 stars:", { color: GRAY, size: 20 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: "F0FDF4", fill: "F0FDF4" },
        margins: { top: 200, bottom: 200, left: 280, right: 280 },
        borders: { left: { style: BorderStyle.THICK, color: GREEN, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [
          body(`"Thank you so much for the kind words! We're thrilled you had a great experience at ${d.name}.`),
          body(`We look forward to welcoming you back soon. — The ${d.name} Team"`),
        ],
      })]})],
      margins: { bottom: 240 },
    }),
    sectionHeader("😤  CRITICAL REVIEW TEMPLATE", "DC2626"),
    body("Use when a customer leaves 1–2 stars:", { color: GRAY, size: 20 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFF7F7", fill: "FFF7F7" },
        margins: { top: 200, bottom: 200, left: 280, right: 280 },
        borders: { left: { style: BorderStyle.THICK, color: "DC2626", size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [
          body(`"Thank you for taking the time to share your feedback. We're sorry to hear your experience didn't meet expectations.`),
          body(`We'd love the chance to make it right — please reach out to us directly at [your email]. — The ${d.name} Team"`),
        ],
      })]})],
      margins: { bottom: 240 },
    }),
    sectionHeader("💬  NEUTRAL REVIEW TEMPLATE", AMBER),
    body("Use when a customer leaves 3 stars:", { color: GRAY, size: 20 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: "FFFBEB", fill: "FFFBEB" },
        margins: { top: 200, bottom: 200, left: 280, right: 280 },
        borders: { left: { style: BorderStyle.THICK, color: AMBER, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        children: [
          body(`"Thank you for your feedback! We're always looking to improve and your comments help us do that.`),
          body(`Hope to see you again soon. — The ${d.name} Team"`),
        ],
      })]})],
      margins: { bottom: 240 },
    }),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 3: 30-Day Social Media Calendar ──────────────────────────────────────
async function docSocialCalendar(d) {
  const weeks = [
    { title: "WEEK 1 — INTRODUCE YOURSELF", color: BLUE, posts: [
      ["Mon – Day 1",  "Behind-the-Scenes", `"Ever wondered what goes on behind the scenes at ${d.name}? Here's your look 👀 #LocalBusiness #BehindTheScenes"`],
      ["Tue – Day 2",  "Team Spotlight",    `"Meet the team that makes it all happen! [Tag a team member] #OurTeam #SmallBusiness"`],
      ["Wed – Day 3",  "Customer Story",    `"One of our favourite moments this week was... [share a positive customer moment] #CustomerLove"`],
      ["Thu – Day 4",  "Service Highlight", `"Did you know we offer [highlight one service]? Here's why our customers love it. #LocalFave"`],
      ["Fri – Day 5",  "Weekend CTA",       `"Weekend plans? Come visit us at [address] — we'd love to see you! #Weekend"`],
    ]},
    { title: "WEEK 2 — BUILD TRUST", color: GREEN, posts: [
      ["Mon – Day 8",  "Educational Tip",   `"Pro tip for [your industry]: [share a useful tip] #Tips #Expert"`],
      ["Tue – Day 9",  "Before & After",    `"The transformation you didn't know you needed. [share a result or process] #Results"`],
      ["Wed – Day 10", "Review Ask",        `"Loving what we do? Leave us a Google review — it takes 30 seconds and means the world 🙏"`],
      ["Thu – Day 11", "FAQ",               `"We get asked this ALL the time: [answer a common question] #FAQ #${d.name}"`],
      ["Fri – Day 12", "Fun Fact",          `"Here's something most people don't know about us... [share an interesting fact] #FunFact"`],
    ]},
    { title: "WEEK 3 — ENGAGEMENT PUSH", color: AMBER, posts: [
      ["Mon – Day 15", "Poll / Question",   `"Quick poll for our community: [ask a relevant question] Comment below! #Community"`],
      ["Tue – Day 16", "UGC Re-share",      `"LOVE when our customers tag us! [re-share customer photo/story] Tag us @${d.name.replace(/\s+/g,"")}"`],
      ["Wed – Day 17", "Milestone",         `"We hit [milestone]! None of this would be possible without YOU. Thank you! #Grateful"`],
      ["Thu – Day 18", "How-To",            `"Step-by-step: How to get the most out of [product/service] 👇 #HowTo"`],
      ["Fri – Day 19", "Weekend Special",   `"This weekend only: [offer or highlight]. Tag a friend who needs this! #Weekend"`],
    ]},
    { title: "WEEK 4 — AUTHORITY & CLOSE", color: NAVY, posts: [
      ["Mon – Day 22", "Case Study",        `"Here's how we helped [customer type] achieve [result]. [Tell the story] #Success"`],
      ["Tue – Day 23", "Industry News",     `"Big news in [industry]: [share relevant update + your take] #IndustryInsights"`],
      ["Wed – Day 24", "Review Highlight",  `"⭐⭐⭐⭐⭐ '[paste a real 5-star review]' — Thank you [reviewer name]! #CustomerLove"`],
      ["Thu – Day 25", "Origin Story",      `"Why we started ${d.name}: [share your story] #WhyWeDo #LocalBusiness"`],
      ["Fri – Day 26", "Month Recap",       `"What a month! Here's what we've been up to + what's coming next. Follow us to stay in the loop 🔔"`],
    ]},
  ];

  const rows = weeks.flatMap(w => [
    new TableRow({
      children: [new TableCell({
        columnSpan: 3,
        shading: { type: ShadingType.SOLID, color: w.color, fill: w.color },
        margins: { top: 100, bottom: 100, left: 180, right: 180 },
        children: [new Paragraph({ children: [new TextRun({ text: w.title, font: "Calibri", size: 22, bold: true, color: WHITE })] })],
      })],
    }),
    twoColRow("DAY / PLATFORM", "CAPTION TEMPLATE", true),
    ...w.posts.map(([day, type, caption]) => new TableRow({ children: [
      new TableCell({
        width: { size: 20, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        borders: { top: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, bottom: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, left: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, right: { style: BorderStyle.SINGLE, color: RULE, size: 4 } },
        children: [
          new Paragraph({ children: [new TextRun({ text: day, font: "Calibri", size: 18, bold: true, color: DARK })] }),
          new Paragraph({ children: [new TextRun({ text: type, font: "Calibri", size: 18, color: w.color, italics: true })] }),
        ],
      }),
      new TableCell({
        width: { size: 80, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        borders: { top: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, bottom: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, left: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, right: { style: BorderStyle.SINGLE, color: RULE, size: 4 } },
        children: [new Paragraph({ children: [new TextRun({ text: caption, font: "Calibri", size: 19, color: DARK })] })],
      }),
    ]})),
  ]);

  const children = [
    darkHeader("30-Day Social Media Calendar", `${d.name}  ·  Social Score: ${d.sc.social}/100`),
    infoBox("Post consistently for 30 days and watch your engagement grow. Customise each caption with your own photos, stories and personality."),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows, margins: { bottom: 240 } }),
    sectionHeader("📌  POSTING TIPS", NAVY),
    bullet("Best times: Tue–Thu 9–11am and 6–8pm local time"),
    bullet("Use 5–10 hashtags on Instagram, 2–3 on Facebook/LinkedIn"),
    bullet("Reply to ALL comments within 2 hours to boost reach"),
    bullet("Re-scan Know Your Presence after 30 days to track improvement"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 4: Google Business Profile Guide ─────────────────────────────────────
async function docGBPGuide(d) {
  const sections = [
    { title: "BASIC INFORMATION — Do this today", color: BLUE, items: [
      "Business name matches exactly what's on your signage and website",
      "Primary category is the most specific match for your business",
      "Add 2–3 secondary categories",
      "Phone number is correct and matches your website",
      "Website URL is correct and goes to a working page",
      "Address / service area is accurate and up to date",
      "Business hours are correct (including holidays)",
      "Business description: 750 characters, keyword-rich, no promotional language",
    ]},
    { title: "PHOTOS — Aim for 20+ photos", color: GREEN, items: [
      "Cover photo — high quality, represents your brand",
      "Profile photo — your logo, clearly visible at small size",
      "Interior photos (minimum 5) — clean and well-lit",
      "Exterior photos (minimum 3) — street view, signage visible",
      "Team photos — builds trust with new customers",
      "Product / service photos — minimum 5",
      "Add new photos every 2–4 weeks to signal activity to Google",
    ]},
    { title: "POSTS — 2× per week minimum", color: AMBER, items: [
      '"What\'s New" post — updates and announcements',
      '"Offer" post — promotions with clear expiry dates',
      '"Event" post — if you run events or workshops',
      "Include a clear call-to-action button on every post",
      "Use local keywords naturally in post text",
    ]},
    { title: "REVIEWS — Critical for ranking", color: "DC2626", items: [
      "Respond to 100% of reviews — positive AND negative",
      "Respond within 24 hours of each review",
      "Use the customer's name in your response",
      "Thank positive reviewers specifically for what they mentioned",
      "For negative reviews: acknowledge, apologise, offer to resolve offline",
      "Send review request link to happy customers via SMS or email",
      "Never offer incentives for reviews — violates Google policy",
    ]},
    { title: "ADVANCED", color: NAVY, items: [
      "Add products/services with descriptions and prices",
      "Set up messaging if you can respond within 1 hour",
      "Add booking link if applicable",
      'Check "Suggest an edit" to see if Google has wrong info',
      "Verify all information matches your website exactly (NAP consistency)",
      "Add your own FAQs to the Q&A section proactively",
    ]},
  ];

  const children = [
    darkHeader("Google Business Profile Guide", `${d.name}  ·  Google Score: ${d.sc.google}/100`),
    infoBox("Your Google Business Profile is the single most impactful free tool for local visibility. Work through each section in order — foundation first, advanced last."),
    ...sections.flatMap(s => [
      sectionHeader(`▸  ${s.title}`, s.color),
      ...s.items.map(i => checkItem(i)),
    ]),
    sectionHeader("📊  TRACK YOUR PROGRESS", NAVY),
    body("Go to: business.google.com → Your profile → See your performance"),
    bullet("Search views — how often you appear in Google Search"),
    bullet("Map views — how often you appear in Google Maps"),
    bullet("Website clicks — how many people visit your site from GBP"),
    bullet("Direction requests — how many people want to visit you"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 5: 90-Day Growth Roadmap ─────────────────────────────────────────────
async function docRoadmap(d) {
  const sc = d.sc;
  const target = Math.min(sc.overall + 25, 95);
  const phases = [
    { title: "PHASE 1 — FOUNDATION", sub: "Days 1–30  ·  Fix the basics. Stop bleeding visibility.", color: BLUE, weeks: [
      { w: "Week 1", items: ["Respond to ALL unanswered Google & Yelp reviews", "Update Google Business Profile (hours, photos, description)", "Fix any broken links on your website", "Claim any unclaimed directory listings (Yelp, TripAdvisor, etc.)", "Post 3× on social media using your 30-Day Calendar"] },
      { w: "Week 2", items: ["Add 10 new photos to Google Business Profile", "Fix website mobile speed (use pagespeed.web.dev)", "Write and publish your first local SEO blog post", "Set up 2× Google Posts per week schedule", "Begin asking happy customers for Google reviews"] },
      { w: "Week 3", items: ["Add FAQ schema to your website homepage", "Check NAP consistency across all directories", "Start responding to every social media comment within 2 hours", "Submit your business to 5 new local directories"] },
      { w: "Week 4", items: ["Run first Google Posts offer", "Set up a review-request SMS or email template", "Audit all social profile bios — make them keyword-rich", "Review your top 3 local competitors and note what they do better"] },
    ]},
    { title: "PHASE 2 — MOMENTUM", sub: "Days 31–60  ·  Build consistent visibility and engagement.", color: GREEN, weeks: [
      { w: "Week 5–6", items: ["Reach 5 new Google reviews (or increase count by 50%)", "Post 5× per week on your primary social channel", "Launch a UGC campaign ('Tag us for a chance to be featured')", "Publish 2 more local SEO blog posts", "Set up Google Business Profile Q&A section"] },
      { w: "Week 7–8", items: ["Run a paid social test ($5/day, 7 days, boost your best post)", "Create a highlight reel / portfolio on Instagram or Facebook", "Set up a monthly email to your customer list", "Add products/services to Google Business Profile with prices"] },
    ]},
    { title: "PHASE 3 — GROWTH", sub: "Days 61–90  ·  Compound results and measure ROI.", color: AMBER, weeks: [
      { w: "Week 9–10", items: ["Run a proper paid ad campaign with a dedicated landing page", "Publish a local press story or community partnership post", "Reach out to 3 complementary local businesses for cross-promotion", "Create a referral incentive for existing customers"] },
      { w: "Week 11–12", items: ["Audit all improvements made since Day 1", "Compile new review count vs. 90 days ago", "Check website traffic in Google Analytics or Search Console", `Re-scan on Know Your Presence — target score: ${target}/100`, "Celebrate progress and plan the next 90 days!"] },
    ]},
  ];

  const children = [
    darkHeader("90-Day Growth Roadmap", `${d.name}  ·  Current Score: ${sc.overall}/100  →  Target: ${target}/100`),
    infoBox(`You're starting at ${sc.overall}/100. Follow this roadmap week by week and you should reach ${target}/100 by Day 90. Each phase builds on the last.`),
    ...phases.flatMap(p => [
      sectionHeader(`${p.title}`, p.color),
      body(p.sub, { color: GRAY, size: 20, before: 0, after: 120 }),
      ...p.weeks.flatMap(w => [
        body(w.w, { bold: true, color: p.color, before: 160, after: 60 }),
        ...w.items.map(i => checkItem(i)),
      ]),
    ]),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 6: Local SEO Guide ────────────────────────────────────────────────────
async function docSEOGuide(d) {
  const children = [
    darkHeader("Local SEO Quick-Start Guide", `${d.name}  ·  ${d.city}`),
    infoBox("Local SEO helps your business appear when people nearby search for what you offer. These steps are free and have the highest impact on local search ranking."),
    sectionHeader("🔍  STEP 1 — NAIL YOUR KEYWORDS", BLUE),
    body("Find 5–10 keywords your customers actually use to search:"),
    bullet(`"[your service] in ${d.city}"`),
    bullet(`"best [your service] near me"`),
    bullet(`"[your service] ${d.city} reviews"`),
    bullet(`"[your service] open now ${d.city}"`),
    body("Free keyword research tools:", { color: GRAY, size: 20, before: 160 }),
    bullet("Google Keyword Planner — ads.google.com/home/tools/keyword-planner"),
    bullet("Ubersuggest — ubersuggest.com"),
    bullet("AnswerThePublic — answerthepublic.com"),
    sectionHeader("🌐  STEP 2 — ON-PAGE SEO (Your Website)", GREEN),
    checkItem(`Include your primary keyword in the page <title> tag`),
    checkItem(`Include city + service in H1 heading: "Best [Service] in ${d.city}"`),
    checkItem("Add your full address in the footer of every page"),
    checkItem("Create a dedicated Contact/Location page with embedded Google Map"),
    checkItem("Add alt text to all images (describe the image + include keyword)"),
    checkItem("Ensure your site loads in under 3 seconds on mobile"),
    sectionHeader("🏷️  STEP 3 — SCHEMA MARKUP", AMBER),
    body("Tell Google exactly who you are. Give this code to your web developer:", { before: 0 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: "1E293B", fill: "1E293B" },
        margins: { top: 160, bottom: 160, left: 240, right: 240 },
        children: [
          new Paragraph({ children: [new TextRun({ text: '<script type="application/ld+json">', font: "Courier New", size: 18, color: "94A3B8" })] }),
          new Paragraph({ children: [new TextRun({ text: '{', font: "Courier New", size: 18, color: "4ADE80" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "@context": "https://schema.org",`, font: "Courier New", size: 18, color: "93C5FD" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "@type": "LocalBusiness",`, font: "Courier New", size: 18, color: "93C5FD" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "name": "${d.name}",`, font: "Courier New", size: 18, color: "FDE68A" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "addressLocality": "${d.city}",`, font: "Courier New", size: 18, color: "FDE68A" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "telephone": "[Your Phone]",`, font: "Courier New", size: 18, color: "FDE68A" })] }),
          new Paragraph({ children: [new TextRun({ text: `  "url": "[Your Website URL]"`, font: "Courier New", size: 18, color: "FDE68A" })] }),
          new Paragraph({ children: [new TextRun({ text: '}', font: "Courier New", size: 18, color: "4ADE80" })] }),
          new Paragraph({ children: [new TextRun({ text: '</script>', font: "Courier New", size: 18, color: "94A3B8" })] }),
        ],
      })]})],
      margins: { top: 120, bottom: 200 },
    }),
    sectionHeader("📋  STEP 4 — DIRECTORY LISTINGS", NAVY),
    body("List your business on these directories with IDENTICAL name, address, phone (NAP consistency):"),
    checkItem("Google Business Profile — business.google.com"),
    checkItem("Yelp — biz.yelp.com"),
    checkItem("Bing Places — bingplaces.com"),
    checkItem("Apple Maps — mapsconnect.apple.com"),
    checkItem("Facebook Business Page"),
    checkItem("TripAdvisor (if hospitality / restaurant)"),
    checkItem("Yellow Pages — yellowpages.com"),
    checkItem("Better Business Bureau — bbb.org"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 7: Social Bio Templates ──────────────────────────────────────────────
async function docBioTemplates(d) {
  const children = [
    darkHeader("Social Media Bio & Profile Templates", d.name),
    infoBox("Copy, customise, and paste these bios into each platform. A strong bio = more follows, more trust, more customers."),
    sectionHeader("📸  INSTAGRAM BIO  (150 characters max)", "E1306C"),
    body("Template A — Service-focused:", { bold: true, color: BLUE }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "FFF0F7", fill: "FFF0F7" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: "E1306C", size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        body(`[What you do] in ${d.city} 📍`),
        body("[Key benefit or unique value]"),
        body("[Social proof — '500+ happy customers' or 'Est. 2015']"),
        body("👇 Book / Shop / Learn more"),
        body("[Link in bio URL]"),
      ],
    })]})], margins: { bottom: 200 } }),
    body("Template B — Brand-focused:", { bold: true, color: BLUE, before: 160 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "FFF0F7", fill: "FFF0F7" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: "E1306C", size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        body("We help [target customer] [achieve outcome] ✨"),
        body(`📍 ${d.city}  |  [Country / State]`),
        body("DM us or tap the link below 👇"),
        body("[Link in bio URL]"),
      ],
    })]})], margins: { bottom: 200 } }),
    sectionHeader("👤  FACEBOOK PAGE ABOUT  (255 characters max)", "1877F2"),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "EFF6FF", fill: "EFF6FF" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: "1877F2", size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        body(`${d.name} is [what you do] based in ${d.city}.`),
        body("We specialise in [key service/product] and are known for [differentiator]."),
        body("Contact us at [email] or [phone] — we'd love to help!"),
      ],
    })]})], margins: { bottom: 200 } }),
    sectionHeader("🔗  GOOGLE BUSINESS PROFILE DESCRIPTION  (750 characters max)", GREEN),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "F0FDF4", fill: "F0FDF4" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: GREEN, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        body(`${d.name} is a [type of business] located in ${d.city}.`),
        body("We offer [list 3–5 core services/products]."),
        body("[Unique selling point — what makes you different]."),
        body("[Social proof — years in business, customers served, awards]."),
        body("Visit us at [address], call [phone], or visit [website] to learn more."),
        body(`We proudly serve ${d.city} and surrounding areas.`),
      ],
    })]})], margins: { bottom: 200 } }),
    sectionHeader("#️⃣  HASHTAG SETS", NAVY),
    body("Local:", { bold: true, color: BLUE }),
    body(`#${(d.city||"YourCity").replace(/\s+/g,"")} #${(d.city||"YourCity").replace(/\s+/g,"")}Business #LocalBusiness #ShopLocal #SupportSmallBusiness`),
    body("Engagement:", { bold: true, color: BLUE, before: 120 }),
    body("#SmallBusiness #Entrepreneur #LocalLove #Community #MadeLocal"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 8: Review Request Scripts ────────────────────────────────────────────
async function docReviewScripts(d) {
  const children = [
    darkHeader("Customer Review Request Scripts", d.name),
    infoBox("Reviews are the #1 trust signal for local businesses. Ask within 24 hours of a positive experience — while it's fresh. Never offer incentives (Google policy violation)."),
    sectionHeader("📱  SMS SCRIPTS  (under 160 characters)", GREEN),
    body("After purchase / visit:", { bold: true, color: DARK }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "F0FDF4", fill: "F0FDF4" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: GREEN, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [body(`"Hi [Name]! Thanks for visiting ${d.name} today. If you enjoyed your experience, we'd love a Google review: [YOUR LINK]. Takes 30 seconds! 🙏"`)],
    })]})], margins: { bottom: 160 } }),
    body("Follow-up (3 days later, if no review):", { bold: true, color: DARK, before: 160 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "F0FDF4", fill: "F0FDF4" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: GREEN, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [body(`"Hi [Name], just checking in from ${d.name}! Hope everything was great. A Google review would mean the world to us: [YOUR LINK]"`)],
    })]})], margins: { bottom: 240 } }),
    sectionHeader("📧  EMAIL SCRIPTS", BLUE),
    body("Email 1 — Friendly ask:", { bold: true, color: DARK }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "EFF6FF", fill: "EFF6FF" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: BLUE, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [
        body("Subject: Quick favour, [Name]? ⭐", { bold: true }),
        body(""),
        body("Hi [Name],"),
        body(`Thank you so much for choosing ${d.name} — we really appreciate your business.`),
        body("If you had a great experience, would you mind leaving us a quick Google review? It takes less than a minute and genuinely helps other local people find us."),
        body("[PASTE YOUR GOOGLE REVIEW LINK HERE]", { bold: true, color: BLUE }),
        body("No pressure at all, and thank you either way!"),
        body(`Warm regards, The ${d.name} Team`),
      ],
    })]})], margins: { bottom: 200 } }),
    sectionHeader("🗣️  IN-PERSON SCRIPT  (for staff)", AMBER),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: "FFFBEB", fill: "FFFBEB" },
      margins: { top: 160, bottom: 160, left: 240, right: 240 },
      borders: { left: { style: BorderStyle.THICK, color: AMBER, size: 24 }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [body(`"I'm really glad you had a great experience! If you have a moment, a Google review would really help us out — I can text you the link right now if you'd like?"`)]
    })]})], margins: { bottom: 200 } }),
    sectionHeader("✅  BEST PRACTICES", NAVY),
    bullet("Ask within 24 hours of a positive experience — while it's fresh"),
    bullet("Never offer discounts or gifts for reviews (Google policy violation)"),
    bullet("Respond to every review — positive and negative"),
    bullet("Aim for 1–2 new reviews per week minimum"),
    bullet("Respond to negative reviews within 24 hours, calmly and professionally"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 9: Website Quick-Win Checklist ───────────────────────────────────────
async function docWebsiteChecklist(d) {
  const children = [
    darkHeader("Website Quick-Win Checklist", `${d.name}  ·  Website Score: ${d.sc.website}/100`),
    infoBox("Work through these priorities in order. Speed and mobile come first — they are the biggest ranking factor AND the biggest conversion factor."),
    sectionHeader("🚀  PRIORITY 1 — SPEED & MOBILE", "DC2626"),
    checkItem("Test your site: pagespeed.web.dev — target 90+ on mobile"),
    checkItem("Compress all images (use squoosh.app — free, no upload limit)"),
    checkItem("Enable browser caching (ask your web host or developer)"),
    checkItem("Use Cloudflare free plan for CDN — cloudflare.com"),
    checkItem("Remove unused plugins or scripts from your website"),
    checkItem("Enable GZIP compression on your server"),
    sectionHeader("🤝  PRIORITY 2 — TRUST SIGNALS", BLUE),
    checkItem("Display your phone number prominently in the header"),
    checkItem("Add your physical address with a Google Map embed"),
    checkItem("Show real customer reviews / testimonials with photos"),
    checkItem("Display any awards, certifications, or press mentions"),
    checkItem("Add an SSL certificate (https://) — free via Let's Encrypt"),
    checkItem("Show a clear refund / satisfaction guarantee"),
    checkItem("Professional headshots or team photos on About page"),
    sectionHeader("📍  PRIORITY 3 — LOCAL SEO ON-PAGE", GREEN),
    checkItem(`H1 heading includes keyword + city: "Best [Service] in ${d.city}"`),
    checkItem(`Page title: "[Keyword] | ${d.name} | ${d.city}"`),
    checkItem("Meta description: 155 chars, includes service + city + phone"),
    checkItem("Footer includes: business name, address, phone, hours"),
    checkItem("Contact page has an embedded Google Map"),
    checkItem("Add LocalBusiness schema markup (see Local SEO Guide)"),
    sectionHeader("🎯  PRIORITY 4 — CONVERSION", AMBER),
    checkItem("One clear Call to Action on every page (Book / Call / Get Quote)"),
    checkItem("CTA button visible without scrolling on mobile"),
    checkItem("Contact form works and sends to a monitored email"),
    checkItem("Phone number is click-to-call on mobile"),
    checkItem("Confirmation message shown after form submit"),
    sectionHeader("🔧  FREE TOOLS", NAVY),
    bullet("PageSpeed Insights — pagespeed.web.dev"),
    bullet("Mobile-friendly test — search.google.com/test/mobile-friendly"),
    bullet("Schema validator — validator.schema.org"),
    bullet("Image compression — squoosh.app"),
    bullet("Broken link checker — deadlinkchecker.com"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── FILE 10: Competitor Intelligence Worksheet ────────────────────────────────
async function docCompetitorSheet(d) {
  const competitorBlock = (n) => [
    sectionHeader(`🔎  COMPETITOR ${n}`, n === 1 ? BLUE : n === 2 ? GREEN : AMBER),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        twoColRow("FIELD", "YOUR NOTES", true),
        twoColRow("Business Name", ""),
        twoColRow("Google Rating / Review Count", "     ★ / _____ reviews"),
        twoColRow("Website Speed (pagespeed.web.dev)", "_____ / 100 mobile"),
        twoColRow("Social Following", "IG: _____ | FB: _____ | TikTok: _____"),
        twoColRow("Posting Frequency", "_____ × per week"),
        twoColRow("What they do WELL", ""),
        twoColRow("What they do POORLY", ""),
        twoColRow("Gap I can exploit", ""),
      ],
      margins: { bottom: 200 },
    }),
  ];

  const children = [
    darkHeader("Competitor Intelligence Worksheet", `${d.name}  ·  ${d.city}`),
    infoBox(`Go to Google and search "[your service] in ${d.city}" — the top 3 map pack results are your main competitors. Fill in one block per competitor below.`),
    ...competitorBlock(1),
    ...competitorBlock(2),
    ...competitorBlock(3),
    sectionHeader("🏆  YOUR COMPETITIVE ADVANTAGE SUMMARY", NAVY),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        twoColRow("AREA", "NOTES", true),
        twoColRow(`Where ${d.name} already WINS`, ""),
        twoColRow("Areas to IMPROVE to overtake", ""),
        twoColRow("Quick wins from competitor gaps", ""),
      ],
      margins: { bottom: 200 },
    }),
    sectionHeader("📅  MONTHLY TRACKING REMINDER", BLUE),
    bullet("Their Google review count — are they growing faster than you?"),
    bullet("New content or campaigns they launched"),
    bullet("Any new services or pricing changes"),
    bullet("Set a monthly calendar reminder: 'Competitor check — 30 minutes'"),
    bullet("Re-scan Know Your Presence every 90 days to compare your score"),
    ...footer(d.name),
  ];
  return Packer.toBuffer(await makeDoc(children));
}

// ── Main export ────────────────────────────────────────────────────────────────
async function generateToolkitZip(reportData) {
  const archiver = require("archiver");
  const fs = require("fs");
  const path = require("path");
  const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, "../reports");

  const reportId    = reportData.reportId || "REPORT";
  const zipPath     = path.join(REPORTS_DIR, `${reportId}-toolkit.zip`);

  const sc = (() => {
    const s = reportData.scores || {};
    const overall = Math.round((s.reputation||0)*0.20 + (s.google||0)*0.35 + (s.website||0)*0.20 + (s.social||0)*0.25);
    return { overall, google: s.google||0, social: s.social||0, website: s.website||0, reputation: s.reputation||0 };
  })();

  const d = {
    name: reportData.businessName || "Your Business",
    city: reportData.city || "",
    date: reportData.reportDate || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    sc,
  };

  const files = [
    { name: "01_Action_Checklist.docx",              gen: docChecklist },
    { name: "02_Review_Response_Templates.docx",     gen: docReviewTemplates },
    { name: "03_30Day_Social_Media_Calendar.docx",   gen: docSocialCalendar },
    { name: "04_Google_Business_Profile_Guide.docx", gen: docGBPGuide },
    { name: "05_90Day_Growth_Roadmap.docx",          gen: docRoadmap },
    { name: "06_Local_SEO_Guide.docx",               gen: docSEOGuide },
    { name: "07_Social_Bio_Templates.docx",          gen: docBioTemplates },
    { name: "08_Review_Request_Scripts.docx",        gen: docReviewScripts },
    { name: "09_Website_Quick_Win_Checklist.docx",   gen: docWebsiteChecklist },
    { name: "10_Competitor_Intelligence.docx",       gen: docCompetitorSheet },
  ];

  // Generate all DOCX buffers in parallel
  const buffers = await Promise.all(files.map(f => f.gen(d)));

  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => { console.log("Toolkit ZIP saved:", zipPath); resolve(zipPath); });
    archive.on("error", reject);
    archive.pipe(output);
    files.forEach((f, i) => archive.append(buffers[i], { name: f.name }));
    archive.finalize();
  });
}

module.exports = { generateToolkitZip };
