const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(fromDateStr, toDate) {
  if (!fromDateStr) return 0;
  return Math.max(0, Math.floor((toDate - new Date(fromDateStr)) / MS_PER_DAY));
}

/**
 * computeInterest — running balance interest with sign-aware logic
 *
 * KEY RULE (agreed with client):
 *   Interest is charged ONLY when the running balance is NEGATIVE
 *   (i.e. farmer owes arhtiya money).
 *
 *   When balance is POSITIVE (arhtiya owes farmer — "Humara dena baaki"),
 *   the farmer is withdrawing his own money → ZERO interest.
 *
 * METHOD: Day-weighted running balance
 *   For each period between transactions, we calculate:
 *     interest += negative_balance × rate × days / 365
 *   Positive balance periods contribute 0 interest.
 *
 * TIMELINE EXAMPLE:
 *   01 Apr: Opening loan -₹50,000  → balance -₹50,000 → interest accrues
 *   01 Jun: Form J +₹1,34,547      → balance +₹84,547 → interest STOPS
 *   15 Jun: Cash advance -₹20,000  → balance +₹64,547 → still 0 interest
 *   01 Jul: Cash advance -₹70,000  → balance -₹5,453  → interest RESTARTS
 */
export function computeInterest(party, partyLedger) {
  const rate = party.interest_rate || 0;
  if (rate <= 0) return 0;

  const today = new Date();

  // Build a timeline of (date, balance_change) events
  // Starting with opening balance
  const events = [];

  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && obDate) {
    // Opening balance: positive means farmer owes arhtiya (loan given)
    // So it REDUCES the balance from arhtiya's perspective → negative for farmer
    events.push({ date: obDate, change: party.opening_balance });
  }

  // Add all ledger entries sorted by date
  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const e of sorted) {
    if (!e.date) continue;
    // debit = farmer took money (reduces balance), credit = farmer gave money (increases balance)
    events.push({ date: e.date, change: (e.debit || 0) - (e.credit || 0) });
  }

  if (events.length === 0) return 0;

  // Calculate interest on negative balance periods only
  let balance    = 0;
  let totalInterest = 0;

  for (let i = 0; i < events.length; i++) {
    const curr    = events[i];
    const nextDate = i + 1 < events.length ? new Date(events[i + 1].date) : today;
    const currDate = new Date(curr.date);

    // Apply this event's change
    balance += curr.change;

    // Calculate days until next event
    const days = Math.max(0, Math.floor((nextDate - currDate) / MS_PER_DAY));

    // Only charge interest if balance is NEGATIVE (farmer owes arhtiya)
    if (balance > 0 && days > 0) {
      // Balance positive = arhtiya owes farmer = interest free
      // Do nothing
    } else if (balance < 0 && days > 0) {
      // Balance negative = farmer owes arhtiya = interest accrues
      totalInterest += Math.abs(balance) * (rate / 100) * (days / 365);
    }
  }

  return Math.max(0, totalInterest);
}
