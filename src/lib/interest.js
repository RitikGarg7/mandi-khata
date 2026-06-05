const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(fromDateStr, today) {
  if (!fromDateStr) return 0;
  return Math.max(0, Math.floor((today - new Date(fromDateStr)) / MS_PER_DAY));
}

/**
 * Computes accrued simple interest for a party using the running-balance method:
 * each debit entry adds interest from its date, each credit entry subtracts it.
 * This matches: "50k loan from D1, 10k repaid at D2 → interest on 50k from D1 minus interest on 10k from D2"
 */
export function computeInterest(party, partyLedger) {
  const rate = party.interest_rate || 0;
  if (rate <= 0) return 0;

  const today = new Date();
  let total = 0;

  // Opening balance: use opening_balance_date, fall back to created_at, then skip
  const obDate = party.opening_balance_date || party.created_at?.substring(0, 10);
  if (party.opening_balance && obDate) {
    total += party.opening_balance * (rate / 100) * (daysBetween(obDate, today) / 365);
  }

  for (const entry of partyLedger) {
    if (!entry.date) continue;
    const days = daysBetween(entry.date, today);
    const net = (entry.debit || 0) - (entry.credit || 0);
    total += net * (rate / 100) * (days / 365);
  }

  return Math.max(0, total);
}
