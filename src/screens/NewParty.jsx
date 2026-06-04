import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, Btn, Field } from "../components/ui";

export default function NewParty({ onBack }) {
  const { saveParty } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    name: "", type: "Farmer", place: "", phone: "",
    gstin: "", state: "Haryana",
    opening_balance: "", interest_rate: "",
    notes: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!f.name.trim()) { setError("Naam zaroori hai."); return; }
    setBusy(true);
    setError("");
    try {
      await saveParty({
        ...f,
        name: f.name.trim(),
        opening_balance: parseFloat(f.opening_balance) || 0,
        interest_rate: parseFloat(f.interest_rate) || 0,
        created_at: new Date().toISOString(),
      });
      onBack();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Shell>
      <TopBar title="Naya Party Jodein" onBack={onBack} />
      <div style={{ padding: "18px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <Card style={{ marginBottom: 14 }}>
          <Field label="Party ka Naam" value={f.name} onChange={v => s("name", v)} placeholder="Poora naam" required />
          <Field label="Type" value={f.type} onChange={v => s("type", v)}
            options={[
              { value: "Farmer",   label: "👨‍🌾 Kisan (Farmer)" },
              { value: "Customer", label: "🏭 Grahak (Buyer)" },
              { value: "Expense",  label: "💸 Expense Account" },
              { value: "Bank",     label: "🏦 Bank Account" },
            ]} required />
          <Field label="Jagah" value={f.place} onChange={v => s("place", v)} placeholder="Shehar / Gaon" />
          <Field label="Phone" value={f.phone} onChange={v => s("phone", v)} type="tel" placeholder="Mobile number" />
        </Card>

        <Card style={{ marginBottom: 14 }}>
          <Field label="GSTIN" value={f.gstin} onChange={v => s("gstin", v)} placeholder="15 digit (agar ho toh)" />
          <Field label="State" value={f.state} onChange={v => s("state", v)}
            options={["Haryana","Punjab","Uttar Pradesh","Rajasthan","Delhi","Other"]} />
          <Field label="Opening Balance (Udhar)" value={f.opening_balance} onChange={v => s("opening_balance", v)}
            type="number" prefix="₹"
            hint={f.type === "Farmer" ? "Farmer ko diya loan positive mein likhein" : "Buyer ka opening balance"} />
          {f.type === "Farmer" && (
            <Field label="Byaaj dar" value={f.interest_rate} onChange={v => s("interest_rate", v)}
              type="number" suffix="% / saal" placeholder="0" />
          )}
          <Field label="Notes" value={f.notes} onChange={v => s("notes", v)} placeholder="Koi baat nahi (optional)" rows={2} />
        </Card>

        <Btn variant="green" onClick={handleSave} disabled={busy || !f.name.trim()}>
          {busy ? "Save ho raha hai..." : "✓ Party Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}
