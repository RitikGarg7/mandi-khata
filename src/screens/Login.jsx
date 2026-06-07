import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { encrypt } from "../lib/crypto";
import { db } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { Shell, C, Btn, Field, Spinner } from "../components/ui";

// Auth flow:
// New user      → Google Sign-In → set 4-digit PIN → firm details → Home
// Every day     → Enter PIN → Home  (Google session persists in browser)
// Forgot PIN    → Google Sign-In again → set new PIN → Home

export default function Login({ onLoggedIn, pendingSession }) {
  const { unlock, loadAll } = useApp();
  const [step, setStep] = useState("loading");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [mandiName, setMandiName] = useState("");
  const [mandiCity, setMandiCity] = useState("");
  const [gstin, setGstin] = useState("");

  useEffect(() => {
    // If redirected back from Google OAuth, pendingSession is set
    if (pendingSession) {
      setAuthSession(pendingSession);
      // Check if this user has settings already (returning user) or is new
      supabase.from("settings").select("id").maybeSingle().then(({ data }) => {
        setIsNew(!data);
        setStep("pin");
      });
      return;
    }
    // Check for existing session (user opened app again same day)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthSession(session);
        supabase.from("settings").select("id").maybeSingle().then(({ data }) => {
          setIsNew(!data);
          setStep("pin");
        });
      } else {
        setStep("google"); // No session — need Google sign-in
      }
    });
  }, [pendingSession]);

  const handleGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Page will redirect to Google — no code runs after this
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const tapDigit = (d, target) => {
    const current = target === "confirm" ? confirmPin : pin;
    const setter  = target === "confirm" ? setConfirmPin : setPin;
    const next = current + d;
    if (next.length > 4) return;
    setter(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (target === "confirm") handleConfirmComplete(next);
        else handlePinComplete(next);
      }, 250);
    }
  };

  const handlePinComplete = (p) => {
    if (isNew) setStep("confirm_pin");
    else doUnlock(authSession, p);
  };

  const handleConfirmComplete = (p) => {
    if (p !== pin) {
      setError("PIN match nahi hua. Dobara try karein.");
      setPin(""); setConfirmPin(""); setStep("pin");
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
      const settingsData = {
        firm_name: firmName.trim(),
        gstin: gstin.trim(),
        mandi_name: mandiName.trim(),
        mandi_city: mandiCity.trim(),
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

  const PinPad = ({ target }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
      {[1,2,3,4,5,6,7,8,9].map(d => (
        <button key={d} onClick={() => tapDigit(String(d), target)}
          style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "17px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'" }}>
          {d}
        </button>
      ))}
      <div />
      <button onClick={() => tapDigit("0", target)}
        style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "17px 0", fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'" }}>
        0
      </button>
      <button onClick={() => target === "confirm" ? setConfirmPin(p => p.slice(0,-1)) : setPin(p => p.slice(0,-1))}
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

        {(busy || step === "loading") && <Spinner />}

        {/* Google sign-in */}
        {!busy && step === "google" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            <p style={{ fontSize: 14, color: C.inkMid, textAlign: "center", lineHeight: 1.6 }}>
              Apne Google account se login karein.<br />
              <span style={{ fontSize: 12, color: C.inkLight }}>Roz PIN se khuljega — Google sirf pehli baar.</span>
            </p>
            <button onClick={handleGoogle}
              style={{ display: "flex", alignItems: "center", gap: 12, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 24px", fontSize: 15, fontWeight: 600, color: C.ink, cursor: "pointer", width: "100%", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.5 26.8 36.5 24 36.5c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 40 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.6-.4-3.9z"/>
              </svg>
              Google se Login Karein
            </button>
          </div>
        )}

        {/* Daily PIN entry */}
        {!busy && step === "pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 8 }}>
              {isNew ? "Naya 4-digit PIN chunein" : "PIN daalnein"}
            </p>
            {!isNew && authSession && (
              <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 16 }}>
                {authSession.user?.user_metadata?.full_name || authSession.user?.email}
              </p>
            )}
            <PinDots len={pin.length} />
            <PinPad target="main" />
            <button onClick={() => { setStep("google"); setPin(""); }}
              style={{ marginTop: 20, background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer" }}>
              PIN bhool gaye? Google se login karein →
            </button>
          </div>
        )}

        {/* Confirm PIN (new users) */}
        {!busy && step === "confirm_pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 20 }}>
              PIN dobara daalnein (confirm)
            </p>
            <PinDots len={confirmPin.length} />
            <PinPad target="confirm" />
          </div>
        )}

        {/* Firm setup (new users only) */}
        {!busy && step === "setup" && (
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 20, textAlign: "center" }}>
              Apni dukaan ki jaankari bharein
            </p>
            <Field label="Firm ka Naam" value={firmName} onChange={setFirmName} placeholder="Jaise: B.R. and Sons" required />
            <Field label="Mandi ka Naam" value={mandiName} onChange={setMandiName} placeholder="Jaise: Taraori Anaj Mandi" />
            <Field label="Shehar / Zila" value={mandiCity} onChange={setMandiCity} placeholder="Jaise: Karnal" />
            <Field label="GSTIN (optional)" value={gstin} onChange={setGstin} placeholder="15 digit GSTIN" />
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
