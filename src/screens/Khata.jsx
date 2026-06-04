import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Tag, fmt } from "../components/ui";

export default function Khata({ party, onBack }) {
  const { ledger, savePayment, partyBalance } = useApp();
  const [showPay, setShowPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pay, setPay] = useState({
    type: "bank_receipt",
    amount: "",
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

  const currentBal = partyBalance(party.id);
  const displayBal = Math.abs(currentBal + (party.opening_balance || 0));

  const handlePaySave = async () => {
    if (!pay.amount || parseFloat(pay.amount) <= 0) {
      setError("Raqam sahi nahi hai.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await savePayment({
        party_id: party.id,
        date: pay.date,
        type: pay.type,
        amount: parseFloat(pay.amount),
        reference: pay.reference,
        narration: pay.narration || pay.type,
      });
      setShowPay(false);
      setPay({ type: "bank_receipt", amount: "", reference: "", date: new Date().toISOString().split("T")[0], narration: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
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
            </div>
            <Tag color={C.white} bg="rgba(255,255,255,0.2)">
              {displayBal === 0 ? "✓ Saaf" : isFarmer ? "Loan baaki" : "Lena baaki"}
            </Tag>
          </div>
          <button onClick={() => setShowPay(v => !v)}
            style={{ marginTop: 14, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "10px 0", color: C.white, fontSize: 13, fontWeight: 600, width: "100%", cursor: "pointer" }}>
            💳 Payment Record Karein
          </button>
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
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Payment / Receipt Record Karein</p>
            <Field label="Type" value={pay.type} onChange={v => sp("type", v)}
              options={[
                { value: "bank_receipt",  label: "Bank Receipt (paisa aaya)" },
                { value: "bank_payment",  label: "Bank Payment (paisa diya)" },
                { value: "cash_receipt",  label: "Cash Receipt" },
                { value: "cash_payment",  label: "Cash Payment" },
              ]} />
            <Field label="Raqam" value={pay.amount} onChange={v => sp("amount", v)} type="number" prefix="₹" required />
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
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", padding: "11px 14px", borderBottom: i < ledgerWithBal.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
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
          {party.opening_balance > 0 && <p style={{ fontSize: 12 }}>Opening Balance: ₹{fmt(party.opening_balance)}</p>}
          {party.interest_rate > 0 && <p style={{ fontSize: 12 }}>Interest: {party.interest_rate}% / saal</p>}
          {party.notes && <p style={{ fontSize: 12, marginTop: 4, color: C.inkMid }}>{party.notes}</p>}
        </div>
      </div>
    </Shell>
  );
}
