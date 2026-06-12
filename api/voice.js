/**
 * Vercel Serverless Function — /api/voice
 *
 * Accepts a base64-encoded audio recording from the browser,
 * sends it to Gemini which BOTH transcribes AND extracts Form J fields
 * in one single API call — no separate STT step needed.
 *
 * FLOW:
 *   Browser records audio → base64 → POST /api/voice
 *     → Gemini 2.5 Flash Lite (audio input)
 *     → Returns structured JSON with all Form J fields
 *     → Same field format as /api/scan so NewFormJ.jsx needs no changes
 *
 * ENV: GEMINI_API_KEY (same key as scan, no VITE_ prefix)
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "Gemini API key not configured" });

  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64 || !mimeType) return res.status(400).json({ error: "Missing audio data" });

    // ── Prompt: extract Form J fields from spoken input ───────────────────────
    // User can speak in any order, any mix of Hindi/English/Haryanvi.
    // Gemini understands context — "teen hazar nauso pachpan" = 3955
    const prompt = `You are helping an Indian grain market commission agent (arhtiya) fill a purchase bill (Form J).

The user has spoken some or all of these details in Hindi, Haryanvi, or English — in any order:
- Kisan/farmer name (बेचने वाले का नाम)
- Number of bags/bori (बोरी)
- Weight in quintals (वजन/quintal)
- Rate per quintal in rupees (भाव)
- Buyer name (खरीददार)
- Commodity/crop (जिंस) — usually Wheat/गेहूं

Extract what you hear and return ONLY a valid JSON object. No explanation, no markdown:

{
  "seller_name": "farmer name spoken (Hindi or English)",
  "bags": "number of bags as integer string",
  "weight": "weight in quintals as number string",
  "rate": "rate per quintal in rupees as number string",
  "buyer_name": "buyer name",
  "commodity": "Wheat/Paddy/Mustard/Bajra/Maize",
  "kul_kharcha": "0",
  "gross_amount": "",
  "net_amount": "",
  "date": "",
  "bill_number": "",
  "confidence": "high/medium/low",
  "low_confidence_fields": ["fields you could not hear clearly"],
  "transcription": "exact words the user spoke"
}

Notes:
- Hindi numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10
- "hazar" = thousand, "sau" = hundred, "pachas" = 50, "pachhattar" = 75
- "bori" or "boriya" = bags, "quintal" or "maan" = weight unit
- "bhav" or "rate" = price per quintal
- DATE: VERY IMPORTANT — if user says date like "teen december", "3 12 2024", "3-12-24", always convert to EXACTLY "YYYY-MM-DD" format. Example: "3 12 2024" = "2024-12-03". "teen barah" = "2024-12-03". Must be exactly 10 chars like "2024-12-03". Never return partial dates.
- If a field is not mentioned, return "" for text fields and "0" for number fields
- Return ONLY the JSON`;

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType, // e.g. "audio/webm" or "audio/mp4"
                  data: audioBase64,
                }
              }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
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

    console.log("=== GEMINI VOICE RESPONSE ===");
    console.log(rawText);

    const clean = rawText.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: "Samajh nahi aaya. Dobara bolein — thoda saaf aur dheere.",
        transcription: rawText,
      });
    }

    console.log("=== PARSED VOICE FIELDS ===");
    console.log(JSON.stringify(parsed, null, 2));

    // Map to same format as /api/scan so NewFormJ.jsx works unchanged
    const result = {
      bill_number:            "",
      date:                   "",
      seller_name:            parsed.seller_name  || "",
      commodity:              parsed.commodity    || "Wheat",
      bags:                   String(parsed.bags  || ""),
      weight:                 String(parsed.weight || ""),
      buyer_name:             parsed.buyer_name   || "",
      rate:                   String(parsed.rate  || ""),
      gross_amount_from_form: "",
      scanned_kul_kharcha:    "0", // voice doesn't provide kharcha
      net_amount_from_form:   "",
      confidence:             parsed.confidence   || "medium",
      low_confidence_fields:  parsed.low_confidence_fields || [],
      transcription:          parsed.transcription || "",
    };

    return res.status(200).json({ success: true, data: result, transcription: parsed.transcription });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
