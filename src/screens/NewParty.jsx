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
    opening_balance: "", opening_balance_date: "", interest_rate: "",
    // Bank fields
    bank_name: "", account_number: "", ifsc: "",
    // Expense fields
    expense_category: "",
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

  const isFarmer   = f.type === "Farmer";
  const isBuyer    = f.type === "Customer";
  const isBank     = f.type === "Bank";
  const isExpense  = f.type === "Expense";

  return (
    <Shell>
      <TopBar title="Naya Party Jodein" onBack={onBack} />
      <div style={{ padding: "18px 14px 100px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Basic info — all types */}
        <Card style={{ marginBottom: 14 }}>
          <Field label="Party ka Naam" value={f.name} onChange={v => s("name", v)}
            placeholder={isBank ? "Jaise: SBI Current Account" : isExpense ? "Jaise: Office Kharcha" : "Poora naam"} required />
          <Field label="Type" value={f.type} onChange={v => s("type", v)}
            options={[
              { value: "Farmer",   label: "👨‍🌾 Kisan (Farmer)" },
              { value: "Customer", label: "🏭 Grahak (Buyer)" },
              { value: "Expense",  label: "💸 Expense Account" },
              { value: "Bank",     label: "🏦 Bank Account" },
            ]} required />

          {/* Farmer & Buyer: place + phone */}
          {(isFarmer || isBuyer) && (
            <>
              <Field label="Jagah" value={f.place} onChange={v => s("place", v)} placeholder="Shehar / Gaon" />
              <Field label="Phone" value={f.phone} onChange={v => s("phone", v)} type="tel" placeholder="Mobile number" />
            </>
          )}

          {/* Expense: category */}
          {isExpense && (
            <Field label="Category" value={f.expense_category} onChange={v => s("expense_category", v)}
              options={["Dalali","Mazdoori","Office","Labour","Transport","Misc"]} />
          )}
        </Card>

        {/* Farmer / Buyer extra fields */}
        {(isFarmer || isBuyer) && (
          <Card style={{ marginBottom: 14 }}>
            <Field label="GSTIN" value={f.gstin} onChange={v => s("gstin", v)} placeholder="15 digit (agar ho toh)" />
            <Field label="State" value={f.state} onChange={v => s("state", v)}
              options={["Haryana","Punjab","Uttar Pradesh","Rajasthan","Delhi","Other"]} />
            <Field
              label={isFarmer ? "Opening Balance — Loan diya tha (₹)" : "Opening Balance (₹)"}
              value={f.opening_balance}
              onChange={v => s("opening_balance", v)}
              type="number" prefix="₹"
              hint={isFarmer
                ? "Jo loan diya tha wo positive mein likhein"
                : "Positive = wo humara dena baaki hai · Negative = hum unka dena baaki hain"}
            />
            {parseFloat(f.opening_balance) !== 0 && f.opening_balance !== "" && (
              <Field label="Opening Balance ki Tarikh" value={f.opening_balance_date}
                onChange={v => s("opening_balance_date", v)} type="date"
                hint="Byaaj is tarikh se shuru hoga" />
            )}
            {(isFarmer || isBuyer) && (
              <Field label="Byaaj dar" value={f.interest_rate} onChange={v => s("interest_rate", v)}
                type="number" suffix="% / saal" placeholder="0" />
            )}
          </Card>
        )}

        {/* Bank fields */}
        {isBank && (
          <Card style={{ marginBottom: 14 }}>
            <Field label="Bank ka Naam" value={f.bank_name} onChange={v => s("bank_name", v)} placeholder="Jaise: State Bank of India" />
            <Field label="Account Number" value={f.account_number} onChange={v => s("account_number", v)} placeholder="Account number" />
            <Field label="IFSC Code" value={f.ifsc} onChange={v => s("ifsc", v)} placeholder="Jaise: SBIN0001234" />
            <Field label="Opening Balance (₹)" value={f.opening_balance} onChange={v => s("opening_balance", v)}
              type="number" prefix="₹" hint="Bank mein abhi kitna paisa hai" />
          </Card>
        )}

        {/* Notes — all types */}
        <Card style={{ marginBottom: 14 }}>
          <Field label="Notes" value={f.notes} onChange={v => s("notes", v)}
            placeholder="Jaankari (optional)" rows={2} />
        </Card>

        <Btn variant="green" onClick={handleSave} disabled={busy || !f.name.trim()}>
          {busy ? "Save ho raha hai..." : "✓ Party Save Karein"}
        </Btn>
        <Btn variant="ghost" onClick={onBack} style={{ marginTop: 8 }}>Raddh Karein</Btn>
      </div>
    </Shell>
  );
}
