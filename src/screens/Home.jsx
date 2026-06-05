import { useApp } from "../context/AppContext";
import { Shell, C, Card, BottomNav, Tag, amountShort, fmt } from "../components/ui";

function currentFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed; April = 3
  const start = m >= 3 ? y : y - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

export default function Home({ nav }) {
  const { parties, purchaseBills, saleBills, settings, trueBalance } = useApp();

  const farmers = parties.filter(p => p.type === "Farmer");
  const buyers  = parties.filter(p => p.type === "Customer");

  const totalFarmerLoans = farmers.reduce((s, f) => s + Math.max(0, trueBalance(f)), 0);
  const totalBuyerDue    = buyers.reduce((s, b)  => s + Math.max(0, trueBalance(b)), 0);
  const totalAadat       = saleBills.reduce((s, b) => s + (b.mpc_amount || 0), 0);

  const today      = new Date().toISOString().split("T")[0];
  const todayBills = purchaseBills.filter(b => b.date === today);
  const recentBills = [...purchaseBills].sort((a, b) => b.date?.localeCompare(a.date)).slice(0, 4);

  const firmName  = settings?.firm_name || "Aapki Firm";
  const gstin     = settings?.gstin || "";
  const mandiName = settings?.mandi_name || "";
  const location  = [mandiName, settings?.mandi_city].filter(Boolean).join(", ");

  return (
    <Shell>
      <div style={{ background: C.saffron, padding: "36px 18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>Radhe Radhe 🙏</p>
            <h2 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 22, color: C.white, marginTop: 2 }}>{firmName}</h2>
            {(location || gstin) && (
              <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, marginTop: 2 }}>
                {[location, gstin].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <Tag color={C.white} bg="rgba(255,255,255,0.18)">{currentFY()}</Tag>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
          {[
            { label: "Kisan Udhar",  amount: totalFarmerLoans, icon: "👨‍🌾" },
            { label: "Buyer Baaki",  amount: totalBuyerDue,    icon: "🏭" },
            { label: "Aapki Aadat",  amount: totalAadat,       icon: "💰" },
          ].map(c => (
            <div key={c.label} style={{ background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 14, color: C.white }}>{amountShort(c.amount)}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginTop: 1 }}>{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "18px 14px 100px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Quick Actions</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Naya Khareed\nForm J", icon: "📥", color: C.pink,    screen: "newJ" },
              { label: "Naya Bikri\nForm I",   icon: "📤", color: C.saffron, screen: "newI" },
              { label: "Payment\nRecord karein",icon:"💳", color: C.gold,   screen: "parties" },
              { label: "Naya Party\nJodein",   icon: "➕",  color: C.blue,   screen: "newParty" },
            ].map(a => (
              <button key={a.label} onClick={() => nav(a.screen)}
                style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "14px 12px", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: a.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{a.icon}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, whiteSpace: "pre-line", lineHeight: 1.3 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {todayBills.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Aaj ki Bills ({today})</p>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {todayBills.map((b, i) => {
                const farmer = parties.find(p => p.id === b.party_id);
                return (
                  <div key={b.id} style={{ padding: "13px 14px", borderBottom: i < todayBills.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{farmer?.name || "—"} · {b.commodity}</div>
                      <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{b.series}/{b.bill_number} · {b.bags} bori</div>
                    </div>
                    <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 14, color: C.green }}>₹{fmt(b.net_payable)}</div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Haal ki Bills</p>
          {recentBills.length === 0 ? (
            <Card>
              <p style={{ textAlign: "center", color: C.inkLight, fontSize: 13, padding: "12px 0" }}>Koi bills nahi abhi tak</p>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {recentBills.map((b, i) => {
                const farmer = parties.find(p => p.id === b.party_id);
                return (
                  <div key={b.id} style={{ padding: "13px 14px", borderBottom: i < recentBills.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{farmer?.name || "—"} · {b.commodity}</div>
                      <div style={{ fontSize: 11, color: C.inkLight, marginTop: 2 }}>{b.series}/{b.bill_number} · {b.bags} bori · {b.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 14, color: C.green }}>₹{fmt(b.net_payable)}</div>
                      <Tag color={b.is_complete ? C.green : C.gold} bg={b.is_complete ? "#E8F5EE" : "#FDF6E3"}>
                        {b.is_complete ? "✓ Mukammal" : "Baaki"}
                      </Tag>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>

      <BottomNav active="home" nav={nav} />
    </Shell>
  );
}
