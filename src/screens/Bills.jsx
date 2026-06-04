import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, BottomNav, Tag, fmt } from "../components/ui";

export default function Bills({ nav }) {
  const { parties, purchaseBills, saleBills } = useApp();
  const [tab, setTab] = useState("J");
  const [search, setSearch] = useState("");

  const matchJ = b => {
    const farmer = parties.find(p => p.id === b.party_id);
    const q = search.toLowerCase();
    return !search || farmer?.name?.toLowerCase().includes(q) || b.commodity?.toLowerCase().includes(q) || String(b.bill_number).includes(q);
  };

  const matchI = b => {
    const buyer = parties.find(p => p.id === b.party_id);
    const q = search.toLowerCase();
    return !search || buyer?.name?.toLowerCase().includes(q) || b.commodity?.toLowerCase().includes(q) || String(b.bill_number).includes(q);
  };

  const jBills = [...purchaseBills].filter(matchJ).sort((a, b) => b.date?.localeCompare(a.date));
  const iBills = [...saleBills].filter(matchI).sort((a, b) => b.date?.localeCompare(a.date));

  return (
    <Shell>
      <TopBar
        title="Bills"
        right={
          <button onClick={() => nav(tab === "J" ? "newJ" : "newI")}
            style={{ background: tab === "J" ? C.pink : C.saffron, border: "none", borderRadius: 8, padding: "6px 13px", color: C.white, fontSize: 12, fontWeight: 700 }}>
            + Naya
          </button>
        }
      />

      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Naam ya fasal dhundhein..."
            style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 13 }} />
        </div>

        <div style={{ display: "flex", background: C.white, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, marginBottom: 14 }}>
          {[["J","📥 Form J (Khareed)"],["I","📤 Form I (Bikri)"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, background: tab === id ? (id === "J" ? C.pink : C.saffron) : "transparent", color: tab === id ? C.white : C.inkMid, border: "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 14px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
        {tab === "J" && (
          jBills.length === 0 ? (
            <EmptyState label="Koi khareed bills nahi" />
          ) : (
            jBills.map(b => {
              const farmer = parties.find(p => p.id === b.party_id);
              return (
                <Card key={b.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{farmer?.name || "—"}</div>
                      <div style={{ fontSize: 11, color: C.inkLight }}>{b.series}/{b.bill_number} · {b.date} · {b.commodity}</div>
                    </div>
                    <Tag color={b.is_complete ? C.green : C.gold} bg={b.is_complete ? "#E8F5EE" : "#FDF6E3"}>
                      {b.is_complete ? "✓ Mukammal" : "Baaki"}
                    </Tag>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                    {[{l:"Bori",v:b.bags},{l:"Wazan (qtl)",v:b.weight},{l:"Bhao/qtl",v:`₹${b.rate}`}].map(i => (
                      <div key={i.l} style={{ background: C.pinkLight, borderRadius: 8, padding: "7px 10px" }}>
                        <div style={{ fontSize: 10, color: C.inkLight }}>{i.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Baloo 2'" }}>{i.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.inkLight }}>Raqam</div>
                      <div style={{ fontFamily: "'Baloo 2'", fontWeight: 600, fontSize: 13 }}>₹{fmt(b.gross_amount)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.inkLight }}>Net Payable (Kisan)</div>
                      <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 15, color: C.green }}>₹{fmt(b.net_payable)}</div>
                    </div>
                  </div>

                  {b.loan_recovered > 0 && (
                    <div style={{ marginTop: 8, background: "#FDF0EE", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: C.red, fontWeight: 600 }}>
                      Loan recovery: ₹{fmt(b.loan_recovered)} · Haath mein: ₹{fmt(b.final_payment)}
                    </div>
                  )}
                </Card>
              );
            })
          )
        )}

        {tab === "I" && (
          iBills.length === 0 ? (
            <EmptyState label="Koi bikri bills nahi" />
          ) : (
            iBills.map(b => {
              const buyer = parties.find(p => p.id === b.party_id);
              return (
                <Card key={b.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{buyer?.name || "—"}</div>
                      <div style={{ fontSize: 11, color: C.inkLight }}>{b.series}/{b.bill_number} · {b.date} · {b.commodity}</div>
                    </div>
                    <Tag>{b.buyer_state === "Haryana" ? "Intra" : "Inter"}</Tag>
                  </div>

                  <div style={{ background: C.greenLight, borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.green }}>💰 AAPKI AADAT (MPC)</div>
                    <div style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 20, color: C.green }}>₹{fmt(b.mpc_amount)}</div>
                    <div style={{ fontSize: 10, color: C.green }}>
                      AUC: ₹{fmt(b.auc_amount)} · Mazdoori: ₹{fmt(b.labour_amount)}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                    {[{l:"Bori",v:b.bags},{l:"Wazan (qtl)",v:b.weight},{l:"Bhao/qtl",v:`₹${b.rate}`}].map(i => (
                      <div key={i.l} style={{ background: C.saffronLight, borderRadius: 8, padding: "7px 10px" }}>
                        <div style={{ fontSize: 10, color: C.inkLight }}>{i.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Baloo 2'" }}>{i.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.inkLight }}>Kul Raqam</div>
                      <div style={{ fontFamily: "'Baloo 2'", fontWeight: 600, fontSize: 13 }}>₹{fmt(b.gross_amount)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.inkLight }}>Total Bill (Buyer se)</div>
                      <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 15, color: C.saffron }}>₹{fmt(b.total_bill)}</div>
                    </div>
                  </div>

                  {(b.cgst_amount > 0 || b.igst_amount > 0) && (
                    <div style={{ marginTop: 8, background: C.blueLight, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: C.blue, fontWeight: 600 }}>
                      {b.igst_amount > 0
                        ? `IGST: ₹${fmt(b.igst_amount)}`
                        : `CGST: ₹${fmt(b.cgst_amount)} · SGST: ₹${fmt(b.sgst_amount)}`}
                    </div>
                  )}
                </Card>
              );
            })
          )
        )}
      </div>

      <BottomNav active="bills" nav={nav} />
    </Shell>
  );
}

function EmptyState({ label }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: C.inkLight }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
      <p style={{ fontSize: 14 }}>{label}</p>
    </div>
  );
}
