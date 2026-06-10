/**
 * interest.js — Mandi lending interest calculator
 *
 * RULES (as per mandi convention):
 *
 * 1. SIMPLE INTEREST within a financial year
 *    Rate is monthly (e.g. 1% per month)
 *    Partial months prorated at 30 days/month
 *
 * 2. COMPOUNDING on 1st April every year
 *    Accrued interest added to principal at start of each new financial year
 *    This is "annual compounding at financial year end" — standard mandi practice
 *
 * 3. SIGN CONVENTION (matches trueBalance in AppContext):
 *    balance > 0 = farmer OWES arhtiya → interest accrues
 *    balance < 0 = arhtiya OWES farmer → interest FREE (farmer's own money)
 *
 * 4. RUNNING BALANCE:
 *    Interest calculated on the NET balance at each point in time
 *    Payments/credits reduce the principal, new advances increase it
 *
 * EXAMPLE:
 *   Loan: ₹100 given 1 Jan 2024, rate 1%/month
 *
 *   1 Jan 2024 → 31 Mar 2024 (3 months):
 *     Interest = 100 × 1% × 3 = ₹3
 *
 *   1 Apr 2024: Compound → new principal = ₹103
 *
 *   1 Apr 2024 → 31 Mar 2025 (12 months):
 *     Interest = 103 × 1% × 12 = ₹12.36
 *
 *   1 Apr 2025: Compound → new principal = ₹115.36
 *
 *   1 Apr 2025 → 13 Apr 2025 (13 days):
 *     Interest = 115.36 × 1% × (13/30) = ₹0.50
 *
 *   Total interest = ₹15.86
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

// Get financial year start (1 Apr) for a given date
function fyStart(date) {
  const y = date.getMonth() >= 3  // April = month 3
    ? date.getFullYear()
    : date.getFullYear() - 1;
  return new Date(y, 3, 1); // 1 April
}

// Get all 1st April dates between two dates (compounding points)
function getAprilFirstDates(fromDate, toDate) {
  const dates = [];
  // Start from the first April 1st AFTER fromDate
  let year = fromDate.getMonth() >= 3
    ? fromDate.getFullYear() + 1
    : fromDate.getFullYear();

  while (true) {
    const apr1 = new Date(year, 3, 1); // 1 April of that year
    if (apr1 >= toDate) break;
    if (apr1 > fromDate) dates.push(apr1);
    year++;
  }
  return dates;
}

// Calculate months between two dates using calendar month counting
// e.g. 1 Jan → 13 Apr = 3 months + 12 days = 3.4 months
function monthsBetween(fromDate, toDate) {
  let years  = toDate.getFullYear() - fromDate.getFullYear();
  let months = toDate.getMonth()    - fromDate.getMonth();
  let days   = toDate.getDate()     - fromDate.getDate();

  let totalMonths = years * 12 + months;

  if (days < 0) {
    totalMonths--;
    days += 30; // partial month treated as 30-day month
  }

  return totalMonths + (days / 30);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * computeInterest(party, partyLedger)
 *
 * Calculates total accrued interest for a party using:
 * - Running balance method (payments reduce principal)
 * - Annual compounding on 1st April
 * - Monthly simple interest within each financial year
 * - Interest only on positive balance (farmer owes arhtiya)
 */
export function computeInterest(party, partyLedger) {
  const monthlyRate = party.interest_rate || 0; // e.g. 1 = 1% per month
  if (monthlyRate <= 0) return 0;

  const today = new Date();

  // ── Build timeline of all balance-changing events ──────────────────────────
  const events = [];

  // Opening balance
  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && obDate) {
    events.push({
      date:   new Date(obDate),
      change: party.opening_balance, // positive = loan given = farmer owes
    });
  }

  // Ledger entries
  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const e of sorted) {
    if (!e.date) continue;
    events.push({
      date:   new Date(e.date),
      change: (e.debit || 0) - (e.credit || 0),
    });
  }

  if (events.length === 0) return 0;

  // ── Process each segment between events ────────────────────────────────────
  // A "segment" is a period where balance is constant between two events.
  // Within each segment, we may cross one or more 1st April boundaries (compounding points).

  let balance       = 0; // running balance
  let totalInterest = 0; // accumulated interest

  // We track a "compounded principal" separately for the interest-on-interest calculation.
  // After each 1st April, accrued interest is added to compoundedPrincipal.
  // But since we use running balance method, we actually just use balance directly
  // and compound it at each April 1st.

  // Build complete timeline including April 1st compounding points
  const allEvents = [...events];

  // Add April 1st markers between first event and today
  if (events.length > 0) {
    const apr1Dates = getAprilFirstDates(events[0].date, today);
    for (const d of apr1Dates) {
      allEvents.push({ date: d, change: 0, isCompounding: true });
    }
  }

  // Sort all events + compounding points by date
  allEvents.sort((a, b) => a.date - b.date);

  // Track accrued interest since last compounding point
  let interestSinceLastCompound = 0;
  let prevDate = null;

  for (let i = 0; i < allEvents.length; i++) {
    const event = allEvents[i];

    if (prevDate !== null && balance > 0) {
      // Calculate simple interest for this segment
      const months = monthsBetween(prevDate, event.date);
      if (months > 0) {
        const segmentInterest = balance * (monthlyRate / 100) * months;
        interestSinceLastCompound += segmentInterest;
        totalInterest             += segmentInterest;
      }
    }

    if (event.isCompounding) {
      // 1st April: add accrued interest to balance (compound it)
      // This means next period's interest earns on principal + previous interest
      if (interestSinceLastCompound > 0) {
        balance += interestSinceLastCompound;
        interestSinceLastCompound = 0;
      }
    } else {
      // Regular transaction: update balance
      balance += event.change;
    }

    prevDate = event.date;
  }

  // Final segment: from last event to today
  if (prevDate !== null && balance > 0) {
    const months = monthsBetween(prevDate, today);
    if (months > 0) {
      totalInterest += balance * (monthlyRate / 100) * months;
    }
  }

  return Math.max(0, totalInterest);
}
