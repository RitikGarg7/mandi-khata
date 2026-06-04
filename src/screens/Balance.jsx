import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, BottomNav, Tag, Row, Divider, fmt } from "../components/ui";

export default function Balance({ nav }) {
  const { parties, purchaseBills, saleBills, payments, ledger, partyBalance } = useApp();
  const [tab, setTab] = useState("pl");

  // Income
  const totalMpc      = saleBills.reduce((s, b) => s + (b.mpc_amount || 0), 0);
  const totalAuc      = saleBills.reduce((s, b) => s + (b.auc_amount || 0), 0);
  const totalLabourIn = saleBills.reduce((s, b) => s + (b.labour_amount || 0), 0);
  const totalIncome   = totalMpc + totalAuc + totalLabourIn;

  // Expenses: sum of payments to expense-type parties
  const expenseParties = parties.filter(p => p.type === "Expense").map(p => p.id);
  const totalExpenses  = payments
    .filter(p => expenseParties.includes(p.party_id) && ["bank_payment","cash_payment"].includes(p.type))
    .reduce((s, p) => s + (p.amount || 0), 0);
  const netProfit = totalIncome - totalExpenses;

  // Assets
  const farmers    = parties.filter(p => p.type === "Farmer");
  const buyers     = parties.filter(p => p.type === "Customer");
  const bankParts  = parties.filter(p => p.type === "Bank");

  const farmerLoans = farmers.reduce((s, f) => {
    const ob = f.opening_balance || 0;
    const bal = partyBalance(f.id);
    return s + Math.max(0, ob - bal); // simplified: opening + net debit
  }, 0);

  const buyerDue = buyers.reduce((s, b) => {
    const bal = partyBalance(b.id);
    return s + Math.max(0, bal);
  }, 0);

  const cashBal = payments
    .filter(p => p.type === "cash_receipt")
    .reduce((s, p) => s + (p.amount || 0), 0)
    - payments.filter(p => p.type === "cash_payment").reduce((s, p) => s + (p.amount || 0), 0);

  const bankBal = bankParts.reduce((s, b) => {
    const bal = partyBalance(b.id);
    return s + bal;
  }, 0);

  const totalAssets = farmerLoans + buyerDue + Math.max(0, cashBal) + Math.max(0, bankBal);

  // Liabilities
  const gstPay = saleBills.reduce((s, b) => s + (b.cgst_amount || 0) + (b.sgst_amount || 0) + (b.igst_amount || 0), 0);
  const totalLiab = gstPay;
  const capital   = totalAssets - totalLiab;

  return (
    <Shell>
      <TopBar title="Balance Sheet" />
      <div style={{ padding: "14px 14px 100px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: C.inkMid }}>Taraori Anaj Mandi · Karnal</p>
          <Tag>2023–24</Tag>
        </div>

        <div style={{ display: "flex", background: C.white, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, marginBottom: 18 }}>
          {[["pl","P&L Statement"],["bs","Balance Sheet"],["gst","GST Summary"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 11, fontWeight: 700, background: tab === id ? C.saffron : "transparent", color: tab === id ? C.white : C.inkMid, border: "none" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "pl" && (
          <>
            <div style={{ background: netProfit >= 0 ? C.greenLight : "#FDF0EE", border: `1.5px solid ${netProfit >= 0 ? C.green : C.red}`, borderRadius: 14, padding: 16, marginBottom: 14, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: C.inkLight, marginBottom: 4 }}>Net Munafa (Yeh Saal)</p>
              <p style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 34, color: netProfit >= 0 ? C.green : C.red }}>
                ₹{fmt(Math.abs(netProfit))}
              </p>
              {netProfit < 0 && <p style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Nuksan</p>}
            </div>

            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 10 }}>💰 Aamdan (Income)</p>
              <Row label={`Aadat/MPC (${saleBills.length} bills)`} amount={totalMpc} />
              <Row label="AUC / Dalali" amount={totalAuc} />
              <Row label="Mazdoori income" amount={totalLabourIn} />
              <Row label="Kul Aamdan" amount={totalIncome} bold color={C.green} />
            </Card>

            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 10 }}>💸 Kharche (Expenses)</p>
              {totalExpenses === 0 ? (
                <p style={{ fontSize: 12, color: C.inkLight }}>Koi expense entries nahi</p>
              ) : (
                <Row label="Kul Kharche" amount={totalExpenses} bold color={C.red} />
              )}
            </Card>

            <Card style={{ background: netProfit >= 0 ? C.greenLight : "#FDF0EE", border: `1.5px solid ${netProfit >= 0 ? C.green : C.red}` }}>
              <Row label="Kul Aamdan" amount={totalIncome} />
              <Row label="Kul Kharche (−)" amount={totalExpenses} color={C.red} />
              <Row label="Net Munafa" amount={Math.abs(netProfit)} bold color={netProfit >= 0 ? C.green : C.red} />
            </Card>
          </>
        )}

        {tab === "bs" && (
          <>
            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 10 }}>🏦 Sampatti (Assets)</p>
              <Row label="Kisan loan outstanding" amount={farmerLoans} />
              <Row label="Buyer se lena (Receivable)" amount={buyerDue} />
              <Row label="Haath mein naqdh" amount={Math.max(0, cashBal)} />
              <Row label="Bank balance" amount={Math.max(0, bankBal)} />
              <Row label="Kul Sampatti" amount={totalAssets} bold color={C.green} />
            </Card>

            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 10 }}>📋 Denadari (Liabilities)</p>
              <Row label="GST Dena baaki" amount={gstPay} />
              <Row label="Kul Denadari" amount={totalLiab} bold color={C.red} />
            </Card>

            <Card style={{ background: C.goldLight, border: `1.5px solid ${C.gold}` }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 10 }}>👑 Punji (Capital / Net Worth)</p>
              <Row label="Kul Sampatti" amount={totalAssets} />
              <Row label="Kul Denadari (−)" amount={totalLiab} color={C.red} />
              <Row label="Net Punji" amount={Math.abs(capital)} bold color={C.gold} />
            </Card>
          </>
        )}

        {tab === "gst" && (
          <>
            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 10 }}>🧾 GST Summary</p>
              <Row label="GST Taxable (MPC + AUC)" amount={totalMpc + totalAuc} />
              <Divider />
              <Row label="CGST @ 9%" amount={(totalMpc + totalAuc) * 0.09} indent />
              <Row label="SGST @ 9%" amount={(totalMpc + totalAuc) * 0.09} indent />
              <Row label="Kul GST (Intrastate)" amount={gstPay} bold />
            </Card>

            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.inkMid, marginBottom: 10 }}>Bill-wise Breakdown</p>
              {saleBills.length === 0 ? (
                <p style={{ fontSize: 12, color: C.inkLight }}>Koi sale bills nahi</p>
              ) : (
                saleBills.map(b => {
                  const buyer = parties.find(p => p.id === b.party_id);
                  return (
                    <div key={b.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{buyer?.name || "—"}</span>
                        <span style={{ fontSize: 11, color: C.inkLight }}>{b.date}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{b.series}/{b.bill_number}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 11, background: C.blueLight, color: C.blue, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                          Taxable: ₹{fmt(b.gst_taxable)}
                        </span>
                        <span style={{ fontSize: 11, background: C.greenLight, color: C.green, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                          GST: ₹{fmt((b.cgst_amount || 0) + (b.sgst_amount || 0) + (b.igst_amount || 0))}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          </>
        )}
      </div>

      <BottomNav active="balance" nav={nav} />
    </Shell>
  );
}
