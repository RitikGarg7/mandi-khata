import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Tag, fmt } from "../components/ui";
import PinConfirm from "../components/PinConfirm";
import { useKhata } from "../hooks/useKhata";

export default function Khata({ party, onBack }) {
  const k = useKhata(party);
  const { parties, payments, ledger, savePayment, deletePayment, trueBalance, computePartyInterest } = useApp();
  const bankAccounts = parties.filter(p => p.type === "Bank");
  const [showPay, setShowPay]         = useState(false);
  const [showNakad, setShowNakad]     = useState(false);
  const [nakadAmt, setNakadAmt]       = useState("");
  const [nakadDate, setNakadDate]     = useState(new Date().toISOString().split("T")[0]);
  const [nakadNote, setNakadNote]     = useState("");
  const [selEntry, setSelEntry]       = useState(null); // selected ledger entry
  const [pinAction, setPinAction]     = useState(null); // "edit" | "delete"
  const [showByaaj, setShowByaaj]     = useState(false);
  const [editingPay, setEditingPay]   = useState(null); // payment data pre-filled for edit
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState("");
  const [pay, setPay] = useState({
    type: "bank_receipt",
    amount: "",
    bank_party_id: "",
    reference: "",
    date: new Date().toISOString().split("T")[0],
    narration: "",
  });
  const sp = (k, v) => setPay(p => ({ ...p, [k]: v }));

  if (!party) {
    return (
      <Shell>
        <TopBar title="Khata" onBack={onBack} />
        <p style={{ textAlign: "center", padding: 40, color: C.inkLight }}>Party nahi mili.</p>
      </Shell>
    );
  }

  const isFarmer = party.type === "Farmer";
  const accent   = isFarmer ? C.pink : C.saffron;

  const partyLedger = ledger
    .filter(e => e.party_id === party.id)
    .sort((a, b) => a.date?.localeCompare(b.date));

  // Build running balance
  let running = party.opening_balance || 0;
  const ledgerWithBal = partyLedger.map(e => {
    running += (e.debit || 0) - (e.credit || 0);
    return { ...e, running_balance: running };
  });

  const bal = trueBalance(party);
  const displayBal = Math.abs(bal);
  const isCredit = bal < 0; // we owe them
  const accruedInterest = computePartyInterest(party);

  const handlePaySave = async () => {
    if (!pay.amount || parseFloat(pay.amount) <= 0) { setError("Raqam sahi nahi hai."); return; }
    setBusy(true); setError("");
    try {
      if (editingPay) {
        // Delete old + save new (simplest update path)
        await deletePayment(editingPay.id);
      }
      await savePayment({
        party_id: party.id,
        date: pay.date,
        type: pay.type,
        amount: parseFloat(pay.amount),
        reference: pay.reference,
        narration: pay.narration || pay.type,
      });
      setShowPay(false);
      setEditingPay(null);
      setPay({ type: "bank_receipt", amount: "", reference: "", date: new Date().toISOString().split("T")[0], narration: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!selEntry) return;
    setBusy(true);
    try {
      const payId = selEntry.source_id;
      await deletePayment(payId);
      setSelEntry(null);
    } catch (e) {
      setError(e.message);
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
      date:      paymentData.date      || new Date().toISOString().split("T")[0],
      narration: paymentData.narration || "",
    });
    setSelEntry(null);
    setShowPay(true);
  };

  return (
    <Shell>
      {pinAction && (
        <PinConfirm
          prompt={pinAction === "delete" ? "Delete confirm karne ke liye PIN" : "Edit karne ke liye PIN"}
          onConfirm={() => { const a = pinAction; setPinAction(null); a === "delete" ? handleDeleteEntry() : openEditEntry(); }}
          onCancel={() => setPinAction(null)}
        />
      )}

      {/* Byaaj trail popover */}
      {showByaaj && (
        <ByaajTrailPopover
          party={party}
          trail={k.interestTrail}
          accruedInterest={k.accruedInterest}
          onClose={() => setShowByaaj(false)}
        />
      )}

      {/* Payment detail bottom sheet */}
      {selEntry && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100 }} onClick={() => setSelEntry(null)}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: C.white, borderRadius: "20px 20px 0 0", padding: "24px 18px 36px" }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.ink }}>Payment Details</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                ["Tarikh", selEntry.date],
                ["Type", selEntry.narration],
                ["Debit", selEntry.debit > 0 ? `₹${fmt(selEntry.debit)}` : "—"],
                ["Credit", selEntry.credit > 0 ? `₹${fmt(selEntry.credit)}` : "—"],
              ].map(([label, val]) => (
                <div key={label} style={{ background: C.cream, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: C.inkLight }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                </div>
              ))}
            </div>
            {selEntry.source_type === "payment" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => setPinAction("edit")}
                  style={{ padding: "12px 0", background: accent, color: C.white, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Edit
                </button>
                <button onClick={() => setPinAction("delete")}
                  style={{ padding: "12px 0", background: "#FDF0EE", color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: accent }}>
        <TopBar title="Khata" onBack={onBack} bg="transparent" />
        <div style={{ padding: "10px 16px 20px" }}>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
            {isFarmer ? "👨‍🌾 Kisan" : "🏭 Buyer"} · {party.place} · {party.phone || "—"}
          </p>
          <h3 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 22, color: C.white, marginTop: 4 }}>{party.name}</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Current Balance</p>
              <p style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 28, color: C.white }}>₹{fmt(displayBal)}</p>
              {/* bal > 0 = farmer owes arhtiya = interest accrues */}
              {/* bal < 0 = arhtiya owes farmer = interest free */}
              {accruedInterest > 0 && bal > 0 && (
                <button onClick={() => setShowByaaj(true)}
                  style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)",
                    borderRadius: 20, padding: "3px 12px", marginTop: 6, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>📈</span>
                  <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>
                    + ₹{fmt(accruedInterest)} byaaj
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>dekhein →</span>
                </button>
              )}
              {bal < 0 && party.interest_rate > 0 && (
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>
                  ✓ Byaaj free (farmer ka paisa hai)
                </p>
              )}
            </div>
            <Tag color={C.white} bg="rgba(255,255,255,0.2)">
              {displayBal === 0 ? "✓ Saaf" : isCredit ? "Humara dena baaki" : isFarmer ? "Loan baaki" : "Lena baaki"}
            </Tag>
          </div>
          <button onClick={() => setShowPay(v => !v)}
            style={{ marginTop: 14, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "10px 0", color: C.white, fontSize: 13, fontWeight: 600, width: "100%", cursor: "pointer" }}>
            💳 Payment Record Karein
          </button>
          {/* Nakad Dena — cash advance to farmer from his own balance or as new loan */}
          {isFarmer && (
            <button onClick={() => setShowNakad(v => !v)}
              style={{ marginTop: 8, background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "10px 0", color: C.white, fontSize: 13, fontWeight: 600, width: "100%", cursor: "pointer" }}>
              💵 Nakad Dena (Cash Advance)
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "14px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {showPay && (
          <Card style={{ marginBottom: 14, border: `1.5px solid ${accent}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{editingPay ? "Payment Edit Karein" : "Payment / Receipt Record Karein"}</p>
            <Field label="Type" value={pay.type} onChange={v => { sp("type", v); sp("bank_party_id", ""); }}
              options={[
                { value: "bank_receipt",  label: "Bank Receipt (paisa aaya)" },
                { value: "bank_payment",  label: "Bank Payment (paisa diya)" },
                { value: "cash_receipt",  label: "Cash Receipt" },
                { value: "cash_payment",  label: "Cash Payment" },
              ]} />
            <Field label="Raqam" value={pay.amount} onChange={v => sp("amount", v)} type="number" prefix="₹" required />
            {["bank_receipt","bank_payment"].includes(pay.type) && (
              <Field label="Bank Account" value={pay.bank_party_id} onChange={v => sp("bank_party_id", v)}
                placeholder="Bank chunein (optional)"
                options={bankAccounts.map(b => ({ value: b.id, label: b.name }))} />
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Cheque / Ref" value={pay.reference} onChange={v => sp("reference", v)} placeholder="Optional" />
              <Field label="Tarikh" value={pay.date} onChange={v => sp("date", v)} type="date" />
            </div>
            <Field label="Narration" value={pay.narration} onChange={v => sp("narration", v)} placeholder="Koi baat likhein..." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Btn variant="secondary" onClick={() => setShowPay(false)}>Raddh</Btn>
              <Btn onClick={handlePaySave} disabled={busy}>{busy ? "..." : "Save"}</Btn>
            </div>
          </Card>
        )}

        {/* Nakad Dena form */}
        {showNakad && (
          <Card style={{ marginBottom: 14, border: `1.5px solid ${accent}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>💵 Nakad Dena — Cash Advance</p>
            {bal > 0 ? (
              <p style={{ fontSize: 11, color: C.green, marginBottom: 10 }}>
                ✓ Farmer ka balance: ₹{fmt(bal)} — is amount tak interest free hai
              </p>
            ) : (
              <p style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>
                ⚠ Farmer pehle se ₹{fmt(Math.abs(bal))} mein udhar hai — aur dene par byaaj lagega
              </p>
            )}
            <Field label="Raqam (₹)" value={nakadAmt} onChange={setNakadAmt} type="number" prefix="₹" required />
            <Field label="Tarikh" value={nakadDate} onChange={setNakadDate} type="date" />
            <Field label="Note (optional)" value={nakadNote} onChange={setNakadNote} placeholder="Koi baat likhein..." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <Btn variant="secondary" onClick={() => setShowNakad(false)}>Raddh</Btn>
              <Btn onClick={async () => {
                if (!nakadAmt || parseFloat(nakadAmt) <= 0) return;
                setBusy(true);
                try {
                  await savePayment({
                    party_id: party.id,
                    date: nakadDate,
                    type: "cash_payment",
                    amount: parseFloat(nakadAmt),
                    reference: "",
                    narration: nakadNote || "Nakad diya (cash advance)",
                  });
                  setShowNakad(false);
                  setNakadAmt(""); setNakadNote("");
                  setNakadDate(new Date().toISOString().split("T")[0]);
                } catch(e) { setError(e.message); }
                finally { setBusy(false); }
              }} disabled={busy || !nakadAmt}>
                {busy ? "..." : "✓ Save"}
              </Btn>
            </div>
          </Card>
        )}

        <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
          Account Statement
        </p>

        {ledgerWithBal.length === 0 ? (
          <Card>
            <p style={{ textAlign: "center", color: C.inkLight, fontSize: 13, padding: "16px 0" }}>Koi entries nahi</p>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", padding: "9px 14px", background: C.cream, borderBottom: `1px solid ${C.border}` }}>
              {["Vivaran", "Debit", "Credit"].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, textAlign: h !== "Vivaran" ? "right" : "left" }}>{h}</span>
              ))}
            </div>

            {ledgerWithBal.map((e, i) => (
              <div key={e.id} onClick={() => setSelEntry(e)}
                style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", padding: "11px 14px", borderBottom: i < ledgerWithBal.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{e.narration}</div>
                  <div style={{ fontSize: 10, color: C.inkLight, marginTop: 2 }}>{e.date}</div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "'Baloo 2'", fontSize: 12, color: C.red }}>
                  {e.debit > 0 ? `₹${fmt(e.debit)}` : "—"}
                </div>
                <div style={{ textAlign: "right", fontFamily: "'Baloo 2'", fontSize: 12, color: C.green }}>
                  {e.credit > 0 ? `₹${fmt(e.credit)}` : "—"}
                </div>
              </div>
            ))}

            <div style={{ padding: "11px 14px", background: C.cream, borderTop: `2px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Closing Balance</span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 15, color: accent }}>₹{fmt(displayBal)}</span>
            </div>
          </Card>
        )}

        <div style={{ marginTop: 14, padding: "12px 14px", background: C.cream, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 4 }}>Party Info</p>
          {party.gstin && <p style={{ fontSize: 12 }}>GSTIN: {party.gstin}</p>}
          {party.opening_balance > 0 && (
            <p style={{ fontSize: 12 }}>
              Opening Balance: ₹{fmt(party.opening_balance)}
              {party.opening_balance_date && ` · ${new Date(party.opening_balance_date).toLocaleDateString("hi-IN", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          )}
          {party.interest_rate > 0 && (
            <p style={{ fontSize: 12 }}>
              Byaaj dar: {party.interest_rate}% / saal
              {accruedInterest > 0 && bal > 0 && ` · Abhi tak: ₹${fmt(accruedInterest)}`}
              {bal <= 0 && " · Abhi byaaj nahi (balance positive hai)"}
            </p>
          )}
          {party.notes && <p style={{ fontSize: 12, marginTop: 4, color: C.inkMid }}>{party.notes}</p>}
        </div>
      </div>
    </Shell>
  );
}

// ── Byaaj Trail Popover ───────────────────────────────────────────────────────

function ByaajTrailPopover({ party, trail, accruedInterest, onClose }) {
  const [showCalc, setShowCalc] = useState(false);

  const totalByaaj = (trail || [])
    .filter(s => s.type === "interest")
    .reduce((sum, s) => sum + s.interest, 0);

  const rate = parseFloat(party?.interest_rate) || 0;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.white, borderRadius: "20px 20px 0 0",
          maxHeight: "82vh", display: "flex", flexDirection: "column" }}>

        {/* Drag handle */}
        <div style={{ padding: "12px 0 4px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
        </div>

        {/* Header */}
        <div style={{ padding: "8px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Baloo 2'", color: C.ink }}>
                📈 Byaaj ka hisaab
              </p>
              <p style={{ fontSize: 12, color: C.inkLight, marginTop: 2 }}>
                {party?.name} · {rate}% / mahina
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 11, color: C.inkLight }}>Aaj tak ka byaaj</p>
                <p style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 22, color: C.red }}>
                  ₹{fmt(totalByaaj)}
                </p>
              </div>
              <button onClick={() => setShowCalc(true)}
                style={{ background: C.ink, border: "none", borderRadius: 20,
                  padding: "5px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 14 }}>🧮</span>
                <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>Calculator</span>
              </button>
            </div>
          </div>
        </div>

        {/* Calculator sheet — slides over trail */}
        {showCalc && (
          <ByaajCalculator
            onClose={() => setShowCalc(false)}
          />
        )}

        {/* Trail rows */}
        <div style={{ overflowY: "auto", padding: "10px 0 32px" }}>
          {(!trail || trail.length === 0) ? (
            <p style={{ textAlign: "center", color: C.inkLight, padding: "32px 0", fontSize: 14 }}>
              Abhi tak byaaj nahi laga
            </p>
          ) : trail.map((seg, i) => (
            seg.type === "compound" ? (
              /* ── 1st April compounding row ── */
              <div key={i} style={{ margin: "6px 16px", padding: "10px 14px",
                background: "#FFF8E1", borderRadius: 12, border: "1px solid #FFE082",
                display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>🔄</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#F57F17" }}>
                    1 April — Byaaj juda
                  </p>
                  <p style={{ fontSize: 12, color: C.inkMid, marginTop: 2 }}>
                    ₹{fmt(seg.addedInterest)} byaaj, udhaar mein jod diya
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, color: C.inkLight }}>Naya udhaar</p>
                  <p style={{ fontWeight: 700, fontSize: 14, color: C.ink, fontFamily: "'Baloo 2'" }}>
                    ₹{fmt(seg.newPrincipal)}
                  </p>
                </div>
              </div>
            ) : (
              /* ── Regular interest period row ── */
              <div key={i} style={{ padding: "12px 20px",
                borderBottom: i < trail.length - 1 ? `1px solid ${C.border}` : "none" }}>

                {/* Period label */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                      {seg.label}
                    </p>
                    {/* Plain language explanation */}
                    <p style={{ fontSize: 11, color: C.inkLight, marginTop: 3, lineHeight: 1.5 }}>
                      ₹{fmt(seg.principal)} udhaar × {rate}% × {seg.duration}
                    </p>
                  </div>
                  <p style={{ fontFamily: "'Baloo 2'", fontWeight: 700,
                    fontSize: 15, color: C.red, flexShrink: 0, marginLeft: 12 }}>
                    + ₹{fmt(seg.interest)}
                  </p>
                </div>
              </div>
            )
          ))}

          {/* Summary box at bottom */}
          {trail && trail.length > 0 && (
            <div style={{ margin: "16px 16px 0", padding: 14,
              background: "#FFF3E0", borderRadius: 14,
              border: "1px solid #FFCC80" }}>
              <Row label="Kul udhaar (aaj)" value={`₹${fmt(party?.opening_balance || 0)}`} />
              <Row label="Kul byaaj bana" value={`+ ₹${fmt(totalByaaj)}`} valueColor={C.red} />
              <div style={{ borderTop: `1px solid #FFCC80`, marginTop: 8, paddingTop: 8 }}>
                <Row
                  label="Aaj tak dena hai"
                  value={`₹${fmt((parseFloat(party?.opening_balance) || 0) + totalByaaj)}`}
                  bold
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: C.inkMid, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: "'Baloo 2'", fontWeight: bold ? 800 : 600,
        fontSize: bold ? 16 : 13, color: valueColor || C.ink }}>{value}</span>
    </div>
  );
}

// ── Byaaj Calculator ──────────────────────────────────────────────────────────

function ByaajCalculator({ onClose }) {
  const [display, setDisplay] = useState("0");
  const [prev,    setPrev]    = useState(null);
  const [op,      setOp]      = useState(null);
  const [fresh,   setFresh]   = useState(true); // next digit replaces display

  const MAX_DIGITS = 12;

  const fmtDisplay = (val) => {
    const n = parseFloat(val);
    if (isNaN(n)) return "Error";
    // show decimals only if present
    const hasDecimal = val.includes(".");
    if (hasDecimal) return val; // show raw while typing decimal
    return n.toLocaleString("en-IN");
  };

  const pressDigit = (d) => {
    setDisplay(prev => {
      if (fresh) { setFresh(false); return d === "." ? "0." : d; }
      if (d === "." && prev.includes(".")) return prev;
      if (prev === "0" && d !== ".") return d;
      if (prev.replace(".", "").replace("-", "").length >= MAX_DIGITS) return prev;
      return prev + d;
    });
  };

  const pressOp = (newOp) => {
    const cur = parseFloat(display);
    if (prev !== null && !fresh) {
      const result = calculate(prev, cur, op);
      setPrev(result);
      setDisplay(String(result));
    } else {
      setPrev(cur);
    }
    setOp(newOp);
    setFresh(true);
  };

  const pressEquals = () => {
    if (op === null || prev === null) return;
    const cur    = parseFloat(display);
    const result = calculate(prev, cur, op);
    setDisplay(String(result));
    setPrev(null);
    setOp(null);
    setFresh(true);
  };

  const calculate = (a, b, operation) => {
    let r;
    if (operation === "+") r = a + b;
    else if (operation === "−") r = a - b;
    else if (operation === "×") r = a * b;
    else if (operation === "÷") r = b !== 0 ? a / b : 0;
    else return b;
    // round to avoid floating point noise
    return Math.round(r * 1e8) / 1e8;
  };

  const pressClear = () => {
    setDisplay("0"); setPrev(null); setOp(null); setFresh(true);
  };

  const pressPlusMinus = () => {
    setDisplay(d => String(parseFloat(d) * -1));
  };

  const pressPercent = () => {
    setDisplay(d => String(parseFloat(d) / 100));
    setFresh(true);
  };

  const pressBackspace = () => {
    setDisplay(d => {
      if (fresh || d.length <= 1) return "0";
      const next = d.slice(0, -1);
      return next === "-" || next === "" ? "0" : next;
    });
    setFresh(false);
  };

  // Button colors — iPhone style
  const CLR = { func: "#A5A5A5", op: "#FF9500", num: "#333333", zero: "#333333" };
  const TXT = { func: "#000", op: "#fff", num: "#fff" };

  const Btn2 = ({ label, type = "num", wide = false, onPress }) => (
    <button
      onPointerDown={e => { e.preventDefault(); onPress(); }}
      style={{
        gridColumn: wide ? "span 2" : "span 1",
        background: type === "op" && op === label ? "#fff" : CLR[type],
        color: type === "op" && op === label ? CLR.op : TXT[type],
        border: "none", borderRadius: "50%",
        fontSize: wide ? 30 : 28,
        fontWeight: 400,
        fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: wide ? "flex-start" : "center",
        paddingLeft: wide ? 28 : 0,
        aspectRatio: wide ? "auto" : "1",
        height: wide ? undefined : "100%",
        width: "100%",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        transition: "filter 0.1s",
        boxSizing: "border-box",
      }}>
      {label}
    </button>
  );

  const displayVal = fmtDisplay(display);
  const fontSize = displayVal.length > 9 ? 36 : displayVal.length > 6 ? 44 : 56;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000",
      borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column",
      zIndex: 10, overflow: "hidden" }}>

      {/* Back button */}
      <div style={{ padding: "14px 18px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onClose}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 20,
            padding: "6px 14px", color: "#fff", fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6 }}>
          ← Wapas
        </button>
      </div>

      {/* Display */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end",
        justifyContent: "flex-end", padding: "0 24px 16px" }}>
        <p style={{
          fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
          fontWeight: 200, fontSize, color: "#fff",
          letterSpacing: -2, lineHeight: 1, wordBreak: "break-all", textAlign: "right"
        }}>
          {displayVal}
        </p>
      </div>

      {/* Buttons grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12, padding: "0 16px 32px",
        gridAutoRows: "calc((100vw - 32px - 36px) / 4)",
      }}>
        <Btn2 label="AC"  type="func"  onPress={pressClear} />
        <Btn2 label="+/-" type="func"  onPress={pressPlusMinus} />
        <Btn2 label="%"   type="func"  onPress={pressPercent} />
        <Btn2 label="÷"   type="op"    onPress={() => pressOp("÷")} />

        <Btn2 label="7"   onPress={() => pressDigit("7")} />
        <Btn2 label="8"   onPress={() => pressDigit("8")} />
        <Btn2 label="9"   onPress={() => pressDigit("9")} />
        <Btn2 label="×"   type="op"    onPress={() => pressOp("×")} />

        <Btn2 label="4"   onPress={() => pressDigit("4")} />
        <Btn2 label="5"   onPress={() => pressDigit("5")} />
        <Btn2 label="6"   onPress={() => pressDigit("6")} />
        <Btn2 label="−"   type="op"    onPress={() => pressOp("−")} />

        <Btn2 label="1"   onPress={() => pressDigit("1")} />
        <Btn2 label="2"   onPress={() => pressDigit("2")} />
        <Btn2 label="3"   onPress={() => pressDigit("3")} />
        <Btn2 label="+"   type="op"    onPress={() => pressOp("+")} />

        <Btn2 label="⌫"   onPress={pressBackspace} />
        <Btn2 label="0"   onPress={() => pressDigit("0")} />
        <Btn2 label="."   onPress={() => pressDigit(".")} />
        <Btn2 label="="   type="op"    onPress={pressEquals} />
      </div>
    </div>
  );
}
