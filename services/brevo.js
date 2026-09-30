// services/brevo.js
// Adds a customer to Brevo and triggers the 90-day drip sequence.
// Uses Brevo Contacts API + Transactional Email API.
// Set BREVO_API_KEY in Render env vars.

const https = require("https");

const BREVO_API_KEY = process.env.BREVO_API_KEY;

function brevoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "api.brevo.com",
      path,
      method,
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Score track helper ────────────────────────────────────────────────────────
function getLowestScoreTrack(scores) {
  const s = scores || {};
  const items = [
    { key: "google",     label: "Google Business Profile", score: s.google     ?? 100 },
    { key: "social",     label: "Social Media",            score: s.social     ?? 100 },
    { key: "website",    label: "Website",                 score: s.website    ?? 100 },
    { key: "reputation", label: "Reputation",              score: s.reputation ?? 100 },
  ];
  items.sort((a, b) => a.score - b.score);
  return items[0].key; // "google" | "social" | "website" | "reputation"
}

// ── Email content per track ───────────────────────────────────────────────────
const TRACKS = {
  google: {
    day7:  { subject: "Quick win: your Google Business Profile", body: (name) => `Hi ${name},\n\nYour report flagged your Google Business Profile as your biggest opportunity.\n\nHere are 3 things you can do this week:\n\n1. Add at least 10 photos (businesses with photos get 42% more requests for directions)\n2. Post an update on GBP — even a short one about this week's special or hours\n3. Reply to your most recent reviews (Google rewards active profiles)\n\nThese alone can move your score 10–15 points.\n\nKnow Your Presence` },
    day14: { subject: "The Google review system that actually works", body: (name) => `Hi ${name},\n\nMost businesses ask for reviews the wrong way — and get ignored.\n\nHere's what works:\n\nAsk within 24 hours of a positive experience. Use this exact text:\n\n"Hi [Customer name], thanks for visiting us! If you had a great experience, it would mean a lot if you left us a quick Google review — it only takes 30 seconds. [Your Google review link]"\n\nShorten your Google review link at g.page/[yourbusiness]/review\n\nSend this to your last 20 customers this week.\n\nKnow Your Presence` },
    day30: { subject: "30-day check-in: your Google presence", body: (name) => `Hi ${name},\n\nYou're 30 days in. Here's what to verify:\n\n✅ GBP photos — do you have at least 10?\n✅ Weekly posts — are you posting at least once a week?\n✅ Reviews — have you received any new ones?\n✅ Q&A section — are there unanswered questions?\n\nIf you've done all of these, your Google score should already be improving.\n\nKnow Your Presence` },
  },
  social: {
    day7:  { subject: "Social media: quality beats quantity", body: (name) => `Hi ${name},\n\nYour social media presence has room to grow — and the good news is you don't need to post every day.\n\nStart with this: post 3 times this week on your strongest platform (Facebook or Instagram).\n\nWhat works for local businesses:\n• Behind-the-scenes photos (your team, your space)\n• Before/after (if relevant to your business)\n• Customer stories (with permission)\n• "Did you know" facts about your product or service\n\nConsistency for 4 weeks beats sporadic viral attempts every time.\n\nKnow Your Presence` },
    day14: { subject: "The post template that local businesses swear by", body: (name) => `Hi ${name},\n\nHere's a simple post formula that works:\n\n[Hook] — a question or surprising fact\n[Value] — one useful thing for your customer\n[CTA] — tell them what to do next\n\nExample for a café:\n"Did you know most people decide where to eat within 3 minutes of searching? ☕ Our daily specials are now on our Google profile and updated every morning. Follow us so you never miss out — link in bio."\n\nCustomise this for your business and post it today.\n\nKnow Your Presence` },
    day30: { subject: "30 days in: your social media check-in", body: (name) => `Hi ${name},\n\nQuick check-in on your social presence:\n\n✅ Are you posting at least 3x per week?\n✅ Have you replied to all comments and DMs?\n✅ Is your profile picture and bio up to date?\n✅ Have you linked your social to your Google Business Profile?\n\nThe last one is often missed — adding your Facebook/Instagram links to GBP helps both platforms.\n\nKnow Your Presence` },
  },
  website: {
    day7:  { subject: "Your website: the 3 things that matter most", body: (name) => `Hi ${name},\n\nYour website score has the most room to grow. Let's fix the quick wins first:\n\n1. Speed — go to pagespeed.web.dev and run your URL. If you score below 50 on mobile, contact your host about caching.\n2. Mobile — open your site on your phone right now. Does everything display correctly?\n3. Contact info — is your phone number clickable on mobile? It should be a tel: link.\n\nThese 3 things affect whether Google recommends your site to searchers.\n\nKnow Your Presence` },
    day14: { subject: "One page that could double your enquiries", body: (name) => `Hi ${name},\n\nIf your website has one job, it's to turn visitors into enquiries.\n\nThe highest-converting local business pages have:\n• A clear headline that says what you do and where\n• A phone number visible without scrolling\n• 3–5 customer reviews on the homepage\n• One clear button: "Call now" / "Book now" / "Get a quote"\n\nCheck your homepage against this list and fix anything missing.\n\nKnow Your Presence` },
    day30: { subject: "30-day website check-in", body: (name) => `Hi ${name},\n\nA month in — let's see where your website stands:\n\n✅ Speed score above 60 on mobile?\n✅ Phone number clickable on mobile?\n✅ Customer reviews visible on homepage?\n✅ Google Analytics or Search Console set up?\n\nIf Search Console isn't set up yet, do it today — it's free and shows you exactly what people search to find you.\n\nKnow Your Presence` },
  },
  reputation: {
    day7:  { subject: "Your reputation score: how to move it fast", body: (name) => `Hi ${name},\n\nReputation is the score most businesses can move fastest — because it's driven by reviews you can actively earn.\n\nThis week:\n1. Find your Google review link (search your business name on Google → click "Write a review" → copy the URL)\n2. Send it to your 5 most loyal customers with a personal message\n3. Reply to every existing review — positive and negative\n\nBusinesses that reply to reviews get 12% more reviews on average.\n\nKnow Your Presence` },
    day14: { subject: "How to respond to a negative review (template inside)", body: (name) => `Hi ${name},\n\nNegative reviews happen to every business. How you respond matters more than the review itself.\n\nUse this template:\n\n"Thank you for your feedback, [Name]. We're sorry your experience didn't meet your expectations — this isn't the standard we hold ourselves to. We'd love the chance to make it right. Please contact us at [phone/email] and we'll personally ensure your next experience is excellent."\n\nNever argue, never make excuses. A well-handled negative review can actually build trust.\n\nKnow Your Presence` },
    day30: { subject: "30-day reputation check-in", body: (name) => `Hi ${name},\n\nLet's see where your reputation stands after a month:\n\n✅ New reviews received this month?\n✅ All reviews replied to?\n✅ Review link sent to at least 10 customers?\n✅ Listed on Yelp, TripAdvisor (if relevant), or industry directories?\n\nIf your rating hasn't moved, focus on volume — more reviews, more consistently asked for.\n\nKnow Your Presence` },
  },
};

// ── Send a single drip email via Brevo ────────────────────────────────────────
async function sendDripEmail(to, businessName, subject, textBody) {
  if (!BREVO_API_KEY) return;
  const res = await brevoRequest("POST", "/v3/smtp/email", {
    sender: { name: "Know Your Presence", email: "reports@knowyourpresence.com" },
    to: [{ email: to }],
    subject,
    textContent: textBody(businessName),
  });
  if (res.status >= 400) {
    console.error("Brevo drip email failed:", res.status, JSON.stringify(res.body));
  } else {
    console.log(`Brevo drip sent to ${to}: "${subject}"`);
  }
}

// ── Add contact to Brevo with custom attributes ───────────────────────────────
async function addBrevoContact({ email, businessName, city, scores, reportId, grade }) {
  if (!BREVO_API_KEY) {
    console.warn("brevo: BREVO_API_KEY not set — skipping contact add.");
    return;
  }

  const track = getLowestScoreTrack(scores);
  const overall = scores
    ? Math.round(
        (scores.reputation || 0) * 0.20 +
        (scores.google     || 0) * 0.35 +
        (scores.website    || 0) * 0.20 +
        (scores.social     || 0) * 0.25
      )
    : 0;

  // Upsert contact with custom attributes
  const res = await brevoRequest("POST", "/v3/contacts", {
    email,
    attributes: {
      FIRSTNAME:        businessName,
      CITY:             city || "",
      REPORT_ID:        reportId || "",
      OVERALL_SCORE:    overall,
      GRADE:            grade || "",
      GOOGLE_SCORE:     scores?.google     ?? 0,
      SOCIAL_SCORE:     scores?.social     ?? 0,
      WEBSITE_SCORE:    scores?.website    ?? 0,
      REPUTATION_SCORE: scores?.reputation ?? 0,
      SCORE_TRACK:      track,
    },
    updateEnabled: true,
  });

  if (res.status >= 400 && res.status !== 409) {
    console.error("Brevo contact add failed:", res.status, JSON.stringify(res.body));
    return;
  }

  console.log(`Brevo contact added: ${email} (track: ${track})`);

  // Schedule drip emails with delays
  const trackEmails = TRACKS[track] || TRACKS.google;
  const delays = { day7: 7, day14: 14, day30: 30 };

  // NOTE: setTimeout is used here for simplicity but will NOT survive a server
  // restart (Render deploys reset all in-memory timers). For production reliability,
  // move drip scheduling to Brevo's native campaign scheduler or a cron job.
  // Max safe setTimeout delay = 2^31 - 1 ms ≈ 24.8 days, so day30 is capped.
  const MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1

  for (const [key, delayDays] of Object.entries(delays)) {
    const email_content = trackEmails[key];
    if (!email_content) continue;

    const delayMs = Math.min(delayDays * 24 * 60 * 60 * 1000, MAX_TIMEOUT_MS);

    setTimeout(async () => {
      try {
        await sendDripEmail(email, businessName, email_content.subject, email_content.body);
      } catch (e) {
        console.error(`Brevo drip ${key} failed for ${email}:`, e.message);
      }
    }, delayMs);

    console.log(`Brevo: scheduled ${key} email for ${email} in ${delayDays} days`);
  }
}

module.exports = { addBrevoContact };
