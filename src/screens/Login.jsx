import { useState, useEffect, useRef } from "react";
import { auth, db, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "../lib/firebase";
import { encrypt } from "../lib/crypto";
import { useApp } from "../context/AppContext";
import { Shell, C, Btn, Field, Spinner } from "../components/ui";

// Auth flow:
// New user   → Enter phone → OTP → set 4-digit PIN → firm details → Home
// Every day  → Enter PIN → Home  (Firebase session persists in browser)
// Forgot PIN → Re-verify phone → set new PIN → Home

export default function Login({ onLoggedIn }) {
  const { unlock, loadAll } = useApp();

  const [step, setStep]           = useState("loading"); // loading | phone | otp | pin | confirm_pin | setup
  const [phone, setPhone]         = useState("");
  const [otp, setOtp]             = useState("");
  const [pin, setPin]             = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isNew, setIsNew]         = useState(false);
  const [fireUser, setFireUser]   = useState(null);
  const [confirmResult, setConfirmResult] = useState(null);
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState(false);
  // Setup fields
  const [firmName, setFirmName]   = useState("");
  const [mandiName, setMandiName] = useState("");
  const [mandiCity, setMandiCity] = useState("");
  const [gstin, setGstin]         = useState("");

  const recaptchaRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  // On mount: check for existing Firebase session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFireUser(user);
        // Check if new user (no settings doc yet)
        try {
          const settings = await db.getSettings();
          setIsNew(!settings);
        } catch {
          setIsNew(true);
        }
        setStep("pin");
      } else {
        setStep("phone");
      }
    });
    return () => unsub();
  }, []);

  // Set up invisible reCAPTCHA when on phone step
  useEffect(() => {
    if (step !== "phone") return;
    // Small delay to ensure div is mounted
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

  const handleSendOtp = async () => {
    const cleaned = phone.trim().replace(/\s/g, "");
    if (!cleaned || cleaned.length < 10) { setError("Sahi phone number daalnein."); return; }
    // Ensure +91 prefix
    const withCode = cleaned.startsWith("+") ? cleaned : "+91" + cleaned.replace(/^0/, "");
    setBusy(true); setError("");
    try {
      const verifier = recaptchaVerifierRef.current;
      const result = await signInWithPhoneNumber(auth, withCode, verifier);
      setConfirmResult(result);
      setStep("otp");
    } catch (e) {
      setError(e.message || "OTP bhejne mein dikkat aayi.");
      // Reset reCAPTCHA on error
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
      const settings = await db.getSettings().catch(() => null);
      setIsNew(!settings);
      setStep("pin");
    } catch (e) {
      setError("Galat OTP. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  };

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
      await loadAll(key);
      onLoggedIn();
    } catch {
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
      <button onClick={() => tapDigit("⌫", target)}
        style={{ background: "none", border: "none", fontSize: 20, color: C.inkMid }}>⌫</button>
    </div>
  );

  return (
    <Shell>
      {/* Invisible reCAPTCHA anchor */}
      <div ref={recaptchaRef} />

      <div style={{ background: C.saffron, padding: "52px 28px 36px", textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🌾</div>
        <h1 style={{ fontFamily: "'Baloo 2'", fontWeight: 800, fontSize: 34, color: C.white, lineHeight: 1.1 }}>Mandi Khata</h1>
        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 14, marginTop: 8, fontStyle: "italic" }}>Arhtiya ka Digital Khata</p>
      </div>

      <div style={{ padding: "28px 24px 32px" }}>
        {error && (
          <div style={{ background: "#FDF0EE", border: `1px solid ${C.red}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.red, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {(busy || step === "loading") && <Spinner />}

        {/* Phone number entry */}
        {!busy && step === "phone" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: C.inkMid, textAlign: "center", lineHeight: 1.6 }}>
              Apna mobile number daalnein.<br />
              <span style={{ fontSize: 12, color: C.inkLight }}>OTP aayega — sirf pehli baar ya PIN bhool jane par.</span>
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
          </div>
        )}

        {/* OTP verification */}
        {!busy && step === "otp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 14, color: C.inkMid, textAlign: "center", lineHeight: 1.6 }}>
              OTP aapke number par bheja gaya hai.<br />
              <span style={{ fontSize: 12, color: C.inkLight }}>6-digit code daalnein.</span>
            </p>
            <Field
              label="OTP"
              value={otp}
              onChange={setOtp}
              type="number"
              placeholder="6-digit OTP"
            />
            <Btn onClick={handleVerifyOtp} disabled={otp.length !== 6}>
              ✓ OTP Verify Karein
            </Btn>
            <button onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
              style={{ background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer" }}>
              ← Number badlein / Dobara bhejein
            </button>
          </div>
        )}

        {/* Daily PIN entry */}
        {!busy && step === "pin" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 8 }}>
              {isNew ? "Naya 4-digit PIN chunein" : "PIN daalnein"}
            </p>
            {!isNew && fireUser && (
              <p style={{ fontSize: 12, color: C.inkLight, marginBottom: 16 }}>
                {fireUser.phoneNumber}
              </p>
            )}
            <PinDots len={pin.length} />
            <PinPad target="main" />
            <button onClick={() => {
              // Force re-auth via OTP to reset PIN
              signOut(auth);
              setStep("phone"); setPin(""); setError("");
            }}
              style={{ marginTop: 20, background: "none", border: "none", color: C.inkLight, fontSize: 12, cursor: "pointer" }}>
              PIN bhool gaye? Phone se verify karein →
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
