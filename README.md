# Know Your Presence - Business Pulse Scanner

A working starter for the KYP scanner tool: scores a business's Google
Business Profile, social presence, and website health, then generates
a prioritized 90-day action plan - the core of the ₹899 report.

## What's included

- `server.js` - Express API, single `/api/scan` endpoint
- `services/googleBusiness.js` - Google Places API integration
- `services/socialMedia.js` - YouTube live; Instagram/Facebook stubbed (see note below)
- `services/website.js` - Google PageSpeed Insights integration
- `services/scoring.js` - the weighted Pulse Score formula + 90-day potential projection
- `services/actionPlan.js` - generates the tailored improvement plan
- `public/` - the dashboard frontend (plain HTML/CSS/JS, no build step)

Everything runs with **mock/demo data** if you don't add API keys yet,
so you can see the whole flow working immediately.

## Setup (in VS Code)

1. Open this folder in VS Code.
2. Open a terminal (`` Ctrl+` ``) and run:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in the keys you have (optional to start):
   ```
   cp .env.example .env
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

## Getting API keys

| Key | Where to get it | Cost |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) → enable "Places API (New)" | Free tier, then pay-per-use |

## Business disambiguation via Google Places Autocomplete (important)

Until this was added, the scan had **no way to know which exact business** a
typed name referred to - "Urban Bites Cafe" could be one of several
businesses with that name in different cities, and the scan had no way to
tell them apart. It silently fell back to generic mock data every time,
even with a real `GOOGLE_PLACES_API_KEY` configured, because the backend's
real data lookup requires a `place_id`, which the frontend never collected.

This is now fixed: the Business Name field uses **Google Places
Autocomplete** - as the user types, a real dropdown of matching businesses
appears (name + address), and selecting one captures its `place_id`, which
now flows through to the real scan.

**This needs a separate API key from `GOOGLE_PLACES_API_KEY` above** - a
**client-side** Maps JavaScript API key, since it runs in the browser:

1. In Google Cloud Console, enable **"Maps JavaScript API"** and **"Places
   API"** for your project
2. Create a new API key specifically for this (don't reuse your server-side
   key)
3. **Restrict it by HTTP referrer** to your actual domain
   (`knowyourpresence.com/*`) - this is what keeps a client-side key safe
   despite being visible in your page's source, which is normal for this
   type of key
4. In `public/index.html`, find `YOUR_GOOGLE_MAPS_JS_KEY` in the Google
   Maps script tag and replace it with your real key

Without this key added, the Business Name field still works as a plain
text input (autocomplete just won't activate), and the scan falls back to
the same generic mock data as before - nothing breaks, it just won't be
disambiguated or pull real data yet.
| `GOOGLE_PAGESPEED_API_KEY` | Same console → enable "PageSpeed Insights API" | Free |
| `YOUTUBE_API_KEY` | Same console → enable "YouTube Data API v3" | Free |
| `META_ACCESS_TOKEN` | [Meta for Developers](https://developers.facebook.com/) → create an app → business must connect their Page/Instagram via OAuth | Free, but requires the business owner's login |

**Important note on Instagram/Facebook:** unlike Google and YouTube, you
cannot pull another business's private engagement data with just their
username - Meta requires the business to connect their own account
through an OAuth login flow. For a real product, this means your scan
tool needs a "Connect your Instagram" button that takes the business
owner through Meta's login, after which you get a token scoped to
their account. The `socialMedia.js` file has the exact API calls
documented in comments, ready to drop in once you build that flow.

## International pricing (PPP-based, not flat currency conversion)

`services/pricing.js` groups countries into three tiers by purchasing
power, each with its own USD-equivalent target price, then converts
that into local currency:

- **Tier 1** ($19): US, UK, Australia, UAE, Saudi, Kuwait, Qatar, Germany, France, Netherlands, Switzerland, Singapore, Canada
- **Tier 2** ($11): Russia, Brazil, Argentina, Mexico, Poland, Turkey, South Africa, China
- **Tier 3** ($10.8, ≈ your ₹899): India, Pakistan, Bangladesh, Philippines, Vietnam, Nigeria, Egypt, Indonesia

Test it directly: `GET http://localhost:3000/api/pricing/AE` returns
`{ tier: "tier1", currency: "AED", price: 69, usdEquivalent: 19 }`.

**Before going live:** the FX rates in `FX_TO_USD` are hardcoded
snapshots - swap them for a live feed (e.g. exchangerate.host,
openexchangerates.org) so prices don't drift as currencies move.
Also double-check local pricing psychology per market (e.g. Gulf
buyers often expect round AED numbers, not "599-style" pricing).

## Multi-language support (with RTL for Arabic)

`public/i18n.js` holds the UI translation dictionary - currently
English, Arabic, Russian, Spanish, Portuguese, and Hindi. The
language selector in the header swaps all `data-i18n` tagged text
instantly and flips the page to RTL automatically for Arabic.

**To add a language:** add a new key to `TRANSLATIONS` in
`public/i18n.js` with the same fields as the `en` block, then add an
`<option>` to the `#langSelect` dropdown in `index.html`.

**Important limitation:** this only translates static UI labels. The
actual report content - the action plan text, category names, review
sentiment summaries - is generated dynamically per business, so it
needs real machine translation at generation time (Google Cloud
Translation API or DeepL API), not a static dictionary. Wire that
into `services/actionPlan.js` before this is production-ready for
non-English markets.

## The PDF report generator (dynamic, by business type)

`report-generator/report_generator.py` builds the actual 13-page PDF
report a customer receives. Unlike an earlier version, **nothing in it
is hardcoded to one example business** - every page adapts to the real
business name, business type, city, and scores passed in.

- **`report-generator/business_content.py`** - genuinely different
  auto-reply messages, Google Business posts, content calendar, hashtags,
  and review-sequence wording for 5 business types: restaurant/cafe,
  retail, salon/spa, clinic, and service business. A salon report and a
  clinic report read nothing alike.
- **Score-tier narrative** - the diagnosis text for each category (Google,
  Social, Website, Reputation) is selected from low/mid/high tier
  templates based on the actual score, not one fixed script. A 35 and an
  81 on the same category produce different, appropriately-toned writing.
- **`services/reportPdf.js`** - the Node bridge. It spawns
  `report_generator.py` as a subprocess with the order's data, and
  returns the generated PDF's path. This means **Python 3 with reportlab
  must be installed on whatever server runs this project**:
  ```
  pip install reportlab --break-system-packages
  ```
  (Fonts are bundled in `report-generator/fonts/` - no extra setup needed
  for those.)
- **`GET /api/report/:reportId`** serves the generated PDF. Right now
  anyone with the exact report ID can download it (report IDs are
  long/random, but this isn't real access control) - add proper
  authorization before handling anything more sensitive than a business
  audit report.

**Known simplification:** competitor and industry-average benchmarking
in the report currently has no real data source - the report gracefully
omits that section when they're not provided. Wiring up real competitor
scans (a second call to the scan pipeline for a nearby business) is the
next step for that section to populate for real customers.

## Finding prospects: `prospect.js`

A standalone CLI that finds local businesses with weak Google profiles and
outputs them ranked worst-first, with their public contact details.

```
node prospect.js "coffee shops" "Austin, TX" 30
```

Writes `data/prospects-<slug>.csv` and prints the ten weakest to the console
with the specific problems found on each profile.

**Why it matters:** the `Issues Found` column is the actual product here. It
turns cold outreach into something concrete - "your profile has no photos and
3 unanswered reviews" rather than a generic pitch.

**Cost:** each business is a Google Places API call at the Enterprise tier
(~$40/1,000, first 1,000/month free). 500 businesses is roughly $20. The
script prints an estimate before it runs.

**Legal, and this genuinely differs by country:**
- **US (CAN-SPAM)** - cold B2B email is permitted with a working opt-out and
  a real physical postal address in every message.
- **Australia (Spam Act)** - permitted for B2B with opt-out and accurate
  sender details.
- **UK / EU (GDPR + PECR)** - materially stricter. Legitimate interest can
  cover B2B outreach but the bar is higher and enforcement is real. Do not
  assume the US position applies.

Role addresses (`info@`, `contact@`) are safer ground than personal ones.
The script only surfaces contact details already published on public Google
Business Profiles - it does not scrape personal emails.

## Payments: Dodo Payments (Merchant of Record)

Payments run through **Dodo Payments**, not a plain gateway. As a Merchant
of Record, Dodo becomes the legal seller and handles VAT/GST/sales tax
across 190+ countries on your behalf - which matters when selling a digital
product into the US, UK, EU and Australia, where you would otherwise need
to register for tax in each jurisdiction yourself.

**The flow is redirect-based, not a widget:**
1. `POST /api/checkout/create-session` creates a Dodo session server-side
2. Browser redirects to Dodo's hosted `checkout_url`
3. Customer pays on Dodo's page, then returns to your `return_url`
4. **`POST /api/webhooks/dodo` is the source of truth** - it confirms the
   payment, saves the order, generates the PDF, and sends both emails

Step 4 closes a real gap in the old Razorpay flow: fulfilment no longer
depends on the customer's browser staying open. If they close the tab the
instant after paying, the webhook still fires and they still get the report.

**Price lives in the Dodo dashboard, not in this code.** `services/pricing.js`
holds $129 for DISPLAY on the site only. If you change the price, you must
change it in **both** places or the site will advertise one number and
charge another.

**Setup:**
1. Create the report product in the Dodo dashboard, priced at $129 USD
2. Copy its product ID into `DODO_PRODUCT_ID`
3. Generate an API key (Developer > API) into `DODO_PAYMENTS_API_KEY`
4. Add a webhook pointing at `https://yourdomain.com/api/webhooks/dodo`,
   copy the signing secret into `DODO_WEBHOOK_SECRET`
5. Keep `DODO_ENVIRONMENT=test_mode` until you've tested end to end

**Two implementation details worth knowing:**
- `express.json()` is deliberately skipped for the webhook path. Signature
  verification must run against the exact raw bytes Dodo signed; letting
  express parse and re-serialize the JSON first would break it.
- Webhook signatures are verified with a 5-minute timestamp tolerance to
  block replay attacks. Without verification, anyone who found your webhook
  URL could POST a fake "payment succeeded" and get a free report.

## Email gate + rate limiting on the free scan

The free scan costs real money - roughly **4 cents per scan** in Google
Places API calls, because requesting reviews/ratings/photos bills at
Google's Enterprise+Atmosphere tier ($40 per 1,000 calls). Google also
retired its flat $200 monthly credit in March 2025; the Enterprise free
cap is now only **1,000 calls/month**.

Two protections are in place:

- **`services/rateLimit.js`** - one free scan per IP per 24 hours. Without
  this, a single bot hammering `/api/scan` could run up a serious bill in
  minutes. Note `app.set("trust proxy", 1)` in server.js - without it,
  every visitor behind your host's proxy would look like the same IP and
  share one limit.
- **Email gate** - `/api/scan` now requires a valid email. Visitors who
  never buy at least leave a contactable lead, so the API spend isn't a
  total loss.

**`services/leads.js`** stores captured emails in `data/leads.json`,
deduplicating repeat scanners and tracking `converted: true` once they
purchase. `GET /api/admin/leads` returns the list plus your real
scan-to-purchase conversion rate.

**Limitations worth knowing:**
- Rate limiting is in-memory, so it resets on server restart and does NOT
  work across multiple server instances. Fine for one small server; move
  to Redis if you scale out.
- IP limiting is imperfect by nature - shared office/mobile networks may
  block legitimate separate users, and a determined person can change IP.
  It's cost protection against bots, not airtight access control.
- `data/leads.json` contains real email addresses. Never commit it, and
  keep `/api/admin/leads` behind a password before going live.

## Checkout, order storage, and sale notifications

Three new pieces work together to actually take payment and notify both
sides:

- **`services/orders.js`** - stores each completed order in a local JSON
  file (`data/orders.json`), created automatically on first order. No
  database setup needed to start. **Only stores what the Privacy Policy
  discloses**: email, business name, country code, amount, and payment
  reference - no personal name, no precise location. If you want to
  collect a customer's name or a more precise location later, update the
  Privacy Policy first, then add the field here.
- **`services/email.js`** - sends two emails per sale via
  [Resend](https://resend.com) (free for 3,000 emails/month): a
  confirmation + report link to the customer, and a sale notification to
  you at `OWNER_EMAIL`. Without `RESEND_API_KEY` set, it logs what it
  would have sent instead of failing, so local development still works.
- **Checkout endpoints in `server.js`**:
  - `POST /api/checkout/create-order` - creates a Razorpay order for the
    correct regional price
  - `POST /api/checkout/verify-payment` - verifies the payment signature,
    saves the order, and fires both emails
  - `GET /api/admin/orders` - lists every order so far, plus a
    breakdown by country (useful for deciding which languages to add
    next, once you have real traffic). **Protect this endpoint with a
    password or proper login before going live** - it currently has no
    access control.

**Before this can take a real payment**, you need:
1. A verified Razorpay business account (KYC required) - get your keys
   from dashboard.razorpay.com
2. A Resend account with a verified sending domain
3. Python 3 with reportlab installed on the server (`pip install reportlab
   --break-system-packages`) - required for PDF report generation
4. That's everything - **the checkout form is fully wired**: email,
   business type (used to pick the right report content), and an
   optional WhatsApp number all get collected before payment, then flow
   straight into the generated PDF.

**Note on `data/orders.json`**: this file will contain real customer
emails once live - never commit it to a public repository, and back it
up regularly. For meaningful volume, migrate this to a real database
(Postgres via Railway/Supabase both have free tiers) rather than a flat
JSON file, since concurrent writes to a single file can corrupt data
under load.

## Where to extend next

- **Reputation score**: currently a placeholder input in the API request body. Wire this up to Google review sentiment (Places API `reviews` field) + third-party review sites via a sentiment model.
- **Competitive score**: run a second scan on a competitor's Place ID and pass its `overall` score into `subScores.competitive`.
- **PDF report generation**: use a library like `pdfkit` or `puppeteer` to turn the scan JSON into the branded ₹899 PDF report.
- **Payment gateway**: gate the full `/api/scan` response behind Razorpay/Stripe for the ₹899 unlock, showing only `overall` + one locked category on the free tier.
- **Progress tracker**: store scan results in a database (e.g. PostgreSQL/MongoDB) keyed by business, and re-scan on day 90 to show score movement.
- **Dynamic content translation**: wire Google Cloud Translation or DeepL into `actionPlan.js` so the generated report text (not just UI labels) comes out in the buyer's language.
- **Region-specific data sources**: add Yandex Maps for Russia, Trustpilot for Europe, and language-aware sentiment analysis (Google Cloud Natural Language supports 50+ languages) instead of running English sentiment models on translated text.
- **Live FX rates**: replace the hardcoded rates in `pricing.js` with a live feed so prices stay accurate as currencies move.
