// Google Cloud Vision — Form J scanner
// Compresses image client-side → sends to /api/scan → returns parsed form fields

const MAX_WIDTH    = 1400; // px — higher res helps GCV read handwriting
const JPEG_QUALITY = 0.85; // 85% quality — better for OCR accuracy

// Compress image using Canvas API
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

// Main scan function
export async function scanFormJ(imageFile) {
  let base64;
  try {
    base64 = await compressImage(imageFile);
  } catch {
    // Fallback: send raw
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }

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

  // DEBUG: log raw OCR text and parsed fields in browser console
  // Open DevTools → Console tab to see what Google Vision read from the image
  console.log("=== RAW OCR TEXT (what Google Vision read) ===");
  console.log(rawText);
  console.log("=== PARSED FORM J FIELDS ===");
  console.log(JSON.stringify(parsed, null, 2));
  console.log("=== END DEBUG ===");

  return {
    scanned:               true,
    date:                  parsed.date          || "",
    commodity:             parsed.commodity     || "",
    bags:                  parsed.bags          || "",
    weight:                parsed.weight        || "",
    rate:                  parsed.rate          || "",
    utarai:                parsed.utarai        || "0",
    jharai:                parsed.jharai        || "0",
    kiraya:                parsed.kiraya        || "0",
    gross_amount:          parsed.gross_amount  || "",
    net_amount:            parsed.net_amount    || "",
    buyer_name:            parsed.buyer_name    || "",
    seller_name:           parsed.seller_name   || "",
    bill_number:           parsed.bill_number   || "",
    confidence:            parsed.confidence    || "medium",
    low_confidence_fields: parsed.low_confidence_fields || [],
    _raw: parsed,
  };
}
