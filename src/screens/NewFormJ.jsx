import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Divider, Row, fmt } from "../components/ui";

export default function NewFormJ({ onBack }) {
  const { parties, purchaseBills, savePurchaseBill, partyBalance } = useApp();
  const farmers = parties.filter(p => p.type === "Farmer");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [f, setF] = useState({
    party_id: "",
    date: new Date().toISOString().split("T")[0],
    series: "Form J3",
    commodity: "",
    bags: "",
    weight: "",
    rate: "",
    labour_rate: "5.32",
    dami: "",     // weight allowance / dami
    cess: "",
    bonus: "",
    loan_recovered: "",
    notes: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Auto-increment bill number for selected series
  const nextBillNo = () => {
    const bills = purchaseBills.filter(b => b.series === f.series);
    return bills.length > 0 ? Math.max(...bills.map(b => b.bill_number || 0)) + 1 : 1;
  };

  const bags      = parseFloat(f.bags) || 0;
  const weight    = parseFloat(f.weight) || 0;
  const rate      = parseFloat(f.rate) || 0;
  const labRate   = parseFloat(f.labour_rate) || 5.32;
  const damiAmt   = parseFloat(f.dami) || 0;
  const cessAmt   = parseFloat(f.cess) || 0;
  const bonusAmt  = parseFloat(f.bonus) || 0;

  const gross_amount  = weight * rate;
  const labour_amount = bags * labRate;
  const total_deductions = labour_amount + damiAmt + cessAmt;
  const net_payable   = gross_amount - total_deductions + bonusAmt;

  const selectedFarmer = farmers.find(ff => ff.id === f.party_id);
  const farmerBal = selectedFarmer ? partyBalance(selectedFarmer.id) : 0;
  const loanBaaki = farmerBal < 0 ? Math.abs(farmerBal) + (selectedFarmer?.opening_balance || 0) : (selectedFarmer?.opening_balance || 0);
  const maxLoanRecovery = Math.min(loanBaaki, net_payable);
  const loanRecoveredAmt = parseFloat(f.loan_recovered) || 0;
  const finalPayment = net_payable - loanRecoveredAmt;

  const handleSave = async () => {
    if (!f.party_id || !f.commodity || !bags || !weight || !rate) {
      setError("Saare zaroori fields bharein.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const billData = {
        party_id: f.party_id,
        series: f.series,
        bill_number: nextBillNo(),
        date: f.date,
        commodity: f.commodity,
        bags,
        weight,
        rate,
        gross_amount,
        labour_rate: labRate,
        labour_amount,
        dami_amount: damiAmt,
        cess_amount: cessAmt,
        bonus: bonusAmt,
        net_payable,
        loan_recovered: loanRecoveredAmt,
        final_payment: finalPayment,
        notes: f.notes,
        is_complete: false,
        created_at: new Date().toISOString(),
      };
      await savePurchaseBill(billData);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Shell>
        <div style={{ background: C.pink, padding: "60px 28px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 24, color: C.white }}>Form J Save Ho Gaya!</h2>
          <p style={{ color: "rgba(255,255,255,0.82)", marginTop: 8 }}>{f.series}/{nextBillNo() - 1}</p>
        </div>
        <div style={{ padding: "24px 16px" }}>
          <Btn variant="pink" onClick={onBack}>← Wapas Jaayein</Btn>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ background: C.pink }}>
        <TopBar title="Form J — Naya Khareed" onBack={onBack} bg="transparent" />
        <div style={{ padding: "4px 16px 18px" }}>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>📥 Kisan se khareed ka bill</p>
        </div>
      </div>

      <div style={{ padding: "16px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <Card style={{ marginBottom: 12 }}>
          <Field label="Bechne wale ka Naam (Kisan)" value={f.party_id} onChange={v => s("party_id", v)} required
            placeholder="Kisan chunein..."
            options={farmers.map(ff => ({ value: ff.id, label: `${ff.name} — ${ff.place}` }))} />

          {selectedFarmer && loanBaaki > 0 && (
            <div style={{ background: "#FDF0EE", borderRadius: 8, padding: "9px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span>⚠️</span>
              <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Udhar baaki: ₹{fmt(loanBaaki)}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Tithi" value={f.date} onChange={v => s("date", v)} type="date" required />
            <Field label="Series" value={f.series} onChange={v => s("series", v)}
              options={["Form J1","Form J2","Form J3"]} />
          </div>

          <Field label="Fasal (Commodity)" value={f.commodity} onChange={v => s("commodity", v)} required
            placeholder="Fasal chunein..."
            options={["Wheat","Paddy","Bajra","Maize","Mustard","Other"]} />
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>📦 Maal ki Jaankari</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Bori (Bags)" value={f.bags} onChange={v => s("bags", v)} type="number" placeholder="0" required />
            <Field label="Wazan (Quintal)" value={f.weight} onChange={v => s("weight", v)} type="number" placeholder="0" required />
          </div>
          <Field label="Bhao (₹ per Quintal)" value={f.rate} onChange={v => s("rate", v)} type="number" prefix="₹" suffix="/qtl" placeholder="0" required />
          {gross_amount > 0 && (
            <div style={{ background: C.greenLight, borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: C.inkLight }}>Raqam </span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 18, color: C.green }}>₹{fmt(gross_amount)}</span>
            </div>
          )}
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>💸 Kharche (Kisan se katenge)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Utaari (₹/bori)" value={f.labour_rate} onChange={v => s("labour_rate", v)} type="number" prefix="₹" hint="Default ₹5.32/bori" />
            <Field label="Dami/Dum (₹)" value={f.dami} onChange={v => s("dami", v)} type="number" prefix="₹" placeholder="0" />
            <Field label="Cess (₹)" value={f.cess} onChange={v => s("cess", v)} type="number" prefix="₹" placeholder="0" />
            <Field label="Bonus (₹)" value={f.bonus} onChange={v => s("bonus", v)} type="number" prefix="₹" placeholder="0" hint="Kisan ko extra dena" />
          </div>
        </Card>

        {gross_amount > 0 && (
          <Card style={{ marginBottom: 12, background: C.pinkLight, border: `1.5px solid ${C.pink}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.pink, marginBottom: 8 }}>📊 Hisaab — Kisan ko milega</p>
            <Row label={`Wazan × Bhao (${weight} × ₹${rate})`} amount={gross_amount} />
            <Divider label="Kul Kharche (−)" />
            <Row label={`Utaari (${bags} bori × ₹${labRate})`} amount={labour_amount} color={C.red} indent />
            {damiAmt > 0 && <Row label="Dami" amount={damiAmt} color={C.red} indent />}
            {cessAmt > 0 && <Row label="Cess" amount={cessAmt} color={C.red} indent />}
            {bonusAmt > 0 && <Row label="Bonus (joda)" amount={bonusAmt} color={C.green} indent />}
            <Row label="Net Payable" amount={net_payable} bold color={C.green} />

            {loanBaaki > 0 && (
              <>
                <Divider label="Loan Recovery" />
                <Field label="Loan Recovery (₹)" value={f.loan_recovered} onChange={v => s("loan_recovered", v)} type="number" prefix="₹"
                  hint={`Max: ₹${fmt(maxLoanRecovery)} (agar recover karna ho)`} />
                {loanRecoveredAmt > 0 && (
                  <Row label="Haath mein milega" amount={finalPayment} bold color={C.green} />
                )}
              </>
            )}

            <Field label="Notes" value={f.notes} onChange={v => s("notes", v)} placeholder="Koi baat (optional)" rows={2} />
          </Card>
        )}

        <Btn variant="pink" onClick={handleSave} disabled={busy || !f.party_id || !f.commodity || !bags || !weight || !rate}>
          {busy ? "Save ho raha hai..." : "✓ Form J Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}
