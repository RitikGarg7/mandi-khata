/**
 * hooks/useFormJ.js
 *
 * Custom hook that encapsulates ALL Form J business logic.
 * NewFormJ.jsx becomes a pure UI component that just renders
 * what this hook provides.
 *
 * Responsibilities:
 * - Form state management
 * - Scan + voice input handling
 * - Calculations (gross, deductions, net)
 * - Farmer name matching
 * - Save / update
 */

import { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { scanFormJ } from "../lib/vision";
import { createRecorder } from "../lib/voice";
import {
  calcFormJ,
  validateFormJ,
  validateScanMismatch,
} from "../services/billCalculations";
import { COMMODITIES, BILL_SERIES, DEFAULTS } from "../constants/index";

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split("T")[0];
}

function parseDate(raw) {
  if (!raw || typeof raw !== "string") return "";
  raw = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[-\/\s]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length !== 3) return "";
  let [a, b, c] = parts;
  let d, m, y;
  if (c.length === 4 || (c.length === 2 && parseInt(c) > 20)) {
    [d, m, y] = [a, b, c];
  } else if (a.length === 4) {
    [y, m, d] = [a, b, c];
  } else {
    [d, m, y] = [a, b, c];
  }
  if (y.length === 2) y = "20" + y;
  const dd = parseInt(d), mm = parseInt(m), yy = parseInt(y);
  if (isNaN(dd) || isNaN(mm) || isNaN(yy) || dd < 1 || dd > 31 || mm < 1 || mm > 12) return "";
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// ── Initial form state ────────────────────────────────────────────────────────

function initialFormState(editData) {
  if (editData) return {
    party_id:       editData.party_id              || "",
    date:           editData.date                  || today(),
    series:         editData.series                || "Form J3",
    commodity:      editData.commodity             || "",
    bags:           String(editData.bags           || ""),
    weight:         String(editData.weight         || ""),
    rate:           String(editData.rate           || ""),
    labour_rate:    String(editData.labour_rate    || DEFAULTS.labour_rate),
    cess:           String(editData.cess_amount    || ""),
    transport:      String(editData.transport_amount || ""),
    anya_kharcha:   String(editData.anya_kharcha   || ""),
    loan_recovered: String(editData.loan_recovered || ""),
  };
  return {
    party_id: "", date: today(), series: "Form J3",
    commodity: "", bags: "", weight: "", rate: "",
    labour_rate: String(DEFAULTS.labour_rate),
    cess: "", transport: "", anya_kharcha: "", loan_recovered: "",
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFormJ(editData) {
  const {
    parties, purchaseBills,
    savePurchaseBill, updatePurchaseBill,
    saveParty, partyBalance,
  } = useApp();

  const farmers = parties.filter(p => p.type === "Farmer");
  const isEdit  = !!editData;

  // ── UI state ────────────────────────────────────────────────────────────────
  const [busy, setBusy]                   = useState(false);
  const [scanning, setScanning]           = useState(false);
  const [error, setError]                 = useState("");
  const [saved, setSaved]                 = useState(false);
  const [scanResult, setScanResult]       = useState(null);
  const [newKisanName, setNewKisanName]   = useState("");
  const [creatingKisan, setCreatingKisan] = useState(false);
  const [recording, setRecording]         = useState(false);
  const [recorder, setRecorder]           = useState(null);
  const [transcription, setTranscription] = useState("");

  // ── Form state ──────────────────────────────────────────────────────────────
  const [f, setF] = useState(() => initialFormState(editData));
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  // ── Refs ────────────────────────────────────────────────────────────────────
  const fileInputRef    = useRef(null);
  const galleryInputRef = useRef(null);

  // ── Shared apply logic (scan + voice both use this) ──────────────────────────
  const applyResult = (data) => {
    setF(prev => ({
      ...prev,
      date:      parseDate(data.date) || prev.date,
      commodity: data.commodity || prev.commodity,
      bags:      data.bags      || prev.bags,
      weight:    data.weight    || prev.weight,
      rate:      data.rate      || prev.rate,
      // Scan/voice: put entire kul kharcha into anya_kharcha, clear labour
      anya_kharcha: data.anya_kharcha && data.anya_kharcha !== "0"
        ? data.anya_kharcha : prev.anya_kharcha,
      labour_rate: data.anya_kharcha && data.anya_kharcha !== "0"
        ? "0" : prev.labour_rate,
    }));

    // Kisan matching: try to find existing farmer by name
    if (data.seller_name) {
      const lower = data.seller_name.toLowerCase().trim();
      const match = farmers.find(ff => {
        const fl = ff.name.toLowerCase();
        return fl.includes(lower) || lower.includes(fl.split(" ")[0]);
      });
      if (match) setF(prev => ({ ...prev, party_id: match.id }));
      else setNewKisanName(data.seller_name);
    }

    setScanResult({ ...data, scanned: true });
  };

  // ── Scan handlers ────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setScanning(true); setError(""); setScanResult(null); setNewKisanName("");
    try {
      const result = await scanFormJ(file);
      applyResult(result);
    } catch (err) {
      setError("Scan nahi ho paya: " + (err.message || "Dobara try karein"));
    } finally {
      setScanning(false);
    }
  };

  // ── Voice handlers ────────────────────────────────────────────────────────────
  const handleVoiceStart = async () => {
    try {
      setError(""); setTranscription("");
      const rec = createRecorder();
      setRecorder(rec);
      await rec.start();
      setRecording(true);
    } catch (err) {
      setError("Microphone access nahi mila: " + err.message);
    }
  };

  const handleVoiceStop = async () => {
    if (!recorder) return;
    setRecording(false);
    setScanning(true);
    try {
      const result = await recorder.stop();
      setTranscription(prev =>
        prev ? prev + " | " + (result.transcription || "") : (result.transcription || "")
      );
      applyResult(result.data);
    } catch (err) {
      setError("Samajh nahi aaya: " + (err.message || "Dobara bolein"));
    } finally {
      setScanning(false);
      setRecorder(null);
    }
  };

  // ── New kisan creation ────────────────────────────────────────────────────────
  const handleCreateNewKisan = async () => {
    if (!newKisanName.trim()) return;
    setCreatingKisan(true);
    try {
      const newId = await saveParty({
        name: newKisanName.trim(), type: "Farmer",
        place: "", phone: "", opening_balance: 0, interest_rate: 0,
        created_at: new Date().toISOString(),
      });
      setF(prev => ({ ...prev, party_id: newId }));
      setNewKisanName("");
    } catch (err) {
      setError("Kisan add nahi ho paya: " + err.message);
    } finally {
      setCreatingKisan(false);
    }
  };

  // ── Calculations ──────────────────────────────────────────────────────────────
  const nextBillNo = () => {
    if (isEdit) return editData.bill_number;
    const bills = purchaseBills.filter(b => b.series === f.series);
    return bills.length > 0 ? Math.max(...bills.map(b => b.bill_number || 0)) + 1 : 1;
  };

  const labourRate = f.labour_rate === "" ? DEFAULTS.labour_rate : (parseFloat(f.labour_rate) || 0);

  const calcs = calcFormJ({
    bags:          f.bags,
    weight:        f.weight,
    rate:          f.rate,
    labourRate,
    cess:          f.cess,
    transport:     f.transport,
    anyaKharcha:   f.anya_kharcha,
    loanRecovered: f.loan_recovered,
  });

  // Farmer balance for loan recovery
  const selectedFarmer   = farmers.find(ff => ff.id === f.party_id);
  const farmerBal        = selectedFarmer ? partyBalance(selectedFarmer.id) : 0;
  const loanBaaki        = Math.max(0, -farmerBal + (selectedFarmer?.opening_balance || 0));
  const maxLoanRecovery  = Math.min(loanBaaki, calcs.net_payable);

  // Scan validation
  const scanMismatches = scanResult
    ? validateScanMismatch({
        gross_calculated: calcs.gross,
        gross_from_form:  scanResult.gross_amount_from_form,
        net_calculated:   calcs.net_payable,
        net_from_form:    scanResult.net_amount_from_form,
      })
    : [];

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validationErrors = validateFormJ(f);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(", "));
      return;
    }
    setBusy(true); setError("");
    try {
      const billData = {
        party_id:          f.party_id,
        series:            f.series,
        bill_number:       nextBillNo(),
        date:              f.date,
        commodity:         f.commodity,
        bags:              parseFloat(f.bags),
        weight:            parseFloat(f.weight),
        rate:              parseFloat(f.rate),
        gross_amount:      calcs.gross,
        labour_rate:       labourRate,
        labour_amount:     calcs.labour_amount,
        cess_amount:       parseFloat(f.cess)          || 0,
        transport_amount:  parseFloat(f.transport)     || 0,
        anya_kharcha:      parseFloat(f.anya_kharcha)  || 0,
        net_payable:       calcs.net_payable,
        loan_recovered:    parseFloat(f.loan_recovered) || 0,
        final_payment:     calcs.final_payment,
        scanned:           scanResult?.scanned || false,
        is_complete:       false,
        created_at:        editData?.created_at || new Date().toISOString(),
      };
      if (isEdit) await updatePurchaseBill(editData.id, billData);
      else        await savePurchaseBill(billData);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return {
    // State
    f, set,
    busy, scanning, error, saved,
    scanResult, newKisanName, creatingKisan,
    recording, transcription,
    isEdit,

    // Refs
    fileInputRef, galleryInputRef,

    // Calculations
    calcs, labourRate, selectedFarmer,
    loanBaaki, maxLoanRecovery, scanMismatches,
    nextBillNo,

    // Data
    farmers,

    // Handlers
    handleFileChange,
    handleVoiceStart,
    handleVoiceStop,
    handleCreateNewKisan,
    handleSave,
    clearError:   () => setError(""),
    clearScan:    () => setScanResult(null),
    setNewKisanName,
  };
}
