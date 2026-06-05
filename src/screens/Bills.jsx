import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, BottomNav, Tag, Row, Divider, fmt } from "../components/ui";
import PinConfirm from "../components/PinConfirm";

export default function Bills({ nav }) {
  const { parties, purchaseBills, saleBills, deleteSaleBill, deletePurchaseBill } = useApp();
  const [tab, setTab]             = useState("J");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState(null); // { bill, type: "I"|"J" }
  const [pinAction, setPinAction] = useState(null);  // "edit" | "delete"
  const [busy, setBusy]           = useState(false);

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

  const handleDelete = async () => {
    setBusy(true);
    try {
      if (selected.type === "J") await deletePurchaseBill(selected.bill.id);
      else await deleteSaleBill(selected.bill.id);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = () => {
    nav(selected.type === "J" ? "newJ" : "newI", selected.bill);
    setSelected(null);
  };

  if (selected) {
    const b    = selected.bill;
    const type = selected.type;
    const party = parties.find(p => p.id === b.party_id);
    const accent = type === "J" ? C.pink : C.saffron;
    const accentLight = type === "J" ? C.pinkLight : C.saffronLight;

    return (
      <Shell>
        {pinAction && (
          <PinConfirm
            prompt={pinAction === "delete" ? "Delete confirm karne ke liye PIN" : "Edit karne ke liye PIN"}
            onConfirm={() => { setPinAction(null); pinAction === "delete" ? handleDelete() : handleEdit(); }}
            onCancel={() => setPinAction(null)}
          />
        )}
        <div style={{ background: accent }}>
          <TopBar title={`${b.series}/${b.bill_number}`} onBack={() => setSelected(null)} bg="transparent" />
          <div style={{ padding: "4px 16px 18px" }}>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, fontWeight: 700 }}>{party?.name || "—"}</p>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{b.date} · {b.commodity}</p>
          </div>
        </div>

        <div style={{ padding: "14px 14px 120px", overflowY: "auto" }}>
          <Card style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Maal ki Jaankari</p>
            <Row label="Bori (Bags)" amount={b.bags} />
            <Row label="Wazan (Quintal)" amount={b.weight} />
            <Row label="Bhao / qtl" amount={b.rate} />
            <Row label="Kul Raqam" amount={b.gross_amount} bold />
          </Card>

          {type === "J" && (
            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Kharche & Net Payable</p>
              <Row label="Utaari/Mazdoori" amount={b.labour_amount} color={C.red} />
              {b.dami_amount > 0 && <Row label="Dami" amount={b.dami_amount} color={C.red} />}
              {b.cess_amount > 0 && <Row label="Cess" amount={b.cess_amount} color={C.red} />}
              {b.bonus > 0 && <Row label="Bonus (+)" amount={b.bonus} color={C.green} />}
              <Row label="Net Payable (Kisan ko)" amount={b.net_payable} bold color={C.green} />
              {b.loan_recovered > 0 && (
                <>
                  <Divider label="Loan Recovery" />
                  <Row label="Loan Recovery (−)" amount={b.loan_recovered} color={C.red} />
                  <Row label="Haath mein milega" amount={b.final_payment} bold color={C.green} />
                </>
              )}
            </Card>
          )}

          {type === "I" && (
            <Card style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Mandi Kharche (Buyer se)</p>
              <Row label={`Aadat/MPC (${b.mpc_rate}%)`} amount={b.mpc_amount} color={C.green} />
              <Row label={`Dalali/AUC (${b.auc_rate}%)`} amount={b.auc_amount} />
              <Row label={`Mazdoori (₹${b.labour_rate}/bori)`} amount={b.labour_amount} />
              {b.dami_amount > 0 && <Row label="Dami" amount={b.dami_amount} />}
              <Divider label="GST" />
              {b.cgst_amount > 0 && <Row label="CGST (9%)" amount={b.cgst_amount} indent sub />}
              {b.sgst_amount > 0 && <Row label="SGST (9%)" amount={b.sgst_amount} indent sub />}
              {b.igst_amount > 0 && <Row label="IGST (18%)" amount={b.igst_amount} indent sub />}
              <Row label="Total Bill (Buyer se)" amount={b.total_bill} bold color={C.saffron} />
            </Card>
          )}

          {b.notes && (
            <div style={{ padding: "10px 14px", background: C.cream, borderRadius: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 12, color: C.inkMid }}>{b.notes}</p>
            </div>
          )}
        </div>

        {/* Sticky Edit / Delete footer */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: "12px 14px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, zIndex: 10 }}>
          <button onClick={() => setPinAction("edit")} disabled={busy}
            style={{ padding: "13px 0", background: accent, color: C.white, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ✏️ Edit
          </button>
          <button onClick={() => setPinAction("delete")} disabled={busy}
            style={{ padding: "13px 0", background: "#FDF0EE", color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            🗑️ Delete
          </button>
        </div>
      </Shell>
    );
  }

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
          jBills.length === 0 ? <EmptyState label="Koi khareed bills nahi" /> :
          jBills.map(b => {
            const farmer = parties.find(p => p.id === b.party_id);
            return (
              <Card key={b.id} onClick={() => setSelected({ bill: b, type: "J" })} style={{ cursor: "pointer" }}>
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
        )}

        {tab === "I" && (
          iBills.length === 0 ? <EmptyState label="Koi bikri bills nahi" /> :
          iBills.map(b => {
            const buyer = parties.find(p => p.id === b.party_id);
            return (
              <Card key={b.id} onClick={() => setSelected({ bill: b, type: "I" })} style={{ cursor: "pointer" }}>
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
                  <div style={{ fontSize: 10, color: C.green }}>AUC: ₹{fmt(b.auc_amount)} · Mazdoori: ₹{fmt(b.labour_amount)}</div>
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
                    {b.igst_amount > 0 ? `IGST: ₹${fmt(b.igst_amount)}` : `CGST: ₹${fmt(b.cgst_amount)} · SGST: ₹${fmt(b.sgst_amount)}`}
                  </div>
                )}
              </Card>
            );
          })
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
