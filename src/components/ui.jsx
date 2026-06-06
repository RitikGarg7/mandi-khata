// Shared design system — tokens + primitive components
import { useState } from "react";

export const C = {
  saffron: "#D4580A",
  saffronLight: "#FDF1E8",
  saffronDark: "#A8430A",
  green: "#1A6B3A",
  greenLight: "#E8F5EE",
  gold: "#B8820A",
  goldLight: "#FDF6E3",
  pink: "#E8507A",
  pinkLight: "#FDF0F4",
  ink: "#1A1208",
  inkMid: "#4A3F30",
  inkLight: "#8A7A65",
  cream: "#FAF7F2",
  white: "#FFFFFF",
  border: "#E8E0D5",
  red: "#C8230A",
  redLight: "#FDF0EE",
  blue: "#1A5A8A",
  blueLight: "#E8F0F8",
};

export const G = `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&family=Noto+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  body{font-family:'Noto Sans',sans-serif;background:${C.cream};color:${C.ink}}
  input,select,textarea,button{font-family:'Noto Sans',sans-serif}
  button{cursor:pointer}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
`;

export const fmt = n =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function Shell({ children, style }) {
  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: C.cream, position: "relative", overflow: "hidden", ...style }}>
      <style>{G}</style>
      {children}
    </div>
  );
}

export function TopBar({ title, onBack, right, bg = C.white }) {
  return (
    <div style={{ background: bg, borderBottom: bg === C.white ? `1px solid ${C.border}` : "none", padding: "0 16px", height: 56, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, color: bg === C.white ? C.inkMid : C.white, padding: "8px 8px 8px 0" }}>←</button>
      )}
      <span style={{ fontFamily: "'Baloo 2'", fontWeight: 700, fontSize: 18, color: bg === C.white ? C.ink : C.white, flex: 1 }}>{title}</span>
      {right}
    </div>
  );
}

export function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ background: C.white, borderRadius: 16, padding: 16, border: `1px solid ${C.border}`, cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", style, disabled, type = "button" }) {
  const variants = {
    primary:   { background: C.saffron,  color: C.white,   border: "none" },
    secondary: { background: C.white,    color: C.saffron,  border: `1.5px solid ${C.saffron}` },
    green:     { background: C.green,    color: C.white,   border: "none" },
    pink:      { background: C.pink,     color: C.white,   border: "none" },
    ghost:     { background: "transparent", color: C.inkMid, border: "none" },
    red:       { background: C.red,      color: C.white,   border: "none" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...variants[variant], borderRadius: 12, padding: "13px 20px", fontSize: 15, fontWeight: 600, width: "100%", opacity: disabled ? 0.45 : 1, fontFamily: "'Baloo 2'", ...style }}>
      {children}
    </button>
  );
}

function ModalSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => (o.value ?? o) === value);
  const displayLabel = selected ? (selected.label ?? selected) : null;

  return (
    <>
      <div onClick={() => setOpen(true)}
        style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 14, color: displayLabel ? C.ink : C.inkLight, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayLabel || placeholder || "Chunein..."}</span>
        <span style={{ color: C.inkLight, fontSize: 11, marginLeft: 8, flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "relative", background: C.white, borderRadius: "20px 20px 0 0", maxHeight: "65vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 0 4px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border, margin: "0 auto" }} />
            </div>
            <div style={{ overflowY: "auto", paddingBottom: 28 }}>
              {options.map(o => {
                const val = o.value ?? o;
                const lbl = o.label ?? o;
                const isSelected = val === value;
                return (
                  <div key={val} onClick={() => { onChange(val); setOpen(false); }}
                    style={{ padding: "14px 20px", fontSize: 15, fontWeight: isSelected ? 700 : 400, color: isSelected ? C.saffron : C.ink, background: isSelected ? C.saffronLight : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
                    <span>{lbl}</span>
                    {isSelected && <span style={{ fontSize: 14, color: C.saffron }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Field({ label, value, onChange, type = "text", placeholder, prefix, suffix, options, hint, required, readOnly, rows }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 5 }}>
          {label}{required && <span style={{ color: C.red }}> *</span>}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {prefix && <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.inkLight, fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>{prefix}</span>}
        {options ? (
          <ModalSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />
        ) : rows ? (
          <textarea value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly} rows={rows}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: readOnly ? C.cream : C.white, fontSize: 14, color: C.ink, resize: "none" }} />
        ) : (
          <input type={type} value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
            style={{ width: "100%", padding: `12px ${suffix ? "52px" : "16px"} 12px ${prefix ? "36px" : "16px"}`, borderRadius: 10, border: `1.5px solid ${C.border}`, background: readOnly ? C.cream : C.white, fontSize: 14, color: C.ink }} />
        )}
        {suffix && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.inkLight, fontSize: 12 }}>{suffix}</span>}
      </div>
      {hint && <p style={{ fontSize: 11, color: C.inkLight, marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

export function Tag({ children, color = C.saffron, bg = C.saffronLight }) {
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, color, background: bg }}>{children}</span>;
}

export function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      {label && <span style={{ fontSize: 11, color: C.inkLight, fontWeight: 600 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

export function Row({ label, amount, bold, color, sub, indent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${bold ? 8 : 5}px 0`, paddingLeft: indent ? 10 : 0, borderTop: bold ? `1px solid ${C.border}` : "none", marginTop: bold ? 6 : 0 }}>
      <span style={{ fontSize: sub ? 12 : bold ? 14 : 13, fontWeight: bold ? 700 : 400, color: color || (bold ? C.ink : C.inkMid) }}>{label}</span>
      <span style={{ fontSize: sub ? 12 : bold ? 15 : 14, fontWeight: bold ? 700 : 500, color: color || (bold ? C.ink : C.inkMid), fontFamily: "'Baloo 2'" }}>
        ₹{fmt(Math.abs(Number(amount || 0)))}
      </span>
    </div>
  );
}

export function BottomNav({ active, nav }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: C.white, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100, paddingBottom: 6 }}>
      {[["home","🏠","Home"],["parties","👥","Parties"],["bills","📋","Bills"],["balance","📊","Balance"]].map(([id, icon, label]) => (
        <button key={id} onClick={() => nav(id)}
          style={{ flex: 1, background: "none", border: "none", padding: "10px 0 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 21 }}>{icon}</span>
          <span style={{ fontSize: 10, fontWeight: active === id ? 700 : 400, color: active === id ? C.saffron : C.inkLight }}>{label}</span>
          {active === id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.saffron }} />}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 120 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${C.border}`, borderTopColor: C.saffron, animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function amountShort(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${fmt(n)}`;
}
