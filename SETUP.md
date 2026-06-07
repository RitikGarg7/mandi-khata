# Mandi Khata — Setup Guide

## What Was Built

A complete React PWA for grain market commission agents (Arhtiyas).

**Stack:** Vite + React · Firebase (Phone Auth + Firestore) · AES-256-GCM zero-knowledge encryption

---

## Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com and create a new project
2. Click **Add app** → **Web** → register your app → copy the `firebaseConfig` object

## Step 2 — Enable Phone Authentication

1. In Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Phone** provider
3. For testing: add your number under **Phone numbers for testing** (so you don't burn SMS quota during dev)

> **SMS quota:** Firebase Phone Auth is free for **10,000 SMS/month** on the Spark (free) plan.
> That's more than enough for a single arhtiya firm.

## Step 3 — Set Up Firestore

1. Firebase Console → **Firestore Database** → Create database
2. Start in **production mode**
3. Go to **Rules** tab and paste the contents of `firebase/firestore.rules`
4. Publish rules

## Step 4 — Environment Variables

```bash
cp .env.example .env.local
```

Fill in from Firebase Console → Project Settings → Your apps → Web app:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Step 5 — Authorised Domains

Firebase Console → Authentication → Settings → **Authorised domains**  
Add your production domain (e.g. `mandi-khata.vercel.app`) and `localhost`.

## Step 6 — Run Locally

```bash
npm install
npm run dev
```

App runs at http://localhost:5173

## Step 7 — Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Set all 6 `VITE_FIREBASE_*` env vars in Vercel dashboard → Settings → Environment Variables.

---

## App Architecture

```
src/
├── lib/
│   ├── firebase.js     # Firebase init + Auth helpers + Firestore CRUD (db.getAll / upsert / delete)
│   ├── crypto.js       # AES-256-GCM encryption (Web Crypto API) — unchanged
│   └── interest.js     # Running-balance simple interest calculator — unchanged
├── context/
│   └── AppContext.jsx  # Global state: all decrypted data lives here in-memory
├── components/
│   └── ui.jsx          # Design tokens + shared components
└── screens/
    ├── Login.jsx        # Phone OTP → PIN → derives encryption key
    ├── Home.jsx         # Dashboard
    ├── Parties.jsx      # Farmers & buyers
    ├── Khata.jsx        # Party ledger + payment recording
    ├── NewParty.jsx     # Add party
    ├── NewFormJ.jsx     # Purchase bill (Fard-J)
    ├── NewFormI.jsx     # Sale bill (Fard-I) with GST
    ├── Bills.jsx        # All bills
    └── Balance.jsx      # P&L + Balance Sheet + GST Summary
firebase/
└── firestore.rules     # Security rules (user can only access their own data)
```

## Firestore Data Layout

```
users/
  {uid}/
    settings/
      main          → { data: <encrypted blob>, updatedAt }
    parties/
      {docId}       → { data: <encrypted blob>, updatedAt }
    purchase_bills/
      {docId}       → { data: <encrypted blob>, updatedAt }
    sale_bills/
      {docId}       → { data: <encrypted blob>, updatedAt }
    payments/
      {docId}       → { data: <encrypted blob>, updatedAt }
    ledger/
      {docId}       → { data: <encrypted blob>, updatedAt }
```

## Encryption Flow

1. User signs in with phone OTP → Firebase assigns a `uid`
2. User sets a 4-digit PIN
3. App derives AES-256-GCM key using PBKDF2(uid + ":" + PIN, 200,000 iterations)
4. Key lives only in memory — never stored anywhere
5. All data encrypted as JSON before upload to Firestore
6. Firestore stores only opaque ciphertext blobs
7. On logout, key is wiped from memory

## Business Logic

- **Form J (Khareed):** Farmer → Agent. Gross = weight × rate. Deductions: Utaari (₹5.32/bag), Dami, Cess.
- **Form I (Bikri):** Agent → Buyer. Additions: MPC/Aadat (2.5%), AUC/Dalali (0.1%), Mazdoori (₹7.88/bag), GST.
- **Ledger:** Auto-created on every bill save. Payments also create entries.
- **Balance Sheet:** Assets − Liabilities = Capital (Net Worth).

---

## Phase 2 Roadmap

- [ ] PDF bill generation + WhatsApp share
- [ ] Offline-first (Firestore offline persistence)
- [ ] Photo-to-entry via OCR
- [ ] Multi-user (accountant read-only)
- [ ] GSTR-1 export
- [ ] Data migration from legacy SQL Server database
