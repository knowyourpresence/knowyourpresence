// services/dodo.js
// Dodo Payments integration (Merchant of Record).
//
// WHY DODO RATHER THAN A PLAIN GATEWAY: as a Merchant of Record, Dodo becomes
// the legal seller of record. They collect and remit VAT/GST/sales tax across
// 190+ countries on your behalf - which matters a lot when selling a digital
// product into the US, UK, EU and Australia, where you'd otherwise be liable
// for registering in each jurisdiction yourself.
//
// HOW THE FLOW DIFFERS FROM RAZORPAY: there is no client-side payment widget.
// Instead:
//   1. Server creates a checkout session -> gets back a hosted checkout_url
//   2. Customer is redirected to Dodo's hosted page to pay
//   3. Dodo redirects them back to your return_url
//   4. Dodo sends a WEBHOOK confirming payment - this is the source of truth
//
// Step 4 matters: payment confirmation no longer depends on the customer's
// browser staying open. A closed tab can't lose an order the way it could
// with the old client-side verification flow.

const crypto = require("crypto");

const DODO_API_BASE = process.env.DODO_ENVIRONMENT === "live_mode"
  ? "https://live.dodopayments.com"
  : "https://test.dodopayments.com";

/**
 * Creates a Dodo checkout session and returns the hosted checkout URL.
 *
 * NOTE: the PRICE is not passed here - it's configured on the product inside
 * the Dodo dashboard. This function only references the product by ID.
 *
 * @param {object} opts
 * @param {string} opts.email - customer email (prefills their checkout)
 * @param {string} opts.returnUrl - where Dodo sends them after payment
 * @param {object} opts.metadata - your own data echoed back in the webhook
 *                                 (businessName, businessType, scores, etc.)
 * @returns {Promise<{checkoutUrl: string, sessionId: string}>}
 */
async function createCheckoutSession({ email, returnUrl, metadata = {} }) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PRODUCT_ID;

  if (!apiKey) throw new Error("DODO_PAYMENTS_API_KEY is not set.");
  if (!productId) throw new Error("DODO_PRODUCT_ID is not set - create the product in the Dodo dashboard first.");

  // Dodo's metadata values must be strings, so anything structured (like the
  // scores object) is JSON-stringified here and parsed back in the webhook.
  //
  // KNOWN RISK: most payment processors cap individual metadata string
  // values (often a few hundred characters). scanDetails is now JSON-
  // stringified into metadata too, and it's larger than scores was. If
  // Dodo rejects the session for an oversized metadata value, the fix is
  // trimming scanDetails to only the fields report_generator.py actually
  // uses before stringifying, rather than sending the whole raw object.
  const stringMeta = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (v === undefined || v === null) continue;
    stringMeta[k] = typeof v === "string" ? v : JSON.stringify(v);
  }

  const res = await fetch(`${DODO_API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email },
      return_url: returnUrl,
      metadata: stringMeta,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dodo checkout session failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    checkoutUrl: data.checkout_url || data.url,
    sessionId: data.session_id || data.id,
  };
}

/**
 * Verifies a Dodo webhook signature.
 *
 * Dodo uses the Standard Webhooks spec: the signature is an HMAC-SHA256 of
 * "{id}.{timestamp}.{body}" keyed on your webhook secret, base64-encoded.
 *
 * ALWAYS verify before trusting a webhook - without this, anyone who finds
 * your webhook URL could POST a fake "payment succeeded" event and get a
 * free report.
 *
 * @param {object} headers - the raw request headers
 * @param {string} rawBody - the raw, UNPARSED request body string
 * @returns {boolean}
 */
function verifyWebhookSignature(headers, rawBody) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("DODO_WEBHOOK_SECRET not set - refusing to trust webhook.");
    return false;
  }

  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject old timestamps to prevent replay attacks (5 minute window)
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    console.error("Webhook timestamp outside tolerance - possible replay.");
    return false;
  }

  // The secret is prefixed "whsec_" and base64-encoded after that prefix
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedPayload).digest("base64");

  // The header can carry several space-separated "v1,<sig>" values
  const provided = signatureHeader.split(" ").map((p) => p.split(",")[1]).filter(Boolean);

  return provided.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, so guard first
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

module.exports = { createCheckoutSession, verifyWebhookSignature, DODO_API_BASE };
