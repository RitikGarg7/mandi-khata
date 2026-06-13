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
 *    - 360: every month = 30 days (same day count, divisor changes)
 * 4. Compound on 1st April every financial year
 * 5. Interest only when balance > 0 (farmer owes arhtiya)
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

// Always convert to Date object — prevents getMonth errors from string dates
function asDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return new Date(d); // clone
  return new Date(d); // parse string
}

function getApril1Dates(fromDate, toDate) {
  const from = asDate(fromDate); // ensure Date object
  const to   = asDate(toDate);   // ensure Date object
  const dates = [];
  let year = from.getMonth() >= FINANCIAL_YEAR_START.month
    ? from.getFullYear() + 1
    : from.getFullYear();
  while (true) {
    const apr1 = new Date(year, FINANCIAL_YEAR_START.month, FINANCIAL_YEAR_START.day);
    if (apr1 >= to) break;
    if (apr1 > from) dates.push(apr1);
    year++;
  }
  return dates;
}

// ── Main trail builder ────────────────────────────────────────────────────────

export function buildPartyInterestTrail(party, partyLedger, today = new Date(), mode = "365") {
  const annualRate = party.interest_rate || 0;
  if (annualRate <= 0) return { segments: [], totalInterest: 0 };

  const todayDate = asDate(today);

  // ── Build events list ───────────────────────────────────────────────────────
  const events = [];

  // Opening balance — interest starts day AFTER loan date (first day excluded)
  const obDateStr = party.opening_balance_date
    || party.created_at?.substring(0, 10)
    || todayDate.toISOString().substring(0, 10);

  if (party.opening_balance > 0) {
    const loanDate  = asDate(obDateStr);
    const startDate = asDate(obDateStr); // clone
    startDate.setDate(startDate.getDate() + 1); // day after

    events.push({
      date:          startDate,           // Date object — interest starts here
      displayDate:   obDateStr,           // original loan date for display
      balanceChange: party.opening_balance,
      label:         `Opening Balance — ₹${party.opening_balance.toLocaleString("en-IN")}`,
      type:          "loan",
    });
  }

  // Ledger entries
  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  for (const e of sorted) {
    if (!e.date) continue;

    if (e.debit > 0 && e.source_type === "payment") {
      // Nakad dena — interest starts NEXT day
      const startDate = asDate(e.date);
      startDate.setDate(startDate.getDate() + 1);
      events.push({
        date:          startDate,
        displayDate:   e.date,
        balanceChange: e.debit,
        label:         `${e.narration || "Nakad diya"} — ₹${e.debit.toLocaleString("en-IN")}`,
        type:          "loan",
      });
    } else if (e.credit > 0) {
      // Payment received — reduces balance on payment day
      events.push({
        date:          asDate(e.date),
        displayDate:   e.date,
        balanceChange: -e.credit,
        label:         `${e.narration || "Payment"} — ₹${e.credit.toLocaleString("en-IN")}`,
        type:          "payment",
      });
    }
  }

  if (events.length === 0) return { segments: [], totalInterest: 0 };

  // Sort by date — all dates are now guaranteed Date objects
  events.sort((a, b) => a.date - b.date);

  const firstDate = events[0].date;

  // Get 1st April compounding points
  const apr1Dates = getApril1Dates(firstDate, todayDate);

  // Merge all checkpoints
  const allCheckpoints = [
    ...events.map(e => ({ date: e.date, event: e })),
    ...apr1Dates.map(d => ({ date: d, isCompound: true })),
    { date: todayDate, isEnd: true },
  ].sort((a, b) => a.date - b.date);

  // ── Process timeline ────────────────────────────────────────────────────────
  const segments          = [];
  let balance             = 0;
  let totalInterest       = 0;
  let interestSinceCompound = 0;
  let prevDate            = null;

  for (let i = 0; i < allCheckpoints.length; i++) {
    const cp = allCheckpoints[i];

    // Interest for period from prevDate → cp.date
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
          isEvent:       false,
        });
      }
    }

    if (cp.isCompound) {
      // 1 April compound
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
          isEvent:       false,
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
          fromDate:     cp.event.displayDate ? asDate(cp.event.displayDate) : cp.date,
          toDate:       cp.date,
          days:         0,
          principal:    Math.round(balance * 100) / 100,
          interest:     0,
          isCompounding: false,
          isEvent:      true,
          eventLabel:   cp.event.label,
          eventType:    cp.event.type,
          balanceAfter: Math.round(balance * 100) / 100,
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

export function computeInterest(party, partyLedger, today = new Date(), mode = "365") {
  if ((party.interest_rate || 0) <= 0) return 0;
  const { totalInterest } = buildPartyInterestTrail(party, partyLedger, today, mode);
  return totalInterest;
}

export function buildInterestTrail(party, partyLedger, today = new Date()) {
  const { segments } = buildPartyInterestTrail(party, partyLedger, today);
  return segments;
}
