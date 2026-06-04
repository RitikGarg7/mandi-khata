# Mandi Khata — Setup Guide

## What Was Built

A complete React PWA for grain market commission agents (Arhtiyas).

**Stack:** Vite + React · Supabase (Postgres + Auth) · AES-256-GCM zero-knowledge encryption

---

## Step 1 — Supabase Project

1. Go to https://supabase.com and create a new project
2. In the SQL Editor, run the entire contents of `supabase/schema.sql`
3. In Authentication → Providers, enable **Google**
   - Add your Google OAuth Client ID + Secret (from console.cloud.google.com)
   - Set Authorized redirect URI to: `https://your-project-id.supabase.co/auth/v1/callback`

## Step 2 — Environment Variables

```bash
cp .env.example .env.local
```

Fill in your values from Supabase Dashboard → Settings → API:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 3 — Run Locally

```bash
npm install
npm run dev
```

App runs at http://localhost:5173

## Step 4 — Deploy

Deploy to Vercel (free):
```bash
npm install -g vercel
vercel --prod
```
Set the two VITE_ env vars in Vercel dashboard.

Add your Vercel domain to Supabase → Authentication → URL Configuration → Site URL and Redirect URLs.

---

## App Architecture

```
src/
├── lib/
│   ├── crypto.js       # AES-256-GCM encryption (Web Crypto API)
│   └── supabase.js     # Supabase client + thin CRUD helpers
├── context/
│   └── AppContext.jsx  # Global state: all decrypted data lives here in-memory
├── components/
│   └── ui.jsx          # Design tokens + shared components (Shell, Card, Btn, Field, etc.)
└── screens/
    ├── Login.jsx        # Google OAuth + PIN → derives encryption key
    ├── Home.jsx         # Dashboard: summary cards + quick actions + recent bills
    ├── Parties.jsx      # List of farmers & buyers with balances
    ├── Khata.jsx        # Party ledger + payment recording
    ├── NewParty.jsx     # Add farmer / buyer / expense account
    ├── NewFormJ.jsx     # Purchase bill (Fard-J) with auto-calculations
    ├── NewFormI.jsx     # Sale bill (Fard-I) with GST calculations
    ├── Bills.jsx        # All Form J and Form I bills
    └── Balance.jsx      # P&L + Balance Sheet + GST Summary
```

## Encryption Flow

1. User signs in with Google → gets `google_id`
2. User enters 4-digit PIN
3. App derives AES-256-GCM key using PBKDF2(google_id + ":" + PIN, 200,000 iterations)
4. Key lives only in memory — never stored anywhere
5. All data encrypted as JSON before upload to Supabase
6. Supabase stores only opaque ciphertext blobs
7. On logout, key is wiped from memory

## Data Schema (Supabase)

7 tables — each row has `id`, `user_id`, `data` (encrypted blob), `updated_at`.
RLS policies ensure users can only access their own rows.

Tables: `users` · `settings` · `parties` · `purchase_bills` · `sale_bills` · `payments` · `ledger`

## Business Logic

- **Form J (Khareed):** Farmer → Agent. Gross = weight × rate. Deductions: Utaari (₹5.32/bag), Dami, Cess. Net payable to farmer. Loan recovery optional.
- **Form I (Bikri):** Agent → Buyer. Gross = weight × rate. Additions: MPC/Aadat (2.5%), AUC/Dalali (0.1%), Mazdoori (₹7.88/bag), GST (CGST+SGST for Haryana, IGST for interstate).
- **Ledger:** Every Form J and Form I save auto-creates ledger entries. Payments also create entries.
- **Balance Sheet:** Assets (farmer loans + buyer receivables + cash + bank), Liabilities (GST payable), Capital = Assets − Liabilities.

---

## Next Steps (Phase 2)

- [ ] PDF bill generation + WhatsApp share
- [ ] Offline-first (IndexedDB cache + background sync)
- [ ] Photo-to-entry using local OCR
- [ ] Multi-user (accountant read-only access)
- [ ] GSTR-1 export
- [ ] Data migration from legacy SQL Server database
