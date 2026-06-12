/**
 * vision.js — Form J Scanner (client-side)
 *
 * Compresses image → sends to /api/scan (Vercel serverless) → returns parsed fields
 * The actual AI reading is done by Gemini 2.5 Flash Lite in api/scan.js
 *
 * FIELD MAPPING (from Gemini response → NewFormJ.jsx state):
 *   date                  → f.date
 *   commodity             → f.commodity
 *   bags                  → f.bags
 *   weight                → f.weight
 *   rate                  → f.rate  (bhav, 4th column)
 *   scanned_kul_kharcha   → f.anya_kharcha  ← ENTIRE जोड़ total goes here
 *   labour/cess/transport → NOT set (stay 0 in scan mode)
 *   seller_name           → used for kisan matching / new kisan confirm box
 *   buyer_name            → not stored in form state (info only)
 *
 * WHY anya_kharcha for kul_kharcha:
 *   Formula: net = gross - labour - cess - transport - anya_kharcha
 *   In scan mode: labour=0, cess=0, transport=0, anya_kharcha = जोड़ from col 6
 *   In manual mode: user fills labour/cess/transport, anya_kharcha=0
 *   This way both modes use the same formula.
 */

const MAX_WIDTH    = 1400; // px — enough for Gemini to read handwriting clearly
const JPEG_QUALITY = 0.85; // 85% — good quality for Gemini

// Compress image using Canvas API before sending
// Reduces 5MB phone photo to ~300KB without losing readability
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width  = MAX_WIDTH;
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Image compress nahi hua")); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load nahi hua")); };
    img.src = url;
  });
}

export async function scanFormJ(imageFile) {
  // Compress image
  let base64;
  try {
    base64 = await compressImage(imageFile);
  } catch {
    // Fallback: send raw if compression fails
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }

  // Send to serverless function
  const resp = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mimeType: "image/jpeg" }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || `Server error: ${resp.status}`);
  }

  const result = await resp.json();
  const { data: parsed, rawText } = result;

  // Debug logs — visible in browser DevTools Console tab
  console.log("=== GEMINI RESPONSE ===");
  console.log(rawText);
  console.log("=== PARSED FIELDS ===");
  console.log(JSON.stringify(parsed, null, 2));
  console.log("=== END DEBUG ===");

  return {
    scanned:     true,
    // Basic fields
    date:        parsed.date        || "",
    commodity:   parsed.commodity   || "",
    bags:        parsed.bags        || "",
    weight:      parsed.weight      || "",
    rate:        parsed.rate        || "",
    buyer_name:  parsed.buyer_name  || "",
    seller_name: parsed.seller_name || "",
    bill_number: parsed.bill_number || "",

    // KHARCHA MAPPING:
    // scanned_kul_kharcha = जोड़ total from form col 6 (e.g. 416.48)
    // This maps to anya_kharcha in NewFormJ.jsx
    // labour_rate/cess/transport stay at their defaults (not overwritten)
    // so user can still see/edit them, but they contribute 0 because
    // anya_kharcha > 0 triggers scan mode in the form (see NewFormJ.jsx)
    anya_kharcha: parsed.scanned_kul_kharcha || "0",

    // Cross-validation values (shown in UI to compare against form)
    gross_amount_from_form: parsed.gross_amount_from_form || "",
    net_amount_from_form:   parsed.net_amount_from_form   || "",

    // Scan metadata
    confidence:            parsed.confidence            || "medium",
    low_confidence_fields: parsed.low_confidence_fields || [],
    _raw: parsed,
  };
}
