// AES-256-GCM zero-knowledge encryption via Web Crypto API
// Key derived from: googleId + PIN using PBKDF2
// Key is never stored — re-derived each session from PIN

const PBKDF2_ITERATIONS = 200_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function buf2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b642buf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Derive AES-GCM key from googleId + PIN
export async function deriveKey(googleId, pin) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(googleId + ":" + pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  // Use a deterministic salt derived from googleId so same PIN always gives same key
  const saltSource = await crypto.subtle.digest("SHA-256", enc.encode("mandi-khata-v1:" + googleId));
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt any object → base64 string (iv:ciphertext)
export async function encrypt(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return buf2b64(iv) + ":" + buf2b64(ct);
}

// Decrypt base64 string → object
export async function decrypt(key, blob) {
  const [ivB64, ctB64] = blob.split(":");
  const iv = b642buf(ivB64);
  const ct = b642buf(ctB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

// Decrypt an array of {id, data} rows in parallel
export async function decryptRows(key, rows) {
  return Promise.all(rows.map(async r => ({ id: r.id, ...await decrypt(key, r.data) })));
}
