/**
 * Vercel Serverless Function — /api/scan
 *
 * FLOW:
 *   Browser → POST /api/scan { imageBase64, mimeType }
 *     → Google Cloud Vision DOCUMENT_TEXT_DETECTION (Hindi + English)
 *     → Raw OCR text extracted
 *     → parseFormJ() converts raw text → structured Form J fields
 *     → Return JSON { success, data, rawText }
 *
 * ENV VAR REQUIRED:
 *   GOOGLE_CLOUD_VISION_API_KEY (set in Vercel dashboard, no VITE_ prefix)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GCV_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!GCV_API_KEY) {
    return res.status(500).json({ error: "Google Cloud Vision API key not configured" });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: "imageBase64 and mimeType required" });
    }

    // ── STEP 1: Google Cloud Vision OCR ──────────────────────────────────────
    // DOCUMENT_TEXT_DETECTION handles structured documents better than TEXT_DETECTION
    // languageHints: hi = Hindi/Devanagari, en = English
    const visionResp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GCV_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["hi", "en"] },
          }],
        }),
      }
    );

    if (!visionResp.ok) {
      const err = await visionResp.json().catch(() => ({}));
      return res.status(visionResp.status).json({
        error: err?.error?.message || "Google Cloud Vision API error",
      });
    }

    const visionData = await visionResp.json();
    const fullText = visionData?.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!fullText) {
      return res.status(422).json({ error: "Form mein koi text nahi mila. Seedhi photo lo." });
    }

    // DEBUG: visible in Vercel → Functions → /api/scan → Logs
    console.log("=== RAW OCR TEXT FROM GOOGLE VISION ===");
    console.log(fullText);
    console.log("=== END RAW OCR TEXT ===");

    // ── STEP 2: Parse OCR text → Form J fields ────────────────────────────────
    const parsed = parseFormJ(fullText);

    console.log("=== PARSED FORM J FIELDS ===");
    console.log(JSON.stringify(parsed, null, 2));
    console.log("=== END PARSED ===");

    return res.status(200).json({ success: true, data: parsed, rawText: fullText });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseFormJ(text)
//
// FORM J COLUMN LAYOUT (left→right on physical form):
//   Col 1: जिंस का नाम (commodity) + bags×weight written as "76×50"
//   Col 2: खरीददार का नाम (buyer)
//   Col 3: वजन (weight in quintals)
//   Col 4: भाव (rate per quintal) ← e.g. 3955
//   Col 5: रकम (gross = weight × rate) ← e.g. 150290
//   Col 6: कुल खर्च breakdown: उतराई / झराई / किराया / अन्य
//          जोड़ = total of col 6 ← e.g. 416.48
//   Col 7: रकम साफी जो दी गई (net = col5 - col6) ← e.g. 149873.52
//
// Header fields (outside table):
//   बेचने वाले का नाम = farmer/seller name (Hindi handwriting)
//   निलामी की तिथि   = auction date e.g. 3-12-24
//   क्रमांक           = bill serial number e.g. 04
//
// DEDUCTION APPROACH (agreed with client):
//   SCAN:   anya_kharcha = जोड़ total; labour/cess/transport stay 0
//   MANUAL: user fills labour/cess/transport; anya_kharcha = 0
// ─────────────────────────────────────────────────────────────────────────────
function parseFormJ(text) {
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  // ── HELPERS ──────────────────────────────────────────────────────────────
  
  // Extract first clean number from string (removes commas, handles decimals)
  // e.g. "416-48" → "416.48", "1,50,290" → "150290"
  const extractNum = (str) => {
    if (!str) return "";
    // Normalize: remove commas, replace - with . when between digits (Indian handwriting)
    const normalized = str.replace(/,/g, "").replace(/(\d)-(\d)/g, "$1.$2");
    const m = normalized.match(/\d+(?:\.\d+)?/);
    return m ? m[0] : "";
  };

  // Find ALL numbers in a string, sorted by length descending (largest first)
  const allNums = (str) => {
    const normalized = str.replace(/,/g, "").replace(/(\d)-(\d)/g, "$1.$2");
    return (normalized.match(/\d+(?:\.\d+)?/g) || [])
      .map(Number)
      .sort((a, b) => b - a);
  };

  // Get text after a keyword on same line or next line
  const afterKw = (keywords) => {
    for (const kw of keywords) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(kw)) {
          const after = lines[i].replace(kw, "").replace(/^[\s:\-\.]+/, "").trim();
          if (after.length > 1) return after;
          if (lines[i + 1]) return lines[i + 1].trim();
        }
      }
    }
    return "";
  };

  // ── BILL NUMBER (क्रमांक) ────────────────────────────────────────────────
  // Small 2-digit serial number, usually "04", "01" etc near top right
  let bill_number = "";
  const billM = joined.match(/क्रमांक\s*[:\-]?\s*0*(\d{1,3})/);
  if (billM) {
    bill_number = billM[1];
  } else {
    for (const l of lines.slice(0, 10)) {
      const m = l.match(/^\s*0*(\d{1,2})\s*$/);
      if (m && parseInt(m[1]) < 100) { bill_number = m[1]; break; }
    }
  }

  // ── DATE (निलामी की तिथि) ────────────────────────────────────────────────
  // Format: 3-12-24 (D-M-YY) → convert to YYYY-MM-DD
  // "निलामी की तिथि" is the correct label to look for (not just "तिथि")
  let date = "";
  // Look specifically after "तिथि" keyword
  const titheIdx = joined.search(/तिथि/);
  if (titheIdx !== -1) {
    const window = joined.slice(titheIdx, titheIdx + 30);
    const m = window.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = "20" + y;
      date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
  }
  // Fallback: find any date pattern in full text
  if (!date) {
    const m = joined.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = "20" + y;
      date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
  }

  // ── SELLER / FARMER NAME (बेचने वाले का नाम) ─────────────────────────────
  // Hindi handwriting on dotted line after "बेचने वाले का नाम"
  // OCR sometimes reads Hindi names poorly — we return best guess,
  // UI shows confirm box for arhtiya to fix
  let seller_name = "";
  const sellerKws = ["बेचने वाले का नाम", "बेचने वाले"];
  for (const kw of sellerKws) {
    const idx = joined.indexOf(kw);
    if (idx !== -1) {
      // Take text after keyword, stop at next known keyword or 50 chars
      const after = joined
        .slice(idx + kw.length)
        .replace(/^[\s:\-\.]+/, "")
        .trim();
      // Split at next section keyword
      const raw = after.split(/निलामी|क्रमांक|जिंस|खरीददार|वजन|भाव|रकम/)[0].trim();
      // Clean: remove dots (from dotted lines), leading/trailing junk
      seller_name = raw.replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
      if (seller_name.length > 1) break;
    }
  }

  // ── COMMODITY (जिंस का नाम) ──────────────────────────────────────────────
  // Default Wheat — Taraori mandi is predominantly wheat
  let commodity = "Wheat";
  const commodityMap = [
    { re: /गेह[ूु]ं?|[Ww]heat/,   val: "Wheat"   },
    { re: /सरसों?|[Mm]ustard/,     val: "Mustard" },
    { re: /धान|[Pp]addy|[Rr]ice/,  val: "Paddy"   },
    { re: /बाजरा|[Bb]ajra/,        val: "Bajra"   },
    { re: /मक्का|[Mm]aize|[Cc]orn/,val: "Maize"   },
  ];
  for (const { re, val } of commodityMap) {
    if (re.test(joined)) { commodity = val; break; }
  }

  // ── BAGS × WEIGHT ─────────────────────────────────────────────────────────
  // Written as "76×50" or "76 x 50" in जिंस column
  // The × symbol may OCR as x, X, ×, ✕
  let bags = "", weight = "";
  const bwMatch = joined.match(/(\d+)\s*[×xX✕]\s*(\d+(?:\.\d+)?)/);
  if (bwMatch) {
    bags   = bwMatch[1];
    weight = bwMatch[2];
  }

  // ── BUYER NAME (खरीददार का नाम) ──────────────────────────────────────────
  let buyer_name = "";
  const buyerIdx = joined.search(/खरीददार का नाम|खरीददार/);
  if (buyerIdx !== -1) {
    const after = joined.slice(buyerIdx).replace(/खरीददार का नाम|खरीददार/, "")
      .replace(/^[\s:\-]+/, "").trim();
    buyer_name = after.split(/वजन|भाव|रकम/)[0].trim().slice(0, 40);
  }

  // ── RATE / BHAV (भाव) — 4th column ──────────────────────────────────────
  // Rate per quintal. Typical range: ₹1000–₹9000
  // KEY ISSUE: OCR sometimes merges rate with रकम (e.g., reads "3955150290" together)
  // Strategy: find "भाव" keyword, then look for a 3-4 digit number in valid rate range
  // We specifically AVOID 5+ digit numbers in this section (those are amounts, not rates)
  let rate = "";
  const bhavIdx = joined.search(/भाव/);
  if (bhavIdx !== -1) {
    // Look in 50 chars after भाव
    const window = joined.slice(bhavIdx + 2, bhavIdx + 60).replace(/,/g, "");
    // Find numbers between 1000-9999 (valid rate range for Indian grains)
    const nums = window.match(/\d{3,4}(?:\.\d+)?/g) || [];
    for (const n of nums) {
      const val = parseFloat(n);
      if (val >= 1000 && val <= 9999) { rate = n; break; }
    }
  }
  // Fallback: scan all lines for a 4-digit number near भाव keyword
  if (!rate) {
    for (const line of lines) {
      if (line.includes("भाव") || line.match(/\d{4}/)) {
        const m = line.replace(/,/g, "").match(/\b([1-9]\d{3})\b/);
        if (m) { rate = m[1]; break; }
      }
    }
  }

  // ── GROSS AMOUNT (रकम) — 5th column ─────────────────────────────────────
  // gross = weight × rate. Typically 5-7 digit number e.g. 150290
  // Used for cross-validation against our calculated gross
  let gross_amount_from_form = "";
  // Look for large amounts (5-7 digits) that are NOT the net amount
  // Strategy: find numbers >= 10000 in the रकम area
  const raqamIdx = joined.search(/रकम/);
  if (raqamIdx !== -1) {
    const window = joined.slice(raqamIdx, raqamIdx + 80).replace(/,/g, "")
      .replace(/(\d)-(\d)/g, "$1.$2");
    const nums = (window.match(/\d{5,7}(?:\.\d+)?/g) || []).map(Number).sort((a,b) => b-a);
    // Take the largest number that's < 10,000,000 (sanity check)
    for (const n of nums) {
      if (n < 10000000) { gross_amount_from_form = String(n); break; }
    }
  }

  // ── KUL KHARCHA / जोड़ — column 6 total ──────────────────────────────────
  // DESIGN DECISION: we take the "जोड़" total (not individual utarai/jharai/kiraya)
  // and store it in anya_kharcha. See NewFormJ.jsx for full formula explanation.
  //
  // Format on form: "जोड़ 416-48" where 416-48 means 416.48 (hyphen = decimal)
  let scanned_kul_kharcha = "0";

  // First try: find जोड़ keyword and extract number after it
  const jodIdx = joined.search(/जोड़/);
  if (jodIdx !== -1) {
    const window = joined.slice(jodIdx, jodIdx + 30);
    // Replace hyphen between digits with decimal point (common in handwriting OCR)
    const normalized = window.replace(/(\d)[.\-](\d)/g, "$1.$2").replace(/,/g, "");
    const m = normalized.match(/\d+\.\d+|\d{3,}/);
    if (m && parseFloat(m[0]) > 0) scanned_kul_kharcha = m[0];
  }

  // Fallback: try उतराई (usually equals जोड़ when other fields are blank)
  if (scanned_kul_kharcha === "0") {
    const utaraiIdx = joined.search(/उतराई/);
    if (utaraiIdx !== -1) {
      const window = joined.slice(utaraiIdx, utaraiIdx + 30)
        .replace(/(\d)[.\-](\d)/g, "$1.$2").replace(/,/g, "");
      const m = window.match(/\d+\.\d+|\d{3,}/);
      if (m && parseFloat(m[0]) > 0) scanned_kul_kharcha = m[0];
    }
  }

  // ── NET AMOUNT (रकम साफी जो दी गई) — 7th column ─────────────────────────
  // Cross-validation: compare our calculated net vs form's net
  let net_amount_from_form = "";
  const safiIdx = joined.search(/साफी|रकम साफी/);
  if (safiIdx !== -1) {
    const window = joined.slice(safiIdx, safiIdx + 60)
      .replace(/,/g, "").replace(/(\d)[.\-](\d)/g, "$1.$2");
    const nums = (window.match(/\d{5,7}(?:\.\d+)?/g) || []).map(Number);
    if (nums.length > 0) net_amount_from_form = String(Math.max(...nums));
  }

  // ── CONFIDENCE SCORING ────────────────────────────────────────────────────
  const missing = [];
  if (!seller_name || seller_name === "•") missing.push("seller_name");
  if (!date)                               missing.push("date");
  if (!bags)                               missing.push("bags");
  if (!weight)                             missing.push("weight");
  if (!rate)                               missing.push("rate");
  if (scanned_kul_kharcha === "0")         missing.push("kul_kharcha");

  const confidence =
    missing.length <= 1 ? "high"   :
    missing.length <= 3 ? "medium" : "low";

  return {
    bill_number,
    date,
    seller_name: (seller_name === "•" || seller_name.length <= 1) ? "" : seller_name,
    commodity,
    bags,
    weight,
    buyer_name,
    rate,
    gross_amount_from_form,
    scanned_kul_kharcha,
    net_amount_from_form,
    confidence,
    low_confidence_fields: missing,
  };
}
