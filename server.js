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
const { saveOrder, getAllOrders, getOrdersByCountry } = require("./services/orders");
const { sendCustomerConfirmation, sendOwnerNotification } = require("./services/email");
const { generateReportPdf, generateToolkitZip, makeReportId, REPORTS_DIR } = require("./services/reportPdf");
const { generateWebReport } = require("./services/reportHtml");
const { scanRateLimit } = require("./services/rateLimit");
const { saveLead, markConverted, getAllLeads, getLeadStats, getPublicScanCount } = require("./services/leads");
const { runApifyEnrichment } = require("./services/apify");
const { scanUrl: urlScanUrl } = require("./services/urlscan");
const { pushScanRecord, pushLeadRecord } = require("./services/coupler");
const { runAdIntelligence } = require("./services/metaAds");

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
      calculateSocialScore({ youtubeChannelId, instagramUserId, facebookPageId }),
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
      reputation: reputationScore != null ? Number(reputationScore) : 60, // fallback until wired up
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

    const returnUrl = `${req.protocol}://${req.get("host")}/?payment=success`;

    const { checkoutUrl, sessionId } = await createCheckoutSession({
      email,
      returnUrl,
      metadata: {
        businessName,
        businessType,
        businessDescription: businessDescription || "",
        city: city || "",
        waNumber: waNumber || "",
        scores: scores || { google: 60, social: 60, website: 60, reputation: 60 },
        scanDetails: scanDetails || null,
        competitorName: competitorName || "",
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

    const reportId = makeReportId();
    const reportData = {
      businessName: meta.businessName || "Your Business",
      businessType: meta.businessType || "service",
      businessDescription: meta.businessDescription || "",
      city: meta.city || "",
      reportId,
      reportDate: new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
      waNumber: meta.waNumber || "",
      scores: scores || { google: 60, social: 60, website: 60, reputation: 60 },
      scanDetails,
      competitor: competitorData,
      // Enrichment layers baked into the PDF report
      apify: apifyEnrichment,
      urlscan: urlscanEnrichment,
      metaAds: metaAdsEnrichment,
    };


    let reportUrl = "";
    let webReportUrl = "";
    let toolkitUrl = "";
    try {
      // Run PDF + toolkit in parallel; also save web report HTML
      await Promise.all([
        generateReportPdf(reportData).then(() => {
          reportUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/report/${reportId}`;
        }),
        generateToolkitZip(reportData).then(() => {
          toolkitUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/toolkit/${reportId}`;
        }),
        // Save interactive web report HTML
        (async () => {
          const fs = require("fs");
          const path = require("path");
          const htmlContent = generateWebReport(reportData);
          const htmlPath = path.join(REPORTS_DIR, `${reportId}.html`);
          fs.writeFileSync(htmlPath, htmlContent, "utf8");
          webReportUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/report/${reportId}/view`;
        })(),
      ]);
    } catch (genErr) {
      console.error("Report/toolkit generation failed after payment:", genErr.message);
    }

    sendCustomerConfirmation(order, reportUrl, toolkitUrl, webReportUrl).catch((e) => console.error("Customer email failed:", e.message));
    sendOwnerNotification(order).catch((e) => console.error("Owner notification failed:", e.message));

    // Push completed order record to Coupler analytics sheet (non-blocking)
    pushScanRecord({
      reportId,
      businessName: reportData.businessName,
      businessType: reportData.businessType,
      city: reportData.city,
      email,
      scores: { ...reportData.scores, overall: scores ? undefined : 60 },
      grade: scoreResult?.grade || "",
      urlscan: urlscanEnrichment,
      apify: apifyEnrichment,
      metaAds: metaAdsEnrichment,
      amount: order.amount,
      currency: order.currency,
      paymentId: order.paymentId,
    }).catch(() => {});
  } catch (err) {
    console.error("Webhook fulfilment error:", err);
  }
});

// --- Serves a generated report PDF. Anyone with the exact reportId (a long
// random-looking string) can download it - fine for a report that isn't
// sensitive, but add real access control here before handling anything
// more private.
app.get("/api/report/:reportId/view", (req, res) => {
  const htmlPath = path.join(REPORTS_DIR, `${req.params.reportId}.html`);
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send("Report not found.");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.sendFile(htmlPath);
});

app.get("/api/report/:reportId", (req, res) => {
  const filePath = path.join(REPORTS_DIR, `${req.params.reportId}.pdf`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Report not found." });
  }
  res.sendFile(filePath);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KYP Scanner running at http://localhost:${PORT}`);
});
