import { useState } from "react";
import { useApp } from "../context/AppContext";
import { C } from "./ui";

export default function PinConfirm({ prompt = "Confirm karne ke liye PIN daalnein", onConfirm, onCancel }) {
  const { verifyPin } = useApp();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tap = async (d) => {
    if (busy) return;
    if (d === "⌫") { setPin(p => p.slice(0, -1)); setError(""); return; }
    const next = pin + d;
    if (next.length > 4) return;
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      const ok = await verifyPin(next);
      setBusy(false);
      if (ok) { onConfirm(); }
      else { setError("Galat PIN. Dobara try karein."); setPin(""); }
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: C.white, borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", boxSizing: "border-box" }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, textAlign: "center", marginBottom: 6 }}>{prompt}</p>

        {error && <p style={{ fontSize: 12, color: C.red, textAlign: "center", marginBottom: 8, fontWeight: 600 }}>⚠️ {error}</p>}

        {/* PIN dots */}
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: pin.length > i ? C.saffron : C.border, transition: "background 0.12s" }} />
          ))}
        </div>

        {/* PIN pad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 260, margin: "0 auto 20px" }}>
          {[1,2,3,4,5,6,7,8,9].map(d => (
            <button key={d} onClick={() => tap(String(d))} disabled={busy}
              style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "16px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'", cursor: "pointer" }}>
              {d}
            </button>
          ))}
          <div />
          <button onClick={() => tap("0")} disabled={busy}
            style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "16px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'", cursor: "pointer" }}>
            0
          </button>
          <button onClick={() => tap("⌫")} disabled={busy}
            style={{ background: "none", border: "none", fontSize: 20, color: C.inkMid, cursor: "pointer" }}>
            ⌫
          </button>
        </div>

        <button onClick={onCancel}
          style={{ width: "100%", padding: "12px 0", background: "none", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.inkMid, cursor: "pointer", fontWeight: 600 }}>
          Raddh
        </button>
      </div>
    </div>
  );
}
