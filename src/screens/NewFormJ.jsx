/**
 * NewFormJ.jsx — Form J (Khareed Bill) Entry Screen
 *
 * PURPOSE: Create or edit a purchase bill (Form J) — the receipt given to a
 * farmer when the arhtiya buys their crop at the mandi auction.
 *
 * TWO MODES:
 *   1. SCAN MODE: User photographs a physical Form J →
 *      Google Cloud Vision reads the text → fields auto-filled → arhtiya validates → saves
 *   2. MANUAL MODE: Arhtiya types all fields directly
 *
 * CALCULATION FORMULA (both modes):
 *   gross_amount  = weight × rate
 *   labour_amount = bags × labour_rate          ← manual only, 0 when scanned
 *   total_deductions = labour_amount + cess + transport + anya_kharcha
 *   net_payable   = gross_amount - total_deductions
 *   final_payment = net_payable - loan_recovered
 *
 * DEDUCTION APPROACH (scan vs manual):
 *   When SCANNING:  labour=0, cess=0, transport=0
 *                   anya_kharcha = जोड़ (total kharcha from form's column 6)
 *   When MANUAL:    user fills labour_rate/cess/transport themselves
 *                   anya_kharcha stays 0
 *
 * CROSS-VALIDATION:
 *   After scan, we compare our calculated values against what's written on the form:
 *   - Calculated gross vs form's "रकम" column → warn if >1% difference
 *   - Calculated net vs form's "रकम साफी" column → warn if >1% difference
 *
 * KISAN (FARMER) MATCHING:
 *   Scan reads "बेचने वाले का नाम" from form.
 *   We check if it matches any existing farmer in the app.
 *   If match found → auto-select that farmer.
 *   If no match → show scanned name in a confirmation box → arhtiya confirms → party created.
 *   (We never auto-create parties without arhtiya confirmation — Option B agreed with client)
 */

import { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Divider, Row, fmt } from "../components/ui";
import { scanFormJ } from "../lib/vision";

export default function NewFormJ({ onBack, nav, editData }) {
  const { parties, purchaseBills, savePurchaseBill, updatePurchaseBill, saveParty, partyBalance } = useApp();

  // Only show Farmer type parties in the seller dropdown
  const farmers = parties.filter(p => p.type === "Farmer");
  const mazdooriAccount = parties.find(
    p => p.type === "Expense" && ["Mazdoori", "Labour"].includes(p.expense_category)
  );

  const isEdit = !!editData;

  // ── Component state ─────────────────────────────────────────────────────────
  const [busy, setBusy]         = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError]       = useState("");
  const [saved, setSaved]       = useState(false);

  // scanResult: holds metadata from the scan (confidence, warnings, raw values)
  const [scanResult, setScanResult] = useState(null);

  // newKisanName: when scan finds a farmer name not in our list,
  // we show it here for arhtiya to confirm before creating the party
  const [newKisanName, setNewKisanName] = useState("");
  const [creatingKisan, setCreatingKisan] = useState(false);

  // Refs for the two hidden file inputs (camera vs gallery)
  const fileInputRef    = useRef(null);
  const galleryInputRef = useRef(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [f, setF] = useState(() => editData ? {
    party_id:      editData.party_id             || "",
    date:          editData.date                 || today(),
    series:        editData.series               || "Form J3",
    commodity:     editData.commodity            || "",
    bags:          String(editData.bags          || ""),
    weight:        String(editData.weight        || ""),
    rate:          String(editData.rate          || ""),
    // Manual deduction fields (used in manual mode, 0 when scanned)
    labour_rate:   String(editData.labour_rate   || "5.32"),
    cess:          String(editData.cess_amount   || ""),
    transport:     String(editData.transport_amount || ""),
    // anya_kharcha: holds the total kharcha from scan (जोड़ from form column 6)
    // In manual mode this stays 0. In scan mode, labour/cess/transport stay 0.
    anya_kharcha:  String(editData.anya_kharcha  || ""),
    loan_recovered: String(editData.loan_recovered || ""),
  } : {
    party_id: "", date: today(), series: "Form J3",
    commodity: "", bags: "", weight: "", rate: "",
    labour_rate: "5.32", cess: "", transport: "",
    anya_kharcha: "",   // populated by scan, empty in manual mode
    loan_recovered: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  // ── Scan handler ─────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected

    setScanning(true);
    setError("");
    setScanResult(null);
    setNewKisanName("");

    try {
      const result = await scanFormJ(file);

      // ── Pre-fill form fields from scan result ─────────────────────────────
      setF(prev => ({
        ...prev,
        // Map "निलामी की तिथि" from form → app's "Tithi" date field
        date:      result.date      || prev.date,
        commodity: result.commodity || prev.commodity,
        bags:      result.bags      || prev.bags,
        weight:    result.weight    || prev.weight,
        // Map "भाव" (4th column) → app's "Bhao per Quintal" field
        rate:      result.rate      || prev.rate,

        // DEDUCTION APPROACH (scan mode):
        // Do NOT populate labour_rate/cess/transport — leave them as default/0.
        // Put the entire "जोड़" (kul kharcha from column 6) into anya_kharcha.
        // Formula: net = gross - 0(labour) - 0(cess) - 0(transport) - anya_kharcha
        anya_kharcha: result.scanned_kul_kharcha !== "0"
          ? result.scanned_kul_kharcha
          : prev.anya_kharcha,
        // Clear labour_rate when scan provides kul_kharcha
        // so utarai = 0 and doesn't double-count with anya_kharcha
        labour_rate: result.scanned_kul_kharcha !== "0" ? "0" : prev.labour_rate,

        // Notes: always empty after scan (per client decision)
        // notes: ""  ← not stored in state, not shown
      }));

      // ── Kisan (farmer) name matching ──────────────────────────────────────
      // Try to match scanned seller name to existing farmers in the app.
      // Matching logic: check if scanned name contains farmer's first word, or vice versa.
      if (result.seller_name) {
        const scannedLower = result.seller_name.toLowerCase().trim();
        const match = farmers.find(ff => {
          const farmerLower = ff.name.toLowerCase();
          const farmerFirst = farmerLower.split(" ")[0]; // first name/word
          return (
            farmerLower.includes(scannedLower) ||
            scannedLower.includes(farmerFirst)
          );
        });

        if (match) {
          // Existing farmer found → auto-select
          setF(prev => ({ ...prev, party_id: match.id }));
        } else {
          // No match → show confirmation box (Option B: never auto-create)
          // Arhtiya must confirm the name before we create a new party
          setNewKisanName(result.seller_name);
        }
      }

      setScanResult(result);
    } catch (e) {
      setError("Scan nahi ho paya: " + (e.message || "Dobara try karein"));
    } finally {
      setScanning(false);
    }
  };

  // ── Create new farmer from scanned name ──────────────────────────────────────
  // Called when arhtiya confirms the scanned kisan name (Option B flow)
  const handleCreateNewKisan = async () => {
    if (!newKisanName.trim()) return;
    setCreatingKisan(true);
    try {
      const newPartyData = {
        name:             newKisanName.trim(),
        type:             "Farmer",
        place:            "",
        phone:            "",
        opening_balance:  0,
        interest_rate:    0,
        created_at:       new Date().toISOString(),
      };
      const newId = await saveParty(newPartyData);
      // Auto-select the newly created farmer
      setF(prev => ({ ...prev, party_id: newId }));
      setNewKisanName("");
    } catch (e) {
      setError("Kisan add nahi ho paya: " + e.message);
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

  const bags          = parseFloat(f.bags)          || 0;
  const weight        = parseFloat(f.weight)         || 0;
  const rate          = parseFloat(f.rate)           || 0;
  const labRate       = parseFloat(f.labour_rate)    || 5.32;
  const cessAmt       = parseFloat(f.cess)           || 0;
  const transportAmt  = parseFloat(f.transport)      || 0;
  const anyaKharcha   = parseFloat(f.anya_kharcha)   || 0;

  // gross_amount = weight × rate (always calculated, never taken from form)
  const gross_amount     = weight * rate;
  // labour_amount = bags × labour_rate per bag (0 when scanned since labour_rate stays default
  // but labour doesn't get added to deductions separately — anya_kharcha covers it)
  const labour_amount    = anyaKharcha > 0 ? 0 : bags * labRate;
  // total_deductions includes all four deduction types
  const total_deductions = labour_amount + cessAmt + transportAmt + anyaKharcha;
  const net_payable      = gross_amount - total_deductions;

  // Loan recovery
  const selectedFarmer   = farmers.find(ff => ff.id === f.party_id);
  const farmerBal        = selectedFarmer ? partyBalance(selectedFarmer.id) : 0;
  const loanBaaki        = Math.max(0, -(farmerBal) + (selectedFarmer?.opening_balance || 0));
  const maxLoanRecovery  = Math.min(loanBaaki, net_payable);
  const loanRecoveredAmt = parseFloat(f.loan_recovered) || 0;
  const finalPayment     = net_payable - loanRecoveredAmt;

  // ── Cross-validation warnings ─────────────────────────────────────────────
  // Compare our calculated values against what's written on the physical form.
  // Tolerance: 1% difference is acceptable (rounding in handwriting).
  const grossMismatch = scanResult?.gross_amount_from_form
    && gross_amount > 0
    && Math.abs(gross_amount - parseFloat(scanResult.gross_amount_from_form)) / gross_amount > 0.01;

  const netMismatch = scanResult?.net_amount_from_form
    && net_payable > 0
    && Math.abs(net_payable - parseFloat(scanResult.net_amount_from_form)) / net_payable > 0.01;

  // ── Save handler ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!f.party_id || !f.commodity || !bags || !weight || !rate) {
      setError("Saare zaroori fields bharein (Kisan, Fasal, Bori, Wazan, Bhao).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const billData = {
        party_id:          f.party_id,
        series:            f.series,
        bill_number:       nextBillNo(),
        date:              f.date,
        commodity:         f.commodity,
        bags,
        weight,
        rate,
        gross_amount,
        labour_rate:       labRate,
        labour_amount,
        cess_amount:       cessAmt,
        transport_amount:  transportAmt,
        // anya_kharcha: stores the scanned "जोड़" total (0 in manual mode)
        anya_kharcha:      anyaKharcha,
        net_payable,
        loan_recovered:    loanRecoveredAmt,
        final_payment:     finalPayment,
        // Track whether this bill was created via scan or manual entry
        scanned:           scanResult?.scanned || false,
        is_complete:       false,
        created_at:        new Date().toISOString(),
      };
      if (isEdit) await updatePurchaseBill(editData.id, billData);
      else        await savePurchaseBill(billData);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Saved screen ────────────────────────────────────────────────────────────
  if (saved) {
    return (
      <Shell>
        <div style={{ background: C.pink, padding: "60px 28px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 24, color: C.white }}>
            Form J Save Ho Gaya!
          </h2>
          <p style={{ color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
            {f.series} / Bill #{nextBillNo() - 1}
          </p>
        </div>
        <div style={{ padding: "24px 16px" }}>
          <Btn variant="pink" onClick={onBack}>← Wapas Jaayein</Btn>
        </div>
      </Shell>
    );
  }

  // ── Confidence badge component ──────────────────────────────────────────────
  const ConfidenceBadge = ({ confidence }) => {
    const map = {
      high:   { bg: C.greenLight, color: C.green,  label: "✓ Scan sahi laga — phir bhi check karein" },
      medium: { bg: "#FFF8E1",    color: "#B45309", label: "⚠ Kuch fields check zaroor karein"       },
      low:    { bg: "#FDF0EE",    color: C.red,     label: "✗ Manually verify karein — scan clear nahi tha" },
    };
    const { bg, color, label } = map[confidence] || map.medium;
    return (
      <div style={{ background: bg, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* Hidden file inputs — separate for camera vs gallery */}
      {/* camera: capture="environment" forces rear camera on mobile */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={handleFileChange} />
      {/* gallery: no capture attribute = opens photo picker on iOS/Android */}
      <input ref={galleryInputRef} type="file" accept="image/*"
        style={{ display: "none" }} onChange={handleFileChange} />

      {/* Header */}
      <div style={{ background: C.pink }}>
        <TopBar title={isEdit ? "Form J — Edit Karein" : "Form J — Naya Khareed"} onBack={onBack} bg="transparent" />
        <div style={{ padding: "4px 16px 18px" }}>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>📥 Kisan se khareed ka bill</p>
        </div>
      </div>

      <div style={{ padding: "16px 14px 100px" }}>

        {/* Error banner */}
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10,
            padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── SCAN BUTTONS (camera + gallery) ─────────────────────────────── */}
        {!isEdit && (
          scanning ? (
            <div style={{ background: C.cream, border: `1.5px solid ${C.border}`, borderRadius: 14,
              padding: "16px 20px", marginBottom: 16,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⏳</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.inkMid }}>Form padh raha hai...</div>
                <div style={{ fontSize: 11, color: C.inkLight }}>Thoda wait karein (~5 sec)</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                    border: "none", borderRadius: 14, padding: "16px 10px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }}>
                  <span style={{ fontSize: 30 }}>📷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Camera</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Abhi photo lo</span>
                </button>
                <button onClick={() => galleryInputRef.current?.click()}
                  style={{ background: C.white, border: `1.5px solid ${C.border}`,
                    borderRadius: 14, padding: "16px 10px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 30 }}>🖼️</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Gallery</span>
                  <span style={{ fontSize: 10, color: C.inkLight }}>Pehle li hui photo</span>
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.inkLight, fontWeight: 600 }}>YA MANUALLY BHAREIN</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
            </>
          )
        )}

        {/* ── SCAN RESULT BANNER ───────────────────────────────────────────── */}
        {scanResult && (
          <Card style={{ marginBottom: 12, border: `1.5px solid ${C.green}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 8 }}>
              📋 Scan Result — Neeche fields check karein
            </p>
            <ConfidenceBadge confidence={scanResult.confidence} />

            {/* Fields that had low confidence */}
            {scanResult.low_confidence_fields?.length > 0 && (
              <div style={{ background: "#FFF8E1", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Ye fields dhyan se check karein: {scanResult.low_confidence_fields.join(", ")}
                </p>
              </div>
            )}

            {/* Cross-validation: gross amount mismatch */}
            {grossMismatch && (
              <div style={{ background: "#FDF0EE", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
                <p style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>
                  ⚠️ Kul Raqam mismatch: App ne calculate kiya ₹{fmt(gross_amount)},
                  form par likha hai ₹{fmt(parseFloat(scanResult.gross_amount_from_form))}.
                  Bhao aur wazan check karein.
                </p>
              </div>
            )}

            {/* Cross-validation: net amount mismatch */}
            {netMismatch && (
              <div style={{ background: "#FDF0EE", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
                <p style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>
                  ⚠️ Net Amount mismatch: App ne calculate kiya ₹{fmt(net_payable)},
                  form par "रकम साफी" ₹{fmt(parseFloat(scanResult.net_amount_from_form))}.
                  Kul Kharcha check karein.
                </p>
              </div>
            )}

            <button onClick={() => setScanResult(null)}
              style={{ marginTop: 4, background: "none", border: "none", fontSize: 11, color: C.inkLight, cursor: "pointer" }}>
              × Band karein
            </button>
          </Card>
        )}

        {/* ── NEW KISAN CONFIRMATION BOX ───────────────────────────────────── */}
        {/* Shown when scan finds a farmer name not in our existing parties list */}
        {/* Arhtiya confirms the name, then we create the party (Option B) */}
        {newKisanName && (
          <Card style={{ marginBottom: 12, border: `1.5px solid #F59E0B`, background: "#FFF8E1" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
              👤 Naya Kisan mila scan mein
            </p>
            <p style={{ fontSize: 12, color: "#78350F", marginBottom: 10 }}>
              Ye kisan aapki list mein nahi hai. Naam sahi hai to "Add Karein" dabayein.
            </p>
            <Field
              label="Kisan ka Naam (confirm karein)"
              value={newKisanName}
              onChange={setNewKisanName}
              placeholder="Naam sahi karein agar galat ho"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={handleCreateNewKisan} disabled={creatingKisan}
                style={{ flex: 1, background: "#F59E0B", color: "#fff", border: "none",
                  borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {creatingKisan ? "Add ho raha hai..." : "✓ Add Karein"}
              </button>
              <button onClick={() => setNewKisanName("")}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: "10px 14px", fontSize: 12, color: C.inkMid, cursor: "pointer" }}>
                Skip
              </button>
            </div>
          </Card>
        )}

        {/* ── BASIC INFO ───────────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          {/* Farmer dropdown — shows all existing farmers */}
          {/* If scan matched a farmer, this is auto-selected */}
          <Field
            label="Bechne wale ka Naam (Kisan) *"
            value={f.party_id}
            onChange={v => s("party_id", v)}
            placeholder="Kisan chunein..."
            options={farmers.map(ff => ({ value: ff.id, label: `${ff.name}${ff.place ? " — " + ff.place : ""}` }))}
          />

          {selectedFarmer && loanBaaki > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "9px 12px",
              marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span>⚠️</span>
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>
                Udhar baaki: ₹{fmt(loanBaaki)}
              </span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Date maps to "निलामी की तिथि" from the physical form */}
            <Field label="Tithi (Nilami ki)" value={f.date} onChange={v => s("date", v)} type="date" required />
            <Field label="Series" value={f.series} onChange={v => s("series", v)}
              options={["Form J1", "Form J2", "Form J3"]} />
          </div>

          <Field
            label="Fasal (Commodity) *"
            value={f.commodity}
            onChange={v => s("commodity", v)}
            placeholder="Fasal chunein..."
            options={["Wheat", "Paddy", "Bajra", "Maize", "Mustard", "Other"]}
          />
        </Card>

        {/* ── MAAL KI JAANKARI ─────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>📦 Maal ki Jaankari</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Bori (Bags) *" value={f.bags} onChange={v => s("bags", v)} type="number" placeholder="0" />
            <Field label="Wazan (Quintal) *" value={f.weight} onChange={v => s("weight", v)} type="number" placeholder="0" />
          </div>
          {/* Bhav maps to "भाव" column (4th column) on the physical form */}
          <Field label="Bhao (₹ per Quintal) *" value={f.rate} onChange={v => s("rate", v)}
            type="number" prefix="₹" suffix="/qtl" placeholder="0" />
          {gross_amount > 0 && (
            <div style={{ background: C.greenLight, borderRadius: 8, padding: "12px 14px", marginTop: 6 }}>
              <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>
                {weight} qtl × ₹{rate}/qtl
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Kul Raqam</span>
                <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 20, color: C.green }}>
                  ₹{fmt(gross_amount)}
                </span>
              </div>
              {/* Show form's रकम for reference if scanned */}
              {scanResult?.gross_amount_from_form && (
                <div style={{ fontSize: 11, color: grossMismatch ? C.red : C.inkLight, marginTop: 4 }}>
                  Form par likha: ₹{fmt(parseFloat(scanResult.gross_amount_from_form))}
                  {grossMismatch ? " ⚠ Match nahi" : " ✓"}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── KHARCHE ──────────────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 4 }}>💸 Kharche</p>

          {anyaKharcha > 0 ? (
            /* SCAN MODE: Show single "Kul Kharcha from scan" field */
            /* Individual labour/cess/transport fields are hidden — anya_kharcha covers all */
            <div>
              <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: "#92400E" }}>
                  📷 Scan se: कुल खर्च (जोड़) fill hua hai. Individual kharche manually add kar sakte hain.
                </p>
              </div>
              <Field
                label="Kul Kharcha / जोड़ (Scan se)"
                value={f.anya_kharcha}
                onChange={v => s("anya_kharcha", v)}
                type="number"
                prefix="₹"
                hint="Form ke column 6 ka जोड़ — edit kar sakte hain"
              />
            </div>
          ) : (
            /* MANUAL MODE: Show individual deduction fields */
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Labour / Utarai (₹/bori)" value={f.labour_rate}
                  onChange={v => s("labour_rate", v)} type="number" prefix="₹" hint="Default ₹5.32/bori" />
                <Field label="Cess (₹)" value={f.cess}
                  onChange={v => s("cess", v)} type="number" prefix="₹" placeholder="0" />
              </div>
              <Field label="Transport / Kiraya (₹)" value={f.transport}
                onChange={v => s("transport", v)} type="number" prefix="₹" placeholder="0" />
              <Field label="Anya Kharcha (₹)" value={f.anya_kharcha}
                onChange={v => s("anya_kharcha", v)} type="number" prefix="₹" placeholder="0"
                hint="Koi aur kharcha ho to yahan likhein" />
            </div>
          )}

          {total_deductions > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "10px 14px",
              marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Kul Kharche</span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 15, color: C.red }}>
                − ₹{fmt(total_deductions)}
              </span>
            </div>
          )}
        </Card>

        {/* Mazdoori account warning — only in manual mode */}
        {gross_amount > 0 && labour_amount > 0 && !mazdooriAccount && (
          <div style={{ background: "#FFF8E1", border: "1.5px solid #F59E0B", borderRadius: 12,
            padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
              ⚠️ Mazdoori account nahi mila
            </p>
            <p style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5, marginBottom: 10 }}>
              Is bill mein Utarai/Mazdoori (₹{fmt(labour_amount)}) kat rahi hai.
              Ise Balance Sheet mein track karne ke liye ek <strong>Mazdoori</strong> Expense account zaroori hai.
            </p>
            {nav && (
              <button onClick={() => nav("newParty")}
                style={{ background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                + Mazdoori Account Banayein
              </button>
            )}
          </div>
        )}

        {/* ── GRAND TOTAL ──────────────────────────────────────────────────── */}
        {gross_amount > 0 && (
          <Card style={{ marginBottom: 12, background: C.pinkLight, border: `1.5px solid ${C.pink}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.pink, marginBottom: 8 }}>
              📊 Grand Total — Kisan ko milega
            </p>
            {/* Kul Raqam: calculated = weight × rate */}
            <Row label="Kul Raqam (weight × bhao)" amount={gross_amount} />
            {/* Kul Kharche: sum of all deductions */}
            <Row label="Kul Kharche (−)" amount={total_deductions} color={C.red} />
            {/* Net Payable: validated against form's "रकम साफी जो दी गई" */}
            <Row label="Net Payable (Kisan ko)" amount={net_payable} bold color={C.green} />

            {/* Show form's रकम साफी for reference if scanned */}
            {scanResult?.net_amount_from_form && (
              <div style={{ fontSize: 11, color: netMismatch ? C.red : C.inkLight,
                padding: "4px 0", marginTop: 2 }}>
                Form par "रकम साफी": ₹{fmt(parseFloat(scanResult.net_amount_from_form))}
                {netMismatch ? " ⚠ Match nahi — check karein" : " ✓ Match"}
              </div>
            )}

            {/* Loan recovery section */}
            {loanBaaki > 0 && (
              <>
                <Divider label="Loan Recovery" />
                <Field label="Loan Recovery (₹)" value={f.loan_recovered}
                  onChange={v => s("loan_recovered", v)} type="number" prefix="₹"
                  hint={`Max: ₹${fmt(maxLoanRecovery)}`} />
                {loanRecoveredAmt > 0 && (
                  <>
                    <Row label="Loan recovery (−)" amount={loanRecoveredAmt} color={C.red} />
                    <Row label="Haath mein milega" amount={finalPayment} bold color={C.green} />
                  </>
                )}
              </>
            )}
          </Card>
        )}

        {/* Save / Cancel */}
        <Btn
          variant="pink"
          onClick={handleSave}
          disabled={busy || !f.party_id || !f.commodity || !bags || !weight || !rate}>
          {busy ? "Save ho raha hai..." : isEdit ? "✓ Update Karein" : "✓ Form J Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}

// Helper: today's date in YYYY-MM-DD format
function today() {
  return new Date().toISOString().split("T")[0];
}
