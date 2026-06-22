/**
 * services/waImport.js
 *
 * Imports parties created via WhatsApp into the local app DB.
 * Called after login — checks wa_parties/{phoneNumber}/parties
 * and imports any that haven't been imported yet.
 */

import { db_firestore } from "../lib/firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

/**
 * Fetch unimported WhatsApp parties for a phone number.
 * Phone number format from Firebase Auth: +919876543210
 * Format in wa_parties: 919876543210 (no +)
 */
export async function fetchWaParties(phoneNumber) {
  if (!phoneNumber) return [];

  // Strip leading + if present
  const phone = phoneNumber.replace(/^\+/, "");

  try {
    const ref  = collection(db_firestore, "wa_parties", phone, "parties");
    const snap = await getDocs(ref);

    const parties = [];
    snap.forEach(d => {
      const data = d.data();
      // Only import parties not yet imported
      if (!data.imported) {
        parties.push({ docId: d.id, ...data });
      }
    });

    return parties;
  } catch (err) {
    console.error("fetchWaParties error:", err);
    return [];
  }
}

/**
 * Mark a WhatsApp party as imported so it doesn't get imported again.
 */
export async function markWaPartyImported(phoneNumber, docId) {
  const phone = phoneNumber.replace(/^\+/, "");
  try {
    const ref = doc(db_firestore, "wa_parties", phone, "parties", docId);
    await updateDoc(ref, { imported: true, importedAt: new Date().toISOString() });
  } catch (err) {
    console.error("markWaPartyImported error:", err);
  }
}
