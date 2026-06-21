/**
 * services/interestCalculator.js
 *
 * CONVENTIONS:
 * 1. Rate stored as % per month (e.g. 1 = 1% per month)
 * 2. Full months → P × monthlyRate × fullMonths
 * 3. Partial days → P × annualRate × days / 365 (366 in leap year)
 * 4. Day counting: first day IN, last day IN (arhtiya convention)
 * 5. Simple interest within financial year (1 Apr → 31 Mar)
 * 6. Compound on 1st April: accrued interest added to principal
 * 7. Interest ONLY when balance > 0 (farmer owes arhtiya)
 *
 * Example: 1 Jan → 31 Mar, ₹24L @ 1%/month = 3 months exactly = ₹72,000 ✓
 */

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Interest for a period.
 * fromDate: first day IN (inclusive)
 * toDateInclusive: last day IN (inclusive)
 *
 * Full calendar months use monthly rate.
 * Remaining partial days use annual rate × days/365.
 */
function interestForPeriod(principal, monthlyRate, fromDate, toDateInclusive) {
  if (principal <= 0 || monthlyRate <= 0) return 0;
  const annualRate = monthlyRate * 12;

  // Convert last-day-inclusive to exclusive for arithmetic
  const toEx = new Date(toDateInclusive);
  toEx.setDate(toEx.getDate() + 1);

  let y = toEx.getFullYear() - fromDate.getFullYear();
  let m = toEx.getMonth()    - fromDate.getMonth();
  let d = toEx.getDate()     - fromDate.getDate();

  let fullMonths = y * 12 + m;
  if (d < 0) { fullMonths--; d += 30; }

  const monthlyInterest = principal * (monthlyRate / 100) * fullMonths;
  const daysYear        = isLeapYear(toDateInclusive.getFullYear()) ? 366 : 365;
  const partialInterest = d > 0 ? principal * (annualRate / 100) * d / daysYear : 0;

  return monthlyInterest + partialInterest;
}

function monthsAndDays(fromDate, toDateInclusive) {
  const toEx = new Date(toDateInclusive);
  toEx.setDate(toEx.getDate() + 1);

  let y = toEx.getFullYear() - fromDate.getFullYear();
  let m = toEx.getMonth()    - fromDate.getMonth();
  let d = toEx.getDate()     - fromDate.getDate();

  let fullMonths = y * 12 + m;
  if (d < 0) { fullMonths--; d += 30; }

  return { fullMonths, partialDays: d };
}

function durationLabel(fullMonths, partialDays) {
  let s = "";
  if (fullMonths > 0) s += `${fullMonths} mahine`;
  if (partialDays > 0) s += `${fullMonths > 0 ? " " : ""}${partialDays} din`;
  return s || "0 din";
}

function fmtDate(date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Get all 1st April dates strictly between fromDate and toDate (both inclusive) */
function getApril1Dates(fromDate, toDate) {
  const dates = [];
  let year = fromDate.getFullYear();
  if (fromDate >= new Date(year, 3, 1)) year++;
  while (true) {
    const apr1 = new Date(year, 3, 1);
    if (apr1 > toDate) break;
    dates.push(apr1);
    year++;
  }
  return dates;
}

// ── Main trail builder ────────────────────────────────────────────────────────

export function buildInterestTrail(party, partyLedger, today = new Date()) {
  const monthlyRate = parseFloat(party.interest_rate) || 0;
  if (monthlyRate <= 0) return [];

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

  const todayNorm = new Date(today); todayNorm.setHours(0, 0, 0, 0);

  // Merge April 1 compounding markers
  const allEvents = [...events];
  for (const d of getApril1Dates(events[0].date, todayNorm)) {
    allEvents.push({ date: d, isCompounding: true, change: 0 });
  }
  allEvents.sort((a, b) => a.date - b.date);

  const trail = [];
  let balance         = 0;
  let interestAccrued = 0;
  let prevDate        = null;

  for (const event of allEvents) {
    // Segment: prevDate (IN) → day before event (IN)
    if (prevDate !== null && balance > 0) {
      const segTo = new Date(event.date);
      segTo.setDate(segTo.getDate() - 1); // day before event = last day IN

      if (segTo >= prevDate) {
        const interest = interestForPeriod(balance, monthlyRate, prevDate, segTo);
        const { fullMonths, partialDays } = monthsAndDays(prevDate, segTo);

        if (interest > 0) {
          interestAccrued += interest;
          trail.push({
            type:        "interest",
            fromDate:    prevDate,
            toDate:      segTo,
            principal:   Math.round(balance),
            fullMonths,
            partialDays,
            interest:    Math.round(interest * 100) / 100,
            label:       `${fmtDate(prevDate)} → ${fmtDate(segTo)}`,
            duration:    durationLabel(fullMonths, partialDays),
          });
        }
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
      balance  += event.change;
      prevDate  = event.date;
    }
  }

  // Final segment: prevDate (IN) → today (IN)
  if (prevDate !== null && balance > 0 && todayNorm >= prevDate) {
    const interest = interestForPeriod(balance, monthlyRate, prevDate, todayNorm);
    const { fullMonths, partialDays } = monthsAndDays(prevDate, todayNorm);

    if (interest > 0) {
      trail.push({
        type:        "interest",
        fromDate:    prevDate,
        toDate:      todayNorm,
        principal:   Math.round(balance),
        fullMonths,
        partialDays,
        interest:    Math.round(interest * 100) / 100,
        label:       `${fmtDate(prevDate)} → Aaj`,
        duration:    durationLabel(fullMonths, partialDays),
      });
    }
  }

  return trail;
}

export function computeInterest(party, partyLedger, today = new Date()) {
  return buildInterestTrail(party, partyLedger, today)
    .filter(s => s.type === "interest")
    .reduce((sum, s) => sum + s.interest, 0);
}
