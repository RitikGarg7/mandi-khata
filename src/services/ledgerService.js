/**
 * services/ledgerService.js
 *
 * Pure functions for ledger calculations.
 * No state, no API calls — just data transformation.
 */

import { SOURCE_TYPES } from "../constants/index.js";

/**
 * Calculate running balance for a party
 * Returns sum of all debits minus credits from ledger entries
 */
export function calcPartyBalance(partyId, ledger) {
  return ledger
    .filter(e => e.party_id === partyId)
    .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);
}

/**
 * Calculate true balance including opening balance
 * balance > 0 = farmer owes arhtiya
 * balance < 0 = arhtiya owes farmer
 */
export function calcTrueBalance(party, ledger) {
  if (!party) return 0;
  return (party.opening_balance || 0) + calcPartyBalance(party.id, ledger);
}

/**
 * Build ledger entries with running balance for display
 * Sorted by date ascending (oldest first)
 */
export function buildLedgerWithRunningBalance(party, ledger) {
  const partyLedger = ledger
    .filter(e => e.party_id === party.id)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // Add opening balance as the first entry if it exists
  const openingEntry = (party.opening_balance && party.opening_balance !== 0)
    ? [{
        id:             "__opening__",
        party_id:       party.id,
        date:           party.opening_balance_date || party.created_at?.substring(0, 10) || "",
        narration:      "Opening Balance (Loan diya)",
        debit:          party.opening_balance > 0 ? party.opening_balance : 0,
        credit:         party.opening_balance < 0 ? Math.abs(party.opening_balance) : 0,
        source_type:    "opening",
        running_balance: party.opening_balance,
      }]
    : [];

  let running = party.opening_balance || 0;
  const entries = partyLedger.map(e => {
    running += (e.debit || 0) - (e.credit || 0);
    return { ...e, running_balance: running };
  });

  // Combine and re-sort by date so opening entry sits in correct position
  return [...openingEntry, ...entries]
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/**
 * Build ledger entry for a purchase bill (Form J)
 */
export function makePurchaseBillEntry(billId, billData) {
  const narration = `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`;
  return {
    party_id:    billData.party_id,
    date:        billData.date,
    entry_type:  "credit",
    debit:       0,
    credit:      billData.net_payable,
    narration,
    source_type: SOURCE_TYPES.PURCHASE_BILL,
    source_id:   billId,
  };
}

/**
 * Build ledger entry for a sale bill (Form I)
 */
export function makeSaleBillEntry(billId, billData) {
  const narration = `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`;
  return {
    party_id:    billData.party_id,
    date:        billData.date,
    entry_type:  "debit",
    debit:       billData.total_bill,
    credit:      0,
    narration,
    source_type: SOURCE_TYPES.SALE_BILL,
    source_id:   billId,
  };
}

/**
 * Build ledger entry for a payment
 * Payments are cash_payment/bank_payment = debit (farmer took money)
 * Receipts are cash_receipt/bank_receipt = credit (farmer gave money)
 */
export function makePaymentEntry(payId, paymentData) {
  const isDebit = ["bank_payment", "cash_payment"].includes(paymentData.type);
  return {
    party_id:    paymentData.party_id,
    date:        paymentData.date,
    entry_type:  isDebit ? "debit" : "credit",
    debit:       isDebit ? paymentData.amount : 0,
    credit:      isDebit ? 0 : paymentData.amount,
    narration:   paymentData.narration || paymentData.type,
    source_type: SOURCE_TYPES.PAYMENT,
    source_id:   payId,
  };
}

/**
 * Find expense account by category
 */
export function findExpenseAccount(parties, category) {
  return parties.find(p =>
    p.type === "Expense" &&
    (Array.isArray(category)
      ? category.includes(p.expense_category)
      : p.expense_category === category)
  );
}
