// Firebase client — Auth (Phone OTP) + Firestore (encrypted blob storage)
import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db_firestore = getFirestore(app);

// ── Re-export auth helpers so App.jsx / Login.jsx can import them ────────────
export { onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber };

// ── Firestore CRUD helpers (same interface as the old supabase `db` object) ──
//
// Data layout in Firestore:
//   users/{uid}/settings        (single document)
//   users/{uid}/{table}/{docId} (sub-collections for everything else)
//
// Each document: { id, data (encrypted blob), updatedAt }

function userCol(uid, table) {
  return collection(db_firestore, "users", uid, table);
}
function userDoc(uid, table, id) {
  return doc(db_firestore, "users", uid, table, id);
}
function settingsDoc(uid) {
  return doc(db_firestore, "users", uid, "settings", "main");
}

function currentUid() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  return user.uid;
}

export const db = {
  // Returns array of { id, data, updatedAt }
  async getAll(table) {
    const uid = currentUid();
    const q = query(userCol(uid, table), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Upsert a row; if id is null a new doc is created with auto-id
  async upsert(table, id, encryptedData) {
    const uid = currentUid();
    const ref = id ? userDoc(uid, table, id) : doc(userCol(uid, table));
    await setDoc(ref, { data: encryptedData, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  },

  async delete(table, id) {
    const uid = currentUid();
    await deleteDoc(userDoc(uid, table, id));
  },

  async getSettings() {
    const uid = currentUid();
    const snap = await getDoc(settingsDoc(uid));
    if (!snap.exists()) return null;
    return { id: "main", ...snap.data() };
  },

  async saveSettings(id, encryptedData) {
    const uid = currentUid();
    const ref = settingsDoc(uid);
    await setDoc(ref, { data: encryptedData, updatedAt: serverTimestamp() }, { merge: true });
    return "main";
  },
};
