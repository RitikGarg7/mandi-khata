/**
 * /api/wa-conversation.js
 *
 * Conversation state machine for WhatsApp party onboarding.
 *
 * Steps:
 *   STEP_0_WELCOME  → greet, ask naam
 *   STEP_1_NAAM     → got naam, ask udhaar
 *   STEP_2_UDHAAR   → got udhaar, ask date
 *   STEP_3_DATE     → got date, ask byaaj haan/nahi
 *   STEP_4_BYAAJ    → got byaaj yn, ask rate (if haan) or confirm
 *   STEP_5_RATE     → got rate, show summary + confirm
 *   STEP_6_CONFIRM  → confirmed, save party
 *   DONE            → complete
 */

export async function handleMessage(text, state, from) {
  const step = state?.step || "STEP_0_WELCOME";
  const data = state?.data || {};

  switch (step) {

    // ── First message — any text triggers welcome ──────────────────────────
    case "STEP_0_WELCOME": {
      return {
        reply: `🙏 Namaste! Mandi Khata mein aapka swagat hai.\n\nNayi party add karne ke liye — *kisan ka naam* likhein:`,
        newState: { step: "STEP_1_NAAM", data: {} },
        partyData: null,
      };
    }

    // ── Got naam ──────────────────────────────────────────────────────────
    case "STEP_1_NAAM": {
      const naam = text;
      if (!naam || naam.length < 2) {
        return {
          reply: `❌ Naam sahi nahi laga. Dobara likhein:`,
          newState: state,
          partyData: null,
        };
      }
      return {
        reply: `✅ *${naam}*\n\n💰 *${naam}* ko abhi kitna udhaar diya hai?\n\nSirf number likhein (jaise: 50000)\n_Agar abhi kuch nahi diya toh 0 likhein_`,
        newState: { step: "STEP_2_UDHAAR", data: { naam } },
        partyData: null,
      };
    }

    // ── Got udhaar ────────────────────────────────────────────────────────
    case "STEP_2_UDHAAR": {
      const amount = parseFloat(text.replace(/,/g, ""));
      if (isNaN(amount) || amount < 0) {
        return {
          reply: `❌ Raqam sahi nahi lagi. Sirf number likhein (jaise: 50000):`,
          newState: state,
          partyData: null,
        };
      }
      const udhaar = amount;
      return {
        reply: `✅ ₹${fmt(udhaar)} udhaar\n\n📅 Yeh udhaar *kab se* shuru hua?\n\nFormat mein likhein: DD-MM-YYYY\nJaise: 01-01-2026\n\n_Agar aaj se hai toh "aaj" likhein_`,
        newState: { step: "STEP_3_DATE", data: { ...data, udhaar } },
        partyData: null,
      };
    }

    // ── Got date ──────────────────────────────────────────────────────────
    case "STEP_3_DATE": {
      let date;
      const t = text.trim().toLowerCase();

      if (t === "aaj" || t === "आज") {
        date = new Date().toISOString().split("T")[0];
      } else {
        // Parse DD-MM-YYYY
        const parts = t.split(/[-\/]/);
        if (parts.length === 3) {
          const [d, m, y] = parts;
          const parsed = new Date(`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
          if (!isNaN(parsed.getTime())) {
            date = parsed.toISOString().split("T")[0];
          }
        }
      }

      if (!date) {
        return {
          reply: `❌ Tarikh sahi nahi lagi.\n\nDD-MM-YYYY format mein likhein\nJaise: *01-01-2026*\nYa sirf *"aaj"* likhein:`,
          newState: state,
          partyData: null,
        };
      }

      return {
        reply: `✅ ${fmtDate(date)} se\n\n📈 *${data.naam}* par byaaj lagega?\n\n1️⃣ Haan\n2️⃣ Nahi`,
        newState: { step: "STEP_4_BYAAJ", data: { ...data, date } },
        partyData: null,
      };
    }

    // ── Got byaaj yes/no ──────────────────────────────────────────────────
    case "STEP_4_BYAAJ": {
      const t = text.trim().toLowerCase();
      const isHaan = t === "1" || t === "haan" || t === "han" || t === "हाँ" || t === "हां" || t === "yes";
      const isNahi = t === "2" || t === "nahi" || t === "no" || t === "nhi" || t === "नहीं";

      if (!isHaan && !isNahi) {
        return {
          reply: `❌ 1 ya 2 likhein:\n\n1️⃣ Haan\n2️⃣ Nahi`,
          newState: state,
          partyData: null,
        };
      }

      if (isNahi) {
        // No interest — go to confirm
        const summary = buildSummary({ ...data, byaaj: 0 });
        return {
          reply: `${summary}\n\n✅ Sahi hai toh *"haan"* likhein\n✏️ Badalna ho toh *"nahi"* likhein`,
          newState: { step: "STEP_6_CONFIRM", data: { ...data, byaaj: 0 } },
          partyData: null,
        };
      }

      return {
        reply: `📊 Kitna % byaaj per mahina lagega?\n\nSirf number likhein (jaise: 2)\n_Aam toor par 1% se 3% hota hai_`,
        newState: { step: "STEP_5_RATE", data: { ...data } },
        partyData: null,
      };
    }

    // ── Got byaaj rate ────────────────────────────────────────────────────
    case "STEP_5_RATE": {
      const rate = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(rate) || rate <= 0 || rate > 20) {
        return {
          reply: `❌ Rate sahi nahi laga. 1 se 20 ke beech likhein (jaise: 2):`,
          newState: state,
          partyData: null,
        };
      }

      const finalData = { ...data, byaaj: rate };
      const summary   = buildSummary(finalData);

      return {
        reply: `${summary}\n\n✅ Sahi hai toh *"haan"* likhein\n✏️ Badalna ho toh *"nahi"* likhein`,
        newState: { step: "STEP_6_CONFIRM", data: finalData },
        partyData: null,
      };
    }

    // ── Confirm ───────────────────────────────────────────────────────────
    case "STEP_6_CONFIRM": {
      const t = text.trim().toLowerCase();
      const isHaan = t === "haan" || t === "han" || t === "हाँ" || t === "yes" || t === "1" || t === "ok";
      const isNahi = t === "nahi" || t === "no" || t === "nhi" || t === "2";

      if (isNahi) {
        // Start over
        return {
          reply: `🔄 Theek hai, phir se shuru karte hain.\n\n*Kisan ka naam* likhein:`,
          newState: { step: "STEP_1_NAAM", data: {} },
          partyData: null,
        };
      }

      if (!isHaan) {
        return {
          reply: `*"haan"* ya *"nahi"* likhein:`,
          newState: state,
          partyData: null,
        };
      }

      // Save party
      return {
        reply: `🎉 *${data.naam}* ki party save ho gayi!\n\nAb aap Mandi Khata app mein dekh sakte hain.\n\n➕ Ek aur party add karni ho toh kuch bhi likhein.`,
        newState: { step: "STEP_0_WELCOME", data: {} },
        partyData: data,
      };
    }

    default: {
      return {
        reply: `🙏 Nayi party add karne ke liye kuch bhi likhein.`,
        newState: { step: "STEP_0_WELCOME", data: {} },
        partyData: null,
      };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n).toLocaleString("en-IN");
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function buildSummary(data) {
  return `📋 *Party ka hisaab:*\n\n👤 Naam: *${data.naam}*\n💰 Udhaar: *₹${fmt(data.udhaar)}*\n📅 Shuru: *${fmtDate(data.date)}*\n📈 Byaaj: *${data.byaaj > 0 ? data.byaaj + "% / mahina" : "Nahi"}*`;
}
