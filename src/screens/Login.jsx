import { useState } from "react";
import { supabase } from "../lib/supabase";
import { encrypt } from "../lib/crypto";
import { db } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { Shell, C, Btn, Field, Spinner } from "../components/ui";

export default function Login({ onLoggedIn, pendingSession }) {
  const { unlock, loadAll } = useApp();
  const [step, setStep] = useState(pendingSession ? "pin" : "landing");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [authSession, setAuthSession] = useState(pendingSession || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [gstin, setGstin] = useState("");

  const handleGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  // After OAuth redirect, supabase calls onAuthStateChange in App.jsx
  // which calls onLoggedIn with the session + pin still needed.
  // Here we handle the PIN step directly if session is passed.
  const handleGoogleDone = (session) => {
    setAuthSession(session);
    setStep("pin");
  };

  const tapDigit = (d) => {
    const next = pin + d;
    if (next.length > 4) return;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => handlePinComplete(next), 250);
    }
  };

  const tapConfirmDigit = (d) => {
    const next = confirmPin + d;
    if (next.length > 4) return;
    setConfirmPin(next);
    if (next.length === 4) {
      setTimeout(() => handleConfirmComplete(next), 250);
    }
  };

  const handlePinComplete = (p) => {
    if (isNew) {
      setStep("confirm_pin");
    } else {
      doUnlock(authSession, p);
    }
  };

  const handleConfirmComplete = (p) => {
    if (p !== pin) {
      setError("PIN match nahi hua. Dobara try karein.");
      setPin("");
      setConfirmPin("");
      setStep("pin");
      return;
    }
    setStep("setup");
  };

  const doUnlock = async (session, p) => {
    setBusy(true);
    setError("");
    try {
      const key = await unlock(session, p);
      await loadAll(key);
      onLoggedIn();
    } catch (e) {
      setError("Galat PIN. Dobara try karein.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const handleSetupSave = async () => {
    if (!firmName.trim()) { setError("Firm ka naam zaroori hai."); return; }
    setBusy(true);
    try {
      const key = await unlock(authSession, pin);
      // Save initial settings
      const settingsData = {
        firm_name: firmName.trim(),
        gstin: gstin.trim(),
        mandi_name: "Taraori Anaj Mandi",
        mpc_rate_default: 2.5,
        auc_rate_default: 0.1,
        labour_rate_default: 7.88,
        utaari_rate_default: 5.32,
        financial_year_start: "2024-04-01",
      };
      const blob = await encrypt(key, settingsData);
      await db.saveSettings(null, blob);
      await loadAll(key);
      onLoggedIn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const PinDots = ({ len }) => (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 28 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: len > i ? C.saffron : C.border, transition: "background 0.15s" }} />
      ))}
    </div>
  );

  const PinPad = ({ onTap, onBack }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
      {[1,2,3,4,5,6,7,8,9].map(d => (
        <button key={d} onClick={() => onTap(String(d))}
          style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "17px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'" }}>{d}</button>
      ))}
      <div />
      <button onClick={() => onTap("0")}
        style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "17px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'" }}>0</button>
      <button onClick={onBack}
        style={{ background: "none", border: "none", fontSize: 20, color: C.inkMid }}>⌫</button>
    </div>
  );

  return (
    <Shell>
      <div style={{ background: C.saffron, padding: "52px 28px 36px", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🌾</div>
        <h1 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 34, color: C.white, lineHeight: 1.1 }}>Mandi Khata</h1>
        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 8, fontStyle: "italic" }}>Taraori Anaj Mandi, Karnal</p>
      </div>

      <div style={{ padding: "28px 24px 32px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {busy && <Spinner />}

        {!busy && step === "landing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Btn onClick={handleGoogle}>Google se Login karein</Btn>
            <button
              onClick={() => { setIsNew(true); setStep("google_first"); }}
              style={{ background: "none", border: "none", color: C.inkLight, fontSize: 13, marginTop: 4 }}>
              Pehli baar? Naya account banayein →
            </button>
          </div>
        )}

        {!busy && step === "google_first" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 14, color: C.inkMid, marginBottom: 8, textAlign: "center" }}>
              Pehle Google se sign in karein, phir naya PIN set karenge.
            </p>
            <Btn onClick={handleGoogle}>Google se Continue karein</Btn>
          </div>
        )}

        {!busy && step === "pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 20 }}>
              {isNew ? "Naya 4-digit PIN chunein" : "4-digit PIN daalnein"}
            </p>
            <PinDots len={pin.length} />
            <PinPad onTap={tapDigit} onBack={() => setPin(p => p.slice(0, -1))} />
          </div>
        )}

        {!busy && step === "confirm_pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 20 }}>PIN dobara daalnein (confirm)</p>
            <PinDots len={confirmPin.length} />
            <PinPad onTap={tapConfirmDigit} onBack={() => setConfirmPin(p => p.slice(0, -1))} />
          </div>
        )}

        {!busy && step === "setup" && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 20, textAlign: "center" }}>
              Apni dukaan ki jaankari bharein
            </p>
            <Field label="Firm ka Naam" value={firmName} onChange={setFirmName} placeholder="Jaise: B.R. and Sons" required />
            <Field label="GSTIN" value={gstin} onChange={setGstin} placeholder="15 digit GSTIN (agar ho toh)" />
            <Btn variant="green" onClick={handleSetupSave}>✓ Shuru Karein</Btn>
          </div>
        )}
      </div>

      <p style={{ textAlign: "center", fontSize: 11, color: C.inkLight, padding: "0 24px 32px" }}>
        🔒 End-to-end encrypted · Sirf aapke paas
      </p>
    </Shell>
  );
}
