/**
 * Vercel Serverless Function — /api/scan
 * 
 * PURPOSE: Proxy between the React app and Google Cloud Vision API.
 * The browser cannot call Vision API directly due to CORS restrictions,
 * so all image scanning goes through this server-side function.
 *
 * FLOW:
 *   Browser → POST /api/scan { imageBase64, mimeType }
 *     → Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *     → Raw OCR text extracted
 *     → parseFormJ() converts raw text → structured Form J fields
 *     → Return JSON { success, data }
 *
 * ENVIRONMENT VARIABLE REQUIRED:
 *   GOOGLE_CLOUD_VISION_API_KEY — set in Vercel dashboard (server-side only, not VITE_ prefix)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GCV_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!GCV_API_KEY) {
    return res.status(500).json({ error: "Google Cloud Vision API key not configured on server" });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: "imageBase64 and mimeType are required" });
    }

    // ── STEP 1: Send image to Google Cloud Vision ─────────────────────────────
    // Using DOCUMENT_TEXT_DETECTION (vs TEXT_DETECTION) because:
    // - Better at reading structured documents and tables
    // - Handles mixed Hindi/English text better
    // - Returns fullTextAnnotation which gives us the complete text in reading order
    // languageHints: ["hi", "en"] helps Vision API prioritize Hindi + English character sets
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

    // fullTextAnnotation.text contains the entire OCR output as a single string
    // with newlines between detected text blocks
    const fullText = visionData?.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!fullText) {
      return res.status(422).json({
        error: "Form mein koi text nahi mila. Photo seedhi aur clear lo.",
      });
    }

    // ── DEBUG LOGS (visible in Vercel → Functions → /api/scan → Logs) ──────────
    // These help diagnose what Google Vision is reading from the image
    console.log("=== RAW OCR TEXT FROM GOOGLE VISION ===");
    console.log(fullText);
    console.log("=== END RAW OCR TEXT ===");

    // ── STEP 2: Parse OCR text into Form J fields ─────────────────────────────
    const parsed = parseFormJ(fullText);

    // Log parsed result for debugging
    console.log("=== PARSED FORM J FIELDS ===");
    console.log(JSON.stringify(parsed, null, 2));
    console.log("=== END PARSED FIELDS ===");

    // Return both the parsed data and rawText (rawText useful for debugging)
    return res.status(200).json({ success: true, data: parsed, rawText: fullText });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseFormJ(text)
//
// PURPOSE: Convert raw OCR text from Google Vision into structured Form J fields.
//
// FORM J COLUMN LAYOUT (left to right in the actual printed form):
//   1. जिंस का नाम (Commodity) + बोरी×वजन (Bags×Weight)
//   2. खरीददार का नाम (Buyer name)
//   3. वजन (Weight in quintals)
//   4. भाव (Rate per quintal)
//   5. रकम (Gross amount = weight × rate)
//   6. कुल खर्च (Total deductions: उतराई + झराई + किराया + अन्य)
//      → जोड़ (Total of column 6)
//   7. रकम साफी जो दी गई (Net amount paid to farmer = col5 - col6)
//
// OTHER FIELDS (outside the table):
//   - बेचने वाले का नाम = Farmer/seller name
//   - निलामी की तिथि = Date of auction/sale
//   - क्रमांक = Bill serial number
//
// DEDUCTION APPROACH (agreed with client):
// ┌─────────────────────────────────────────────────────────┐
// │ When SCANNING: We do NOT populate individual deduction  │
// │ fields (labour/cess/transport). Instead, we put the    │
// │ entire "जोड़" (total kharcha) into `scanned_kul_kharcha`│
// │ which maps to the `anya_kharcha` field in the form.    │
// │                                                         │
// │ Formula: net = gross - labour - cess - transport        │
// │                      - anya_kharcha                     │
// │                                                         │
// │ So when scanned: labour=0, cess=0, transport=0,         │
// │ anya_kharcha = जोड़ from form                            │
// │                                                         │
// │ When MANUAL: user fills labour/cess/transport normally, │
// │ anya_kharcha stays 0.                                   │
// └─────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────
function parseFormJ(text) {
  const lines  = text.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" "); // single string for regex matching

  // Helper: extract first number from a string (handles Indian format 1,56,828)
  const extractNum = (str) => {
    if (!str) return "";
    const m = str.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? m[0] : "";
  };

  // Helper: find text after a keyword, checking same line then next line
  const afterKeyword = (keywords) => {
    for (const kw of keywords) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(kw)) {
          const after = lines[i].replace(kw, "").trim();
          if (after) return after;
          if (lines[i + 1]) return lines[i + 1].trim();
        }
      }
    }
    return "";
  };

  // ── BILL NUMBER (क्रमांक) ─────────────────────────────────────────────────
  // Appears near top of form, usually a 2-digit number like "04"
  let bill_number = "";
  const billMatch = joined.match(/(?:क्रमांक|Kramank)[^\d]*(\d{1,3})/i);
  if (billMatch) {
    bill_number = billMatch[1];
  } else {
    // Fallback: standalone 2-digit number in first 8 lines
    for (const l of lines.slice(0, 8)) {
      const m = l.match(/^\s*0?(\d{1,2})\s*$/);
      if (m) { bill_number = m[1]; break; }
    }
  }

  // ── DATE (निलामी की तिथि) ────────────────────────────────────────────────
  // "निलामी की तिथि" = Date of auction. This is the correct field to map
  // to the app's "Tithi" (date) field.
  // Format on form: 3-12-24 (DD-MM-YY) → we convert to YYYY-MM-DD
  let date = "";
  const dateMatch = joined.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
  if (dateMatch) {
    let [, d, m, y] = dateMatch;
    if (y.length === 2) y = "20" + y;
    date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // ── SELLER / FARMER NAME (बेचने वाले का नाम) ─────────────────────────────
  // This is the farmer who is selling the crop to the arhtiya.
  // Written in Hindi handwriting on the dotted line after "बेचने वाले का नाम"
  // We return it as-is; the UI will let the arhtiya confirm/match to existing party.
  let seller_name = "";
  const sellerIdx = joined.search(/बेचने वाले का नाम|बेचने वाले/);
  if (sellerIdx !== -1) {
    const after = joined.slice(sellerIdx).replace(/बेचने वाले का नाम|बेचने वाले/, "").trim();
    // Take text until next known keyword or 40 chars
    seller_name = after
      .split(/निलामी|खरीददार|वजन|भाव|रकम/)[0]
      .replace(/^[:\-\.\s]+/, "")
      .trim()
      .slice(0, 50);
  }

  // ── COMMODITY (जिंस का नाम) ──────────────────────────────────────────────
  // Default to Wheat since Taraori mandi predominantly trades wheat.
  // Pattern matching covers Hindi and English spellings.
  let commodity = "Wheat";
  const commodityMap = [
    { pattern: /गेह[ूु]ं?|Wheat|wheat/i,    value: "Wheat"   },
    { pattern: /सरसों?|Mustard|mustard/i,    value: "Mustard" },
    { pattern: /धान|Paddy|paddy|Rice/i,      value: "Paddy"   },
    { pattern: /बाजरा|Bajra|bajra/i,         value: "Bajra"   },
    { pattern: /मक्का|Maize|maize|Corn/i,    value: "Maize"   },
  ];
  for (const { pattern, value } of commodityMap) {
    if (pattern.test(joined)) { commodity = value; break; }
  }

  // ── BAGS × WEIGHT (बोरी × वजन) ───────────────────────────────────────────
  // Written in "जिंस का नाम" column as "76×50" meaning 76 bags × 50 quintals.
  // The × symbol may be rendered as x, X, or ×.
  let bags = "", weight = "";
  const bagsWeightMatch = joined.match(/(\d+)\s*[×xX]\s*(\d+(?:\.\d+)?)/);
  if (bagsWeightMatch) {
    bags   = bagsWeightMatch[1];
    weight = bagsWeightMatch[2];
  } else {
    // Fallback: try reading वजन column separately
    const wLine = afterKeyword(["वजन"]);
    if (wLine) weight = extractNum(wLine);
  }

  // ── BUYER NAME (खरीददार का नाम) ─────────────────────────────────────────
  // The buyer/purchaser of the crop (e.g., BCPL, Anil Sanjay)
  let buyer_name = "";
  const buyerIdx = joined.search(/खरीददार का नाम|खरीददार/);
  if (buyerIdx !== -1) {
    const after = joined.slice(buyerIdx).replace(/खरीददार का नाम|खरीददार/, "").trim();
    buyer_name = after
      .split(/वजन|भाव|रकम/)[0]
      .replace(/^[:\-\s]+/, "")
      .trim()
      .slice(0, 40);
  }

  // ── RATE / BHAV (भाव) — 4th column ──────────────────────────────────────
  // Rate per quintal in rupees. e.g., 3955
  // IMPORTANT: Rate values are typically 1000-9999 range.
  // We filter out small numbers to avoid picking up bag counts etc.
  let rate = "";
  const rateIdx = joined.search(/भाव/);
  if (rateIdx !== -1) {
    // Look in a window of 40 chars after "भाव"
    const window = joined.slice(rateIdx + 3, rateIdx + 60);
    // Find numbers in valid rate range (₹500 - ₹20000)
    const nums = window.replace(/,/g, "").match(/\d{3,5}(?:\.\d+)?/g) || [];
    for (const n of nums) {
      if (parseFloat(n) >= 500 && parseFloat(n) <= 20000) {
        rate = n; break;
      }
    }
  }

  // ── GROSS AMOUNT (रकम) — 5th column ─────────────────────────────────────
  // Gross amount = weight × rate. e.g., 150290
  // This is used for cross-validation against our calculated gross_amount.
  // If they differ by more than 1%, we flag it to the arhtiya.
  let gross_amount_from_form = "";
  const raqamIdx = joined.search(/रकम/);
  if (raqamIdx !== -1) {
    const window = joined.slice(raqamIdx + 3, raqamIdx + 80);
    const nums = window.replace(/,/g, "").match(/\d{5,7}(?:\.\d+)?/g) || [];
    if (nums.length > 0) gross_amount_from_form = nums[0];
  }

  // ── KUL KHARCHA — जोड़ (6th column total) ────────────────────────────────
  // DESIGN DECISION (agreed with client):
  // We do NOT separately extract उतराई/झराई/किराया/अन्य into individual fields.
  // Instead, we take the "जोड़" (grand total of column 6) as a single number
  // and store it in `scanned_kul_kharcha`.
  //
  // In the form calculation:
  //   net_payable = gross - labour - cess - transport - anya_kharcha
  //
  // When scanned: labour=0, cess=0, transport=0, anya_kharcha = scanned_kul_kharcha
  // When manual:  user fills labour/cess/transport normally, anya_kharcha stays 0
  let scanned_kul_kharcha = "0";
  const jodIdx = joined.search(/जोड़|जोड/);
  if (jodIdx !== -1) {
    const window = joined.slice(jodIdx, jodIdx + 40);
    const num = extractNum(window.replace(/जोड़?/, "").replace(/,/g, ""));
    if (num && parseFloat(num) > 0) scanned_kul_kharcha = num;
  }
  // Fallback: try उतराई total if जोड़ not found
  if (scanned_kul_kharcha === "0") {
    const utaraiIdx = joined.search(/उतराई/);
    if (utaraiIdx !== -1) {
      const window = joined.slice(utaraiIdx + 6, utaraiIdx + 30);
      const num = extractNum(window.replace(/,/g, ""));
      if (num) scanned_kul_kharcha = num;
    }
  }

  // ── NET AMOUNT (रकम साफी जो दी गई) — 7th column ─────────────────────────
  // Final amount paid to the farmer = gross - kul_kharcha
  // Used for cross-validation: if our calculated net differs from form's net,
  // we show a warning to the arhtiya to manually verify.
  let net_amount_from_form = "";
  const safiIdx = joined.search(/साफी|रकम साफी/);
  if (safiIdx !== -1) {
    const window = joined.slice(safiIdx, safiIdx + 60);
    const nums = window.replace(/,/g, "").match(/\d{5,7}(?:\.\d+)?/g) || [];
    if (nums.length > 0) net_amount_from_form = nums[0];
  }

  // ── CONFIDENCE SCORING ────────────────────────────────────────────────────
  // Track which critical fields were successfully extracted.
  // If 0-1 fields missing → high confidence
  // If 2-3 fields missing → medium confidence  
  // If 4+ fields missing  → low confidence
  const low_confidence_fields = [];
  if (!seller_name)             low_confidence_fields.push("seller_name");
  if (!bags)                    low_confidence_fields.push("bags");
  if (!weight)                  low_confidence_fields.push("weight");
  if (!rate)                    low_confidence_fields.push("rate");
  if (!gross_amount_from_form)  low_confidence_fields.push("gross_amount");
  if (scanned_kul_kharcha === "0") low_confidence_fields.push("kul_kharcha");

  const confidence =
    low_confidence_fields.length <= 1 ? "high"   :
    low_confidence_fields.length <= 3 ? "medium" : "low";

  return {
    bill_number,
    date,
    seller_name,
    commodity,
    bags,
    weight,
    buyer_name,
    rate,
    // Gross amount from form (for cross-validation in UI)
    gross_amount_from_form,
    // KUL KHARCHA: entire deduction total from form's "जोड़" field
    // Goes into anya_kharcha field in the app (see NewFormJ.jsx for formula)
    scanned_kul_kharcha,
    // Net amount from form (for cross-validation in UI)
    net_amount_from_form,
    confidence,
    low_confidence_fields,
  };
}
