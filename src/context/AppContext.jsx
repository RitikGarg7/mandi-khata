import { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { deriveKey, encrypt, decrypt, decryptRows } from "../lib/crypto";
import { db } from "../lib/supabase";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);   // supabase auth session
  const [encKey, setEncKey] = useState(null);      // CryptoKey for this session
  const [settings, setSettings] = useState(null);  // decrypted settings object + id
  const [parties, setParties] = useState([]);
  const [purchaseBills, setPurchaseBills] = useState([]);
  const [saleBills, setSaleBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Called after Google auth + PIN entry
  const unlock = useCallback(async (supabaseSession, pin) => {
    const googleId = supabaseSession.user.user_metadata?.sub || supabaseSession.user.id;
    const key = await deriveKey(googleId, pin);
    setSession(supabaseSession);
    setEncKey(key);
    return key;
  }, []);

  // Load all data after unlock
  const loadAll = useCallback(async (key) => {
    setLoading(true);
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

      setParties(rawParties.length ? await decryptRows(key, rawParties) : []);
      setPurchaseBills(rawPBills.length ? await decryptRows(key, rawPBills) : []);
      setSaleBills(rawSBills.length ? await decryptRows(key, rawSBills) : []);
      setPayments(rawPayments.length ? await decryptRows(key, rawPayments) : []);
      setLedger(rawLedger.length ? await decryptRows(key, rawLedger) : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save a party (create or update)
  const saveParty = useCallback(async (partyData, id = null) => {
    const blob = await encrypt(encKey, partyData);
    const newId = await db.upsert("parties", id, blob);
    const saved = { id: newId, ...partyData };
    setParties(prev => id ? prev.map(p => p.id === id ? saved : p) : [saved, ...prev]);
    return newId;
  }, [encKey]);

  // Save a purchase bill + ledger entries
  const savePurchaseBill = useCallback(async (billData) => {
    const blob = await encrypt(encKey, billData);
    const billId = await db.upsert("purchase_bills", null, blob);
    const saved = { id: billId, ...billData };
    setPurchaseBills(prev => [saved, ...prev]);

    // Create ledger entry for farmer: credit (money owed to farmer)
    const ledgerEntry = {
      party_id: billData.party_id,
      date: billData.date,
      entry_type: "credit",
      debit: 0,
      credit: billData.net_payable,
      narration: `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`,
      source_type: "purchase_bill",
      source_id: billId,
    };
    const lBlob = await encrypt(encKey, ledgerEntry);
    const lId = await db.upsert("ledger", null, lBlob);
    setLedger(prev => [{ id: lId, ...ledgerEntry }, ...prev]);

    return billId;
  }, [encKey]);

  // Save a sale bill + ledger entry for buyer
  const saveSaleBill = useCallback(async (billData) => {
    const blob = await encrypt(encKey, billData);
    const billId = await db.upsert("sale_bills", null, blob);
    const saved = { id: billId, ...billData };
    setSaleBills(prev => [saved, ...prev]);

    // Ledger entry for buyer: debit (buyer owes us)
    const ledgerEntry = {
      party_id: billData.party_id,
      date: billData.date,
      entry_type: "debit",
      debit: billData.total_bill,
      credit: 0,
      narration: `${billData.series}/${billData.bill_number} — ${billData.bags} bori ${billData.commodity}`,
      source_type: "sale_bill",
      source_id: billId,
    };
    const lBlob = await encrypt(encKey, ledgerEntry);
    const lId = await db.upsert("ledger", null, lBlob);
    setLedger(prev => [{ id: lId, ...ledgerEntry }, ...prev]);

    return billId;
  }, [encKey]);

  // Record a payment
  const savePayment = useCallback(async (paymentData) => {
    const blob = await encrypt(encKey, paymentData);
    const payId = await db.upsert("payments", null, blob);
    const saved = { id: payId, ...paymentData };
    setPayments(prev => [saved, ...prev]);

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

  const saveSettings = useCallback(async (settingsData) => {
    const blob = await encrypt(encKey, settingsData);
    const id = await db.saveSettings(settings?.id || null, blob);
    setSettings({ id, ...settingsData });
  }, [encKey, settings]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setEncKey(null);
    setSettings(null);
    setParties([]);
    setPurchaseBills([]);
    setSaleBills([]);
    setPayments([]);
    setLedger([]);
  }, []);

  // Computed: balance per party
  const partyBalance = useCallback((partyId) => {
    return ledger
      .filter(e => e.party_id === partyId)
      .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);
  }, [ledger]);

  return (
    <AppContext.Provider value={{
      session, encKey, settings, parties, purchaseBills, saleBills, payments, ledger,
      loading, error,
      unlock, loadAll, logout,
      saveParty, savePurchaseBill, saveSaleBill, savePayment, saveSettings,
      partyBalance,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
