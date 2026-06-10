const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * computeInterest — running balance interest, sign-aware
 *
 * SIGN CONVENTION (matches trueBalance in AppContext):
 *   balance > 0 = farmer OWES arhtiya (loan outstanding) → interest ACCRUES
 *   balance < 0 = arhtiya OWES farmer (farmer's money kept) → interest FREE
 *   balance = 0 = settled → no interest
 *
 * EXAMPLE:
 *   01 Apr: Opening loan +₹2,00,000   → balance +₹2,00,000 → interest accrues
 *   10 Jun: Vapis +₹1,00,000 credit   → balance +₹1,05,000 → interest accrues
 *   01 Jul: Form J credit ₹3,00,000   → balance -₹1,95,000 → interest FREE
 *   15 Jul: Nakad diya ₹50,000        → balance -₹1,45,000 → still free
 *   01 Aug: Nakad diya ₹2,00,000      → balance +₹55,000   → interest restarts
 */
export function computeInterest(party, partyLedger) {
  const rate = party.interest_rate || 0;
  if (rate <= 0) return 0;

  const today = new Date();

  // Build timeline of events sorted by date
  const events = [];

  // Opening balance event
  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && obDate) {
    events.push({ date: obDate, change: party.opening_balance });
  }

  // Ledger entries sorted by date
  const sorted = [...partyLedger].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const e of sorted) {
    if (!e.date) continue;
    events.push({ date: e.date, change: (e.debit || 0) - (e.credit || 0) });
  }

  if (events.length === 0) return 0;

  let balance       = 0;
  let totalInterest = 0;

  for (let i = 0; i < events.length; i++) {
    const curr     = events[i];
    const currDate = new Date(curr.date);
    const nextDate = i + 1 < events.length ? new Date(events[i + 1].date) : today;

    balance += curr.change;

    const days = Math.max(0, Math.floor((nextDate - currDate) / MS_PER_DAY));

    // Interest only when balance > 0 (farmer owes arhtiya)
    if (balance > 0 && days > 0) {
      totalInterest += balance * (rate / 100) * (days / 365);
    }
    // balance <= 0 = arhtiya owes farmer = interest free, no accrual
  }

  return Math.max(0, totalInterest);
}
