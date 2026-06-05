import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Shell, C, Card, TopBar, BottomNav, Tag, fmt } from "../components/ui";

export default function Parties({ nav }) {
  const { parties, trueBalance } = useApp();
  const [tab, setTab] = useState("farmers");
  const [search, setSearch] = useState("");

  const list = parties
    .filter(p => {
      if (tab === "farmers") return p.type === "Farmer";
      if (tab === "buyers")  return p.type === "Customer";
      return true;
    })
    .filter(p =>
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.place?.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <Shell>
      <TopBar
        title="Parties"
        right={
          <button onClick={() => nav("newParty")}
            style={{ background: C.saffron, border: "none", borderRadius: 8, padding: "6px 13px", color: C.white, fontSize: 12, fontWeight: 700 }}>
            + Naya
          </button>
        }
      />

      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Naam ya jagah dhundhein..."
            style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 13 }} />
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["farmers","👨‍🌾 Kisan"],["buyers","🏭 Buyer"],["all","Sab"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: tab === id ? C.saffron : C.white, color: tab === id ? C.white : C.inkMid, border: `1.5px solid ${tab === id ? C.saffron : C.border}` }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 14px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 && (
          <Card>
            <p style={{ textAlign: "center", color: C.inkLight, fontSize: 13, padding: "16px 0" }}>
              {search ? "Koi match nahi mila" : "Koi party nahi abhi tak"}
            </p>
          </Card>
        )}

        {list.map(p => {
          const isFarmer = p.type === "Farmer";
          const bal = trueBalance(p);
          const displayBal = Math.abs(bal);
          const isOwed = bal > 0;

          return (
            <Card key={p.id} onClick={() => nav("khata", p)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: isFarmer ? C.pinkLight : C.saffronLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {isFarmer ? "👨‍🌾" : "🏭"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{p.place} · {p.phone || "—"}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 15, color: isOwed ? C.red : C.green }}>
                    {displayBal === 0 ? "✓ Saaf" : `₹${fmt(displayBal)}`}
                  </div>
                  {isOwed && <div style={{ fontSize: 10, color: C.inkLight }}>{isFarmer ? "Loan baaki" : "Lena baaki"}</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <BottomNav active="parties" nav={nav} />
    </Shell>
  );
}
