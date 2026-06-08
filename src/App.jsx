import { useState, useEffect } from "react";
import { auth, onAuthStateChanged } from "./lib/firebase";
import { AppProvider, useApp } from "./context/AppContext";

import Login    from "./screens/Login";
import Home     from "./screens/Home";
import Parties  from "./screens/Parties";
import Bills    from "./screens/Bills";
import Balance  from "./screens/Balance";
import Khata    from "./screens/Khata";
import NewParty from "./screens/NewParty";
import NewFormJ from "./screens/NewFormJ";
import NewFormI from "./screens/NewFormI";

function Router() {
  const { unlock, loadAll } = useApp();
  const [screen, setScreen]   = useState("login");
  const [selParty, setSelParty] = useState(null);
  const [editBill, setEditBill] = useState(null);
  const [hist, setHist]         = useState([]);

  // ── Firebase auth listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user && screen !== "login") {
        setScreen("login");
        setHist([]);
      }
    });
    return () => unsub();
  }, []);

  // ── Intercept iOS swipe-back & Android hardware back ─────────────────────
  // Every time we navigate forward we push a dummy history entry.
  // When the user swipes back the browser fires "popstate" — we catch it,
  // call our own back(), and immediately push another dummy entry so the
  // browser never actually leaves the page.
  useEffect(() => {
    // Push an initial entry so there's always something to pop
    window.history.pushState({ page: "app" }, "");

    const handlePopState = () => {
      // Re-push so next swipe-back is also intercepted
      window.history.pushState({ page: "app" }, "");
      // Trigger our in-app back navigation
      setHist(h => {
        if (h.length === 0) return h; // already at root, do nothing
        const prev = h[h.length - 1];
        setEditBill(null);
        setScreen(prev);
        return h.slice(0, -1);
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const nav = (to, data) => {
    setHist(h => [...h, screen]);
    if (to === "khata" && data) setSelParty(data);
    setEditBill((to === "newI" || to === "newJ") ? (data || null) : null);
    setScreen(to);
    // Push a browser history entry so swipe-back has something to pop
    window.history.pushState({ page: to }, "");
  };

  const back = () => {
    setHist(h => {
      const prev = h[h.length - 1] || "home";
      setEditBill(null);
      setScreen(prev);
      return h.slice(0, -1);
    });
    // Let the popstate handler re-push; or push ourselves if called via button
    window.history.pushState({ page: "app" }, "");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === "login") {
    return (
      <Login onLoggedIn={() => {
        setHist([]);
        setScreen("home");
        window.history.pushState({ page: "home" }, "");
      }} />
    );
  }

  const screens = {
    home:     <Home nav={nav} />,
    parties:  <Parties nav={nav} />,
    bills:    <Bills nav={nav} />,
    balance:  <Balance nav={nav} />,
    newParty: <NewParty onBack={back} />,
    newJ:     <NewFormJ onBack={back} nav={nav} editData={editBill} />,
    newI:     <NewFormI onBack={back} nav={nav} editData={editBill} />,
    khata:    <Khata party={selParty} onBack={back} />,
  };

  return screens[screen] || <Home nav={nav} />;
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
