/**
 * services/interestCalculator.js
 *
 * Mandi lending interest calculator.
 *
 * RULES:
 * 1. Single running balance — new loans ADD to existing principal
 * 2. First day EXCLUDED — loan given 1 Jan → interest starts 2 Jan
 * 3. Two modes:
 *    - 365: exact calendar days (Jan=31, Feb=28/29, Mar=31...)
 *    - 360: every month = 30 days (89 days still = 89 days, just divisor changes)
 * 4. Compound on 1st April every financial year
 * 5. Interest only when balance > 0 (farmer owes arhtiya)
 *
 * EXAMPLE (360 mode):
 *   2 Jan → 31 Mar:  ₹5,00,000 × 12% × 89/360  = ₹14,833
 *   🔄 1 Apr:         ₹5,14,833 new principal
 *   2 Apr → 1 Jun:   ₹5,14,833 × 12% × 61/360  = ₹10,466
 *   2 Jun → 12 Jun:  ₹5,64,833 × 12% × 10/360  = ₹1,883  ← ₹50,000 added
 */

import { FINANCIAL_YEAR_START } from "../constants/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function exactDays(fromDate, toDate) {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((toDate - fromDate) / MS);
}

function calcInterest(principal, annualRate, days, mode) {
  if (principal <= 0 || annualRate <= 0 || days <= 0) return 0;
  const divisor = mode === "360" ? 360 : 365;
  return principal * (annualRate / 100) * (days / divisor);
}

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

function toDateStr(date) {
  return new Date(date).toISOString().split("T")[0];
}

// ── Main trail builder ────────────────────────────────────────────────────────

/**
 * buildPartyInterestTrail(party, partyLedger, today, mode)
 *
 * Single running balance approach:
 * - All money given (opening balance + nakad dena) adds to running balance
 * - Balance changes on the DAY AFTER money is given (first day excluded)
 * - Payments reduce balance immediately (on the payment day)
 * - Interest calculated on running balance between each event
 * - Compounds on 1st April every year
 *
 * Returns array of segments for display in byaaj trail popover.
 */
export function buildPartyInterestTrail(party, partyLedger, today = new Date(), mode = "365") {
  const annualRate = party.interest_rate || 0;
  if (annualRate <= 0) {
    return { segments: [], totalInterest: 0 };
  }

  // ── Build timeline of all balance-changing events ──────────────────────────
  // Each event: { date: Date, balanceChange: number, label: string }
  const events = [];

  // Opening balance — interest starts day AFTER
  const obDate = party.opening_balance_date
    || party.created_at?.substring(0, 10)
    || toDateStr(new Date());

  if (party.opening_balance > 0) {
    const startDate = new Date(obDate);
    startDate.setDate(startDate.getDate() + 1); // exclude first day
    events.push({
      date:          startDate,
      balanceChange: party.opening_balance,
      label:         `Opening Balance — ₹${party.opening_balance.toLocaleString("en-IN")}`,
      date:          obDate,
      type:          "loan",
    });
  }

  // Ledger entries
  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  for (const e of sorted) {
    if (!e.date) continue;

    if (e.debit > 0 && e.source_type === "payment") {
      // Money given to farmer — interest starts NEXT day (first day excluded)
      const d = new Date(e.date);
      d.setDate(d.getDate() + 1);
      events.push({
        date:          d,
        balanceChange: e.debit,
        label:         `${e.narration || "Nakad diya"} — ₹${e.debit.toLocaleString("en-IN")}`,
        type:          "loan",
      });
    } else if (e.credit > 0) {
      // Farmer paid back — reduces balance on payment day itself
      events.push({
        date:          new Date(e.date),
        balanceChange: -e.credit,
        label:         `${e.narration || "Payment"} — ₹${e.credit.toLocaleString("en-IN")}`,
        amount:        e.credit,
        type:          "payment",
      });
    }
  }

  if (events.length === 0) return { segments: [], totalInterest: 0 };

  // Sort events by date
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  events.forEach(e => { e.date = new Date(e.date); });

  const firstDate = events[0].date;

  // Add 1st April compounding points
  const apr1Dates = getApril1Dates(new Date(firstDate), new Date(today));

  // Merge all checkpoints: events + apr1 dates + today
  const allCheckpoints = [
    ...events.map(e => ({ date: new Date(e.date), event: e })),
    ...apr1Dates.map(d => ({ date: new Date(d), isCompound: true })),
    { date: new Date(today), isEnd: true },
  ].sort((a, b) => a.date - b.date);

  // ── Process timeline ───────────────────────────────────────────────────────
  const segments   = [];
  let balance      = 0;
  let totalInterest = 0;
  let interestSinceCompound = 0;
  let prevDate     = null;

  for (let i = 0; i < allCheckpoints.length; i++) {
    const cp = allCheckpoints[i];

    // Calculate interest for period from prevDate to cp.date
    if (prevDate !== null && balance > 0) {
      const days     = exactDays(prevDate, cp.date);
      const interest = calcInterest(balance, annualRate, days, mode);

      if (days > 0) {
        totalInterest         += interest;
        interestSinceCompound += interest;

        segments.push({
          fromDate:      prevDate,
          toDate:        cp.date,
          days,
          principal:     Math.round(balance * 100) / 100,
          interest:      Math.round(interest * 100) / 100,
          isCompounding: false,
          isEnd:         !!cp.isEnd,
        });
      }
    }

    if (cp.isCompound) {
      // 1 April: add accrued interest to balance
      const added = Math.round(interestSinceCompound * 100) / 100;
      if (added > 0) {
        balance += interestSinceCompound;
        segments.push({
          fromDate:      cp.date,
          toDate:        cp.date,
          days:          0,
          principal:     Math.round((balance - interestSinceCompound) * 100) / 100,
          interest:      0,
          isCompounding: true,
          addedInterest: added,
          newPrincipal:  Math.round(balance * 100) / 100,
        });
        interestSinceCompound = 0;
      }
    } else if (cp.event) {
      // Balance change event
      balance += cp.event.balanceChange;
      if (!cp.isEnd) {
        segments.push({
          fromDate:      cp.date,
          toDate:        cp.date,
          days:          0,
          principal:     Math.round(balance * 100) / 100,
          interest:      0,
          isEvent:       true,
          eventLabel:    cp.event.label,
          eventType:     cp.event.type,
          balanceAfter:  Math.round(balance * 100) / 100,
        });
      }
    }

    prevDate = cp.date;
  }

  return {
    segments,
    totalInterest: Math.round(totalInterest * 100) / 100,
  };
}

/**
 * computeInterest — returns total interest number
 */
export function computeInterest(party, partyLedger, today = new Date(), mode = "365") {
  if ((party.interest_rate || 0) <= 0) return 0;
  const { totalInterest } = buildPartyInterestTrail(party, partyLedger, today, mode);
  return totalInterest;
}

// backward compat
export function buildInterestTrail(party, partyLedger, today = new Date()) {
  const { segments } = buildPartyInterestTrail(party, partyLedger, today);
  return segments;
}
