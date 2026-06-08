/**
 * Vercel Serverless Function — /api/scan
 *
 * APPROACH: Use Google Vision word-level bounding boxes to assign each word
 * to its correct column based on x-coordinate position.
 *
 * This solves the core problem: Vision merges all column values into one line
 * when reading text sequentially. By using coordinates, we can ask:
 * "which word is in the भाव column (x: 42-52%)?" regardless of how text is merged.
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
    const response = visionData?.responses?.[0];

    if (!response?.fullTextAnnotation) {
      return res.status(422).json({ error: "Koi text nahi mila. Seedhi photo lo." });
    }

    // Raw text for header fields (seller name, date, bill number)
    const fullText = response.fullTextAnnotation.text || "";

    // Word-level data with bounding boxes for table columns
    const pages = response.fullTextAnnotation.pages || [];

    console.log("=== RAW OCR TEXT ===");
    console.log(fullText);
    console.log("=== END RAW OCR ===");

    const parsed = parseFormJ(fullText, pages);

    console.log("=== PARSED FIELDS ===");
    console.log(JSON.stringify(parsed, null, 2));

    return res.status(200).json({ success: true, data: parsed, rawText: fullText });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseFormJ(fullText, pages)
//
// TWO STRATEGIES combined:
//
// 1. BOUNDING BOX (for table columns):
//    Each word from Vision has x,y coordinates as % of image size.
//    We map words to columns by their x-position:
//      Col 1 जिंस/bags:  x  0-16%
//      Col 2 buyer:      x 16-32%
//      Col 3 वजन:        x 32-42%
//      Col 4 भाव(rate):  x 42-52%  ← key field
//      Col 5 रकम(gross): x 52-65%  ← key field
//      Col 6 कुल खर्च:   x 65-80%  ← key field
//      Col 7 रकम साफी:   x 80-100% ← key field
//    We only look at words in the TABLE ROW y-range (y: 35-75% of image)
//    to avoid picking up column headers.
//
// 2. RAW TEXT (for header fields):
//    Date: top-right corner — clearly separate, easy to find with regex
//    Seller name: line after "बेचने वाले का नाम" label
//    Bill number: near "क्रमांक" keyword
// ─────────────────────────────────────────────────────────────────────────────
function parseFormJ(fullText, pages) {
  const lines  = fullText.split("\n").map(l => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  // ── STEP 1: Extract all words with their normalized x,y positions ──────────
  // Vision returns bounding boxes as pixel vertices. We normalize to 0-1 range
  // so column boundaries work regardless of image resolution.
  const words = extractWords(pages);

  // Find image dimensions from the largest x and y coordinates seen
  let maxX = 1, maxY = 1;
  for (const w of words) {
    if (w.x2 > maxX) maxX = w.x2;
    if (w.y2 > maxY) maxY = w.y2;
  }

  // Normalize all coordinates to 0-1 range
  const normalized = words.map(w => ({
    text: w.text,
    x:  w.x1 / maxX,  // left edge
    x2: w.x2 / maxX,  // right edge
    y:  w.y1 / maxY,  // top edge
    y2: w.y2 / maxY,  // bottom edge
    cx: (w.x1 + w.x2) / 2 / maxX, // center x
    cy: (w.y1 + w.y2) / 2 / maxY, // center y
  }));

  console.log("=== WORD POSITIONS (sample) ===");
  normalized.slice(0, 30).forEach(w =>
    console.log(`"${w.text}" cx=${w.cx.toFixed(2)} cy=${w.cy.toFixed(2)}`)
  );

  // ── STEP 2: Column boundaries (x-range as fraction of image width) ─────────
  // Based on Form J layout. Small tolerance added for rotated/angled photos.
  // These values calibrated from the actual form photos provided.
  const COL = {
    jins:   [0.00, 0.16], // जिंस का नाम + bags×weight
    buyer:  [0.16, 0.32], // खरीददार का नाम
    wajan:  [0.32, 0.42], // वजन (weight)
    bhav:   [0.42, 0.52], // भाव (rate per quintal) ← 4-digit number
    raqam:  [0.52, 0.65], // रकम (gross amount) ← 5-6 digit number
    kharcha:[0.65, 0.80], // कुल खर्च (deductions)
    safi:   [0.80, 1.00], // रकम साफी जो दी गई (net amount)
  };

  // TABLE ROW y-range: the data row is roughly in the middle-lower part of form
  // Header labels are at y~35-42%, data values at y~42-72%
  // We look at y: 35-75% to catch both (filter by number vs text later)
  const TABLE_Y = [0.35, 0.75];

  // Helper: get words in a specific column and y-range
  const wordsInCol = (colKey, yRange = TABLE_Y) => {
    const [xMin, xMax] = COL[colKey];
    const [yMin, yMax] = yRange;
    return normalized.filter(w =>
      w.cx >= xMin && w.cx <= xMax &&
      w.cy >= yMin && w.cy <= yMax
    );
  };

  // Helper: get text from column words, joined
  const colText = (colKey, yRange = TABLE_Y) =>
    wordsInCol(colKey, yRange).map(w => w.text).join(" ");

  // Helper: normalize number (hyphen between digits = decimal)
  const normNum = (s) => String(s).replace(/,/g, "").replace(/(\d)[.\-](\d{2})(?!\d)/g, "$1.$2");

  // Helper: first number from string
  const firstNum = (s) => {
    const m = normNum(s).match(/\d+(?:\.\d+)?/);
    return m ? m[0] : "";
  };

  // ── BILL NUMBER ──────────────────────────────────────────────────────────
  let bill_number = "";
  const billM = joined.match(/(?:क्रमांक|ARAOR\s*क्रमांक)[^\d]*0*(\d{1,3})/);
  if (billM) bill_number = billM[1];

  // ── DATE (निलामी की तिथि) — TOP RIGHT CORNER ────────────────────────────
  // The date is in the top-right area of the form, clearly separate.
  // It's written as "3-12-24" (D-M-YY format).
  // Strategy: find words in top-right area (x > 60%, y < 30%) and look for date pattern.
  const topRightWords = normalized
    .filter(w => w.cx > 0.60 && w.cy < 0.30)
    .map(w => w.text)
    .join(" ");

  console.log("=== TOP RIGHT WORDS (date area) ===", topRightWords);

  let date = "";
  // Try top-right area first
  const dateM = (topRightWords + " " + joined).match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
  if (dateM) {
    let [, d, mo, y] = dateM;
    if (parseInt(d) <= 31 && parseInt(mo) <= 12 && parseInt(mo) >= 1) {
      if (y.length === 2) y = "20" + y;
      date = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
    }
  }

  // ── SELLER NAME (बेचने वाले का नाम) ──────────────────────────────────────
  // Appears on the line AFTER the label, in the header area (y: 18-30%)
  // Left side of form (x: 0-60%)
  const headerLeftWords = normalized
    .filter(w => w.cx < 0.60 && w.cy > 0.15 && w.cy < 0.32)
    .map(w => w.text)
    .join(" ");

  console.log("=== HEADER LEFT WORDS (seller area) ===", headerLeftWords);

  let seller_name = "";
  const SKIP = /निलामी|तिथि|क्रमांक|जिंस|खरीददार|वजन|भाव|रकम|बेचने|FORM|मार्किट|कमीशन|GSTIN/;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("बेचने वाले का नाम") || lines[i].includes("बेचने वाले")) {
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        const raw = lines[j].replace(/[●•]+/g, "").replace(/\.{2,}/g, "").trim();
        if (raw.length > 2 && /[\u0900-\u097F]/.test(raw) && !SKIP.test(raw)) {
          seller_name = raw.slice(0, 50);
          break;
        }
      }
      break;
    }
  }

  // ── COMMODITY (जिंस का नाम) ──────────────────────────────────────────────
  let commodity = "Wheat"; // Default — Taraori mandi is mainly wheat
  const commodityMap = [
    { re: /गेह[ूु]ं?|[Ww]heat/,               val: "Wheat"   },
    { re: /सरसों?|[Mm]ustard/,                 val: "Mustard" },
    { re: /धान|[Pp]addy|[Ff]addy|[Rr]ice/,    val: "Paddy"   },
    { re: /बाजरा|[Bb]ajra/,                    val: "Bajra"   },
    { re: /मक्का|[Mm]aize|[Cc]orn/,            val: "Maize"   },
  ];
  const jinsText = colText("jins");
  for (const { re, val } of commodityMap) {
    if (re.test(jinsText) || re.test(joined)) { commodity = val; break; }
  }

  // ── BAGS × WEIGHT ─────────────────────────────────────────────────────────
  // Written as "76×50" in col 1 (जिंस column)
  let bags = "", weight = "";
  const bwMatch = (jinsText + " " + joined).match(/(\d+)\s*[×xX✕]\s*(\d+(?:\.\d+)?)/);
  if (bwMatch) { bags = bwMatch[1]; weight = bwMatch[2]; }

  // ── BUYER NAME (col 2) ───────────────────────────────────────────────────
  const buyerText = colText("buyer");
  let buyer_name = buyerText.replace(/खरीददार का नाम|खरीददार/, "").trim().slice(0, 40);
  // Fallback: BCPL pattern anywhere
  if (!buyer_name || buyer_name.length < 2) {
    const bcpl = joined.match(/\bBCPL\b/i);
    if (bcpl) buyer_name = "BCPL";
  }

  // ── RATE / BHAV (col 4 — x: 42-52%) ─────────────────────────────────────
  // With bounding boxes, we directly read the भाव column.
  // Should return "3955" cleanly without merging with adjacent columns.
  const bhavText = colText("bhav");
  console.log("=== BHAV COLUMN TEXT ===", bhavText);
  let rate = firstNum(bhavText);
  // Validate: rate should be 3-4 digits in ₹1000-9999 range
  if (rate && (parseFloat(rate) < 500 || parseFloat(rate) > 20000)) rate = "";

  // ── GROSS AMOUNT (col 5 — x: 52-65%) ────────────────────────────────────
  const raqamText = colText("raqam");
  console.log("=== RAQAM COLUMN TEXT ===", raqamText);
  let gross_amount_from_form = firstNum(raqamText);
  // Validate: gross should be 5-7 digits
  if (gross_amount_from_form && parseFloat(gross_amount_from_form) < 1000) gross_amount_from_form = "";

  // ── KUL KHARCHA (col 6 — x: 65-80%) ─────────────────────────────────────
  // The जोड़ total appears at BOTTOM of this column (higher y value)
  // उतराई appears at TOP of this column
  // We want the जोड़ value — look at lower part of the column (y: 55-75%)
  const kharchaText = colText("kharcha", [0.35, 0.80]);
  console.log("=== KHARCHA COLUMN TEXT ===", kharchaText);

  let scanned_kul_kharcha = "0";
  // Find जोड़ in the kharcha column text
  const jodIdx = kharchaText.search(/जोड़/);
  if (jodIdx !== -1) {
    const after = normNum(kharchaText.slice(jodIdx));
    const m = after.match(/\d{2,5}(?:\.\d{1,2})?/g) || [];
    for (const n of m) {
      if (parseFloat(n) > 10) { scanned_kul_kharcha = n; break; }
    }
  }
  // Fallback: last number in kharcha column (जोड़ is at bottom, so last number)
  if (scanned_kul_kharcha === "0") {
    const allNums = normNum(kharchaText).match(/\d{2,5}(?:\.\d{1,2})?/g) || [];
    if (allNums.length > 0) scanned_kul_kharcha = allNums[allNums.length - 1];
  }

  // ── NET AMOUNT / रकम साफी (col 7 — x: 80-100%) ───────────────────────────
  const safiText = colText("safi");
  console.log("=== SAFI COLUMN TEXT ===", safiText);
  let net_amount_from_form = firstNum(safiText);
  if (net_amount_from_form && parseFloat(net_amount_from_form) < 1000) net_amount_from_form = "";

  // ── CALCULATE KHARCHA if still not found ──────────────────────────────────
  // gross - net = kharcha (most reliable fallback)
  if (scanned_kul_kharcha === "0" && gross_amount_from_form && net_amount_from_form) {
    const diff = parseFloat(gross_amount_from_form) - parseFloat(net_amount_from_form);
    if (diff > 0 && diff < parseFloat(gross_amount_from_form) * 0.1) {
      scanned_kul_kharcha = diff.toFixed(2);
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

// ─────────────────────────────────────────────────────────────────────────────
// extractWords(pages)
//
// Flattens Vision API's nested page→block→paragraph→word structure
// into a flat list of { text, x1, y1, x2, y2 } objects.
// Each word's bounding box is the min/max of its vertex coordinates.
// ─────────────────────────────────────────────────────────────────────────────
function extractWords(pages) {
  const words = [];
  for (const page of pages) {
    for (const block of (page.blocks || [])) {
      for (const para of (block.paragraphs || [])) {
        for (const word of (para.words || [])) {
          // Combine all symbols (characters) into word text
          const text = (word.symbols || []).map(s => s.text).join("");
          if (!text.trim()) continue;

          // Get bounding box from vertices
          const verts = word.boundingBox?.vertices || [];
          if (verts.length < 4) continue;

          const xs = verts.map(v => v.x || 0);
          const ys = verts.map(v => v.y || 0);

          words.push({
            text,
            x1: Math.min(...xs),
            y1: Math.min(...ys),
            x2: Math.max(...xs),
            y2: Math.max(...ys),
          });
        }
      }
    }
  }
  return words;
}
