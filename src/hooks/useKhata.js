/**
 * hooks/useKhata.js
 *
 * Custom hook for the Khata (party ledger) screen.
 * Encapsulates all business logic, leaving Khata.jsx as pure UI.
 */

import { useState } from "react";
import { useApp } from "../context/AppContext";
import { buildLedgerWithRunningBalance, calcTrueBalance } from "../services/ledgerService";
import { buildInterestTrail, computeInterest } from "../services/interestCalculator";

export function useKhata(party) {
  const { parties, payments, ledger, savePayment, deletePayment } = useApp();
  const bankAccounts = parties.filter(p => p.type === "Bank");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showPay, setShowPay]           = useState(false);
  const [showNakad, setShowNakad]       = useState(false);
  const [showInterest, setShowInterest] = useState(false); // byaaj trail popover
  const [selEntry, setSelEntry]         = useState(null);
  const [pinAction, setPinAction]       = useState(null);
  const [editingPay, setEditingPay]     = useState(null);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState("");

  // ── Payment form state ──────────────────────────────────────────────────────
  const [pay, setPay] = useState({
    type: "bank_receipt", amount: "", bank_party_id: "",
    reference: "", date: today(), narration: "",
  });
  const sp = (k, v) => setPay(p => ({ ...p, [k]: v }));

  // ── Nakad dena state ────────────────────────────────────────────────────────
  const [nakadAmt, setNakadAmt]   = useState("");
  const [nakadDate, setNakadDate] = useState(today());
  const [nakadNote, setNakadNote] = useState("");

  // ── Derived data ────────────────────────────────────────────────────────────
  const partyLedger  = party ? ledger.filter(e => e.party_id === party.id) : [];
  const ledgerWithBal = party ? buildLedgerWithRunningBalance(party, ledger) : [];
  const bal           = party ? calcTrueBalance(party, ledger) : 0;
  const displayBal    = Math.abs(bal);
  const farmerOwes    = bal > 0;  // farmer owes arhtiya
  const arhtiyaOwes   = bal < 0;  // arhtiya owes farmer (farmer's money kept)

  // Interest: only when farmer owes arhtiya (bal > 0)
  const accruedInterest = party && farmerOwes
    ? computeInterest(party, partyLedger)
    : 0;

  // Interest trail for popover
  const interestTrail = party ? buildInterestTrail(party, partyLedger) : [];

  // ── Payment handlers ────────────────────────────────────────────────────────
  const handlePaySave = async () => {
    if (!pay.amount || parseFloat(pay.amount) <= 0) {
      setError("Raqam sahi nahi hai.");
      return;
    }
    setBusy(true); setError("");
    try {
      if (editingPay) await deletePayment(editingPay.id);
      await savePayment({
        party_id:  party.id,
        date:      pay.date,
        type:      pay.type,
        amount:    parseFloat(pay.amount),
        reference: pay.reference,
        narration: pay.narration || pay.type,
      });
      resetPayForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleNakadSave = async () => {
    if (!nakadAmt || parseFloat(nakadAmt) <= 0) {
      setError("Raqam sahi nahi hai.");
      return;
    }
    setBusy(true); setError("");
    try {
      await savePayment({
        party_id:  party.id,
        date:      nakadDate,
        type:      "cash_payment",
        amount:    parseFloat(nakadAmt),
        reference: "",
        narration: nakadNote || "Nakad diya (cash advance)",
      });
      setShowNakad(false);
      setNakadAmt(""); setNakadNote("");
      setNakadDate(today());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!selEntry) return;
    setBusy(true);
    try {
      await deletePayment(selEntry.source_id);
      setSelEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEditEntry = () => {
    const paymentData = payments.find(p => p.id === selEntry.source_id);
    if (!paymentData) return;
    setEditingPay(paymentData);
    setPay({
      type:      paymentData.type      || "bank_receipt",
      amount:    String(paymentData.amount || ""),
      reference: paymentData.reference || "",
      date:      paymentData.date      || today(),
      narration: paymentData.narration || "",
    });
    setSelEntry(null);
    setShowPay(true);
  };

  const resetPayForm = () => {
    setShowPay(false);
    setEditingPay(null);
    setPay({ type: "bank_receipt", amount: "", reference: "", date: today(), narration: "" });
  };

  return {
    // Data
    bankAccounts, ledgerWithBal,
    bal, displayBal, farmerOwes, arhtiyaOwes,
    accruedInterest, interestTrail,

    // UI state
    showPay, setShowPay,
    showNakad, setShowNakad,
    showInterest, setShowInterest,
    selEntry, setSelEntry,
    pinAction, setPinAction,
    editingPay,
    busy, error, setError,

    // Payment form
    pay, sp,

    // Nakad form
    nakadAmt, setNakadAmt,
    nakadDate, setNakadDate,
    nakadNote, setNakadNote,

    // Handlers
    handlePaySave,
    handleNakadSave,
    handleDeleteEntry,
    openEditEntry,
    resetPayForm,
  };
}

function today() {
  return new Date().toISOString().split("T")[0];
}
