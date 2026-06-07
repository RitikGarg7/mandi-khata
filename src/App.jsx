import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
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
  const [screen, setScreen]     = useState("login");
  const [selParty, setSelParty] = useState(null);
  const [editBill, setEditBill] = useState(null);
  const [hist, setHist]         = useState([]);
  const [pendingSession, setPendingSession] = useState(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) setPendingSession(session);
      if (event === "SIGNED_OUT") { setScreen("login"); setHist([]); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPendingSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const nav = (to, data) => {
    setHist(h => [...h, screen]);
    if (to === "khata" && data) setSelParty(data);
    setEditBill((to === "newI" || to === "newJ") ? (data || null) : null);
    setScreen(to);
  };

  const back = () => {
    const prev = hist[hist.length - 1] || "home";
    setHist(h => h.slice(0, -1));
    setEditBill(null);
    setScreen(prev);
  };

  if (screen === "login") {
    return (
      <Login
        pendingSession={pendingSession}
        onLoggedIn={() => { setHist([]); setScreen("home"); }}
      />
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
