// services/orders.js
// Lightweight order storage using a local JSON file - no database setup
// needed to get started. Stores only what the Privacy Policy discloses:
// email, business name, country, and payment reference. No personal name,
// no precise location beyond country - if you want to collect those later,
// update the Privacy Policy first, then add the fields here.

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "..", "data", "orders.json");

function ensureDataFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
}

function readOrders() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  ensureDataFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2));
}

/**
 * Saves a new order.
 * @param {object} order - { email, businessName, countryCode, amount, currency, paymentId }
 * @returns {object} the saved order, with an id and timestamp added
 */
function saveOrder(order) {
  const orders = readOrders();
  const record = {
    id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    email: order.email,
    businessName: order.businessName,
    countryCode: order.countryCode,
    amount: order.amount,
    currency: order.currency,
    paymentId: order.paymentId || null,
    reportId: order.reportId || null,
    createdAt: new Date().toISOString(),
  };
  orders.push(record);
  writeOrders(orders);
  return record;
}

function getAllOrders() {
  return readOrders();
}

function getOrderByReportId(reportId) {
  return readOrders().find(o => o.reportId === reportId) || null;
}

function getOrdersByCountry() {
  const orders = readOrders();
  const counts = {};
  for (const o of orders) {
    counts[o.countryCode] = (counts[o.countryCode] || 0) + 1;
  }
  return counts;
}

/**
 * Updates an existing order by reportId, merging in extra fields.
 * Used after report generation to store reportData for PDF regeneration.
 */
function updateOrderByReportId(reportId, extraFields) {
  const orders = readOrders();
  const idx = orders.findIndex(o => o.reportId === reportId);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...extraFields };
  writeOrders(orders);
  return orders[idx];
}

module.exports = { saveOrder, getAllOrders, getOrderByReportId, getOrdersByCountry, updateOrderByReportId };
