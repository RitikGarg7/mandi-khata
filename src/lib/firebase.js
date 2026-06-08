// Firebase client — Auth (Phone OTP + Google) + Firestore (encrypted blob storage)
import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  signInWithPopup,
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db_firestore = getFirestore(app);

export { onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup };

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── DB API ────────────────────────────────────────────────────────────────────
export const db = {

  // Fetch all docs in a sub-collection, sorted client-side (no index needed)
  async getAll(table) {
    const uid = currentUid();
    const snap = await getDocs(userCol(uid, table));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort descending by updatedAt (Firestore Timestamp has .toMillis())
    return docs.sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? 0;
      const tb = b.updatedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
  },

  // Create or update a document; auto-generates id when id is null
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

  async saveSettings(_id, encryptedData) {
    const uid = currentUid();
    await setDoc(settingsDoc(uid), { data: encryptedData, updatedAt: serverTimestamp() }, { merge: true });
    return "main";
  },
};
