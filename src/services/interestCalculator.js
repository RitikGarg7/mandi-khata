/**
 * services/interestCalculator.js
 *
 * Interest calculation service for mandi lending.
 *
 * RULES:
 * 1. Rate is monthly (e.g. 1% per month)
 * 2. Simple interest within a financial year (1 Apr → 31 Mar)
 * 3. Compound on 1st April every year (principal += accrued interest)
 * 4. Interest ONLY when balance > 0 (farmer owes arhtiya)
 * 5. Balance ≤ 0 = arhtiya owes farmer = interest free
 * 6. Payments reduce PRINCIPAL first, interest recalculates on new principal
 * 7. Partial months prorated at 30 days/month (mandi convention)
 *
 * SIGN CONVENTION (matches trueBalance in AppContext):
 *   balance > 0 = farmer owes arhtiya → interest accrues
 *   balance < 0 = arhtiya owes farmer → interest free
 */

import { FINANCIAL_YEAR_START, INTEREST_DAYS_IN_MONTH } from "../constants/index.js";

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Get all 1st April dates between two dates (compounding points)
 */
function getCompoundingDates(fromDate, toDate) {
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

/**
 * Calculate months between two dates using calendar month counting
 * Partial months prorated at 30 days/month
 *
 * e.g. 1 Jan → 13 Apr = 3 months + 12 days = 3 + 12/30 = 3.4 months
 */
function monthsBetween(fromDate, toDate) {
  let years  = toDate.getFullYear() - fromDate.getFullYear();
  let months = toDate.getMonth()    - fromDate.getMonth();
  let days   = toDate.getDate()     - fromDate.getDate();

  let totalMonths = years * 12 + months;

  if (days < 0) {
    totalMonths--;
    days += INTEREST_DAYS_IN_MONTH;
  }

  return totalMonths + (days / INTEREST_DAYS_IN_MONTH);
}

// ── Interest trail builder ────────────────────────────────────────────────────

/**
 * buildInterestTrail(party, partyLedger, today?)
 *
 * Returns a detailed breakdown of how interest accrued over time.
 * Used by both computeInterest() and the byaaj trail popover.
 *
 * Returns array of segments:
 * [
 *   {
 *     fromDate, toDate,
 *     principal,      // balance during this period
 *     months,         // duration in months
 *     interest,       // interest for this segment
 *     isCompounding,  // true if this is a 1st April compound event
 *     newPrincipal,   // only on compounding segments
 *     label,          // human readable description
 *   }
 * ]
 */
export function buildInterestTrail(party, partyLedger, today = new Date()) {
  // interest_rate is stored as annual % (e.g. 12 = 12% per year = 1% per month)
  // Divide by 12 to get monthly rate for calculations
  const annualRate  = party.interest_rate || 0;
  const monthlyRate = annualRate / 12;
  if (annualRate <= 0) return [];

  // Build timeline of all balance-changing events
  const events = [];

  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && obDate) {
    events.push({ date: new Date(obDate), change: party.opening_balance });
  }

  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const e of sorted) {
    if (!e.date) continue;
    events.push({ date: new Date(e.date), change: (e.debit || 0) - (e.credit || 0) });
  }

  if (events.length === 0) return [];

  // Add 1st April compounding markers
  const allEvents = [...events];
  const apr1Dates = getCompoundingDates(events[0].date, today);
  for (const d of apr1Dates) {
    allEvents.push({ date: d, change: 0, isCompounding: true });
  }
  allEvents.sort((a, b) => a.date - b.date);

  // Build segments
  const trail = [];
  let balance                 = 0;
  let interestSinceCompound   = 0;
  let prevDate                = null;

  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];

    if (prevDate !== null && balance > 0) {
      const months   = monthsBetween(prevDate, event.date);
      const interest = months > 0 ? balance * (monthlyRate / 100) * months : 0;

      if (months > 0) {
        interestSinceCompound += interest;
        trail.push({
          fromDate:     prevDate,
          toDate:       event.date,
          principal:    balance,
          months:       Math.round(months * 100) / 100,
          interest:     Math.round(interest * 100) / 100,
          isCompounding: false,
          label:        formatPeriodLabel(prevDate, event.date, months),
        });
      }
    }

    if (event.isCompounding) {
      if (interestSinceCompound > 0) {
        const newPrincipal = balance + interestSinceCompound;
        trail.push({
          fromDate:      event.date,
          toDate:        event.date,
          principal:     balance,
          months:        0,
          interest:      0,
          isCompounding: true,
          newPrincipal,
          addedInterest: Math.round(interestSinceCompound * 100) / 100,
          label:         `🔄 1 April compound — ₹${Math.round(interestSinceCompound)} principal mein joda`,
        });
        balance = newPrincipal;
        interestSinceCompound = 0;
      }
    } else {
      balance += event.change;
    }

    prevDate = event.date;
  }

  // Final segment to today
  if (prevDate !== null && balance > 0) {
    const months   = monthsBetween(prevDate, today);
    const interest = months > 0 ? balance * (monthlyRate / 100) * months : 0;
    if (months > 0) {
      trail.push({
        fromDate:     prevDate,
        toDate:       today,
        principal:    balance,
        months:       Math.round(months * 100) / 100,
        interest:     Math.round(interest * 100) / 100,
        isCompounding: false,
        label:        formatPeriodLabel(prevDate, today, months),
      });
    }
  }

  return trail;
}

/**
 * computeInterest(party, partyLedger, today?)
 *
 * Returns total accrued interest (number).
 * Uses buildInterestTrail internally.
 */
export function computeInterest(party, partyLedger, today = new Date()) {
  const trail = buildInterestTrail(party, partyLedger, today);
  return trail
    .filter(s => !s.isCompounding)
    .reduce((sum, s) => sum + s.interest, 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPeriodLabel(fromDate, toDate, months) {
  const from = fromDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const to   = toDate.toLocaleDateString("en-IN",   { day: "numeric", month: "short", year: "numeric" });
  const fullMonths = Math.floor(months);
  const days = Math.round((months - fullMonths) * INTEREST_DAYS_IN_MONTH);

  let duration = "";
  if (fullMonths > 0) duration += `${fullMonths} mahine`;
  if (days > 0)       duration += `${fullMonths > 0 ? " " : ""}${days} din`;

  return `${from} → ${to} (${duration})`;
}
