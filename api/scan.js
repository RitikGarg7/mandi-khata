/**
 * Vercel Serverless Function — /api/scan
 * ENV: GOOGLE_CLOUD_VISION_API_KEY
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

    return res.status(200).json({ success: true, data: parsed, rawText: fullText });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseFormJ(text)
//
// FORM J COLUMNS (physical form, left to right):
//   Col 1: जिंस का नाम + bags×weight  e.g. "faddy\n76×50"
//   Col 2: खरीददार का नाम (buyer)     e.g. "BCPL"
//   Col 3: वजन (weight quintals)      e.g. "38" (written as "38-oo" = 38.00)
//   Col 4: भाव (rate/quintal)         e.g. "3955"  ← 4 digits
//   Col 5: रकम (gross amount)         e.g. "150290" ← 5-6 digits
//   Col 6: कुल खर्च breakdown + जोड़   e.g. उतराई "416-48", जोड़ "416-48"
//   Col 7: रकम साफी जो दी गई (net)   e.g. "149873-52"
//
// HEADER (outside table):
//   बेचने वाले का नाम → farmer name (Hindi, line AFTER label)
//   निलामी की तिथि   → date top-right corner e.g. "3-12-24"
//   क्रमांक           → bill number e.g. "04"
//
// KEY OCR OBSERVATIONS from actual scans:
//   1. ALL table column values merge into ONE line:
//      "3839557/15029०:०० उतराई116-48 149873-52-"
//      This means rate+gross+kharcha+net all run together
//   2. Date "3-12-24" reads as "अ2-24" (Devanagari replaces "3-1")
//      → Solution: look for date pattern RIGHT OF "तिथि" keyword specifically
//   3. Hyphens in amounts mean decimals: "416-48" = 416.48, "149873-52" = 149873.52
//   4. "जोड़" line: "जोड़ 41-48" has OCR dropping digits → "416-48" becomes "41-48"
//      → Solution: calculate kharcha = gross - net (more reliable than reading जोड़)
//   5. Buyer name "BCPL" appears in the merged data line, not after खरीददार keyword
//   6. Seller name is on line AFTER "बेचने वाले का नाम" label
//
// DEDUCTION APPROACH (agreed with client):
//   SCAN: anya_kharcha = जोड़ total (calculated as gross-net if OCR fails)
//         labour/cess/transport = 0
//   MANUAL: user fills labour/cess/transport; anya_kharcha = 0
// ─────────────────────────────────────────────────────────────────────────────
function parseFormJ(text) {
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  // ── HELPER: normalize number string ───────────────────────────────────────
  // Converts "416-48" → "416.48", "149873-52" → "149873.52", removes commas
  // Rule: hyphen between digits = decimal point (Indian handwriting convention)
  const normNum = (s) => String(s).replace(/,/g, "").replace(/(\d)[.\-](\d{2})(?!\d)/g, "$1.$2");

  // Extract first number from normalized string
  const firstNum = (s) => {
    const m = normNum(s).match(/\d+(?:\.\d+)?/);
    return m ? m[0] : "";
  };

  // ── BILL NUMBER (क्रमांक) ────────────────────────────────────────────────
  let bill_number = "";
  const billM = joined.match(/(?:क्रमांक|ARAOR\s*क्रमांक)[^\d]*0*(\d{1,3})/);
  if (billM) {
    bill_number = billM[1];
  } else {
    for (const l of lines.slice(0, 12)) {
      const m = l.match(/^\s*0*(\d{1,2})\s*$/);
      if (m) { bill_number = m[1]; break; }
    }
  }

  // ── DATE (निलामी की तिथि) — TOP RIGHT corner of form ─────────────────────
  // Written as "3-12-24" (D-M-YY). OCR issue: "3-12-24" → "अ2-24"
  // because the form has Devanagari text nearby and OCR confuses "3-1" with "अ".
  //
  // STRATEGY: Search the raw text for date-like patterns with these rules:
  //   - Must have 3 parts separated by - or /
  //   - Day: 1-31, Month: 1-12, Year: 2 or 4 digits
  //   - Prefer pattern that appears AFTER "तिथि" keyword
  let date = "";

  // First: look specifically near "तिथि" keyword (right side of header)
  const titheIdx = joined.search(/तिथि/);
  if (titheIdx !== -1) {
    // Look in 40 chars after तिथि
    const window = joined.slice(titheIdx, titheIdx + 40);
    const m = window.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (parseInt(d) <= 31 && parseInt(mo) <= 12) {
        if (y.length === 2) y = "20" + y;
        date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
      }
    }
  }

  // Second: scan ALL lines for date pattern (handles OCR confusion)
  // We try each line individually since date may be on its own line
  if (!date) {
    for (const line of lines) {
      const m = line.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
      if (m) {
        let [, d, mo, y] = m;
        if (parseInt(d) <= 31 && parseInt(mo) <= 12 && parseInt(mo) >= 1) {
          if (y.length === 2) y = "20" + y;
          date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
          break;
        }
      }
    }
  }

  // ── SELLER NAME (बेचने वाले का नाम) ──────────────────────────────────────
  // Appears on line AFTER the label. Hindi handwriting, OCR quality varies.
  // Filter out: bullets (●), dots from dotted lines, section keywords
  let seller_name = "";
  const SKIP_WORDS = /निलामी|तिथि|क्रमांक|जिंस|खरीददार|वजन|भाव|रकम|बेचने|FORM|मार्किट/;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("बेचने वाले का नाम") || lines[i].includes("बेचने वाले")) {
      // Look at next 3 lines for actual name
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const raw = lines[j]
          .replace(/[●•]+/g, "")        // remove bullets from dotted lines
          .replace(/\.{2,}/g, "")        // remove repeated dots
          .replace(/का नाम/g, "")        // remove label fragments
          .trim();

        // Valid: contains Hindi chars, reasonable length, not a section keyword
        if (raw.length > 2 && /[\u0900-\u097F]/.test(raw) && !SKIP_WORDS.test(raw)) {
          seller_name = raw.slice(0, 50);
          break;
        }
      }
      break;
    }
  }

  // ── COMMODITY (जिंस का नाम) ──────────────────────────────────────────────
  // Default Wheat. OCR may read "paddy" as "faddy" — handled below.
  let commodity = "Wheat";
  const commodityMap = [
    { re: /गेह[ूु]ं?|[Ww]heat/,               val: "Wheat"   },
    { re: /सरसों?|[Mm]ustard/,                 val: "Mustard" },
    { re: /धान|[Pp]addy|[Ff]addy|[Rr]ice/,    val: "Paddy"   },
    { re: /बाजरा|[Bb]ajra/,                    val: "Bajra"   },
    { re: /मक्का|[Mm]aize|[Cc]orn/,            val: "Maize"   },
  ];
  for (const { re, val } of commodityMap) {
    if (re.test(joined)) { commodity = val; break; }
  }

  // ── BAGS × WEIGHT ─────────────────────────────────────────────────────────
  // Written as "76×50" or "76x50". Bags = count, weight = quintals total.
  let bags = "", weight = "";
  const bwMatch = joined.match(/(\d+)\s*[×xX✕]\s*(\d+(?:\.\d+)?)/);
  if (bwMatch) {
    bags   = bwMatch[1];
    weight = bwMatch[2];
  }

  // ── BUYER NAME (खरीददार का नाम) ──────────────────────────────────────────
  // Often appears in the merged data line rather than after the keyword.
  // Common buyers: BCPL, company names in English
  let buyer_name = "";

  // Look for known buyer patterns in full text
  const bcplMatch = joined.match(/\bBCPL\b/i);
  if (bcplMatch) buyer_name = "BCPL";

  if (!buyer_name) {
    // Try after keyword
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("खरीददार का नाम") || lines[i].includes("खरीददार")) {
        const same = lines[i].replace(/खरीददार का नाम|खरीददार/, "").trim();
        if (same.length > 1) { buyer_name = same.slice(0, 40); break; }
        if (lines[i+1] && !/^[\u0900-\u097F\s]+$/.test(lines[i+1])) {
          buyer_name = lines[i+1].trim().slice(0, 40); break;
        }
      }
    }
  }

  // ── RATE / BHAV — 4th column, ₹1000-9999 ────────────────────────────────
  // CORE ISSUE: All column values merge into one line in OCR output.
  // e.g. "3839557/15029०:०० उतराई116-48 149873-52-"
  // The real values are: rate=3955, gross=150290, utarai=416.48, net=149873.52
  //
  // STRATEGY: We know bags and weight. Calculate expected gross = weight × rate.
  // Then scan for a 4-digit number where weight × number ≈ any 5-6 digit number nearby.
  // This cross-references rate against gross to find the correct pair.
  let rate = "";

  // Extract all 4-digit numbers from the text (candidate rates)
  const allFourDigit = (joined.match(/(?<!\d)\d{4}(?!\d)/g) || []).map(Number)
    .filter(n => n >= 1000 && n <= 9999);

  // Extract all 5-7 digit numbers (candidate gross amounts)
  const allLarge = (normNum(joined).match(/(?<!\d)\d{5,7}(?:\.\d+)?(?!\d)/g) || []).map(Number);

  // Try to find rate+gross pair where weight × rate ≈ gross (within 2%)
  if (weight && allFourDigit.length > 0 && allLarge.length > 0) {
    const w = parseFloat(weight);
    let bestRate = null, bestDiff = Infinity;
    for (const r of allFourDigit) {
      const expectedGross = w * r;
      for (const g of allLarge) {
        const diff = Math.abs(g - expectedGross) / expectedGross;
        if (diff < 0.02 && diff < bestDiff) {
          bestRate = r; bestDiff = diff;
        }
      }
    }
    if (bestRate) rate = String(bestRate);
  }

  // Fallback: look for 4-digit number after भाव keyword
  if (!rate) {
    const bhavIdx = joined.search(/भाव/);
    if (bhavIdx !== -1) {
      const window = joined.slice(bhavIdx, bhavIdx + 60);
      const m = window.match(/(?<!\d)([1-9]\d{3})(?!\d)/);
      if (m) rate = m[1];
    }
  }

  // ── GROSS AMOUNT (रकम) — 5th column ──────────────────────────────────────
  // Calculated as weight × rate (more reliable than reading from OCR).
  // Also try to find from OCR for cross-validation.
  let gross_amount_from_form = "";
  if (weight && rate) {
    // Use calculated value as primary (OCR merged-line issue makes reading unreliable)
    gross_amount_from_form = String(Math.round(parseFloat(weight) * parseFloat(rate)));
  }

  // ── KUL KHARCHA / जोड़ ────────────────────────────────────────────────────
  // TOTAL deductions from col 6 (उतराई + झराई + किराया + अन्य).
  // Goes into anya_kharcha field. Labour/cess/transport stay 0 in scan mode.
  //
  // OCR ISSUES:
  //   - "416-48" (hyphen = decimal) → "41-48" (digit dropped)
  //   - "जोड़ 416-48" → "जोड़ 41-48" (OCR misses '6')
  //
  // MOST RELIABLE APPROACH:
  //   Calculate kharcha = gross_amount - net_amount (from form's last column)
  //   This avoids reading the जोड़ line directly.
  let scanned_kul_kharcha = "0";
  let net_amount_from_form = "";

  // Step 1: Try to read net amount (रकम साफी) from OCR
  // It appears as "149873-52" in the last column — normalize hyphen to decimal
  const safiIdx = joined.search(/साफी|रकम साफी/);
  if (safiIdx !== -1) {
    const window = normNum(joined.slice(safiIdx, safiIdx + 80));
    const nums = (window.match(/\d{5,7}(?:\.\d{1,2})?/g) || []).map(Number);
    if (nums.length > 0) net_amount_from_form = String(Math.max(...nums));
  }

  // Also scan all lines for 6-digit number with decimal (likely net amount)
  if (!net_amount_from_form) {
    for (const line of lines) {
      const normalized = normNum(line);
      const m = normalized.match(/(\d{5,6}\.\d{2})/);
      if (m) { net_amount_from_form = m[1]; break; }
    }
  }

  // Step 2: Calculate kharcha = gross - net (MOST RELIABLE)
  if (gross_amount_from_form && net_amount_from_form) {
    const gross = parseFloat(gross_amount_from_form);
    const net   = parseFloat(net_amount_from_form);
    const kharcha = gross - net;
    if (kharcha > 0 && kharcha < gross * 0.1) {
      // Sanity check: kharcha should be < 10% of gross
      scanned_kul_kharcha = kharcha.toFixed(2);
    }
  }

  // Step 3: Fallback — try reading जोड़ directly from OCR
  if (scanned_kul_kharcha === "0") {
    const jodIdx = joined.search(/जोड़/);
    if (jodIdx !== -1) {
      const window = normNum(joined.slice(jodIdx, jodIdx + 40));
      const m = window.match(/\d{2,5}(?:\.\d{1,2})?/g) || [];
      for (const n of m) {
        if (parseFloat(n) > 10) { scanned_kul_kharcha = n; break; }
      }
    }
  }

  // Step 4: Fallback — try reading उतराई directly
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
