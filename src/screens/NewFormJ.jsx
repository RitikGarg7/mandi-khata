/**
 * screens/NewFormJ.jsx
 *
 * Form J (Khareed Bill) entry screen.
 * Pure UI — all logic is in hooks/useFormJ.js
 *
 * Renders:
 * - Scan (camera/gallery) + Voice input buttons
 * - Scan result banner with confidence + mismatch warnings
 * - New kisan confirmation box
 * - Form fields (party, date, commodity, bags, weight, rate)
 * - Deductions section (scan mode vs manual mode)
 * - Grand total with cross-validation
 * - Loan recovery section
 */

import { useFormJ } from "../hooks/useFormJ";
import { Shell, C, Card, TopBar, Btn, Field, Divider, Row, fmt } from "../components/ui";
import { COMMODITIES, BILL_SERIES } from "../constants/index";

export default function NewFormJ({ onBack, nav, editData }) {
  const {
    f, set,
    busy, scanning, error, saved,
    scanResult, newKisanName, creatingKisan,
    recording, transcription,
    isEdit,
    fileInputRef, galleryInputRef,
    calcs, labourRate, selectedFarmer,
    loanBaaki, maxLoanRecovery, scanMismatches,
    nextBillNo, farmers,
    handleFileChange, handleVoiceStart, handleVoiceStop,
    handleCreateNewKisan, handleSave,
    clearScan, setNewKisanName,
  } = useFormJ(editData);

  const anyaKharcha = parseFloat(f.anya_kharcha) || 0;
  const loanRecoveredAmt = parseFloat(f.loan_recovered) || 0;
  const grossMismatch = scanMismatches.includes("gross");
  const netMismatch   = scanMismatches.includes("net");

  // ── Saved screen ─────────────────────────────────────────────────────────────
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

  return (
    <Shell>
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={handleFileChange} />
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

        {/* Error */}
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10,
            padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── INPUT OPTIONS ── */}
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

              <button onClick={recording ? handleVoiceStop : handleVoiceStart}
                style={{ width: "100%", marginBottom: 6, border: "none", borderRadius: 14,
                  padding: "14px 20px", cursor: "pointer",
                  background: recording
                    ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                    : "linear-gradient(135deg, #16a34a, #15803d)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                  boxShadow: "0 4px 15px rgba(0,0,0,0.15)" }}>
                <span style={{ fontSize: 28 }}>{recording ? "⏹️" : "🎤"}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {recording ? "Sunna band karein (tap karein)" : "Bol ke bharein"}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                    {recording ? "🔴 Recording chal rahi hai..." : "Kisan, bori, quintal, bhav bolein"}
                  </div>
                </div>
              </button>

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

        {/* ── SCAN RESULT BANNER ── */}
        {scanResult && (
          <Card style={{ marginBottom: 12, border: `1.5px solid ${C.green}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 8 }}>
              {scanResult.source === "voice" ? "🎤 Voice" : "📋 Scan"} Result — Fields check karein
            </p>
            <ConfidenceBadge confidence={scanResult.confidence} />
            {scanResult.low_confidence_fields?.length > 0 && (
              <div style={{ background: "#FFF8E1", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
                <p style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                  ⚠️ Check karein: {scanResult.low_confidence_fields.join(", ")}
                </p>
              </div>
            )}
            {grossMismatch && (
              <p style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 4 }}>
                ⚠️ Kul Raqam mismatch: calc ₹{fmt(calcs.gross)} vs form ₹{fmt(parseFloat(scanResult.gross_amount_from_form))}
              </p>
            )}
            {netMismatch && (
              <p style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>
                ⚠️ Net mismatch: calc ₹{fmt(calcs.net_payable)} vs form ₹{fmt(parseFloat(scanResult.net_amount_from_form))}
              </p>
            )}
            <button onClick={clearScan}
              style={{ marginTop: 4, background: "none", border: "none", fontSize: 11, color: C.inkLight, cursor: "pointer" }}>
              × Band karein
            </button>
          </Card>
        )}

        {/* ── NEW KISAN CONFIRM ── */}
        {newKisanName && (
          <Card style={{ marginBottom: 12, border: `1.5px solid #F59E0B`, background: "#FFF8E1" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
              👤 Naya Kisan mila
            </p>
            <p style={{ fontSize: 12, color: "#78350F", marginBottom: 10 }}>
              Ye kisan list mein nahi. Naam sahi hai to "Add Karein".
            </p>
            <Field label="Kisan ka Naam" value={newKisanName} onChange={setNewKisanName} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={handleCreateNewKisan} disabled={creatingKisan}
                style={{ flex: 1, background: "#F59E0B", color: "#fff", border: "none",
                  borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {creatingKisan ? "..." : "✓ Add Karein"}
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
            onChange={v => set("party_id", v)} placeholder="Kisan chunein..."
            options={farmers.map(ff => ({ value: ff.id, label: `${ff.name}${ff.place ? " — " + ff.place : ""}` }))} />
          {selectedFarmer && loanBaaki > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "9px 12px", marginBottom: 12,
              display: "flex", gap: 8, alignItems: "center" }}>
              <span>⚠️</span>
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Udhar baaki: ₹{fmt(loanBaaki)}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Tithi *" value={f.date} onChange={v => set("date", v)} type="date" />
            <Field label="Series" value={f.series} onChange={v => set("series", v)} options={BILL_SERIES} />
          </div>
          <Field label="Fasal *" value={f.commodity} onChange={v => set("commodity", v)}
            placeholder="Fasal chunein..." options={COMMODITIES} />
        </Card>

        {/* ── MAAL KI JAANKARI ── */}
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>📦 Maal ki Jaankari</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Bori (Bags) *" value={f.bags} onChange={v => set("bags", v)} type="number" placeholder="0" />
            <Field label="Wazan (Quintal) *" value={f.weight} onChange={v => set("weight", v)} type="number" placeholder="0" />
          </div>
          <Field label="Bhao (₹/Quintal) *" value={f.rate} onChange={v => set("rate", v)}
            type="number" prefix="₹" suffix="/qtl" placeholder="0" />
          {calcs.gross > 0 && (
            <div style={{ background: C.greenLight, borderRadius: 8, padding: "12px 14px", marginTop: 6 }}>
              <div style={{ fontSize: 11, color: C.inkLight, marginBottom: 2 }}>
                {f.weight} qtl × ₹{f.rate}/qtl
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Kul Raqam</span>
                <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 20, color: C.green }}>
                  ₹{fmt(calcs.gross)}
                </span>
              </div>
              {scanResult?.gross_amount_from_form && (
                <div style={{ fontSize: 11, color: grossMismatch ? C.red : C.inkLight, marginTop: 4 }}>
                  Form par: ₹{fmt(parseFloat(scanResult.gross_amount_from_form))} {grossMismatch ? "⚠" : "✓"}
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
                  📷 Scan/Voice se fill hua — edit kar sakte hain
                </p>
              </div>
              <Field label="Kul Kharcha / जोड़" value={f.anya_kharcha}
                onChange={v => set("anya_kharcha", v)} type="number" prefix="₹" />
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Labour / Utarai (₹/bori)" value={f.labour_rate}
                  onChange={v => set("labour_rate", v)} type="number" prefix="₹" hint="Default ₹5.32" />
                <Field label="Cess (₹)" value={f.cess}
                  onChange={v => set("cess", v)} type="number" prefix="₹" placeholder="0" />
              </div>
              <Field label="Transport / Kiraya (₹)" value={f.transport}
                onChange={v => set("transport", v)} type="number" prefix="₹" placeholder="0" />
              <Field label="Anya Kharcha (₹)" value={f.anya_kharcha}
                onChange={v => set("anya_kharcha", v)} type="number" prefix="₹" placeholder="0" />
            </div>
          )}
          {calcs.total_deductions > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "10px 14px", marginTop: 8,
              display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Kul Kharche</span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 15, color: C.red }}>
                − ₹{fmt(calcs.total_deductions)}
              </span>
            </div>
          )}
        </Card>

        {/* ── GRAND TOTAL ── */}
        {calcs.gross > 0 && (
          <Card style={{ marginBottom: 12, background: C.pinkLight, border: `1.5px solid ${C.pink}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.pink, marginBottom: 8 }}>
              📊 Grand Total — Kisan ko milega
            </p>
            <Row label="Kul Raqam" amount={calcs.gross} />
            <Row label="Kul Kharche (−)" amount={calcs.total_deductions} color={C.red} />
            <Row label="Net Payable (Kisan ko)" amount={calcs.net_payable} bold color={C.green} />
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
                  onChange={v => set("loan_recovered", v)} type="number" prefix="₹"
                  hint={`Max: ₹${fmt(maxLoanRecovery)}`} />
                {loanRecoveredAmt > 0 && (
                  <>
                    <Row label="Loan recovery (−)" amount={loanRecoveredAmt} color={C.red} />
                    <Row label="Haath mein milega" amount={calcs.final_payment} bold color={C.green} />
                  </>
                )}
              </>
            )}
          </Card>
        )}

        <Btn variant="pink" onClick={handleSave}
          disabled={busy || !f.party_id || !f.commodity || !f.bags || !f.weight || !f.rate}>
          {busy ? "Save ho raha hai..." : isEdit ? "✓ Update Karein" : "✓ Form J Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }) {
  const map = {
    high:   { bg: C.greenLight, color: C.green,  label: "✓ Scan sahi laga" },
    medium: { bg: "#FFF8E1",    color: "#B45309", label: "⚠ Kuch fields check karein" },
    low:    { bg: "#FDF0EE",    color: C.red,     label: "✗ Manually verify karein" },
  };
  const { bg, color, label } = map[confidence] || map.medium;
  return (
    <div style={{ background: bg, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
    </div>
  );
}
