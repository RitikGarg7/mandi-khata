import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Tag, fmt } from "../components/ui";
import PinConfirm from "../components/PinConfirm";

export default function Khata({ party, onBack }) {
  const { parties, payments, ledger, savePayment, deletePayment, trueBalance, computePartyInterest } = useApp();
  const bankAccounts = parties.filter(p => p.type === "Bank");
  const [showPay, setShowPay]         = useState(false);
  const [selEntry, setSelEntry]       = useState(null); // selected ledger entry
  const [pinAction, setPinAction]     = useState(null); // "edit" | "delete"
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
              {accruedInterest > 0 && (
                <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>
                  + ₹{fmt(accruedInterest)} byaaj (accrued)
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
          {party.opening_balance > 0 && <p style={{ fontSize: 12 }}>Opening Balance: ₹{fmt(party.opening_balance)}</p>}
          {party.interest_rate > 0 && (
            <p style={{ fontSize: 12 }}>
              Byaaj dar: {party.interest_rate}% / saal
              {accruedInterest > 0 && ` · Abhi tak: ₹${fmt(accruedInterest)}`}
            </p>
          )}
          {party.notes && <p style={{ fontSize: 12, marginTop: 4, color: C.inkMid }}>{party.notes}</p>}
        </div>
      </div>
    </Shell>
  );
}
