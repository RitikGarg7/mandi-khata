import { useState, useEffect, useRef } from "react";
import {
  auth, db,
  RecaptchaVerifier, signInWithPhoneNumber,
  GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut,
} from "../lib/firebase";
import { encrypt } from "../lib/crypto";
import { useApp } from "../context/AppContext";
import { Shell, C, Btn, Field, Spinner } from "../components/ui";

// Auth flow:
// New user (phone)  → Phone → OTP → set PIN → firm setup → Home
// New user (google) → Google popup → set PIN → firm setup → Home
// Returning user    → Firebase session detected → PIN screen → Home
// Forgot PIN        → "PIN bhool gaye?" → sign out → choose method again

export default function Login({ onLoggedIn }) {
  const { unlock, loadAll } = useApp();

  const [step, setStep]             = useState("loading"); // loading | choose | phone | otp | pin | confirm_pin | setup
  const [phone, setPhone]           = useState("");
  const [otp, setOtp]               = useState("");
  const [pin, setPin]               = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isNew, setIsNew]           = useState(false);
  const [fireUser, setFireUser]     = useState(null);
  const [confirmResult, setConfirmResult] = useState(null);
  const [error, setError]           = useState("");
  const [busy, setBusy]             = useState(false);
  // Firm setup fields
  const [firmName, setFirmName]     = useState("");
  const [mandiName, setMandiName]   = useState("");
  const [mandiCity, setMandiCity]   = useState("");
  const [gstin, setGstin]           = useState("");

  const recaptchaRef         = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  // On mount: check for existing Firebase session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFireUser(user);
        try {
          const settings = await db.getSettings();
          setIsNew(!settings);
        } catch {
          setIsNew(false);
        }
        setStep("pin");
      } else {
        setStep("choose");
      }
    });
    return () => unsub();
  }, []);

  // Set up invisible reCAPTCHA only when on phone step
  useEffect(() => {
    if (step !== "phone") return;
    const t = setTimeout(() => {
      if (!recaptchaVerifierRef.current && recaptchaRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
          size: "invisible",
          callback: () => {},
        });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [step]);

  // ── Google Sign-In ───────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setBusy(true); setError("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      setFireUser(user);
      try {
        const settings = await db.getSettings();
        setIsNew(!settings);
      } catch {
        setIsNew(false);
      }
      setStep("pin");
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        setError("Google sign-in mein dikkat aayi. Dobara try karein.");
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Phone OTP ────────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const cleaned = phone.trim().replace(/\s/g, "");
    if (!cleaned || cleaned.length < 10) { setError("Sahi phone number daalnein."); return; }
    const withCode = cleaned.startsWith("+") ? cleaned : "+91" + cleaned.replace(/^0/, "");
    setBusy(true); setError("");
    try {
      const result = await signInWithPhoneNumber(auth, withCode, recaptchaVerifierRef.current);
      setConfirmResult(result);
      setStep("otp");
    } catch (e) {
      setError(e.message || "OTP bhejne mein dikkat aayi.");
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError("6-digit OTP daalnein."); return; }
    setBusy(true); setError("");
    try {
      const result = await confirmResult.confirm(otp);
      const user = result.user;
      setFireUser(user);
      try {
        const settings = await db.getSettings();
        setIsNew(!settings);
      } catch {
        setIsNew(false);
      }
      setStep("pin");
    } catch {
      setError("Galat OTP. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  };

  // ── PIN logic ────────────────────────────────────────────────────────────────
  const tapDigit = (d, target) => {
    const current = target === "confirm" ? confirmPin : pin;
    const setter  = target === "confirm" ? setConfirmPin : setPin;
    if (d === "⌫") { setter(p => p.slice(0, -1)); setError(""); return; }
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
    else doUnlock(fireUser, p);
  };

  const handleConfirmComplete = (p) => {
    if (p !== pin) {
      setError("PIN match nahi hua. Dobara try karein.");
      setPin(""); setConfirmPin(""); setStep("pin");
      return;
    }
    setStep("setup");
  };

  const doUnlock = async (user, p) => {
    setBusy(true); setError("");
    try {
      const key = await unlock(user, p);
      await loadAll(key, user);
      onLoggedIn();
    } catch (e) {
      setError(e.message || "Galat PIN. Dobara try karein.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const handleSetupSave = async () => {
    if (!firmName.trim()) { setError("Firm ka naam zaroori hai."); return; }
    setBusy(true);
    try {
      const key = await unlock(fireUser, pin);
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
      await loadAll(key, fireUser);
      onLoggedIn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPin = () => {
    signOut(auth);
    setStep("choose");
    setPin(""); setError("");
  };

  // ── UI Components ────────────────────────────────────────────────────────────
  const PinDots = ({ len }) => (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 32 }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          width: 16, height: 16, borderRadius: "50%",
          background: len > i ? C.saffron : C.border,
          transition: "background 0.15s",
          boxShadow: len > i ? `0 0 0 4px ${C.saffron}22` : "none",
        }} />
      ))}
    </div>
  );

  const PinPad = ({ target }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 280, margin: "0 auto" }}>
      {[1,2,3,4,5,6,7,8,9].map(d => (
        <button key={d} onClick={() => tapDigit(String(d), target)}
          style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "18px 0", fontSize: 24, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'", cursor: "pointer" }}>
          {d}
        </button>
      ))}
      <div />
      <button onClick={() => tapDigit("0", target)}
        style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "18px 0", fontSize: 24, fontWeight: 600, color: C.ink, fontFamily: "'Baloo 2'", cursor: "pointer" }}>
        0
      </button>
      <button onClick={() => tapDigit("⌫", target)}
        style={{ background: "none", border: "none", fontSize: 22, color: C.inkMid, cursor: "pointer" }}>⌫</button>
    </div>
  );

  // Google icon SVG
  const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.5 26.8 36.5 24 36.5c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 40 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );

  return (
    <Shell>
      {/* Invisible reCAPTCHA anchor */}
      <div ref={recaptchaRef} />

      {/* Header */}
      <div style={{ background: C.saffron, padding: "48px 28px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>🌾</div>
        <h1 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 34, color: C.white, lineHeight: 1.1 }}>
          Mandi Khata
        </h1>
        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 8, fontStyle: "italic" }}>
          Arhtiya ka Digital Khata
        </p>
      </div>

      <div style={{ padding: "28px 24px 32px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {(busy || step === "loading") && <Spinner />}

        {/* ── Step 1: Choose sign-in method ── */}
        {!busy && step === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 14, color: C.inkMid, textAlign: "center", lineHeight: 1.7, marginBottom: 6 }}>
              Login karne ka tarika chunein
            </p>

            {/* Google button */}
            <button onClick={handleGoogle}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "15px 20px", fontSize: 15, fontWeight: 600, color: C.ink, cursor: "pointer", width: "100%", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
              <GoogleIcon />
              Google se Login Karein
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 12, color: C.inkLight, fontWeight: 600 }}>YA</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            {/* Phone button */}
            <button onClick={() => setStep("phone")}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: C.saffron, border: "none", borderRadius: 14, padding: "15px 20px", fontSize: 15, fontWeight: 600, color: C.white, cursor: "pointer", width: "100%" }}>
              📱 Mobile Number se Login Karein
            </button>

            <p style={{ fontSize: 11, color: C.inkLight, textAlign: "center", marginTop: 4, lineHeight: 1.6 }}>
              Pehli baar OTP aayega. Uske baad sirf PIN.
            </p>
          </div>
        )}

        {/* ── Step 2a: Phone number entry ── */}
        {!busy && step === "phone" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: C.inkMid, textAlign: "center", lineHeight: 1.7 }}>
              Apna mobile number daalnein.<br />
              <span style={{ fontSize: 12, color: C.inkLight }}>
                OTP aayega — sirf pehli baar ya PIN bhool jane par.
              </span>
            </p>
            <Field
              label="Mobile Number"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="10-digit number (e.g. 98765 43210)"
              prefix="+91"
            />
            <Btn onClick={handleSendOtp} disabled={phone.trim().replace(/\s/g,"").length < 10}>
              📱 OTP Bhejein
            </Btn>
            <button onClick={() => { setStep("choose"); setPhone(""); setError(""); }}
              style={{ background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer", textAlign: "center" }}>
              ← Wapas jaayein
            </button>
          </div>
        )}

        {/* ── Step 2b: OTP verify ── */}
        {!busy && step === "otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.greenLight, borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>✓ OTP bheja gaya</p>
              <p style={{ fontSize: 12, color: C.inkMid, marginTop: 4 }}>+91 {phone} par 6-digit code aaya hoga</p>
            </div>
            <Field
              label="OTP Code"
              value={otp}
              onChange={setOtp}
              type="number"
              placeholder="6-digit OTP daalnein"
            />
            <Btn onClick={handleVerifyOtp} disabled={otp.length !== 6}>
              ✓ Verify Karein
            </Btn>
            <button onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
              style={{ background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer", textAlign: "center" }}>
              ← Number badlein / Dobara bhejein
            </button>
          </div>
        )}

        {/* ── Step 3: PIN entry ── */}
        {!busy && step === "pin" && (
          <div style={{ textAlign: "center" }}>
            {/* Show who is logged in */}
            {fireUser && (
              <div style={{ background: C.cream, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 16px", marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 10 }}>
                {fireUser.photoURL
                  ? <img src={fireUser.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                  : <span style={{ fontSize: 18 }}>📱</span>
                }
                <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>
                  {fireUser.displayName || fireUser.phoneNumber || fireUser.email}
                </span>
              </div>
            )}
            <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
              {isNew ? "Naya 4-digit PIN chunein" : "Apna PIN daalnein"}
            </p>
            <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 24 }}>
              {isNew ? "Yeh PIN aapka data unlock karne ke liye use hoga" : "Roz is PIN se khulega"}
            </p>
            <PinDots len={pin.length} />
            <PinPad target="main" />
            <button onClick={handleForgotPin}
              style={{ marginTop: 24, background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer" }}>
              PIN bhool gaye? Dobara login karein →
            </button>
          </div>
        )}

        {/* ── Step 4: Confirm PIN (new users only) ── */}
        {!busy && step === "confirm_pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
              PIN dobara daalnein
            </p>
            <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 24 }}>
              Confirm karne ke liye wahi PIN phir se daalnein
            </p>
            <PinDots len={confirmPin.length} />
            <PinPad target="confirm" />
          </div>
        )}

        {/* ── Step 5: Firm setup (new users only) ── */}
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
