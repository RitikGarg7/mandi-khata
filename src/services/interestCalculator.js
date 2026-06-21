/**
 * services/interestCalculator.js
 *
 * CONVENTIONS (mandi + RBI aligned):
 * 1. Rate stored as % per month (e.g. 2 means 2% per month)
 * 2. Day counting: Actual days, first day IN last day IN (mandi convention)
 * 3. Days in year: 365 (366 in leap year) — RBI standard
 * 4. Simple interest within financial year (1 Apr → 31 Mar)
 * 5. Compound on 1st April: accrued interest added to principal
 * 6. Interest ONLY when balance > 0 (farmer owes arhtiya)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** Actual days between two dates, first day IN last day IN */
function daysBetween(fromDate, toDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const from = new Date(fromDate); from.setHours(0,0,0,0);
  const to   = new Date(toDate);   to.setHours(0,0,0,0);
  return Math.round((to - from) / msPerDay) + 1; // +1 for last day inclusive
}

/** Interest for a segment (handles year boundary) */
function segmentInterest(principal, monthlyRate, fromDate, toDate) {
  if (principal <= 0) return 0;
  const annualRate = monthlyRate * 12;

  // Split across year boundary if needed
  const fromYear = fromDate.getFullYear();
  const toYear   = toDate.getFullYear();

  if (fromYear === toYear) {
    const days = daysBetween(fromDate, toDate);
    return principal * (annualRate / 100) * days / daysInYear(fromYear);
  }

  // Multi-year: split at Jan 1 boundaries
  let total = 0;
  let cur = new Date(fromDate);
  while (cur.getFullYear() < toYear) {
    const yearEnd = new Date(cur.getFullYear(), 11, 31); // Dec 31
    const days = daysBetween(cur, yearEnd);
    total += principal * (annualRate / 100) * days / daysInYear(cur.getFullYear());
    cur = new Date(cur.getFullYear() + 1, 0, 1); // Jan 1 next year
  }
  const days = daysBetween(cur, toDate);
  total += principal * (annualRate / 100) * days / daysInYear(toYear);
  return total;
}

/** Get all 1st April dates strictly between fromDate and toDate */
function getApril1Dates(fromDate, toDate) {
  const dates = [];
  let year = fromDate.getFullYear();
  // if from is after April 1 this year, start from next year
  if (fromDate >= new Date(year, 3, 1)) year++;
  while (true) {
    const apr1 = new Date(year, 3, 1); // April 1 (month 3 = April)
    if (apr1 > toDate) break;
    dates.push(apr1);
    year++;
  }
  return dates;
}

function fmtDate(date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(days) {
  if (days === 1) return "1 din";
  const months = Math.floor(days / 30);
  const rem    = days % 30;
  let s = "";
  if (months > 0) s += `${months} mahine`;
  if (rem > 0)    s += `${months > 0 ? " " : ""}${rem} din`;
  return s || `${days} din`;
}

// ── Main trail builder ────────────────────────────────────────────────────────

export function buildInterestTrail(party, partyLedger, today = new Date()) {
  const monthlyRate = parseFloat(party.interest_rate) || 0;
  if (monthlyRate <= 0) return [];

  // Build sorted event list
  const events = [];

  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && parseFloat(party.opening_balance) !== 0 && obDate) {
    events.push({ date: new Date(obDate), change: parseFloat(party.opening_balance) });
  }

  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const e of sorted) {
    if (!e.date) continue;
    events.push({ date: new Date(e.date), change: (e.debit || 0) - (e.credit || 0) });
  }

  if (events.length === 0) return [];

  // Merge April 1 compounding markers
  const allEvents = [...events];
  const startDate = events[0].date;
  const todayNorm = new Date(today); todayNorm.setHours(23,59,59,0);
  for (const d of getApril1Dates(startDate, todayNorm)) {
    allEvents.push({ date: d, isCompounding: true, change: 0 });
  }
  allEvents.sort((a, b) => a.date - b.date);

  // Walk through events building segments
  const trail = [];
  let balance = 0;
  let interestAccrued = 0; // since last compound
  let prevDate = null;

  for (const event of allEvents) {
    // Calculate interest for period [prevDate, event.date]
    if (prevDate !== null && balance > 0) {
      // toDate for this segment: if last day inclusive, segment ends day before event
      // But for compounding/new event, we calculate up to event.date (exclusive of event day for new transactions)
      const segTo = new Date(event.date);
      segTo.setDate(segTo.getDate() - 1); // day before event (last day in for previous period)

      if (segTo >= prevDate) {
        const days     = daysBetween(prevDate, segTo);
        const interest = segmentInterest(balance, monthlyRate, prevDate, segTo);

        if (interest > 0) {
          interestAccrued += interest;
          trail.push({
            type:      "interest",
            fromDate:  prevDate,
            toDate:    segTo,
            principal: Math.round(balance),
            days,
            interest:  Math.round(interest * 100) / 100,
            label:     `${fmtDate(prevDate)} → ${fmtDate(segTo)}`,
            duration:  dayLabel(days),
          });
        }
      }
    }

    if (event.isCompounding) {
      if (interestAccrued > 0 && balance > 0) {
        const added = Math.round(interestAccrued * 100) / 100;
        trail.push({
          type:         "compound",
          date:         event.date,
          addedInterest: added,
          oldPrincipal:  Math.round(balance),
          newPrincipal:  Math.round(balance + added),
        });
        balance += added;
        interestAccrued = 0;
      }
      prevDate = event.date;
    } else {
      balance += event.change;
      prevDate = event.date;
    }
  }

  // Final segment to today (today is inclusive)
  if (prevDate !== null && balance > 0) {
    const todayDate = new Date(today); todayDate.setHours(0,0,0,0);
    if (todayDate >= prevDate) {
      const days     = daysBetween(prevDate, todayDate);
      const interest = segmentInterest(balance, monthlyRate, prevDate, todayDate);
      if (interest > 0) {
        interestAccrued += interest;
        trail.push({
          type:      "interest",
          fromDate:  prevDate,
          toDate:    todayDate,
          principal: Math.round(balance),
          days,
          interest:  Math.round(interest * 100) / 100,
          label:     `${fmtDate(prevDate)} → Aaj`,
          duration:  dayLabel(days),
        });
      }
    }
  }

  return trail;
}

/** Total accrued interest from trail */
export function computeInterest(party, partyLedger, today = new Date()) {
  return buildInterestTrail(party, partyLedger, today)
    .filter(s => s.type === "interest")
    .reduce((sum, s) => sum + s.interest, 0);
}
