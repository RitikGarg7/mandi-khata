/**
 * Vercel Serverless Function — /api/scan
 *
 * Uses Gemini 1.5 Flash vision model to read Form J.
 * Unlike Google Cloud Vision (pure OCR), Gemini actually understands
 * the form structure and can extract fields by their meaning/position.
 *
 * ENV: GEMINI_API_KEY (Vercel dashboard, no VITE_ prefix)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "Gemini API key not configured" });

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: "Missing image data" });

    // ── Prompt: tell Gemini exactly what Form J looks like ───────────────────
    // Being very specific about field locations avoids confusion
    const prompt = `This is a Form-J (Mandi purchase bill) from an Indian grain market. Extract the following fields and return ONLY a valid JSON object — no explanation, no markdown, just raw JSON.

Form layout:
- Top area has: bill serial number (क्रमांक), seller/farmer name (बेचने वाले का नाम) on a dotted line, and date (निलामी की तिथि) in the TOP RIGHT corner written as D-M-YY like "3-12-24"
- Table has 7 columns: जिंस का नाम (commodity + bags×weight) | खरीददार का नाम (buyer) | वजन (weight) | भाव (rate per quintal) | रकम (gross amount) | कुल खर्च (deductions: उतराई/झराई/किराया + जोड़ total) | रकम साफी जो दी गई (net amount paid)

Extract these fields:
{
  "bill_number": "serial number near क्रमांक (1-3 digits)",
  "date": "निलामी की तिथि from TOP RIGHT corner, convert to YYYY-MM-DD format",
  "seller_name": "farmer name written on dotted line after बेचने वाले का नाम (Hindi text)",
  "commodity": "crop type from जिंस column — Wheat/Paddy/Mustard/Bajra/Maize",
  "bags": "number of bags (bori) — first number in bags×weight notation like 76 from 76×50",
  "weight": "total quintals — second number in bags×weight like 50 from 76×50, or the वजन column value",
  "buyer_name": "buyer name from खरीददार का नाम column",
  "rate": "rate per quintal from भाव column (3-4 digit number like 3955)",
  "gross_amount": "gross amount from रकम column (5-6 digit number like 150290)",
  "kul_kharcha": "total deductions — the जोड़ value at bottom of कुल खर्च column (like 416.48). Note: hyphens in numbers mean decimal points, so 416-48 = 416.48",
  "net_amount": "final net amount from रकम साफी जो दी गई column (like 149873.52). Hyphens = decimal points.",
  "confidence": "high/medium/low",
  "low_confidence_fields": ["list fields you are unsure about"]
}

Important:
- Date is in TOP RIGHT corner of form, clearly written, format D-M-YY
- Seller name is handwritten in Hindi on the dotted line
- Hyphens between digits are decimal points: 416-48 means 416.48
- bags×weight written as "76×50" means 76 bags, 50 quintals total weight
- Return ONLY the JSON, nothing else`;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiResp.ok) {
      const err = await geminiResp.json().catch(() => ({}));
      return res.status(geminiResp.status).json({
        error: err?.error?.message || "Gemini API error"
      });
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("=== GEMINI RAW RESPONSE ===");
    console.log(rawText);

    // Strip markdown fences if Gemini wraps response in ```json
    const clean = rawText.trim().replace(/^```json\s*/i, "").replace(/```\s*$/,"").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(422).json({ error: "Form padh nahi paya. Dobara try karein — seedhi aur clear photo lo." });
    }

    console.log("=== PARSED FIELDS ===");
    console.log(JSON.stringify(parsed, null, 2));

    // Map Gemini output → standard field names used by vision.js and NewFormJ.jsx
    // kul_kharcha from form col 6 (जोड़ total) → scanned_kul_kharcha
    // vision.js then maps scanned_kul_kharcha → anya_kharcha in the form
    // labour/cess/transport stay 0 in scan mode (anya_kharcha covers all deductions)
    const result = {
      bill_number:            parsed.bill_number           || "",
      date:                   formatDate(parsed.date),
      seller_name:            parsed.seller_name           || "",
      commodity:              parsed.commodity             || "Wheat",
      bags:                   String(parsed.bags           || ""),
      weight:                 String(parsed.weight         || ""),
      buyer_name:             parsed.buyer_name            || "",
      rate:                   String(parsed.rate           || ""),
      gross_amount_from_form: String(parsed.gross_amount   || ""),
      // kul_kharcha = जोड़ from col 6, read hyphen as decimal (416-48 = 416.48)
      // Gemini handles this automatically with our prompt instruction
      scanned_kul_kharcha:    String(parsed.kul_kharcha    || "0"),
      net_amount_from_form:   String(parsed.net_amount     || ""),
      confidence:             parsed.confidence            || "medium",
      low_confidence_fields:  parsed.low_confidence_fields || [],
    };

    return res.status(200).json({ success: true, data: result, rawText });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

// Convert various date formats to YYYY-MM-DD
function formatDate(raw) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // already correct
  const parts = raw.split(/[-/.]/);
  if (parts.length === 3) {
    let [d, m, y] = parts;
    if (y.length === 2) y = "20" + y;
    if (parseInt(d) <= 31 && parseInt(m) <= 12)
      return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return "";
}
