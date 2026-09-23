// services/pricing.js
// Flat single price for every buyer, everywhere.
//
// This replaced an earlier PPP/region-tiered system. The business now sells
// only into Western markets (US, Canada, UK, Europe, Australia, NZ) at one
// price, which also keeps the "One price. Everywhere. No exceptions."
// promise on the landing page literally true.
//
// IMPORTANT: this constant is for DISPLAY on the site only. The amount the
// customer is actually charged is set on the product in the Dodo Payments
// dashboard, not here. If you change the price, change it in BOTH places or
// the site will advertise a different number than it charges.

const REPORT_PRICE_USD = 129;
const REPORT_CURRENCY = "USD";

/**
 * Returns the display price. Takes no country argument by design - there is
 * deliberately no regional variation.
 */
function getPrice() {
  return {
    currency: REPORT_CURRENCY,
    price: REPORT_PRICE_USD,
    display: `$${REPORT_PRICE_USD}`,
  };
}

module.exports = { getPrice, REPORT_PRICE_USD, REPORT_CURRENCY };
