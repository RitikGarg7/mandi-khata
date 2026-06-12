/**
 * constants/index.js
 *
 * All app-wide constants in one place.
 * Never hardcode these values in components or services.
 */

// ── Commodities ───────────────────────────────────────────────────────────────
export const COMMODITIES = ["Wheat", "Paddy", "Bajra", "Maize", "Mustard", "Other"];

// ── Bill series ───────────────────────────────────────────────────────────────
export const BILL_SERIES = ["Form J1", "Form J2", "Form J3"];

// ── Party types ───────────────────────────────────────────────────────────────
export const PARTY_TYPES = {
  FARMER:   "Farmer",
  CUSTOMER: "Customer",
  EXPENSE:  "Expense",
  BANK:     "Bank",
};

// ── Expense categories ────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = ["Dalali", "Mazdoori", "Labour", "Office", "Transport", "Misc"];

// ── Payment types ─────────────────────────────────────────────────────────────
export const PAYMENT_TYPES = {
  BANK_RECEIPT: "bank_receipt",
  BANK_PAYMENT: "bank_payment",
  CASH_RECEIPT: "cash_receipt",
  CASH_PAYMENT: "cash_payment",
};

export const PAYMENT_TYPE_LABELS = {
  bank_receipt: "Bank Receipt (paisa aaya)",
  bank_payment: "Bank Payment (paisa diya)",
  cash_receipt: "Cash Receipt",
  cash_payment: "Cash Payment",
};

// ── Indian states ─────────────────────────────────────────────────────────────
export const STATES = ["Haryana", "Punjab", "Uttar Pradesh", "Rajasthan", "Delhi", "Other"];

// ── Interest / financial year ─────────────────────────────────────────────────
// Financial year in India: 1 April → 31 March
// Compounding happens on 1st April every year (mandi convention)
export const FINANCIAL_YEAR_START = { month: 3, day: 1 }; // month is 0-indexed (3 = April)
export const INTEREST_DAYS_IN_MONTH = 30; // mandi convention: every month = 30 days

// ── Default rates (overridable from settings) ─────────────────────────────────
export const DEFAULTS = {
  labour_rate: 5.32,  // ₹ per bag (utarai)
  mpc_rate:    2.5,   // % aadat/commission on sale bills
  auc_rate:    0.1,   // % dalali on sale bills
};

// ── Ledger source types ───────────────────────────────────────────────────────
export const SOURCE_TYPES = {
  PURCHASE_BILL: "purchase_bill",
  SALE_BILL:     "sale_bill",
  PAYMENT:       "payment",
};
