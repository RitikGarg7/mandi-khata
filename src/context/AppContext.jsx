/**
 * context/AppContext.jsx
 *
 * Global state management for Mandi Khata.
 *
 * Responsibilities:
 * - Hold all decrypted app data in memory (parties, bills, ledger, etc.)
 * - Provide CRUD operations that handle encryption + Firestore + state updates
 * - Provide computed values (balance, interest)
 *
 * What it does NOT do:
 * - Business calculations → services/billCalculations.js
 * - Interest math        → services/interestCalculator.js
 * - Ledger transforms    → services/ledgerService.js
 * - UI logic             → hooks/
 */

import { createContext, useContext, useState, useCallback } from "react";
import { auth, db, signOut } from "../lib/firebase";
import { deriveKey, encrypt, decrypt, decryptRows } from "../lib/crypto";
import { computeInterest } from "../services/interestCalculator";
import { fetchWaParties, markWaPartyImported } from "../services/waImport";
import {
  calcTrueBalance,
  calcPartyBalance,
  makePurchaseBillEntry,
  makeSaleBillEntry,
  makePaymentEntry,
  findExpenseAccount,
} from "../services/ledgerService";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession]             = useState(null);
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

  // ── Auth ──────────────────────────────────────────────────────────────────────

  const unlock = useCallback(async (fireUser, pin) => {
    const key = await deriveKey(fireUser.uid, pin);
    const rawSettings = await db.getSettings();
    if (rawSettings) {
      try { await decrypt(key, rawSettings.data); }
      catch { throw new Error("Galat PIN. Dobara try karein."); }
    }
    setSession(fireUser);
    setEncKey(key);
    setPinVerifier(await encrypt(key, { v: "MANDI_KHATA_OK" }));
    return key;
  }, []);

  const loadAll = useCallback(async (key, fireUser) => {
    setLoading(true); setError(null);
    try {
      const [rawSettings, rawParties, rawPBills, rawSBills, rawPayments, rawLedger] =
        await Promise.all([
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
      const decParties = rawParties.length ? await decryptRows(key, rawParties) : [];
      setPurchaseBills(rawPBills.length ? await decryptRows(key, rawPBills)   : []);
      setSaleBills(rawSBills.length     ? await decryptRows(key, rawSBills)   : []);
      setPayments(rawPayments.length    ? await decryptRows(key, rawPayments) : []);
      setLedger(rawLedger.length        ? await decryptRows(key, rawLedger)   : []);

      // ── Import WhatsApp parties ─────────────────────────────────────────────
      let allParties = decParties;
      if (fireUser?.phoneNumber) {
        console.log("[WA Import] Checking for phone:", fireUser.phoneNumber);
        const waParties = await fetchWaParties(fireUser.phoneNumber);
        console.log("[WA Import] Found parties:", waParties.length, waParties);
        if (waParties.length > 0) {
          const imported = [];
          for (const wp of waParties) {
            const partyData = {
              name:                 wp.name,
              opening_balance:      wp.opening_balance || 0,
              opening_balance_date: wp.opening_balance_date || new Date().toISOString().split("T")[0],
              interest_rate:        wp.interest_rate || 0,
              type:                 wp.type || "Farmer",
              source:               "whatsapp",
            };
            const blob  = await encrypt(key, partyData);
            const newId = await db.upsert("parties", null, blob);
            imported.push({ id: newId, ...partyData });
            await markWaPartyImported(fireUser.phoneNumber, wp.docId);
          }
          allParties = [...imported, ...decParties];
        }
      }
      setParties(allParties);
      // ───────────────────────────────────────────────────────────────────────

    } catch (e) {
      setLoading(false);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setSession(null); setEncKey(null); setSettings(null);
    setParties([]); setPurchaseBills([]); setSaleBills([]);
    setPayments([]); setLedger([]);
  }, []);

  const verifyPin = useCallback(async (enteredPin) => {
    if (!session || !pinVerifier) return false;
    try {
      const testKey = await deriveKey(session.uid, enteredPin);
      const result  = await decrypt(testKey, pinVerifier);
      return result?.v === "MANDI_KHATA_OK";
    } catch { return false; }
  }, [session, pinVerifier]);

  // ── Private ledger helpers ────────────────────────────────────────────────────

  const _addLedgerEntry = useCallback(async (entry) => {
    const blob = await encrypt(encKey, entry);
    const id   = await db.upsert("ledger", null, blob);
    setLedger(prev => [{ id, ...entry }, ...prev]);
  }, [encKey]);

  const _deleteLedgerFor = useCallback(async (sourceType, sourceId) => {
    const toRemove = ledger.filter(e => e.source_type === sourceType && e.source_id === sourceId);
    await Promise.all(toRemove.map(e => db.delete("ledger", e.id)));
    setLedger(prev => prev.filter(e => !(e.source_type === sourceType && e.source_id === sourceId)));
  }, [ledger]);

  const _writePurchaseBillLedger = useCallback(async (billId, billData) => {
    await _addLedgerEntry(makePurchaseBillEntry(billId, billData));
    if ((billData.labour_amount || 0) > 0) {
      const exp = findExpenseAccount(parties, ["Mazdoori", "Labour"]);
      if (exp) await _addLedgerEntry({
        party_id: exp.id, date: billData.date, entry_type: "credit",
        debit: 0, credit: billData.labour_amount,
        narration: `${billData.series}/${billData.bill_number} — Mazdoori`,
        source_type: "purchase_bill", source_id: billId,
      });
    }
  }, [parties, _addLedgerEntry]);

  const _writeSaleBillLedger = useCallback(async (billId, billData) => {
    await _addLedgerEntry(makeSaleBillEntry(billId, billData));
    if ((billData.auc_amount || 0) > 0) {
      const dal = findExpenseAccount(parties, "Dalali");
      if (dal) await _addLedgerEntry({
        party_id: dal.id, date: billData.date, entry_type: "credit",
        debit: 0, credit: billData.auc_amount,
        narration: `${billData.series}/${billData.bill_number} — Dalali`,
        source_type: "sale_bill", source_id: billId,
      });
    }
    if ((billData.labour_amount || 0) > 0) {
      const maz = findExpenseAccount(parties, ["Mazdoori", "Labour"]);
      if (maz) await _addLedgerEntry({
        party_id: maz.id, date: billData.date, entry_type: "credit",
        debit: 0, credit: billData.labour_amount,
        narration: `${billData.series}/${billData.bill_number} — Mazdoori`,
        source_type: "sale_bill", source_id: billId,
      });
    }
  }, [parties, _addLedgerEntry]);

  // ── Party CRUD ────────────────────────────────────────────────────────────────

  const saveParty = useCallback(async (partyData, id = null) => {
    const blob  = await encrypt(encKey, partyData);
    const newId = await db.upsert("parties", id, blob);
    const saved = { id: newId, ...partyData };
    setParties(prev => id ? prev.map(p => p.id === id ? saved : p) : [saved, ...prev]);
    return newId;
  }, [encKey]);

  // ── Purchase bill CRUD ────────────────────────────────────────────────────────

  const savePurchaseBill = useCallback(async (billData) => {
    const blob   = await encrypt(encKey, billData);
    const billId = await db.upsert("purchase_bills", null, blob);
    setPurchaseBills(prev => [{ id: billId, ...billData }, ...prev]);
    await _writePurchaseBillLedger(billId, billData);
    return billId;
  }, [encKey, _writePurchaseBillLedger]);

  const updatePurchaseBill = useCallback(async (billId, billData) => {
    const blob = await encrypt(encKey, billData);
    await db.upsert("purchase_bills", billId, blob);
    setPurchaseBills(prev => prev.map(b => b.id === billId ? { id: billId, ...billData } : b));
    await _deleteLedgerFor("purchase_bill", billId);
    await _writePurchaseBillLedger(billId, billData);
  }, [encKey, _deleteLedgerFor, _writePurchaseBillLedger]);

  const deletePurchaseBill = useCallback(async (billId) => {
    await db.delete("purchase_bills", billId);
    setPurchaseBills(prev => prev.filter(b => b.id !== billId));
    await _deleteLedgerFor("purchase_bill", billId);
  }, [_deleteLedgerFor]);

  // ── Sale bill CRUD ────────────────────────────────────────────────────────────

  const saveSaleBill = useCallback(async (billData) => {
    const blob   = await encrypt(encKey, billData);
    const billId = await db.upsert("sale_bills", null, blob);
    setSaleBills(prev => [{ id: billId, ...billData }, ...prev]);
    await _writeSaleBillLedger(billId, billData);
    return billId;
  }, [encKey, _writeSaleBillLedger]);

  const updateSaleBill = useCallback(async (billId, billData) => {
    const blob = await encrypt(encKey, billData);
    await db.upsert("sale_bills", billId, blob);
    setSaleBills(prev => prev.map(b => b.id === billId ? { id: billId, ...billData } : b));
    await _deleteLedgerFor("sale_bill", billId);
    await _writeSaleBillLedger(billId, billData);
  }, [encKey, _deleteLedgerFor, _writeSaleBillLedger]);

  const deleteSaleBill = useCallback(async (billId) => {
    await db.delete("sale_bills", billId);
    setSaleBills(prev => prev.filter(b => b.id !== billId));
    await _deleteLedgerFor("sale_bill", billId);
  }, [_deleteLedgerFor]);

  // ── Payment CRUD ──────────────────────────────────────────────────────────────

  const savePayment = useCallback(async (paymentData) => {
    const blob  = await encrypt(encKey, paymentData);
    const payId = await db.upsert("payments", null, blob);
    setPayments(prev => [{ id: payId, ...paymentData }, ...prev]);
    const entry = makePaymentEntry(payId, paymentData);
    const lBlob = await encrypt(encKey, entry);
    const lId   = await db.upsert("ledger", null, lBlob);
    setLedger(prev => [{ id: lId, ...entry }, ...prev]);
    return payId;
  }, [encKey]);

  const deletePayment = useCallback(async (paymentId) => {
    await db.delete("payments", paymentId);
    setPayments(prev => prev.filter(p => p.id !== paymentId));
    await _deleteLedgerFor("payment", paymentId);
  }, [_deleteLedgerFor]);

  // ── Settings ──────────────────────────────────────────────────────────────────

  const saveSettings = useCallback(async (settingsData) => {
    const blob = await encrypt(encKey, settingsData);
    const id   = await db.saveSettings(settings?.id || null, blob);
    setSettings({ id, ...settingsData });
  }, [encKey, settings]);

  // ── Computed values ───────────────────────────────────────────────────────────

  const partyBalance = useCallback((partyId) =>
    calcPartyBalance(partyId, ledger),
  [ledger]);

  const trueBalance = useCallback((party) =>
    calcTrueBalance(party, ledger),
  [ledger]);

  const computePartyInterest = useCallback((party) => {
    if (!party) return 0;
    return computeInterest(party, ledger.filter(e => e.party_id === party.id));
  }, [ledger]);

  return (
    <AppContext.Provider value={{
      session, encKey, settings,
      parties, purchaseBills, saleBills, payments, ledger,
      loading, error,
      unlock, loadAll, logout, verifyPin,
      saveParty,
      savePurchaseBill, updatePurchaseBill, deletePurchaseBill,
      saveSaleBill,     updateSaleBill,     deleteSaleBill,
      savePayment,      deletePayment,
      saveSettings,
      partyBalance, trueBalance, computePartyInterest,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
