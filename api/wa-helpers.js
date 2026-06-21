/**
 * /api/wa-helpers.js
 *
 * Firebase Admin SDK helpers for:
 * 1. Storing/retrieving WhatsApp conversation state per user
 * 2. Saving completed party to the arhtiya's Firestore data
 *
 * Uses Firebase Admin SDK (server-side) — different from client SDK.
 *
 * ENV vars needed:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

// ── Init Firebase Admin (only once) ─────────────────────────────────────────

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// ── Conversation state ────────────────────────────────────────────────────────
// Stored at: wa_sessions/{phoneNumber}

export async function getConversationState(phone) {
  try {
    const db  = getAdminDb();
    const ref = db.collection("wa_sessions").doc(phone);
    const doc = await ref.get();
    if (!doc.exists) return null;
    return doc.data();
  } catch (err) {
    console.error("getConversationState error:", err);
    return null;
  }
}

export async function saveConversationState(phone, state) {
  try {
    const db  = getAdminDb();
    const ref = db.collection("wa_sessions").doc(phone);
    await ref.set({ ...state, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("saveConversationState error:", err);
  }
}

// ── Save party to Firebase ────────────────────────────────────────────────────
// Stored at: wa_parties/{phone}/parties/{auto-id}
// The web app can read from here and import into the arhtiya's account

export async function savePartyToFirebase(phone, partyData) {
  try {
    const db  = getAdminDb();
    const ref = db.collection("wa_parties").doc(phone).collection("parties").doc();

    await ref.set({
      id:                   ref.id,
      name:                 partyData.naam,
      opening_balance:      partyData.udhaar,
      opening_balance_date: partyData.date,
      interest_rate:        partyData.byaaj || 0,
      type:                 "Farmer",
      source:               "whatsapp",
      createdAt:            new Date().toISOString(),
      phone_from:           phone,
    });

    console.log(`Party saved for ${phone}: ${partyData.naam}`);
    return ref.id;
  } catch (err) {
    console.error("savePartyToFirebase error:", err);
    throw err;
  }
}
