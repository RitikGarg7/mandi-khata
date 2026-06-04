import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field, Divider, Row, fmt } from "../components/ui";

export default function NewFormI({ onBack }) {
  const { parties, saleBills, purchaseBills, saveSaleBill } = useApp();
  const buyers = parties.filter(p => p.type === "Customer");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [f, setF] = useState({
    party_id: "",
    purchase_bill_id: "",
    date: new Date().toISOString().split("T")[0],
    series: "Form I2",
    commodity: "",
    bags: "",
    weight: "",
    rate: "",
    mpc_rate: "2.5",
    auc_rate: "0.1",
    labour_rate: "7.88",
    dami_amount: "",
    buyer_state: "Haryana",
    notes: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const nextBillNo = () => {
    const bills = saleBills.filter(b => b.series === f.series);
    return bills.length > 0 ? Math.max(...bills.map(b => b.bill_number || 0)) + 1 : 1;
  };

  const bags       = parseFloat(f.bags) || 0;
  const weight     = parseFloat(f.weight) || 0;
  const rate       = parseFloat(f.rate) || 0;
  const mpcRate    = parseFloat(f.mpc_rate) || 2.5;
  const aucRate    = parseFloat(f.auc_rate) || 0.1;
  const labRate    = parseFloat(f.labour_rate) || 7.88;
  const damiAmt    = parseFloat(f.dami_amount) || 0;

  const gross_amount  = weight * rate;
  const mpc_amount    = gross_amount * mpcRate / 100;
  const auc_amount    = gross_amount * aucRate / 100;
  const labour_amount = bags * labRate;
  const gst_taxable   = mpc_amount + auc_amount;
  const isInter       = f.buyer_state !== "Haryana";
  const cgst_amount   = isInter ? 0 : gst_taxable * 0.09;
  const sgst_amount   = isInter ? 0 : gst_taxable * 0.09;
  const igst_amount   = isInter ? gst_taxable * 0.18 : 0;
  const total_gst     = cgst_amount + sgst_amount + igst_amount;
  const total_bill    = gross_amount + mpc_amount + auc_amount + labour_amount + damiAmt + total_gst;

  const pendingPBills = purchaseBills.filter(b => !b.is_complete);

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
        purchase_bill_id: f.purchase_bill_id || null,
        series: f.series,
        bill_number: nextBillNo(),
        date: f.date,
        commodity: f.commodity,
        bags,
        weight,
        rate,
        gross_amount,
        mpc_rate: mpcRate,
        mpc_amount,
        auc_rate: aucRate,
        auc_amount,
        labour_rate: labRate,
        labour_amount,
        dami_amount: damiAmt,
        gst_taxable,
        cgst_rate: isInter ? 0 : 9,
        cgst_amount,
        sgst_rate: isInter ? 0 : 9,
        sgst_amount,
        igst_rate: isInter ? 18 : 0,
        igst_amount,
        total_bill,
        buyer_state: f.buyer_state,
        notes: f.notes,
        created_at: new Date().toISOString(),
      };
      await saveSaleBill(billData);
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
        <div style={{ background: C.saffron, padding: "60px 28px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 24, color: C.white }}>Form I Save Ho Gaya!</h2>
          <p style={{ color: "rgba(255,255,255,0.82)", marginTop: 8 }}>{f.series}/{nextBillNo() - 1}</p>
        </div>
        <div style={{ padding: "24px 16px" }}>
          <Btn onClick={onBack}>← Wapas Jaayein</Btn>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ background: C.saffron }}>
        <TopBar title="Form I — Naya Bikri" onBack={onBack} bg="transparent" />
        <div style={{ padding: "4px 16px 18px" }}>
          <p style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>📤 Buyer ko bikri ka bill</p>
        </div>
      </div>

      <div style={{ padding: "16px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <Card style={{ marginBottom: 12 }}>
          <Field label="Kharidne wale ka Naam (Buyer)" value={f.party_id} onChange={v => s("party_id", v)} required
            placeholder="Buyer chunein..."
            options={buyers.map(b => ({ value: b.id, label: `${b.name} — ${b.place}` }))} />

          {pendingPBills.length > 0 && (
            <Field label="Link to Form J (optional)" value={f.purchase_bill_id} onChange={v => s("purchase_bill_id", v)}
              placeholder="Kisan ki Form J se jodein..."
              options={pendingPBills.map(b => {
                const farmer = parties.find(p => p.id === b.party_id);
                return { value: b.id, label: `${b.series}/${b.bill_number} — ${farmer?.name || "?"} (${b.bags} bori ${b.commodity})` };
              })} />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Tithi" value={f.date} onChange={v => s("date", v)} type="date" required />
            <Field label="Series" value={f.series} onChange={v => s("series", v)}
              options={["Form I1","Form I2"]} />
          </div>

          <Field label="Fasal (Commodity)" value={f.commodity} onChange={v => s("commodity", v)} required
            placeholder="Fasal chunein..."
            options={["Wheat","Paddy","Bajra","Maize","Mustard","Other"]} />

          <Field label="Buyer ki State" value={f.buyer_state} onChange={v => s("buyer_state", v)}
            options={["Haryana","Punjab","Uttar Pradesh","Rajasthan","Delhi","Other"]}
            hint={isInter ? "Interstate → IGST (18%)" : "Intrastate → CGST+SGST (9%+9%)"} />
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>📦 Maal ki Jaankari</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Bori (Bags)" value={f.bags} onChange={v => s("bags", v)} type="number" placeholder="0" required />
            <Field label="Wazan (Quintal)" value={f.weight} onChange={v => s("weight", v)} type="number" placeholder="0" required />
          </div>
          <Field label="Bhao (₹ per Quintal)" value={f.rate} onChange={v => s("rate", v)} type="number" prefix="₹" suffix="/qtl" placeholder="0" required />
          {gross_amount > 0 && (
            <div style={{ background: C.cream, borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
              <span style={{ fontSize: 12, color: C.inkLight }}>Kul Raqam </span>
              <span style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 18, color: C.ink }}>₹{fmt(gross_amount)}</span>
            </div>
          )}
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>💸 Mandi ke Kharche (Buyer se)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Aadat (MPC %)" value={f.mpc_rate} onChange={v => s("mpc_rate", v)} type="number" suffix="%" hint="Aapki kamai" />
            <Field label="Dalali (AUC %)" value={f.auc_rate} onChange={v => s("auc_rate", v)} type="number" suffix="%" hint="Dalali khata" />
            <Field label="Mazdoori (₹/bori)" value={f.labour_rate} onChange={v => s("labour_rate", v)} type="number" prefix="₹" hint="Default ₹7.88" />
            <Field label="Dami (₹)" value={f.dami_amount} onChange={v => s("dami_amount", v)} type="number" prefix="₹" placeholder="0" />
          </div>
        </Card>

        {gross_amount > 0 && (
          <Card style={{ marginBottom: 12, background: C.saffronLight, border: `1.5px solid ${C.saffron}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.saffron, marginBottom: 8 }}>📊 Bill ka Hisaab — Buyer se lena</p>
            <Row label="Kul Raqam (grain ki kimat)" amount={gross_amount} />
            <Divider label="Mandi ke Kharche (+)" />
            <div style={{ background: C.greenLight, borderRadius: 8, padding: "8px 10px", marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.green, marginBottom: 4 }}>💰 AAPKI KAMAI</div>
              <Row label={`Aadat/MPC (${mpcRate}%)`} amount={mpc_amount} color={C.green} sub />
              <Row label={`Dalali/AUC (${aucRate}%) → Dalali khata`} amount={auc_amount} color={C.inkMid} sub />
            </div>
            <Row label={`Mazdoori (${bags} bori × ₹${labRate})`} amount={labour_amount} indent />
            {damiAmt > 0 && <Row label="Dami" amount={damiAmt} indent />}
            <Divider label="GST on MPC + AUC" />
            {!isInter ? (
              <>
                <Row label="CGST (9%)" amount={cgst_amount} indent sub />
                <Row label="SGST (9%)" amount={sgst_amount} indent sub />
              </>
            ) : (
              <Row label="IGST (18%)" amount={igst_amount} indent sub />
            )}
            <Row label="Total Bill — Buyer se lena" amount={total_bill} bold color={C.saffron} />

            <Field label="Notes" value={f.notes} onChange={v => s("notes", v)} placeholder="Koi baat (optional)" rows={2} />
          </Card>
        )}

        <Btn onClick={handleSave} disabled={busy || !f.party_id || !f.commodity || !bags || !weight || !rate}>
          {busy ? "Save ho raha hai..." : "✓ Form I Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}
