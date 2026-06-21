/**
 * services/interestCalculator.js
 *
 * CONVENTIONS:
 * 1. Rate stored as % per month (e.g. 1 = 1% per month)
 * 2. Month counting: calendar months + partial days/30
 * 3. Day counting: first day IN, last day OUT (bank standard)
 *    → 1 Jan to 31 Mar = exactly 3 months → ₹24L × 1% × 3 = ₹72,000 ✓
 * 4. Simple interest within financial year (1 Apr → 31 Mar)
 * 5. Compound on 1st April: accrued interest added to principal
 * 6. Interest ONLY when balance > 0 (farmer owes arhtiya)
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Months between two dates.
 * First day IN, last day OUT.
 * Partial months prorated at 30 days/month (mandi convention).
 *
 * Examples:
 *   1 Jan → 31 Mar = 3 months exactly
 *   1 Jan → 15 Mar = 2 months 14 days = 2.467 months
 */
function monthsBetween(fromDate, toDate) {
  let y = toDate.getFullYear() - fromDate.getFullYear();
  let m = toDate.getMonth()    - fromDate.getMonth();
  let d = toDate.getDate()     - fromDate.getDate(); // last day OUT

  let totalMonths = y * 12 + m;
  if (d < 0) { totalMonths--; d += 30; }

  return totalMonths + d / 30;
}

/** Get all 1st April dates strictly between fromDate and toDate */
function getApril1Dates(fromDate, toDate) {
  const dates = [];
  let year = fromDate.getFullYear();
  if (fromDate >= new Date(year, 3, 1)) year++;
  while (true) {
    const apr1 = new Date(year, 3, 1);
    if (apr1 >= toDate) break;
    dates.push(apr1);
    year++;
  }
  return dates;
}

function fmtDate(date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(months) {
  const fullMonths = Math.floor(months);
  const days       = Math.round((months - fullMonths) * 30);
  let s = "";
  if (fullMonths > 0) s += `${fullMonths} mahine`;
  if (days > 0)       s += `${fullMonths > 0 ? " " : ""}${days} din`;
  return s || "0 din";
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
  for (const d of getApril1Dates(events[0].date, today)) {
    allEvents.push({ date: d, isCompounding: true, change: 0 });
  }
  allEvents.sort((a, b) => a.date - b.date);

  // Walk through events building segments
  const trail = [];
  let balance         = 0;
  let interestAccrued = 0;
  let prevDate        = null;

  for (const event of allEvents) {
    // Interest for [prevDate, event.date) — last day OUT = event.date
    if (prevDate !== null && balance > 0) {
      const months   = monthsBetween(prevDate, event.date);
      const interest = months > 0 ? balance * (monthlyRate / 100) * months : 0;

      if (months > 0 && interest > 0) {
        interestAccrued += interest;
        trail.push({
          type:      "interest",
          fromDate:  prevDate,
          toDate:    event.date,
          principal: Math.round(balance),
          months:    Math.round(months * 100) / 100,
          interest:  Math.round(interest * 100) / 100,
          label:     `${fmtDate(prevDate)} → ${fmtDate(event.date)}`,
          duration:  monthLabel(months),
        });
      }
    }

    if (event.isCompounding) {
      if (interestAccrued > 0 && balance > 0) {
        const added = Math.round(interestAccrued * 100) / 100;
        trail.push({
          type:          "compound",
          date:          event.date,
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

  // Final segment: prevDate → today (today is OUT, so last day not counted)
  if (prevDate !== null && balance > 0) {
    const todayDate = new Date(today); todayDate.setHours(0, 0, 0, 0);
    const months    = monthsBetween(prevDate, todayDate);
    const interest  = months > 0 ? balance * (monthlyRate / 100) * months : 0;

    if (months > 0 && interest > 0) {
      trail.push({
        type:      "interest",
        fromDate:  prevDate,
        toDate:    todayDate,
        principal: Math.round(balance),
        months:    Math.round(months * 100) / 100,
        interest:  Math.round(interest * 100) / 100,
        label:     `${fmtDate(prevDate)} → Aaj`,
        duration:  monthLabel(months),
      });
    }
  }

  return trail;
}

/** Total accrued interest */
export function computeInterest(party, partyLedger, today = new Date()) {
  return buildInterestTrail(party, partyLedger, today)
    .filter(s => s.type === "interest")
    .reduce((sum, s) => sum + s.interest, 0);
}
