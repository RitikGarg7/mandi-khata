import { createContext, useContext, useState, useCallback } from "react";
import { auth, db, signOut } from "../lib/firebase";
import { deriveKey, encrypt, decrypt, decryptRows } from "../lib/crypto";
import { computeInterest } from "../lib/interest";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession]             = useState(null);  // Firebase User object
  const [encKey, setEncKey]               = useState(null);
  const [settings, setSettings]           = useState(null);
  const [parties, setParties]             = useState([]);
  const [purchaseBills, setPurchaseBills] = useState([]);
  const [saleBills, setSaleBills]         = useState([]);
  const [payments, setPayments]           = useState([]);
  const [ledger, setLedger]               = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [pinVerifier, setPinVerifier]     = useState(null);

  // fireUser = Firebase User object (has .uid, .phoneNumber)
  // unlock() now VERIFIES the PIN is correct before accepting it.
  // For existing users: tries to decrypt the settings blob — wrong PIN = AES-GCM
  // auth tag mismatch = throws = rejected.
  // For brand-new users (no settings yet): just derive and accept (they're setting PIN for first time).
  const unlock = useCallback(async (fireUser, pin) => {
    const uid = fireUser.uid;
    const key = await deriveKey(uid, pin);

    // Verify PIN against stored encrypted data (existing users only)
    const rawSettings = await db.getSettings();
    if (rawSettings) {
      // This throws if PIN is wrong — AES-GCM integrity check fails
      try {
        await decrypt(key, rawSettings.data);
      } catch {
        throw new Error("Galat PIN. Dobara try karein.");
      }
    }
    // PIN is correct — commit to state
    setSession(fireUser);
    setEncKey(key);
    const verifier = await encrypt(key, { v: "MANDI_KHATA_OK" });
    setPinVerifier(verifier);
    return key;
  }, []);

  const loadAll = useCallback(async (key) => {
    setLoading(true);
    setError(null);
    try {
      const [rawSettings, rawParties, rawPBills, rawSBills, rawPayments, rawLedger] = await Promise.all([
        db.getSettings(),
        db.getAll("parties"),
        db.getAll("purchase_bills"),
        db.getAll("sale_bills"),
        db.getAll("payments"),
        db.getAll("ledger"),
      ]);
      if (rawSettings) {
        const dec = await decrypt(key, rawSettings.data);
        setSettings({ id: rawSettings.id, ...dec });
      }
      // decryptRows throws if key is wrong — this is intentional, protects data integrity
      setParties(rawParties.length        ? await decryptRows(key, rawParties)   : []);
      setPurchaseBills(rawPBills.length   ? await decryptRows(key, rawPBills)    : []);
      setSaleBills(rawSBills.length       ? await decryptRows(key, rawSBills)    : []);
      setPayments(rawPayments.length      ? await decryptRows(key, rawPayments)  : []);
      setLedger(rawLedger.length          ? await decryptRows(key, rawLedger)    : []);
    } catch (e) {
      // Re-throw so Login.jsx can catch and show "wrong PIN" or network error
      setLoading(false);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveParty = useCallback(async (partyData, id = null) => {
    const blob = await encrypt(encKey, partyData);
    const newId = await db.upsert("parties", id, blob);
    const saved = { id: newId, ...partyData };
    setParties(prev => id ? prev.map(p => p.id === id ? saved : p) : [saved, ...prev]);
    return newId;
  }, [encKey]);

  // ── Ledger helpers ────────────────────────────────────────────────────────────

  const addLedgerEntry = useCallback(async (entry) => {
    const blob = await encrypt(encKey, entry);
    const id = await db.upsert("ledger", null, blob);
    setLedger(prev => [{ id, ...entry }, ...prev]);
  }, [encKey]);

  const _writeSaleBillLedger = useCallback(async (billId, billData) => {
    const narration = `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`;
    await addLedgerEntry({ party_id: billData.party_id, date: billData.date, entry_type: "debit", debit: billData.total_bill, credit: 0, narration, source_type: "sale_bill", source_id: billId });
    if ((billData.auc_amount || 0) > 0) {
      const p = parties.find(p => p.type === "Expense" && p.expense_category === "Dalali");
      if (p) await addLedgerEntry({ party_id: p.id, date: billData.date, entry_type: "credit", debit: 0, credit: billData.auc_amount, narration: `${narration} — Dalali`, source_type: "sale_bill", source_id: billId });
    }
    if ((billData.labour_amount || 0) > 0) {
      const p = parties.find(p => p.type === "Expense" && ["Mazdoori","Labour"].includes(p.expense_category));
      if (p) await addLedgerEntry({ party_id: p.id, date: billData.date, entry_type: "credit", debit: 0, credit: billData.labour_amount, narration: `${narration} — Mazdoori`, source_type: "sale_bill", source_id: billId });
    }
  }, [parties, addLedgerEntry]);

  const _writePurchaseBillLedger = useCallback(async (billId, billData) => {
    const narration = `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`;
    await addLedgerEntry({ party_id: billData.party_id, date: billData.date, entry_type: "credit", debit: 0, credit: billData.net_payable, narration, source_type: "purchase_bill", source_id: billId });
    if ((billData.labour_amount || 0) > 0) {
      const p = parties.find(p => p.type === "Expense" && ["Mazdoori","Labour"].includes(p.expense_category));
      if (p) await addLedgerEntry({ party_id: p.id, date: billData.date, entry_type: "credit", debit: 0, credit: billData.labour_amount, narration: `${narration} — Mazdoori`, source_type: "purchase_bill", source_id: billId });
    }
  }, [parties, addLedgerEntry]);

  const _deleteLedgerFor = useCallback(async (sourceType, sourceId) => {
    const toRemove = ledger.filter(e => e.source_type === sourceType && e.source_id === sourceId);
    await Promise.all(toRemove.map(e => db.delete("ledger", e.id)));
    setLedger(prev => prev.filter(e => !(e.source_type === sourceType && e.source_id === sourceId)));
  }, [ledger]);

  // ── Bill operations ───────────────────────────────────────────────────────────

  const savePurchaseBill = useCallback(async (billData) => {
    const blob = await encrypt(encKey, billData);
    const billId = await db.upsert("purchase_bills", null, blob);
    setPurchaseBills(prev => [{ id: billId, ...billData }, ...prev]);
    await _writePurchaseBillLedger(billId, billData);
    return billId;
  }, [encKey, _writePurchaseBillLedger]);

  const saveSaleBill = useCallback(async (billData) => {
    const blob = await encrypt(encKey, billData);
    const billId = await db.upsert("sale_bills", null, blob);
    setSaleBills(prev => [{ id: billId, ...billData }, ...prev]);
    await _writeSaleBillLedger(billId, billData);
    return billId;
  }, [encKey, _writeSaleBillLedger]);

  const deleteSaleBill = useCallback(async (billId) => {
    await db.delete("sale_bills", billId);
    setSaleBills(prev => prev.filter(b => b.id !== billId));
    await _deleteLedgerFor("sale_bill", billId);
  }, [_deleteLedgerFor]);

  const deletePurchaseBill = useCallback(async (billId) => {
    await db.delete("purchase_bills", billId);
    setPurchaseBills(prev => prev.filter(b => b.id !== billId));
    await _deleteLedgerFor("purchase_bill", billId);
  }, [_deleteLedgerFor]);

  const updateSaleBill = useCallback(async (billId, billData) => {
    const blob = await encrypt(encKey, billData);
    await db.upsert("sale_bills", billId, blob);
    setSaleBills(prev => prev.map(b => b.id === billId ? { id: billId, ...billData } : b));
    await _deleteLedgerFor("sale_bill", billId);
    await _writeSaleBillLedger(billId, billData);
  }, [encKey, _deleteLedgerFor, _writeSaleBillLedger]);

  const updatePurchaseBill = useCallback(async (billId, billData) => {
    const blob = await encrypt(encKey, billData);
    await db.upsert("purchase_bills", billId, blob);
    setPurchaseBills(prev => prev.map(b => b.id === billId ? { id: billId, ...billData } : b));
    await _deleteLedgerFor("purchase_bill", billId);
    await _writePurchaseBillLedger(billId, billData);
  }, [encKey, _deleteLedgerFor, _writePurchaseBillLedger]);

  // ── Payment operations ────────────────────────────────────────────────────────

  const savePayment = useCallback(async (paymentData) => {
    const blob = await encrypt(encKey, paymentData);
    const payId = await db.upsert("payments", null, blob);
    setPayments(prev => [{ id: payId, ...paymentData }, ...prev]);
    const isDebit = ["bank_payment", "cash_payment"].includes(paymentData.type);
    const ledgerEntry = {
      party_id: paymentData.party_id,
      date: paymentData.date,
      entry_type: isDebit ? "debit" : "credit",
      debit: isDebit ? paymentData.amount : 0,
      credit: isDebit ? 0 : paymentData.amount,
      narration: paymentData.narration || paymentData.type,
      source_type: "payment",
      source_id: payId,
    };
    const lBlob = await encrypt(encKey, ledgerEntry);
    const lId = await db.upsert("ledger", null, lBlob);
    setLedger(prev => [{ id: lId, ...ledgerEntry }, ...prev]);
    return payId;
  }, [encKey]);

  const deletePayment = useCallback(async (paymentId) => {
    await db.delete("payments", paymentId);
    setPayments(prev => prev.filter(p => p.id !== paymentId));
    await _deleteLedgerFor("payment", paymentId);
  }, [_deleteLedgerFor]);

  // ── Settings / auth ───────────────────────────────────────────────────────────

  const saveSettings = useCallback(async (settingsData) => {
    const blob = await encrypt(encKey, settingsData);
    const id = await db.saveSettings(settings?.id || null, blob);
    setSettings({ id, ...settingsData });
  }, [encKey, settings]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setSession(null); setEncKey(null); setSettings(null);
    setParties([]); setPurchaseBills([]); setSaleBills([]);
    setPayments([]); setLedger([]);
  }, []);

  // ── Computed values ───────────────────────────────────────────────────────────

  const partyBalance = useCallback((partyId) => {
    return ledger
      .filter(e => e.party_id === partyId)
      .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);
  }, [ledger]);

  const trueBalance = useCallback((party) => {
    if (!party) return 0;
    return (party.opening_balance || 0) + partyBalance(party.id);
  }, [partyBalance]);

  const computePartyInterest = useCallback((party) => {
    if (!party) return 0;
    return computeInterest(party, ledger.filter(e => e.party_id === party.id));
  }, [ledger]);

  const verifyPin = useCallback(async (enteredPin) => {
    if (!session || !pinVerifier) return false;
    try {
      const testKey = await deriveKey(session.uid, enteredPin);
      const result  = await decrypt(testKey, pinVerifier);
      return result?.v === "MANDI_KHATA_OK";
    } catch {
      return false;
    }
  }, [session, pinVerifier]);

  return (
    <AppContext.Provider value={{
      session, encKey, settings, parties, purchaseBills, saleBills, payments, ledger,
      loading, error,
      unlock, loadAll, logout,
      saveParty, savePurchaseBill, saveSaleBill, savePayment, saveSettings,
      deleteSaleBill, deletePurchaseBill, deletePayment,
      updateSaleBill, updatePurchaseBill,
      partyBalance, trueBalance, computePartyInterest, verifyPin,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
