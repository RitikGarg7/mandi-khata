-- Mandi Khata — Supabase Schema
-- All financial columns store encrypted JSON blobs (text).
-- Clear columns: id, user_id, created_at, updated_at, locked (for RLS / sync).

-- Enable RLS on all tables
-- Run this in Supabase SQL editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade unique not null,
  data text not null, -- encrypted JSON: firm_name, gstin, mpc_rate_default, auc_rate_default, labour_rate_default, etc.
  updated_at timestamptz default now()
);

create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  data text not null, -- encrypted JSON: name, type, place, phone, gstin, state, opening_balance, credit_limit, interest_rate, notes
  updated_at timestamptz default now()
);

create table if not exists purchase_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  data text not null, -- encrypted JSON: all bill fields
  updated_at timestamptz default now()
);

create table if not exists sale_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  data text not null, -- encrypted JSON: all bill fields
  updated_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  data text not null, -- encrypted JSON: party_id, date, type, amount, reference, cheque_number, bank_date, narration, linked_bill_id, linked_bill_type
  updated_at timestamptz default now()
);

create table if not exists ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  data text not null, -- encrypted JSON: party_id, date, entry_type, debit, credit, balance, narration, source_type, source_id
  updated_at timestamptz default now()
);

-- Row Level Security
alter table settings enable row level security;
alter table parties enable row level security;
alter table purchase_bills enable row level security;
alter table sale_bills enable row level security;
alter table payments enable row level security;
alter table ledger enable row level security;

-- RLS policies: users can only access their own rows
create policy "own settings" on settings for all using (auth.uid()::text = user_id::text);
create policy "own parties" on parties for all using (auth.uid()::text = user_id::text);
create policy "own purchase_bills" on purchase_bills for all using (auth.uid()::text = user_id::text);
create policy "own sale_bills" on sale_bills for all using (auth.uid()::text = user_id::text);
create policy "own payments" on payments for all using (auth.uid()::text = user_id::text);
create policy "own ledger" on ledger for all using (auth.uid()::text = user_id::text);
