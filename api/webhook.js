/**
 * /api/webhook.js — WhatsApp Webhook (all-in-one, no local imports)
 *
 * ENV vars (Vercel dashboard):
 *   WHATSAPP_TOKEN
 *   WHATSAPP_PHONE_ID
 *   WHATSAPP_VERIFY_TOKEN
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

// ── Firebase Admin — lazy loaded only for POST requests ──────────────────────

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

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // GET — webhook verification
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // POST — incoming message
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

// ── Send WhatsApp message ─────────────────────────────────────────────────────

async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

// ── Firebase state helpers ────────────────────────────────────────────────────

async function getState(phone) {
  try {
    const db = await getDb();
    const doc = await db.collection("wa_sessions").doc(phone).get();
    return doc.exists ? doc.data() : null;
  } catch { return null; }
}

async function saveState(phone, state) {
  const db = await getDb();
  await db.collection("wa_sessions").doc(phone).set({
    ...state, updatedAt: new Date().toISOString()
  });
}

async function saveParty(phone, data) {
  const db = await getDb();
  const ref = db.collection("wa_parties").doc(phone).collection("parties").doc();
  await ref.set({
    id:                   ref.id,
    name:                 data.naam,
    opening_balance:      data.udhaar,
    opening_balance_date: data.date,
    interest_rate:        data.byaaj || 0,
    type:                 "Farmer",
    source:               "whatsapp",
    createdAt:            new Date().toISOString(),
    phone_from:           phone,
  });
}

// ── Conversation state machine ────────────────────────────────────────────────

function handleMessage(text, state) {
  const step = state?.step || "WELCOME";
  const data = state?.data || {};

  // Global keyword — kisi bhi step mein "menu" likho toh menu pe wapas
  if (text.trim().toLowerCase() === "menu" && step !== "WELCOME") {
    return {
      reply: `🏠 *Main Menu*\n\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao`,
      newState: { step: "MENU", data: {} },
      partyData: null,
    };
  }

  switch (step) {

    case "WELCOME":
      return {
        reply: `🙏 Namaste! *Mandi Khata* mein aapka swagat hai! 🌾\n\nAap kya karna chahte hain?\n\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao\n\nSirf number bhejein — *1*, *2*, ya *3*`,
        newState: { step: "MENU", data: {} },
        partyData: null,
      };

    case "MENU": {
      const t = text.trim();
      if (t === "1") {
        return {
          reply: `➕ *Nayi Party*\n\nKisan ka naam likhein:`,
          newState: { step: "NAAM", data: {} },
          partyData: null,
        };
      }
      if (t === "2") {
        return {
          reply: `📋 *Form J*\n\nYeh feature jald aa raha hai!\n\nWapas menu ke liye *"menu"* likhein.`,
          newState: { step: "MENU", data: {} },
          partyData: null,
        };
      }
      if (t === "3") {
        return {
          reply: `📋 *Form I*\n\nYeh feature jald aa raha hai!\n\nWapas menu ke liye *"menu"* likhein.`,
          newState: { step: "MENU", data: {} },
          partyData: null,
        };
      }
      // Unrecognized — show menu again
      return {
        reply: `❌ 1, 2, ya 3 likhein:\n\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao`,
        newState: { step: "MENU", data: {} },
        partyData: null,
      };
    }

    case "NAAM": {
      if (!text || text.length < 2)
        return { reply: `❌ Naam sahi nahi laga. Dobara likhein:`, newState: state, partyData: null };
      return {
        reply: `✅ *${text}*\n\n💰 *${text}* ko kitna udhaar diya hai?\nSirf number likhein (jaise: 50000)\n_Abhi kuch nahi diya toh 0 likhein_`,
        newState: { step: "UDHAAR", data: { naam: text } },
        partyData: null,
      };
    }

    case "UDHAAR": {
      const amount = parseFloat(text.replace(/,/g, ""));
      if (isNaN(amount) || amount < 0)
        return { reply: `❌ Raqam sahi nahi. Sirf number likhein (jaise: 50000):`, newState: state, partyData: null };
      return {
        reply: `✅ ₹${fmtNum(amount)}\n\n📅 Yeh udhaar *kab se* shuru hua?\nFormat: DD-MM-YYYY (jaise: 01-01-2026)\n_Aaj se hai toh "aaj" likhein_`,
        newState: { step: "DATE", data: { ...data, udhaar: amount } },
        partyData: null,
      };
    }

    case "DATE": {
      let date;
      const t = text.trim().toLowerCase();
      if (t === "aaj" || t === "आज") {
        date = new Date().toISOString().split("T")[0];
      } else {
        const parts = t.split(/[-\/]/);
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const parsed = new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
          if (!isNaN(parsed.getTime())) date = parsed.toISOString().split("T")[0];
        }
      }
      if (!date)
        return { reply: `❌ Tarikh sahi nahi lagi.\nDD-MM-YYYY format mein likhein (jaise: *01-01-2026*)\nYa *"aaj"* likhein:`, newState: state, partyData: null };
      return {
        reply: `✅ ${fmtDate(date)}\n\n📈 *${data.naam}* par byaaj lagega?\n\n1️⃣ Haan\n2️⃣ Nahi`,
        newState: { step: "BYAAJ", data: { ...data, date } },
        partyData: null,
      };
    }

    case "BYAAJ": {
      const t = text.trim().toLowerCase();
      const yes = ["1","haan","han","हाँ","हां","yes"].includes(t);
      const no  = ["2","nahi","no","nhi","नहीं"].includes(t);
      if (!yes && !no)
        return { reply: `1 ya 2 likhein:\n1️⃣ Haan\n2️⃣ Nahi`, newState: state, partyData: null };
      if (no) {
        const finalData = { ...data, byaaj: 0 };
        return { reply: `${summary(finalData)}\n\n✅ Sahi hai toh *"haan"* likhein\n✏️ Badalna ho toh *"nahi"* likhein`, newState: { step: "CONFIRM", data: finalData }, partyData: null };
      }
      return {
        reply: `📊 Kitna % byaaj *per mahina* lagega?\nSirf number likhein (jaise: 2):`,
        newState: { step: "RATE", data },
        partyData: null,
      };
    }

    case "RATE": {
      const rate = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(rate) || rate <= 0 || rate > 20)
        return { reply: `❌ Rate sahi nahi. 1 se 20 ke beech likhein (jaise: 2):`, newState: state, partyData: null };
      const finalData = { ...data, byaaj: rate };
      return {
        reply: `${summary(finalData)}\n\n✅ Sahi hai toh *"haan"* likhein\n✏️ Badalna ho toh *"nahi"* likhein`,
        newState: { step: "CONFIRM", data: finalData },
        partyData: null,
      };
    }

    case "CONFIRM": {
      const t = text.trim().toLowerCase();
      const yes = ["haan","han","हाँ","yes","1","ok","okay"].includes(t);
      const no  = ["nahi","no","nhi","2"].includes(t);
      if (no)
        return { reply: `🔄 Theek hai, phir se shuru karte hain.\n\n*Kisan ka naam* likhein:`, newState: { step: "NAAM", data: {} }, partyData: null };
      if (!yes)
        return { reply: `*"haan"* ya *"nahi"* likhein:`, newState: state, partyData: null };
      return {
        reply: `🎉 *${data.naam}* ki party save ho gayi!\n\nMandi Khata app mein dekh sakte hain.\n\n━━━━━━━━━━━━━━\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao`,
        newState: { step: "MENU", data: {} },
        partyData: data,
      };
    }

    default:
      return { reply: `🙏 Namaste! Aap kya karna chahte hain?\n\n1️⃣ Nayi party add karo\n2️⃣ Form J banao\n3️⃣ Form I banao`, newState: { step: "MENU", data: {} }, partyData: null };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n) { return Number(n).toLocaleString("en-IN"); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function summary(d) {
  return `📋 *Party ka hisaab:*\n\n👤 Naam: *${d.naam}*\n💰 Udhaar: *₹${fmtNum(d.udhaar)}*\n📅 Shuru: *${fmtDate(d.date)}*\n📈 Byaaj: *${d.byaaj > 0 ? d.byaaj + "% / mahina" : "Nahi"}*`;
}
