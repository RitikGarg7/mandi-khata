/**
 * Vercel Serverless Function — /api/scan
 *
 * FLOW:
 *   Browser → POST /api/scan { imageBase64, mimeType }
 *     → Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *     → parseFormJ() extracts fields from raw OCR text
 *     → Return { success, data, rawText }
 *
 * ENV: GOOGLE_CLOUD_VISION_API_KEY (Vercel dashboard, no VITE_ prefix)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GCV_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!GCV_API_KEY) return res.status(500).json({ error: "API key not configured" });

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: "Missing image data" });

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
      return res.status(visionResp.status).json({ error: err?.error?.message || "Vision API error" });
    }

    const visionData = await visionResp.json();
    const fullText = visionData?.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!fullText) return res.status(422).json({ error: "Koi text nahi mila. Seedhi photo lo." });

    console.log("=== RAW OCR TEXT ===");
    console.log(fullText);
    console.log("=== END RAW OCR ===");

    const parsed = parseFormJ(fullText);

    console.log("=== PARSED FIELDS ===");
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
// FORM J LAYOUT (physical form columns, left to right):
//   Col 1: जिंस का नाम + bags×weight (e.g. "faddy\n76×50")
//   Col 2: खरीददार का नाम (buyer, e.g. "BCPL")
//   Col 3: वजन (weight, e.g. "38" or "50")
//   Col 4: भाव (rate per quintal, e.g. "3955")
//   Col 5: रकम (gross amount, e.g. "150290")
//   Col 6: कुल खर्च (उतराई/झराई/किराया/अन्य + जोड़ total, e.g. "416.48")
//   Col 7: रकम साफी जो दी गई (net amount, e.g. "149873.52")
//
// Header (outside table):
//   बेचने वाले का नाम → seller/farmer name (Hindi handwriting)
//   निलामी की तिथि   → auction date (e.g. "3-12-24")
//   क्रमांक           → bill number (e.g. "04")
//
// OCR KNOWN ISSUES observed from real scans:
//   1. Dotted lines OCR as "●" or "..." — need to filter these out
//   2. Date: "3-12-24" may OCR as "अ2-24" (Devanagari digit confusion)
//   3. Hyphen in amounts: "416-48" means 416.48 (decimal written as hyphen)
//   4. Numbers merge: "3955" + "150290" may read as "3839557" or similar
//   5. Seller name appears on line AFTER the "बेचने वाले का नाम" label
//   6. Rate (भाव) is 3-4 digits (₹1000-9999), never 5+ digits
//
// DEDUCTION APPROACH:
//   SCAN:   anya_kharcha = जोड़ total; labour/cess/transport = 0
//   MANUAL: user fills labour/cess/transport; anya_kharcha = 0
// ─────────────────────────────────────────────────────────────────────────────
function parseFormJ(text) {
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  // ── HELPER: normalize a string of digits ────────────────────────────────
  // Converts "416-48" → "416.48", removes commas
  const normNum = (s) => s.replace(/,/g, "").replace(/(\d)[.\-](\d)/g, "$1.$2");

  // Extract first valid number from a string
  const firstNum = (s) => {
    const m = normNum(s).match(/\d+(?:\.\d+)?/);
    return m ? m[0] : "";
  };

  // ── BILL NUMBER (क्रमांक) ────────────────────────────────────────────────
  // Small serial number (1-3 digits) near "क्रमांक" keyword
  let bill_number = "";
  const billM = joined.match(/(?:क्रमांक|ARAOR क्रमांक|Kramank)[^\d]*0*(\d{1,3})/);
  if (billM) {
    bill_number = billM[1];
  } else {
    // Fallback: standalone 2-digit number in first 10 lines
    for (const l of lines.slice(0, 10)) {
      const m = l.match(/^\s*0*(\d{1,2})\s*$/);
      if (m) { bill_number = m[1]; break; }
    }
  }

  // ── DATE (निलामी की तिथि) ─────────────────────────────────────────────────
  // Format: D-M-YY e.g. "3-12-24"
  // OCR issue: "3-12-24" may become "अ2-24" (Devanagari replaces digits)
  // Strategy: look for any D-M-YY or D-M-YYYY pattern in full text
  let date = "";

  // Find all date-like patterns: 1-2 digit / 1-2 digit / 2-4 digit
  const dateMatches = joined.match(/\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}/g) || [];
  for (const dm of dateMatches) {
    const parts = dm.split(/[.\-\/]/);
    if (parts.length === 3) {
      let [d, mo, y] = parts;
      // Validate: day 1-31, month 1-12, year 2-digit or 4-digit
      if (parseInt(d) <= 31 && parseInt(mo) <= 12) {
        if (y.length === 2) y = "20" + y;
        date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
        break;
      }
    }
  }

  // ── SELLER NAME (बेचने वाले का नाम) ──────────────────────────────────────
  // The farmer's name appears on the line AFTER the label "बेचने वाले का नाम"
  // OCR often adds "●" (bullet) from dotted lines — we filter these
  let seller_name = "";

  // Find the label line, then look at next 1-2 lines for the actual name
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("बेचने वाले का नाम") || lines[i].includes("बेचने वाले")) {
      // Check next 3 lines for a Hindi name (not a keyword or number)
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const candidate = lines[j]
          .replace(/●|•|\.|निलामी|तिथि|क्रमांक|जिंस|खरीददार/g, "")
          .replace(/का नाम/g, "")
          .trim();
        // Valid name: has Hindi characters, length > 2, not just dots/numbers
        if (candidate.length > 2 && /[\u0900-\u097F]/.test(candidate)) {
          seller_name = candidate.slice(0, 50);
          break;
        }
      }
      break;
    }
  }

  // Fallback: look for line with Hindi text after the ● bullet (which marks the dotted line)
  if (!seller_name) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("●") || lines[i].includes("•")) {
        // The next non-trivial Hindi line is likely the name
        for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
          const candidate = lines[j].replace(/[●•\.]/g, "").trim();
          if (candidate.length > 2 && /[\u0900-\u097F]/.test(candidate)
              && !candidate.includes("निलामी") && !candidate.includes("तिथि")) {
            seller_name = candidate.slice(0, 50);
            break;
          }
        }
        if (seller_name) break;
      }
    }
  }

  // ── COMMODITY (जिंस का नाम) ──────────────────────────────────────────────
  // Default Wheat — Taraori mandi is predominantly wheat
  // Note: OCR may read "faddy" for "paddy" — handle this
  let commodity = "Wheat";
  const commodityMap = [
    { re: /गेह[ूु]ं?|[Ww]heat/,         val: "Wheat"   },
    { re: /सरसों?|[Mm]ustard/,           val: "Mustard" },
    { re: /धान|[Pp]addy|[Ff]addy|[Rr]ice/, val: "Paddy" },
    { re: /बाजरा|[Bb]ajra/,              val: "Bajra"   },
    { re: /मक्का|[Mm]aize|[Cc]orn/,      val: "Maize"   },
  ];
  for (const { re, val } of commodityMap) {
    if (re.test(joined)) { commodity = val; break; }
  }

  // ── BAGS × WEIGHT ─────────────────────────────────────────────────────────
  // Written as "76×50" or "76x50" in col 1
  // bags = number of bags, weight = total quintals
  let bags = "", weight = "";
  const bwMatch = joined.match(/(\d+)\s*[×xX✕]\s*(\d+(?:\.\d+)?)/);
  if (bwMatch) {
    bags   = bwMatch[1];
    weight = bwMatch[2];
  }

  // ── BUYER NAME (खरीददार का नाम) ──────────────────────────────────────────
  let buyer_name = "";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("खरीददार का नाम") || lines[i].includes("खरीददार")) {
      // Check same line after keyword
      const same = lines[i].replace(/खरीददार का नाम|खरीददार/, "").trim();
      if (same.length > 1 && !/^[\s\-:]+$/.test(same)) {
        buyer_name = same.slice(0, 40); break;
      }
      // Check next line
      if (lines[i + 1]) {
        buyer_name = lines[i + 1].trim().slice(0, 40); break;
      }
    }
  }
  // Fallback: BCPL / company names often appear near "76×50" pattern
  if (!buyer_name) {
    const bcplMatch = joined.match(/BCPL|bcpl|Bcpl/);
    if (bcplMatch) buyer_name = "BCPL";
  }

  // ── RATE / BHAV (भाव) — 4th column ───────────────────────────────────────
  // Rate per quintal: 3-4 digit number in range ₹1000-9999
  //
  // KEY OCR ISSUE: Numbers from adjacent columns merge together.
  // e.g. "3955" (rate) + "150290" (gross) may read as "3839557" or "395150290"
  //
  // STRATEGY: Find भाव keyword, then extract ONLY 4-digit numbers in valid range.
  // We specifically reject 5+ digit numbers (those are amounts, not rates).
  let rate = "";
  const bhavIdx = joined.search(/भाव/);
  if (bhavIdx !== -1) {
    // Look at a window of 80 chars after भाव
    const window = normNum(joined.slice(bhavIdx + 2, bhavIdx + 80));
    // Extract all standalone 3-4 digit numbers (word boundary aware)
    const candidates = window.match(/(?<!\d)\d{4}(?!\d)/g) || [];
    for (const c of candidates) {
      const val = parseInt(c);
      if (val >= 1000 && val <= 9999) { rate = c; break; }
    }
    // Also try 3-digit rates (some cheaper commodities)
    if (!rate) {
      const c3 = window.match(/(?<!\d)\d{3}(?!\d)/g) || [];
      for (const c of c3) {
        const val = parseInt(c);
        if (val >= 500) { rate = c; break; }
      }
    }
  }

  // ── GROSS AMOUNT (रकम) — 5th column ──────────────────────────────────────
  // Gross = weight × rate. Typically 5-6 digit number e.g. 150290
  // Used for cross-validation: if our calculated gross differs >1% from this → warn
  //
  // OCR ISSUE: This column's numbers often merge with rate column.
  // We look for the largest clean 5-6 digit number that makes sense as gross.
  let gross_amount_from_form = "";
  if (weight && rate) {
    const expectedGross = parseFloat(weight) * parseFloat(rate);
    // Search for a number within 5% of expected gross
    const allNums = (normNum(joined).match(/\d{5,7}(?:\.\d+)?/g) || []).map(Number);
    let bestMatch = null, bestDiff = Infinity;
    for (const n of allNums) {
      const diff = Math.abs(n - expectedGross) / expectedGross;
      if (diff < 0.05 && diff < bestDiff) { bestMatch = n; bestDiff = diff; }
    }
    if (bestMatch) gross_amount_from_form = String(bestMatch);
  }

  // ── KUL KHARCHA / जोड़ ────────────────────────────────────────────────────
  // Total deductions from col 6. Written as "जोड़ 416-48" (hyphen = decimal).
  //
  // DESIGN DECISION: We take जोड़ total → anya_kharcha field.
  // labour/cess/transport stay 0 in scan mode.
  // Net = gross - anya_kharcha (see NewFormJ.jsx)
  let scanned_kul_kharcha = "0";

  // Look for जोड़ keyword
  const jodIdx = joined.search(/जोड़/);
  if (jodIdx !== -1) {
    const window = normNum(joined.slice(jodIdx, jodIdx + 40));
    // Match decimal number like "416.48" or integer like "416"
    const m = window.match(/\d{2,5}(?:\.\d{1,2})?/g) || [];
    // Take the first valid kharcha amount (usually 3-5 digits before decimal)
    for (const n of m) {
      if (parseFloat(n) > 10) { scanned_kul_kharcha = n; break; }
    }
  }

  // Fallback: उतराई amount (equals जोड़ when झराई/किराया are blank)
  if (scanned_kul_kharcha === "0") {
    const utIdx = joined.search(/उतराई/);
    if (utIdx !== -1) {
      const window = normNum(joined.slice(utIdx, utIdx + 40));
      const m = window.match(/\d{2,5}(?:\.\d{1,2})?/g) || [];
      for (const n of m) {
        if (parseFloat(n) > 10) { scanned_kul_kharcha = n; break; }
      }
    }
  }

  // ── NET AMOUNT (रकम साफी जो दी गई) — 7th column ─────────────────────────
  // Used for cross-validation. Format: "149873-52" → 149873.52
  let net_amount_from_form = "";
  const safiIdx = joined.search(/साफी|रकम साफी/);
  if (safiIdx !== -1) {
    const window = normNum(joined.slice(safiIdx, safiIdx + 60));
    const nums = (window.match(/\d{5,7}(?:\.\d+)?/g) || []).map(Number);
    if (nums.length > 0) net_amount_from_form = String(Math.max(...nums));
  }

  // ── CONFIDENCE SCORING ────────────────────────────────────────────────────
  const missing = [];
  if (!seller_name)              missing.push("seller_name");
  if (!date)                     missing.push("date");
  if (!bags)                     missing.push("bags");
  if (!weight)                   missing.push("weight");
  if (!rate)                     missing.push("rate");
  if (scanned_kul_kharcha==="0") missing.push("kul_kharcha");

  const confidence =
    missing.length <= 1 ? "high"   :
    missing.length <= 3 ? "medium" : "low";

  return {
    bill_number,
    date,
    seller_name,
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
