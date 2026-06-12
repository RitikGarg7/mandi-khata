/**
 * services/interestCalculator.js
 *
 * Mandi lending interest calculator — clean rewrite.
 *
 * RULES:
 * 1. Single rate per farmer (from party.interest_rate — annual %)
 * 2. First day EXCLUDED — loan given 1 Jan → interest starts 2 Jan
 * 3. Two modes:
 *    - 365: exact calendar days (Jan=31, Feb=28/29, Mar=31...)
 *    - 360: every month = 30 days
 * 4. Compound on 1st April every financial year
 * 5. Interest only when balance > 0 (farmer owes arhtiya)
 * 6. Each money-given entry tracked separately with its own trail
 *
 * SIGN CONVENTION (matches trueBalance in AppContext):
 *   balance > 0 = farmer owes arhtiya → interest accrues
 *   balance ≤ 0 = arhtiya owes farmer → interest FREE
 */

import { FINANCIAL_YEAR_START } from "../constants/index.js";

// ── Day counting ──────────────────────────────────────────────────────────────

/**
 * Count exact calendar days between two dates (end exclusive)
 * e.g. 1 Jan → 1 Apr = 90 days
 */
function exactDays(fromDate, toDate) {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((toDate - fromDate) / MS);
}

/**
 * Calculate interest for a given number of days
 * mode: "365" = exact days, "360" = 30-day months
 */
function calcInterest(principal, annualRate, days, mode) {
  if (principal <= 0 || annualRate <= 0 || days <= 0) return 0;
  const divisor = mode === "360" ? 360 : 365;
  return principal * (annualRate / 100) * (days / divisor);
}

// ── Financial year helpers ────────────────────────────────────────────────────

/**
 * Get all 1st April dates strictly between fromDate and toDate
 */
function getApril1Dates(fromDate, toDate) {
  const dates = [];
  let year = fromDate.getMonth() >= FINANCIAL_YEAR_START.month
    ? fromDate.getFullYear() + 1
    : fromDate.getFullYear();
  while (true) {
    const apr1 = new Date(year, FINANCIAL_YEAR_START.month, FINANCIAL_YEAR_START.day);
    if (apr1 >= toDate) break;
    if (apr1 > fromDate) dates.push(apr1);
    year++;
  }
  return dates;
}

// ── Per-entry trail builder ───────────────────────────────────────────────────

/**
 * buildEntryTrail(entry, annualRate, today, mode)
 *
 * Builds interest trail for a SINGLE money-given entry.
 *
 * entry: { date: "YYYY-MM-DD", amount: number, narration: string }
 * annualRate: annual interest rate (e.g. 12 = 12%/year)
 * today: Date object
 * mode: "360" | "365"
 *
 * Returns:
 * {
 *   entry,
 *   segments: [ { fromDate, toDate, days, principal, interest, isCompounding, ... } ],
 *   totalInterest: number,
 *   currentPrincipal: number,  // principal after compounding
 * }
 */
export function buildEntryTrail(entry, annualRate, today, mode = "365") {
  const loanDate  = new Date(entry.date);
  // RULE: exclude first day — interest starts from day 2
  const interestStart = new Date(loanDate);
  interestStart.setDate(interestStart.getDate() + 1);

  if (interestStart >= today) {
    return { entry, segments: [], totalInterest: 0, currentPrincipal: entry.amount };
  }

  // Get all 1 April compounding points between interestStart and today
  const apr1Dates = getApril1Dates(interestStart, today);

  // Build timeline: interestStart → [apr1, apr1, ...] → today
  const checkpoints = [interestStart, ...apr1Dates, today];

  const segments = [];
  let principal          = entry.amount;
  let totalInterest      = 0;
  let interestSinceApr   = 0;

  for (let i = 0; i < checkpoints.length - 1; i++) {
    const from = checkpoints[i];
    const to   = checkpoints[i + 1];
    const isCompoundPoint = i + 1 < checkpoints.length - 1; // all except last

    const days     = exactDays(from, to);
    const interest = calcInterest(principal, annualRate, days, mode);

    totalInterest    += interest;
    interestSinceApr += interest;

    segments.push({
      fromDate:      from,
      toDate:        to,
      days,
      principal:     Math.round(principal * 100) / 100,
      interest:      Math.round(interest * 100) / 100,
      isCompounding: false,
    });

    // 1 April: compound — add accumulated interest to principal
    if (isCompoundPoint) {
      const addedInterest = Math.round(interestSinceApr * 100) / 100;
      const newPrincipal  = principal + interestSinceApr;

      segments.push({
        fromDate:      to,
        toDate:        to,
        days:          0,
        principal,
        interest:      0,
        isCompounding: true,
        addedInterest,
        newPrincipal:  Math.round(newPrincipal * 100) / 100,
      });

      principal          = newPrincipal;
      interestSinceApr   = 0;
    }
  }

  return {
    entry,
    segments,
    totalInterest:    Math.round(totalInterest * 100) / 100,
    currentPrincipal: Math.round(principal * 100) / 100,
  };
}

// ── Full party interest ───────────────────────────────────────────────────────

/**
 * buildPartyInterestTrail(party, partyLedger, today, mode)
 *
 * Builds complete interest trail for a party across all money-given entries.
 * Each debit entry (arhtiya gave money) gets its own trail.
 * Credit entries (farmer paid back) reduce the running balance but don't
 * earn separate interest — they reduce the oldest outstanding principal.
 *
 * Returns:
 * {
 *   entryTrails: [ { entry, segments, totalInterest, currentPrincipal } ],
 *   totalInterest: number,
 *   totalOutstanding: number,
 * }
 */
export function buildPartyInterestTrail(party, partyLedger, today = new Date(), mode = "365") {
  const annualRate = party.interest_rate || 0;
  if (annualRate <= 0) {
    return { entryTrails: [], totalInterest: 0, totalOutstanding: 0 };
  }

  // Collect all money-given entries (debits = arhtiya gave money to farmer)
  const moneyGiven = [];

  // Opening balance counts as first loan
  if (party.opening_balance > 0) {
    const obDate = party.opening_balance_date
      || party.created_at?.substring(0, 10)
      || new Date().toISOString().substring(0, 10);
    moneyGiven.push({
      date:      obDate,
      amount:    party.opening_balance,
      narration: "Opening Balance (Loan diya)",
      id:        "__opening__",
    });
  }

  // Nakad dena and other debit payments
  const debits = partyLedger
    .filter(e => e.debit > 0 && e.source_type === "payment")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  for (const e of debits) {
    moneyGiven.push({
      date:      e.date,
      amount:    e.debit,
      narration: e.narration || "Nakad diya",
      id:        e.id,
    });
  }

  // Build trail per entry
  const entryTrails = moneyGiven.map(entry =>
    buildEntryTrail(entry, annualRate, today, mode)
  );

  const totalInterest    = entryTrails.reduce((s, t) => s + t.totalInterest, 0);
  const totalOutstanding = entryTrails.reduce((s, t) => s + t.currentPrincipal, 0) + totalInterest;

  return {
    entryTrails,
    totalInterest:    Math.round(totalInterest * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
  };
}

/**
 * computeInterest(party, partyLedger, today, mode)
 * Simple total — used by Khata header and Parties list
 */
export function computeInterest(party, partyLedger, today = new Date(), mode = "365") {
  if ((party.interest_rate || 0) <= 0) return 0;
  const { totalInterest } = buildPartyInterestTrail(party, partyLedger, today, mode);
  return totalInterest;
}

// ── Legacy export (backward compat) ──────────────────────────────────────────
export function buildInterestTrail(party, partyLedger, today = new Date()) {
  // Returns flat segments for backward compat — used by old useKhata
  const { entryTrails } = buildPartyInterestTrail(party, partyLedger, today);
  return entryTrails.flatMap(t => t.segments);
}
