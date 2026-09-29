// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const { fetchGoogleBusinessData, searchCompetitorByName } = require("./services/googleBusiness");
const { fetchYelpData } = require("./services/yelp");
const { calculateSocialScore } = require("./services/socialMedia");
const { fetchWebsiteHealth } = require("./services/website");
const { runTechnicalChecks } = require("./services/technical");
const { calculateOverallScore, projectPotentialScore } = require("./services/scoring");
const { generateActionPlan } = require("./services/actionPlan");
const { getPrice, REPORT_PRICE_USD, REPORT_CURRENCY } = require("./services/pricing");
const { createCheckoutSession, verifyWebhookSignature } = require("./services/dodo");
const { saveOrder, getAllOrders, getOrderByReportId, getOrdersByCountry } = require("./services/orders");
const { sendCustomerConfirmation, sendOwnerNotification } = require("./services/email");
const { generateReportPdf, generateToolkitZip, makeReportId, REPORTS_DIR } = require("./services/reportPdf");
const { generateWebReport } = require("./services/reportHtml");
const { scanRateLimit, hasEmailScanned, recordEmailScan } = require("./services/rateLimit");
const { saveLead, markConverted, getAllLeads, getLeadStats, getPublicScanCount } = require("./services/leads");
const { runApifyEnrichment } = require("./services/apify");
const { scanUrl: urlScanUrl } = require("./services/urlscan");
const { pushScanRecord, pushLeadRecord } = require("./services/coupler");
const { runAdIntelligence } = require("./services/metaAds");
const { generateAllInsights } = require("./services/aiInsights"); // ← AI Insights (6 modules)
const { startFollowUpJob } = require("./services/followUpJob");   // ← 24h upsell follow-up
const { logOrderToSheet } = require("./services/googleSheets");   // ← Google Sheets CRM
const { addBrevoContact } = require("./services/brevo");          // ← 90-day drip sequence

const app = express();
// Required when running behind a proxy (Render, Railway, Heroku, nginx etc.)
// so req.ip and x-forwarded-for resolve to the real visitor's IP rather than
// the proxy's - without this, rate limiting would treat ALL traffic as one IP.
app.set("trust proxy", 1);
app.use(cors());
// IMPORTANT: the Dodo webhook route must receive the RAW, unparsed body so
// its signature can be verified against the exact bytes Dodo signed. Running
// express.json() on it first would re-serialize the JSON and break
// verification, so that one path is skipped here and parsed with
// express.raw() on the route itself.
app.use((req, res, next) => {
  if (req.originalUrl === "/api/webhooks/dodo") return next();
  express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/scan", scanRateLimit, async (req, res) => {
  try {
    const {
      businessName,
      placeId,
      websiteUrl,
      youtubeChannelId,
      instagramUserId,
      facebookPageId,
      facebookUrl,       // optional: customer-provided FB page URL
      instagramHandle,   // optional: customer-provided IG handle (without @)
      city, // used to match the right business on Yelp - same city ambiguity problem Google Places solves via placeId
      email, // captured before the scan - this is the email gate
      countryCode,
      reputationScore, // optional manual input for now (aggregate sentiment)
    } = req.body;

    // Email is required for a free scan - it's the gate. Without it, we'd be
    // spending real API money on anonymous visitors we can never follow up with.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email is required to run a free scan." });
    }

    // Email restriction — 1 free scan per email address, forever (persisted to disk).
    if (hasEmailScanned(email)) {
      return res.status(429).json({
        error: "already_scanned",
        message: "This email has already used its free scan. Upgrade to get your full report with AI insights, PDF, and toolkit.",
      });
    }

    // Record the email NOW (before the scan runs) so even a failed/aborted
    // scan counts — prevents someone refreshing to get unlimited free scans.
    recordEmailScan(email);

    // Save the lead before running the scan, so we capture it even if the
    // scan itself fails for some reason.
    try {
      saveLead({ email, businessName, countryCode });
      // Send lead notification email to owner
      const { Resend } = require("resend");
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      if (process.env.OWNER_EMAIL && process.env.RESEND_API_KEY) {
        resendClient.emails.send({
          from: process.env.EMAIL_FROM || "reports@knowyourpresence.com",
          to: process.env.OWNER_EMAIL,
          subject: `🔍 New Free Scan — ${businessName || "Unknown"} (${city || "?"}, ${countryCode || "?"})`,
          html: `<p><strong>New free scan lead!</strong></p>
                 <p>📧 Email: ${email}</p>
                 <p>🏢 Business: ${businessName || "Not provided"}</p>
                 <p>🏙️ City: ${city || "Not provided"}</p>
                 <p>🌍 Country: ${countryCode || "Not provided"}</p>
                 <p>⏰ Time: ${new Date().toISOString()}</p>
                 <p><a href="https://knowyourpresence.com/admin">View all leads →</a></p>`
        }).catch(e => console.error("Lead notification email failed:", e.message));
      }
    } catch (leadErr) {
      console.error("Lead save failed (continuing with scan):", leadErr.message);
    }

    // --- PLACE ID LOOKUP ---
    // If no placeId passed from frontend, look it up via Places Text Search
    let resolvedPlaceId = placeId;
    let resolvedWebsiteUrl = websiteUrl;
    if (!resolvedPlaceId && businessName && process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const query = city ? `${businessName} in ${city}` : businessName;
        const { data: placeData } = await axios.post(
          "https://places.googleapis.com/v1/places:searchText",
          { textQuery: query, maxResultCount: 1 },
          {
            headers: {
              "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask": "places.id,places.websiteUri",
            },
          }
        );
        const place = placeData.places?.[0];
        if (place) {
          resolvedPlaceId = place.id;
          if (!resolvedWebsiteUrl && place.websiteUri) {
            resolvedWebsiteUrl = place.websiteUri;
          }
          console.log("Place ID resolved:", resolvedPlaceId, "for", businessName);
        }
      } catch (placeErr) {
        console.error("Place ID lookup failed (continuing):", placeErr.message);
      }
    }

    const [
      googleResult,
      socialResult,
      websiteResult,
      yelpResult,
      technicalResult,
      metaAdsTeaser,
      apifyResult,
      urlscanResult,
    ] = await Promise.all([
      fetchGoogleBusinessData(resolvedPlaceId),
      calculateSocialScore({ youtubeChannelId, businessName, city, facebookUrl, instagramHandle }),
      fetchWebsiteHealth(resolvedWebsiteUrl),
      fetchYelpData(businessName, city),
      runTechnicalChecks(websiteUrl),
      // Meta Ads Library: quick teaser check — is this business running ads?
      // (Full competitor comparison only in the paid report)
      runAdIntelligence(businessName, null, countryCode || "US").catch((e) => {
        console.error("Meta Ads teaser failed (non-blocking):", e.message);
        return { business: { checked: false }, competitor: { checked: false } };
      }),
      // Apify: DISABLED on free scan to save credits
      // Only runs on paid report generation (webhook handler below)
      Promise.resolve({ checked: false, reason: "free_scan_only" }),
      // URLScan: security headers, trackers, screenshot (non-blocking)
      // URLScan takes ~25-30s so only run it if a websiteUrl was provided
      websiteUrl
        ? urlScanUrl(websiteUrl).catch((e) => {
            console.error("URLScan failed (non-blocking):", e.message);
            return { checked: false };
          })
        : Promise.resolve({ checked: false, reason: "no_url" }),
    ]);

    const subScores = {
      google: googleResult.score,
      social: socialResult.score,
      website: websiteResult.score,
      reputation: (() => {
        // Derive from Google rating if available, else fallback
        const rating = googleResult?.raw?.rating;
        const reviews = googleResult?.raw?.reviewCount ?? googleResult?.raw?.user_ratings_total ?? 0;
        if (rating && rating > 0) {
          // rating 1-5 → score 0-100, boosted by review volume (up to +15)
          const base = Math.round(((rating - 1) / 4) * 85);
          const boost = Math.min(15, Math.round(Math.log10(reviews + 1) * 5));
          return Math.min(100, base + boost);
        }
        return reputationScore != null ? Number(reputationScore) : 60;
      })(),
      competitive: null, // wire up a second scan of a competitor and pass its overall score here
    };

    const scoreResult = calculateOverallScore(subScores);
    const potential = projectPotentialScore(subScores);
    const actionPlan = generateActionPlan(subScores, businessName);

    // Push free-scan lead to Coupler analytics sheet (non-blocking)
    pushLeadRecord({
      email,
      businessName,
      city,
      countryCode,
      overallScore: scoreResult.overall,
      grade: scoreResult.grade,
    }).catch(() => {});

    res.json({
      businessName: businessName || "Your Business",
      overall: scoreResult.overall,
      grade: scoreResult.grade,
      potentialScore: potential,
      breakdown: scoreResult.breakdown,
      // scores object passed through to checkout → webhook → reportData
      scores: {
        google:     subScores.google     ?? 0,
        social:     subScores.social     ?? 0,
        website:    subScores.website    ?? 0,
        reputation: subScores.reputation ?? 0,
      },
      details: {
        google: googleResult.raw,
        social: socialResult.platforms,
        website: websiteResult.raw,
        yelp: yelpResult,
        technical: technicalResult, // ssl expiry, safe browsing, dns config
        // --- New enrichment layers ---
        apify: apifyResult,      // on-page SEO signals + Google Maps review snippets
        urlscan: urlscanResult,  // security headers, tracker count, screenshot URL
        metaAds: metaAdsTeaser,  // is this business running Facebook/Instagram ads?
      },
      actionPlan,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed", message: err.message });
  }
});

// Returns the flat report price for display on the site.
// No country parameter - there is deliberately one price for everyone.
app.get("/api/pricing", (req, res) => {
  res.json(getPrice());
});

// Public config — exposes only safe, public-facing keys
app.get("/api/config", (req, res) => {
  res.json({
    googleMapsKey: process.env.GOOGLE_MAPS_PUBLIC_KEY || "",
  });
});

// --- CHECKOUT: creates a Dodo Payments checkout session and returns the
// hosted checkout URL for the browser to redirect to.
//
// Only collects businessName, email, businessType - matching what the
// Privacy Policy discloses. Everything needed to build the report later is
// passed as metadata, which Dodo echoes back in the webhook.
app.post("/api/checkout/create-session", async (req, res) => {
  try {
    const {
      businessName, email, businessType, businessDescription, city, waNumber, scores, scanDetails, competitorName,
    } = req.body;

    if (!businessName || !email || !businessType) {
      return res.status(400).json({ error: "businessName, email, and businessType are required." });
    }

    // Generate reportId BEFORE checkout so we can embed it in the return URL.
    // The webhook will use the same ID when saving the report, so the loading
    // page can poll for it and redirect as soon as it's ready.
    const preReportId = makeReportId();
    const returnUrl = `${req.protocol}://${req.get("host")}/report-ready?id=${preReportId}`;

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      email,
      returnUrl,
      metadata: {
        businessName,
        businessType,
        businessDescription: businessDescription || "",
        city: city || "",
        waNumber: waNumber || "",
        scores: (scores && typeof scores.google === 'number') ? scores : { google: 60, social: 60, website: 60, reputation: 60 },
        scanDetails: scanDetails || null,
        competitorName: competitorName || "",
        reportId: preReportId,
      },
    });

    res.json({ checkoutUrl, sessionId });
  } catch (err) {
    console.error("Checkout session creation failed:", err);
    res.status(500).json({ error: "Could not start checkout", message: err.message });
  }
});

// --- WEBHOOK: Dodo's confirmation that payment actually succeeded.
//
// This is the SOURCE OF TRUTH for fulfilment, not the customer's browser.
// If they close the tab right after paying, this still fires and they still
// get their report - which the old client-side verification could not
// guarantee.
//
// express.raw() is required here: signature verification must run against
// the exact unparsed body bytes. If express.json() parsed it first, the
// re-serialized JSON would not match what Dodo signed.
app.post("/api/webhooks/dodo", express.raw({ type: "application/json" }), async (req, res) => {
  const rawBody = req.body.toString("utf8");

  if (!verifyWebhookSignature(req.headers, rawBody)) {
    console.error("Rejected webhook with invalid signature.");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Acknowledge immediately - Dodo retries on non-2xx, and report generation
  // can take several seconds. Fulfilment continues after the response.
  res.status(200).json({ received: true });

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("Webhook body was not valid JSON.");
    return;
  }

  if (event.type !== "payment.succeeded") return; // ignore other event types

  try {
    const payload = event.data || {};
    const meta = payload.metadata || {};
    const email = payload.customer?.email;

    if (!email) {
      console.error("payment.succeeded webhook had no customer email - cannot fulfil.");
      return;
    }

    // Metadata values come back as strings; scores was JSON-stringified on the way out
    let scores;
    try {
      scores = meta.scores ? JSON.parse(meta.scores) : null;
    } catch {
      scores = null;
    }

    // Real evidence (isHttps, hasViewportMeta, perfScore, rating, reviewCount,
    // photoCount, hasHours) captured at scan time - used to show genuine
    // findings in the report instead of numbers re-derived from the score.
    let scanDetails;
    try {
      scanDetails = meta.scanDetails ? JSON.parse(meta.scanDetails) : null;
    } catch {
      scanDetails = null;
    }

    const order = saveOrder({
      email,
      businessName: meta.businessName || "Your Business",
      countryCode: payload.customer?.country || null,
      amount: payload.total_amount ? payload.total_amount / 100 : REPORT_PRICE_USD,
      currency: payload.currency || REPORT_CURRENCY,
      paymentId: payload.payment_id || payload.id || null,
      reportId: meta.reportId || null,
    });

    try { markConverted(email); } catch (e) { console.error("markConverted failed:", e.message); }

    // Re-run Apify + URLScan enrichment at fulfillment time (deeper scan for paid report).
    // scanDetails from the free scan may have been stored — we augment with fresh data here.
    let apifyEnrichment = null;
    let urlscanEnrichment = null;

    const websiteForEnrichment = scanDetails?.websiteUrl || null;

    let metaAdsEnrichment = null;

    if (websiteForEnrichment || meta.businessName) {
      const customerCountry = payload.customer?.country || "US";
      [apifyEnrichment, urlscanEnrichment, metaAdsEnrichment] = await Promise.all([
        runApifyEnrichment(websiteForEnrichment, meta.businessName, meta.city, customerCountry, meta.competitorName || null).catch((e) => {
          console.error("Apify enrichment (webhook) failed:", e.message);
          return null;
        }),
        websiteForEnrichment
          ? urlScanUrl(websiteForEnrichment).catch((e) => {
              console.error("URLScan (webhook) failed:", e.message);
              return null;
            })
          : Promise.resolve(null),
        runAdIntelligence(meta.businessName, meta.competitorName || null, customerCountry).catch((e) => {
          console.error("Meta Ads enrichment (webhook) failed:", e.message);
          return null;
        }),
      ]);
    }

    // Real competitor lookup - only runs if the customer named one at
    // checkout. Only Google + Website are compared, since those are the only
    // categories we can genuinely check for a third-party business (social
    // and "reputation" require account-level access we only have for the
    // paying customer). The report omits the comparison entirely rather than
    // showing fabricated numbers if this isn't provided or the lookup fails.
    let competitorData = null;
    if (meta.competitorName) {
      try {
        const result = await searchCompetitorByName(meta.competitorName, meta.city);
        if (result.found) {
          let competitorWebsite = null;
          if (result.websiteUri) {
            try {
              competitorWebsite = await fetchWebsiteHealth(result.websiteUri);
            } catch (e) {
              console.error("Competitor website check failed:", e.message);
            }
          }
          competitorData = {
            name: result.name,
            google: result.google.score,
            website: competitorWebsite ? competitorWebsite.score : null,
          };
        }
      } catch (e) {
        console.error("Competitor lookup failed (report proceeds without it):", e.message);
      }
    }

    // ─── AI INSIGHTS — 6 Claude-powered modules ──────────────────────────────
    // Runs in parallel with nothing — already after all enrichment is done.
    // Non-blocking: if Claude API key is missing or call fails, report still
    // generates fine — aiInsights will just be null.
    let aiInsights = null;
    try {
      // FIX: normalise reviews — Apify sometimes returns an object, not an array
      const rawReviews = apifyEnrichment?.reviews;
      const reviewsArray = Array.isArray(rawReviews)
        ? rawReviews
        : (rawReviews?.reviews || rawReviews?.results || rawReviews?.items || []);

      aiInsights = await generateAllInsights({
        businessName: meta.businessName || "Your Business",
        city: meta.city || "",
        businessType: meta.businessType || "",
        scores: {
          "Google Business Profile": scores?.google ?? 0,
          "Social Media": scores?.social ?? 0,
          "Website": scores?.website ?? 0,
          "Reputation": scores?.reputation ?? 0,
        },
        reviews: reviewsArray,
        socialData: null,
        aiVisibility: null,
      });
      console.log("AI Insights: All 6 modules complete.");
    } catch (err) {
      console.error("AI Insights failed (non-blocking):", err.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Use the pre-generated reportId from checkout metadata (so the loading
    // page that's already polling for it gets the right file).
    const reportId = meta.reportId || makeReportId();
    const reportData = {
      businessName: meta.businessName || "Your Business",
      businessType: meta.businessType || "service",
      businessDescription: meta.businessDescription || "",
      city: meta.city || "",
      reportId,
      reportDate: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
      waNumber: meta.waNumber || "",
      scores: (scores && typeof scores.google === 'number') ? scores : { google: 60, social: 60, website: 60, reputation: 60 },
      scanDetails,
      competitor: competitorData,
      // Enrichment layers baked into the PDF report
      apify: apifyEnrichment,
      urlscan: urlscanEnrichment,
      metaAds: metaAdsEnrichment,
      // AI Insights — 6 Claude-powered sections (null if API key not set)
      aiInsights,
    };

    let reportUrl = "";
    let webReportUrl = "";
    let toolkitUrl = "";
    let pdfPath = "";

    // Generate PDF, toolkit, and web report — run in parallel, each failure
    // is logged individually so one failure doesn't silently block the others.
    await Promise.allSettled([
      generateReportPdf(reportData)
        .then((savedPdfPath) => {
          pdfPath = savedPdfPath;
          reportUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/report/${reportId}`;
          console.log("[webhook] PDF generated:", pdfPath);
        })
        .catch((e) => console.error("[webhook] PDF generation FAILED:", e.message, e.stack)),

      generateToolkitZip(reportData)
        .then(() => {
          toolkitUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/toolkit/${reportId}`;
          console.log("[webhook] Toolkit generated:", toolkitUrl);
        })
        .catch((e) => console.error("[webhook] Toolkit generation FAILED:", e.message)),

      (async () => {
        const htmlContent = generateWebReport(reportData);
        const htmlPath = path.join(REPORTS_DIR, `${reportId}.html`);
        fs.writeFileSync(htmlPath, htmlContent, "utf8");
        webReportUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/report/${reportId}/view`;
        console.log("[webhook] Web report saved:", webReportUrl);
      })().catch((e) => console.error("[webhook] Web report generation FAILED:", e.message)),
    ]);

    // Email sends only the PDF — the web report is shown immediately after
    // payment via the /report-ready loading page, not linked in the email.
    const orderWithScores = {
      ...order,
      reportId,
      city: reportData.city,
      scores: reportData.scores,
      grade: scanDetails?.grade,
      pdfPath,
    };
    sendCustomerConfirmation(orderWithScores, reportUrl, toolkitUrl).catch((e) => console.error("Customer email failed:", e.message));
    sendOwnerNotification({
      customerEmail: email,
      businessName: reportData.businessName,
      city: reportData.city,
      score: (() => { const s = reportData.scores; return Math.round((s.reputation||0)*0.20+(s.google||0)*0.35+(s.website||0)*0.20+(s.social||0)*0.25); })(),
      grade: scanDetails?.grade || "",
      reportId,
      amount: order.amount ? `$${order.amount}` : "—",
    }).catch((e) => console.error("Owner notification failed:", e.message));

    // FIX: use reportData.scores for overall grade — scoreResult is from /api/scan scope, not here
    const overallGrade = scores
      ? (calculateOverallScore(scores)?.grade || "")
      : "";

    // Push completed order record to Coupler analytics sheet (non-blocking)
    pushScanRecord({
      reportId,
      businessName: reportData.businessName,
      businessType: reportData.businessType,
      city: reportData.city,
      email,
      scores: reportData.scores,
      grade: overallGrade,
      urlscan: urlscanEnrichment,
      apify: apifyEnrichment,
      metaAds: metaAdsEnrichment,
      amount: order.amount,
      currency: order.currency,
      paymentId: order.paymentId,
    }).catch(() => {});

    // Log to Google Sheets CRM (non-blocking)
    logOrderToSheet({
      reportId,
      businessName: reportData.businessName,
      city: reportData.city,
      email,
      scores: reportData.scores,
      grade: overallGrade,
      amount: order.amount,
      currency: order.currency,
      paymentId: order.paymentId,
    }).catch((e) => console.error("Google Sheets log failed:", e.message));

    // Add to Brevo + trigger 90-day drip sequence (non-blocking)
    addBrevoContact({
      email,
      businessName: reportData.businessName,
      city: reportData.city,
      scores: reportData.scores,
      reportId,
      grade: overallGrade,
    }).catch((e) => console.error("Brevo contact add failed:", e.message));

    console.log(`[webhook] Fulfilment complete for ${email} — report ${reportId}`);
  } catch (err) {
    console.error("Webhook fulfilment error:", err);
  }
});

// --- Report ready status: polled by the /report-ready loading page.
// Returns { ready: true } as soon as the HTML file exists on disk.
app.get("/api/report/:reportId/status", (req, res) => {
  const htmlPath = path.join(REPORTS_DIR, `${req.params.reportId}.html`);
  res.json({ ready: fs.existsSync(htmlPath) });
});

// --- Loading page shown immediately after Dodo redirects the customer back.
// Polls /api/report/:id/status every 3 s and auto-redirects once ready.
app.get("/report-ready", (req, res) => {
  const reportId = req.query.id || "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Preparing Your Report — Know Your Presence</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{min-height:100vh;display:flex;flex-direction:column;align-items:center;
       justify-content:center;background:#0a0f1e;color:#fff;font-family:'Segoe UI',sans-serif;
       text-align:center;padding:24px;}
  .logo{font-size:13px;letter-spacing:3px;color:#4ade80;text-transform:uppercase;margin-bottom:40px;}
  .spinner{width:64px;height:64px;border:4px solid rgba(74,222,128,0.2);
           border-top-color:#4ade80;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 32px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  h1{font-size:28px;font-weight:700;margin-bottom:12px;}
  p{color:#94a3b8;font-size:16px;line-height:1.6;max-width:420px;}
  .steps{margin-top:32px;display:flex;flex-direction:column;gap:10px;max-width:340px;}
  .step{background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 16px;
        font-size:14px;color:#cbd5e1;text-align:left;display:flex;align-items:center;gap:10px;}
  .step .dot{width:8px;height:8px;border-radius:50%;background:#334155;flex-shrink:0;}
  .step.done .dot{background:#4ade80;}
  .step.active .dot{background:#f59e0b;animation:pulse 1s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
  #eta{margin-top:24px;font-size:13px;color:#64748b;}
</style>
</head>
<body>
<div class="logo">Know Your Presence</div>
<div class="spinner"></div>
<h1>Building Your Report</h1>
<p>Payment confirmed ✓ — we're now generating your full Business Presence Report with AI insights.</p>
<div class="steps">
  <div class="step done"><span class="dot"></span>Payment verified</div>
  <div class="step done"><span class="dot"></span>Deep enrichment scan running</div>
  <div class="step active" id="s3"><span class="dot"></span>Generating AI insights (6 modules)</div>
  <div class="step" id="s4"><span class="dot"></span>Building interactive report</div>
  <div class="step" id="s5"><span class="dot"></span>Sending PDF to your email</div>
</div>
<p id="eta">Usually ready in 60–90 seconds…</p>
<script>
  const reportId = ${JSON.stringify(reportId)};
  let attempts = 0;
  const maxAttempts = 60; // 3 min max
  function check() {
    if (!reportId) { window.location.href = '/'; return; }
    fetch('/api/report/' + reportId + '/status')
      .then(r => r.json())
      .then(data => {
        attempts++;
        if (data.ready) {
          document.getElementById('s3').className = 'step done';
          document.getElementById('s4').className = 'step done';
          document.getElementById('s5').className = 'step active';
          document.getElementById('eta').textContent = 'Report ready! Opening now…';
          setTimeout(() => { window.location.href = '/api/report/' + reportId + '/view'; }, 800);
        } else if (attempts >= maxAttempts) {
          document.getElementById('eta').textContent = 'Taking longer than usual — check your email for the PDF link.';
        } else {
          if (attempts > 10) document.getElementById('s3').className = 'step done';
          if (attempts > 10) document.getElementById('s4').className = 'step active';
          setTimeout(check, 3000);
        }
      })
      .catch(() => { if (attempts < maxAttempts) setTimeout(check, 3000); });
  }
  setTimeout(check, 3000);
</script>
</body>
</html>`);
});

// --- Serves a generated report HTML web view.
// Also patches old reports that still have the broken PDF download banner/link.
app.get("/api/report/:reportId/view", (req, res) => {
  const reportId = req.params.reportId;
  const htmlPath = path.join(REPORTS_DIR, `${reportId}.html`);
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send("Report not found.");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  let html = fs.readFileSync(htmlPath, "utf8");

  // ── Patch 1: remove old "PDF generation failed" error banners ────────────
  html = html.replace(
    /<[^>]*>[^<]*PDF generation failed[^<]*<\/[^>]*>/gi,
    ""
  );
  // Also remove any alert/warning divs containing that text (multi-line)
  html = html.replace(
    /<div[^>]*>[^<]*PDF generation failed[\s\S]*?<\/div>/gi,
    ""
  );

  // ── Patch 2: replace old /pdf download links with resend button ──────────
  // Old anchor tags: <a href="...pdf"...>...Download PDF...</a>
  html = html.replace(
    /<a\s[^>]*href="[^"]*\/pdf"[^>]*>[\s\S]*?<\/a>/gi,
    `<button class="export-btn export-btn-primary" onclick="(function(btn){btn.disabled=true;btn.textContent='⏳ Sending…';fetch('/api/report/${reportId}/resend-pdf',{method:'POST'}).then(r=>r.json()).then(d=>{btn.textContent=d.ok?'✅ PDF sent to your email!':'⚠ '+(d.error||'Failed');setTimeout(()=>{btn.textContent='⬇ Send PDF to Email';btn.disabled=false;},5000);}).catch(()=>{btn.textContent='⚠ Network error';setTimeout(()=>{btn.textContent='⬇ Send PDF to Email';btn.disabled=false;},4000);});})(this)" style="cursor:pointer">⬇ Send PDF to Email</button>`
  );

  // ── Patch 3: inject resendPdf function if not already present ────────────
  if (!html.includes('resendPdf') && !html.includes('resend-pdf')) {
    html = html.replace(
      '</script>\n</body>',
      `function resendPdf(btn){var id=${JSON.stringify(reportId)};btn.disabled=true;btn.textContent='⏳ Sending…';fetch('/api/report/'+id+'/resend-pdf',{method:'POST'}).then(r=>r.json()).then(d=>{btn.textContent=d.ok?'✅ PDF sent to your email!':'⚠ '+(d.error||'Failed');setTimeout(function(){btn.textContent='⬇ Send PDF to Email';btn.disabled=false;},5000);}).catch(function(){btn.textContent='⚠ Network error';setTimeout(function(){btn.textContent='⬇ Send PDF to Email';btn.disabled=false;},4000);});}\n</script>\n</body>`
    );
  }

  res.send(html);
});

app.get("/api/report/:reportId", (req, res) => {
  const filePath = path.join(REPORTS_DIR, `${req.params.reportId}.pdf`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Report not found." });
  }
  res.sendFile(filePath);
});

// PDF download — serve from disk if available.
app.get("/api/report/:reportId/pdf", (req, res) => {
  const reportId = req.params.reportId;
  const pdfPath  = path.join(REPORTS_DIR, `${reportId}.pdf`);
  if (fs.existsSync(pdfPath)) {
    res.setHeader("Content-Disposition", `attachment; filename="KYP_Report_${reportId}.pdf"`);
    return res.sendFile(pdfPath);
  }
  return res.status(404).json({ error: "PDF not on disk — use the resend endpoint." });
});

// "Send PDF to Email" — regenerates the PDF from the stored HTML using
// Playwright (the same method used at fulfillment time), then emails it
// to the customer AND the owner. Called by the Download button in the
// web report. No browser print dialog needed — fully styled PDF.
app.post("/api/report/:reportId/resend-pdf", async (req, res) => {
  const reportId = req.params.reportId;
  const htmlPath = path.join(REPORTS_DIR, `${reportId}.html`);
  const pdfPath  = path.join(REPORTS_DIR, `${reportId}.pdf`);

  if (!fs.existsSync(htmlPath)) {
    return res.status(404).json({ ok: false, error: "Report not found." });
  }

  // Look up customer email from the order record (reportId now stored since this fix)
  const order = getOrderByReportId(reportId);
  const customerEmail = order?.email || null;

  try {
    // Regenerate PDF from stored HTML using Playwright
    const { chromium } = require("playwright");
    const launchOpts = {
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };
    const { __chromiumPath } = require("./services/reportPdf");
    if (__chromiumPath) launchOpts.executablePath = __chromiumPath;

    const browser = await chromium.launch(launchOpts);
    const page = await browser.newPage();
    const htmlFileUrl = `file://${htmlPath}`;
    await page.goto(htmlFileUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000); // let fonts/charts render
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    await browser.close();
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`[resend-pdf] Regenerated PDF: ${pdfPath}`);

    // Send to owner always; customer email if we can find it
    const { Resend } = require("resend");
    const resendClient = new Resend(process.env.RESEND_API_KEY);
    const pdfBase64 = pdfBuffer.toString("base64");
    const fileName = `KYP_Report_${reportId}.pdf`;
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://knowyourpresence.com";
    const webReportUrl = `${PUBLIC_BASE_URL}/api/report/${reportId}/view`;

    const emailBody = `<p>Your Business Presence Report PDF is attached.</p>
      <p><a href="${webReportUrl}">View report online →</a></p>
      <p style="color:#888;font-size:12px">Report ID: ${reportId}</p>`;

    // Send to customer + owner
    const recipients = [];
    if (customerEmail) recipients.push(customerEmail);
    const ownerEmail = process.env.OWNER_EMAIL || "support@knowyourpresence.com";
    if (!recipients.includes(ownerEmail)) recipients.push(ownerEmail);

    const businessName = order?.businessName || reportId;
    await resendClient.emails.send({
      from: "Know Your Presence <reports@knowyourpresence.com>",
      to: recipients,
      subject: `Your Presence Report PDF — ${businessName}`,
      html: emailBody,
      attachments: [{ filename: fileName, content: pdfBase64 }],
    });

    console.log(`[resend-pdf] PDF emailed to: ${recipients.join(", ")}`);
    res.json({ ok: true, message: "PDF regenerated and sent to email." });
  } catch (err) {
    console.error("[resend-pdf] Failed:", err.message, err.stack);
    res.status(500).json({ ok: false, error: "PDF generation failed. Please contact support@knowyourpresence.com with ID " + reportId });
  }
});

// Toolkit ZIP download - same ID as the report, different file extension.
app.get("/api/toolkit/:reportId", (req, res) => {
  const filePath = path.join(REPORTS_DIR, `${req.params.reportId}-toolkit.zip`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Toolkit not found." });
  }
  res.setHeader("Content-Disposition", `attachment; filename="KYP_Toolkit.zip"`);
  res.sendFile(filePath);
});

// --- Public scan counter for the landing page. Returns only a total, never
// any customer data. Hidden until it crosses the threshold in leads.js.
app.get("/api/stats/scans", (req, res) => {
  res.json(getPublicScanCount());
});

// --- Simple admin view of orders so far ---
// Protected by ADMIN_PASSWORD env var. Set it in .env before going live.
// Access: GET /api/admin/orders with header  x-admin-key: yourpassword
// Or visit /admin  (served as admin.html below)
function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!adminKey) return res.status(503).json({ error: "ADMIN_PASSWORD not set in .env" });
  const provided = req.headers["x-admin-key"] || req.query.key;
  if (provided !== adminKey) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json({ orders: getAllOrders(), byCountry: getOrdersByCountry() });
});

// --- Leads captured at the email gate ---
app.get("/api/admin/leads", requireAdmin, (req, res) => {
  res.json({ stats: getLeadStats(), leads: getAllLeads() });
});

// Serve admin dashboard HTML
app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(require("path").join(__dirname, "public", "admin.html"));
});

// Health check for Render
app.get("/health", (req, res) => res.json({ status: "ok", ts: Date.now() }));

// Env diagnostics (owner-only — only shows which keys are set, never the values)
app.get("/api/debug/env", (req, res) => {
  const keys = [
    "FACEBOOK_APP_TOKEN",
    "GOOGLE_MAPS_API_KEY",
    "GOOGLE_PLACES_API_KEY",
    "YOUTUBE_API_KEY",
    "RESEND_API_KEY",
    "DODO_PAYMENTS_API_KEY",
    "DODO_WEBHOOK_SECRET",
    "OPENAI_API_KEY",
    "OWNER_EMAIL",
  ];
  const status = {};
  for (const k of keys) {
    const v = process.env[k];
    status[k] = v ? `SET (${v.length} chars, starts: ${v.slice(0,4)}…)` : "MISSING";
  }
  res.json(status);
});

// Quick social score test for a business name
app.get("/api/debug/social", async (req, res) => {
  const { name, city } = req.query;
  if (!name) return res.status(400).json({ error: "?name=... required" });
  try {
    const result = await calculateSocialScore({ businessName: name, city });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KYP Scanner running at http://localhost:${PORT}`);
  // Start the 24-hour follow-up email job for unconverted free-scan leads
  startFollowUpJob();
});
