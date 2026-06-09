import { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Divider, Row, fmt } from "../components/ui";
import { scanFormJ } from "../lib/vision";
import { createRecorder } from "../lib/voice";

export default function NewFormJ({ onBack, nav, editData }) {
  const { parties, purchaseBills, savePurchaseBill, updatePurchaseBill, saveParty, partyBalance } = useApp();
  const farmers = parties.filter(p => p.type === "Farmer");
  const mazdooriAccount = parties.find(
    p => p.type === "Expense" && ["Mazdoori", "Labour"].includes(p.expense_category)
  );
  const isEdit = !!editData;

  // ── State ────────────────────────────────────────────────────────────────────
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

  const fileInputRef    = useRef(null);
  const galleryInputRef = useRef(null);

  // ── Form state ────────────────────────────────────────────────────────────────
  const [f, setF] = useState(() => editData ? {
    party_id:      editData.party_id             || "",
    date:          editData.date                 || today(),
    series:        editData.series               || "Form J3",
    commodity:     editData.commodity            || "",
    bags:          String(editData.bags          || ""),
    weight:        String(editData.weight        || ""),
    rate:          String(editData.rate          || ""),
    labour_rate:   String(editData.labour_rate   || "5.32"),
    cess:          String(editData.cess_amount   || ""),
    transport:     String(editData.transport_amount || ""),
    anya_kharcha:  String(editData.anya_kharcha  || ""),
    loan_recovered: String(editData.loan_recovered || ""),
  } : {
    party_id: "", date: today(), series: "Form J3",
    commodity: "", bags: "", weight: "", rate: "",
    labour_rate: "5.32", cess: "", transport: "",
    anya_kharcha: "", loan_recovered: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  // ── Shared fill logic (used by both scan and voice) ──────────────────────────
  const applyResult = (data) => {
    setF(prev => ({
      ...prev,
      // Date: parse whatever format Gemini returns → YYYY-MM-DD
      // Handles: "2024-12-03", "3-12-2024", "3/12/2024", "3 12 2024"
      date: parseDate(data.date) || prev.date,
      commodity:    data.commodity || prev.commodity,
      bags:         data.bags      || prev.bags,
      weight:       data.weight    || prev.weight,
      rate:         data.rate      || prev.rate,
      // kul_kharcha from form → anya_kharcha field
      // labour/cess/transport stay 0 (anya_kharcha covers all deductions in scan/voice mode)
      anya_kharcha: data.anya_kharcha && data.anya_kharcha !== "0"
        ? data.anya_kharcha : prev.anya_kharcha,
      labour_rate:  data.anya_kharcha && data.anya_kharcha !== "0"
        ? "0" : prev.labour_rate,
    }));

    // Kisan matching
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

  // ── Scan handlers ─────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setScanning(true); setError(""); setScanResult(null); setNewKisanName("");
    // Keep transcription visible so user can see previous voice inputs
    try {
      const result = await scanFormJ(file);
      applyResult(result);
    } catch (e) {
      setError("Scan nahi ho paya: " + (e.message || "Dobara try karein"));
    } finally {
      setScanning(false);
    }
  };

  // ── Voice handlers ─────────────────────────────────────────────────────────────
  const handleVoiceStart = async () => {
    try {
      // Don't clear previous scan result or kisan box — user may be adding more fields
      setError(""); setTranscription("");
      const rec = createRecorder();
      setRecorder(rec);
      await rec.start();
      setRecording(true);
    } catch (e) {
      setError("Microphone access nahi mila: " + e.message);
    }
  };

  const handleVoiceStop = async () => {
    if (!recorder) return;
    setRecording(false);
    setScanning(true);
    try {
      const result = await recorder.stop();
      // Accumulate transcriptions so user can see all spoken inputs
      setTranscription(prev =>
        prev ? prev + " | " + (result.transcription || "") : (result.transcription || "")
      );
      applyResult(result.data);
    } catch (e) {
      setError("Samajh nahi aaya: " + (e.message || "Dobara bolein"));
    } finally {
      setScanning(false);
      setRecorder(null);
    }
  };

  // ── Create new kisan from scanned/spoken name ─────────────────────────────────
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

  const bags         = parseFloat(f.bags)         || 0;
  const weight       = parseFloat(f.weight)        || 0;
  const rate         = parseFloat(f.rate)          || 0;
  const anyaKharcha  = parseFloat(f.anya_kharcha)  || 0;
  const cessAmt      = parseFloat(f.cess)          || 0;
  const transportAmt = parseFloat(f.transport)     || 0;
  // labour: if anya_kharcha is set (scan/voice mode), labour = 0
  // if field is empty string, use default 5.32; if "0", use 0
  const labRate      = f.labour_rate === "" ? 5.32 : (parseFloat(f.labour_rate) || 0);
  const labour_amount    = anyaKharcha > 0 ? 0 : bags * labRate;
  const gross_amount     = weight * rate;
  const total_deductions = labour_amount + cessAmt + transportAmt + anyaKharcha;
  const net_payable      = gross_amount - total_deductions;

  const selectedFarmer   = farmers.find(ff => ff.id === f.party_id);
  const farmerBal        = selectedFarmer ? partyBalance(selectedFarmer.id) : 0;
  const loanBaaki        = Math.max(0, -farmerBal + (selectedFarmer?.opening_balance || 0));
  const maxLoanRecovery  = Math.min(loanBaaki, net_payable);
  const loanRecoveredAmt = parseFloat(f.loan_recovered) || 0;
  const finalPayment     = net_payable - loanRecoveredAmt;

  const grossMismatch = scanResult?.gross_amount_from_form && gross_amount > 0 &&
    Math.abs(gross_amount - parseFloat(scanResult.gross_amount_from_form)) / gross_amount > 0.01;
  const netMismatch = scanResult?.net_amount_from_form && net_payable > 0 &&
    Math.abs(net_payable - parseFloat(scanResult.net_amount_from_form)) / net_payable > 0.01;

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!f.party_id || !f.commodity || !bags || !weight || !rate) {
      setError("Saare zaroori fields bharein (Kisan, Fasal, Bori, Wazan, Bhao).");
      return;
    }
    setBusy(true); setError("");
    try {
      const billData = {
        party_id: f.party_id, series: f.series, bill_number: nextBillNo(),
        date: f.date, commodity: f.commodity,
        bags, weight, rate, gross_amount,
        labour_rate: labRate, labour_amount,
        cess_amount: cessAmt, transport_amount: transportAmt,
        anya_kharcha: anyaKharcha,
        net_payable, loan_recovered: loanRecoveredAmt, final_payment: finalPayment,
        scanned: scanResult?.scanned || false,
        is_complete: false, created_at: new Date().toISOString(),
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

  // ── Saved screen ──────────────────────────────────────────────────────────────
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

  const ConfidenceBadge = ({ confidence, source }) => {
    const map = {
      high:   { bg: C.greenLight, color: C.green,  label: source === "voice" ? "✓ Achi tarah suna" : "✓ Scan sahi laga" },
      medium: { bg: "#FFF8E1",    color: "#B45309", label: "⚠ Kuch fields check karein" },
      low:    { bg: "#FDF0EE",    color: C.red,     label: "✗ Manually verify karein" },
    };
    const { bg, color, label } = map[confidence] || map.medium;
    return (
      <div style={{ background: bg, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Shell>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={handleFileChange} />
      <input ref={galleryInputRef} type="file" accept="image/*"
        style={{ display: "none" }} onChange={handleFileChange} />

      <div style={{ background: C.pink }}>
        <TopBar title={isEdit ? "Form J — Edit Karein" : "Form J — Naya Khareed"} onBack={onBack} bg="transparent" />
        <div style={{ padding: "4px 16px 18px" }}>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>📥 Kisan se khareed ka bill</p>
        </div>
      </div>

      <div style={{ padding: "16px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10,
            padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── INPUT OPTIONS: Camera / Gallery / Voice ── */}
        {!isEdit && (
          scanning ? (
            <div style={{ background: C.cream, border: `1.5px solid ${C.border}`, borderRadius: 14,
              padding: "16px 20px", marginBottom: 16,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⏳</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.inkMid }}>
                  {recording ? "Recording process ho rahi hai..." : "Form padh raha hai..."}
                </div>
                <div style={{ fontSize: 11, color: C.inkLight }}>Thoda wait karein (~5 sec)</div>
              </div>
            </div>
          ) : (
            <>
              {/* Camera + Gallery */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                    border: "none", borderRadius: 14, padding: "14px 10px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }}>
                  <span style={{ fontSize: 28 }}>📷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Camera</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Abhi photo lo</span>
                </button>
                <button onClick={() => galleryInputRef.current?.click()}
                  style={{ background: C.white, border: `1.5px solid ${C.border}`,
                    borderRadius: 14, padding: "14px 10px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 28 }}>🖼️</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Gallery</span>
                  <span style={{ fontSize: 10, color: C.inkLight }}>Pehle li hui photo</span>
                </button>
              </div>

              {/* Voice input */}
              <button
                onClick={recording ? handleVoiceStop : handleVoiceStart}
                style={{
                  width: "100%", marginBottom: 6,
                  background: recording
                    ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                    : "linear-gradient(135deg, #16a34a, #15803d)",
                  border: "none", borderRadius: 14, padding: "14px 20px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                  cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
                }}>
                <span style={{ fontSize: 28 }}>{recording ? "⏹️" : "🎤"}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {recording ? "Sunna band karein (tap karein)" : "Bol ke bharein"}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                    {recording
                      ? "🔴 Recording chal rahi hai..."
                      : "Kisan, bori, quintal, bhav bolein — kisi bhi order mein"}
                  </div>
                </div>
              </button>

              {/* Transcription display */}
              {transcription && (
                <div style={{ background: C.cream, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
                  <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>🎤 Aapne kaha:</p>
                  <p style={{ fontSize: 13, color: C.inkMid, fontStyle: "italic" }}>"{transcription}"</p>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.inkLight, fontWeight: 600 }}>YA MANUALLY BHAREIN</span>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
            </>
          )
        )}

        {/* ── SCAN/VOICE RESULT BANNER ── */}
        {scanResult && (
          <Card style={{ marginBottom: 12, border: `1.5px solid ${C.green}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 8 }}>
              {scanResult.source === "voice" ? "🎤 Voice Result" : "📋 Scan Result"} — Neeche fields check karein
            </p>
            <ConfidenceBadge confidence={scanResult.confidence} source={scanResult.source} />
            {scanResult.low_confidence_fields?.length > 0 && (
              <div style={{ background: "#FFF8E1", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Ye fields check karein: {scanResult.low_confidence_fields.join(", ")}
                </p>
              </div>
            )}
            {grossMismatch && (
              <p style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 4 }}>
                ⚠️ Kul Raqam mismatch: calculated ₹{fmt(gross_amount)} vs form ₹{fmt(parseFloat(scanResult.gross_amount_from_form))}
              </p>
            )}
            {netMismatch && (
              <p style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>
                ⚠️ Net mismatch: calculated ₹{fmt(net_payable)} vs form ₹{fmt(parseFloat(scanResult.net_amount_from_form))}
              </p>
            )}
            <button onClick={() => setScanResult(null)}
              style={{ marginTop: 4, background: "none", border: "none", fontSize: 11, color: C.inkLight, cursor: "pointer" }}>
              × Band karein
            </button>
          </Card>
        )}

        {/* ── NEW KISAN CONFIRM BOX ── */}
        {newKisanName && (
          <Card style={{ marginBottom: 12, border: `1.5px solid #F59E0B`, background: "#FFF8E1" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
              👤 Naya Kisan mila
            </p>
            <p style={{ fontSize: 12, color: "#78350F", marginBottom: 10 }}>
              Ye kisan aapki list mein nahi hai. Naam sahi hai to "Add Karein" dabayein.
            </p>
            <Field label="Kisan ka Naam (confirm karein)" value={newKisanName} onChange={setNewKisanName} />
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

        {/* ── BASIC INFO ── */}
        <Card style={{ marginBottom: 12 }}>
          <Field label="Bechne wale ka Naam (Kisan) *" value={f.party_id}
            onChange={v => s("party_id", v)} placeholder="Kisan chunein..."
            options={farmers.map(ff => ({ value: ff.id, label: `${ff.name}${ff.place ? " — " + ff.place : ""}` }))} />
          {selectedFarmer && loanBaaki > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "9px 12px",
              marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span>⚠️</span>
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Udhar baaki: ₹{fmt(loanBaaki)}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Tithi (Nilami ki)" value={f.date} onChange={v => s("date", v)} type="date" required />
            <Field label="Series" value={f.series} onChange={v => s("series", v)}
              options={["Form J1", "Form J2", "Form J3"]} />
          </div>
          <Field label="Fasal (Commodity) *" value={f.commodity} onChange={v => s("commodity", v)}
            placeholder="Fasal chunein..."
            options={["Wheat", "Paddy", "Bajra", "Maize", "Mustard", "Other"]} />
        </Card>

        {/* ── MAAL KI JAANKARI ── */}
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>📦 Maal ki Jaankari</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Bori (Bags) *" value={f.bags} onChange={v => s("bags", v)} type="number" placeholder="0" />
            <Field label="Wazan (Quintal) *" value={f.weight} onChange={v => s("weight", v)} type="number" placeholder="0" />
          </div>
          <Field label="Bhao (₹ per Quintal) *" value={f.rate} onChange={v => s("rate", v)}
            type="number" prefix="₹" suffix="/qtl" placeholder="0" />
          {gross_amount > 0 && (
            <div style={{ background: C.greenLight, borderRadius: 8, padding: "12px 14px", marginTop: 6 }}>
              <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>{weight} qtl × ₹{rate}/qtl</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Kul Raqam</span>
                <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 20, color: C.green }}>
                  ₹{fmt(gross_amount)}
                </span>
              </div>
              {scanResult?.gross_amount_from_form && (
                <div style={{ fontSize: 11, color: grossMismatch ? C.red : C.inkLight, marginTop: 4 }}>
                  Form par likha: ₹{fmt(parseFloat(scanResult.gross_amount_from_form))}
                  {grossMismatch ? " ⚠ Match nahi" : " ✓"}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── KHARCHE ── */}
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 4 }}>💸 Kharche</p>
          {anyaKharcha > 0 ? (
            <div>
              <div style={{ background: "#FFF8E1", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: "#92400E" }}>
                  📷 Scan/Voice se: कुल खर्च fill hua hai. Individual kharche manually add kar sakte hain.
                </p>
              </div>
              <Field label="Kul Kharcha / जोड़" value={f.anya_kharcha} onChange={v => s("anya_kharcha", v)}
                type="number" prefix="₹" hint="Edit kar sakte hain" />
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Labour / Utarai (₹/bori)" value={f.labour_rate}
                  onChange={v => s("labour_rate", v)} type="number" prefix="₹" hint="Default ₹5.32/bori" />
                <Field label="Cess (₹)" value={f.cess} onChange={v => s("cess", v)} type="number" prefix="₹" placeholder="0" />
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

        {gross_amount > 0 && labour_amount > 0 && !mazdooriAccount && (
          <div style={{ background: "#FFF8E1", border: "1.5px solid #F59E0B", borderRadius: 12,
            padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>⚠️ Mazdoori account nahi mila</p>
            <p style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5, marginBottom: 10 }}>
              Labour ₹{fmt(labour_amount)} kat rahi hai. Balance Sheet mein track karne ke liye Mazdoori Expense account banayein.
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

        {/* ── GRAND TOTAL ── */}
        {gross_amount > 0 && (
          <Card style={{ marginBottom: 12, background: C.pinkLight, border: `1.5px solid ${C.pink}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.pink, marginBottom: 8 }}>
              📊 Grand Total — Kisan ko milega
            </p>
            <Row label="Kul Raqam (weight × bhao)" amount={gross_amount} />
            <Row label="Kul Kharche (−)" amount={total_deductions} color={C.red} />
            <Row label="Net Payable (Kisan ko)" amount={net_payable} bold color={C.green} />
            {scanResult?.net_amount_from_form && (
              <div style={{ fontSize: 11, color: netMismatch ? C.red : C.inkLight, padding: "4px 0" }}>
                Form par "रकम साफी": ₹{fmt(parseFloat(scanResult.net_amount_from_form))}
                {netMismatch ? " ⚠ Match nahi" : " ✓ Match"}
              </div>
            )}
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

        <Btn variant="pink" onClick={handleSave}
          disabled={busy || !f.party_id || !f.commodity || !bags || !weight || !rate}>
          {busy ? "Save ho raha hai..." : isEdit ? "✓ Update Karein" : "✓ Form J Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}

function today() {
  return new Date().toISOString().split("T")[0];
}

// parseDate: converts any date format Gemini might return → YYYY-MM-DD
// Handles: "2024-12-03", "3-12-2024", "3/12/2024", "3 12 2024", "03-12-24"
function parseDate(raw) {
  if (!raw || typeof raw !== "string") return "";
  raw = raw.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Split by any separator: -, /, space
  const parts = raw.split(/[-\/\s]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length !== 3) return "";

  let [a, b, c] = parts;

  // Determine which is year (4 digits or 2 digits > 20)
  let d, m, y;
  if (c.length === 4 || (c.length === 2 && parseInt(c) > 20)) {
    // Format: D-M-YYYY or D-M-YY
    d = a; m = b; y = c;
  } else if (a.length === 4) {
    // Format: YYYY-M-D
    y = a; m = b; d = c;
  } else {
    // Assume D-M-YY
    d = a; m = b; y = c;
  }

  if (y.length === 2) y = "20" + y;

  const dd = parseInt(d), mm = parseInt(m), yy = parseInt(y);
  if (isNaN(dd) || isNaN(mm) || isNaN(yy)) return "";
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return "";

  return `${yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
}
