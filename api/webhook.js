/**
 * /api/webhook.js — WhatsApp Webhook
 */

let _db = null;
async function getDb() {
  if (_db) return _db;
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  _db = getFirestore();
  return _db;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN)
      return res.status(200).send(challenge);
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    try {
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return res.status(200).json({ status: "ok" });
      const from = message.from;
      const text = message.text?.body?.trim() || "";
      const state = await getState(from);
      const { reply, newState, partyData } = handleMessage(text, state);
      if (partyData) await saveParty(from, partyData);
      await saveState(from, newState);
      await sendMessage(from, reply);
      return res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("Webhook error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(405).send("Method not allowed");
}

async function sendMessage(to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

async function getState(phone) {
  try {
    const doc = await (await getDb()).collection("wa_sessions").doc(phone).get();
    return doc.exists ? doc.data() : null;
  } catch { return null; }
}

async function saveState(phone, state) {
  await (await getDb()).collection("wa_sessions").doc(phone).set({ ...state, updatedAt: new Date().toISOString() });
}

async function saveParty(phone, data) {
  const db  = await getDb();
  const ref = db.collection("wa_parties").doc(phone).collection("parties").doc();
  await ref.set({
    id: ref.id, name: data.naam, opening_balance: data.udhaar,
    opening_balance_date: data.date, interest_rate: data.byaaj || 0,
    type: "Farmer", source: "whatsapp", createdAt: new Date().toISOString(), phone_from: phone,
  });
}

// ── Conversation ──────────────────────────────────────────────────────────────

function handleMessage(text, state) {
  const step = state?.step || "WELCOME";
  const data = state?.data || {};

  // Global keyword
  if (text.trim().toLowerCase() === "menu" && step !== "WELCOME") {
    return { reply: menu(), newState: { step: "MENU", data: {} }, partyData: null };
  }

  switch (step) {

    case "WELCOME":
      return { reply: `🙏 Namaste! *Mandi Khata* mein aapka swagat hai! 🌾\n\n${menu()}`, newState: { step: "MENU", data: {} }, partyData: null };

    case "MENU": {
      const t = text.trim();
      if (t === "1") return {
        reply: `➕ *Nayi Party*\n\nNeeche diye format mein *ek hi message* mein reply karein:\n\n*Naam:* Ramesh Singh\n*Udhaar:* 50000\n*Date:* 01-01-2026\n*Byaaj:* 2\n\n_Date DD-MM-YYYY format mein likhein_\n_Byaaj % per mahina, 0 matlab koi byaaj nahi_`,
        newState: { step: "FORM_FILL", data: {} }, partyData: null,
      };
      if (t === "2") return { reply: `📋 *Form J* jald aa raha hai!\n\n${menu()}`, newState: { step: "MENU", data: {} }, partyData: null };
      if (t === "3") return { reply: `📋 *Form I* jald aa raha hai!\n\n${menu()}`, newState: { step: "MENU", data: {} }, partyData: null };
      return { reply: `❌ 1, 2, ya 3 likhein:\n\n${menu()}`, newState: { step: "MENU", data: {} }, partyData: null };
    }

    case "FORM_FILL": {
      const parsed = parseForm(text);
      if (parsed.errors.length > 0) {
        return {
          reply: `❌ Kuch galat laga:\n${parsed.errors.map(e => `• ${e}`).join("\n")}\n\nDobara is format mein bhejein:\n\n*Naam:* Ramesh Singh\n*Udhaar:* 50000\n*Date:* 01-01-2026\n*Byaaj:* 2`,
          newState: { step: "FORM_FILL", data: {} }, partyData: null,
        };
      }
      const finalData = { naam: parsed.naam, udhaar: parsed.udhaar, date: parsed.date, byaaj: parsed.byaaj };
      return {
        reply: `${summary(finalData)}\n\n✅ Sahi hai toh *"haan"* likhein\n✏️ Badalna ho toh *"nahi"* likhein`,
        newState: { step: "CONFIRM", data: finalData }, partyData: null,
      };
    }

    case "CONFIRM": {
      const t = text.trim().toLowerCase();
      const yes = ["haan","han","हाँ","yes","1","ok","okay"].includes(t);
      const no  = ["nahi","no","nhi","2"].includes(t);
      if (no) return { reply: `🔄 Dobara bhejein:\n\n*Naam:* Ramesh Singh\n*Udhaar:* 50000\n*Date:* 01-01-2026\n*Byaaj:* 2`, newState: { step: "FORM_FILL", data: {} }, partyData: null };
      if (!yes) return { reply: `*"haan"* ya *"nahi"* likhein:`, newState: state, partyData: null };
      return {
        reply: `🎉 *${data.naam}* ki party save ho gayi!\nMandi Khata app mein dekh sakte hain.\n\n━━━━━━━━━━━━━━\n${menu()}`,
        newState: { step: "MENU", data: {} }, partyData: data,
      };
    }

    default:
      return { reply: `🙏 Namaste!\n\n${menu()}`, newState: { step: "MENU", data: {} }, partyData: null };
  }
}

// ── Parse form ────────────────────────────────────────────────────────────────

function parseForm(text) {
  const errors = [];
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const get    = (key) => {
    const line = lines.find(l => l.toLowerCase().startsWith(key.toLowerCase() + ":"));
    return line ? line.split(":").slice(1).join(":").trim() : null;
  };

  // Naam
  const naamRaw = get("naam");
  if (!naamRaw || naamRaw.length < 2) errors.push("Naam sahi nahi laga");

  // Udhaar
  const udhaarRaw = get("udhaar");
  const udhaar    = parseFloat((udhaarRaw || "").replace(/,/g, ""));
  if (!udhaarRaw || isNaN(udhaar) || udhaar < 0) errors.push("Udhaar sahi nahi laga (sirf number)");

  // Date
  const dateRaw = get("date");
  let date = null;
  if (dateRaw) {
    const t = dateRaw.trim().toLowerCase();
    if (t === "aaj") {
      date = new Date().toISOString().split("T")[0];
    } else {
      const parts = t.split(/[-\/]/);
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const parsed = new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
        if (!isNaN(parsed.getTime())) date = parsed.toISOString().split("T")[0];
      }
    }
  }
  if (!date) errors.push("Date sahi nahi lagi (DD-MM-YYYY format mein likhein)");

  // Byaaj
  const byaajRaw = get("byaaj");
  const byaaj    = parseFloat((byaajRaw || "").replace(/[^0-9.]/g, ""));
  if (!byaajRaw || isNaN(byaaj) || byaaj < 0 || byaaj > 20) errors.push("Byaaj sahi nahi laga (0-20 ke beech)");

  return { errors, naam: naamRaw, udhaar, date, byaaj };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function menu() { return `Aap kya karna chahte hain?\n\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao`; }
function fmtNum(n) { return Number(n).toLocaleString("en-IN"); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function summary(d) {
  return `📋 *Party ka hisaab:*\n\n👤 Naam: *${d.naam}*\n💰 Udhaar: *₹${fmtNum(d.udhaar)}*\n📅 Shuru: *${fmtDate(d.date)}*\n📈 Byaaj: *${d.byaaj > 0 ? d.byaaj + "% / mahina" : "Nahi"}*`;
}
