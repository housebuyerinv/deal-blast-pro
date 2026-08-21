-- Deal Blast Pro schema-only bootstrap for databases created from scratch.
--
-- These three tables predate the checked-in migration history. This file must
-- run once, before supabase/migrations, on an empty QA/staging database.
-- It intentionally contains no production rows, auth users, storage objects,
-- customer identifiers, Stripe identifiers, balances, or secrets.

create extension if not exists pgcrypto;

create table if not exists public.deal_submissions (
  id uuid primary key default gen_random_uuid(),
  deal_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  source text not null default 'public_portal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deal_submissions_created_at_idx
  on public.deal_submissions (created_at desc);
create index if not exists deal_submissions_status_idx
  on public.deal_submissions (status);

alter table public.deal_submissions enable row level security;
grant insert on public.deal_submissions to anon, authenticated;
grant select, update, delete on public.deal_submissions to authenticated;
grant all on public.deal_submissions to service_role;

create table if not exists public.buyer_portal_submissions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_review',
  buyer_data jsonb not null,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.buyer_portal_submissions enable row level security;
grant insert, select, update on public.buyer_portal_submissions to anon, authenticated;
grant all on public.buyer_portal_submissions to service_role;

drop policy if exists "Public can create buyer portal submissions" on public.buyer_portal_submissions;
create policy "Public can create buyer portal submissions"
on public.buyer_portal_submissions for insert to anon, authenticated
with check (status = 'pending_review');

drop policy if exists "App can read pending buyer portal submissions" on public.buyer_portal_submissions;
create policy "App can read pending buyer portal submissions"
on public.buyer_portal_submissions for select to anon, authenticated
using (true);
drop policy if exists "App can update buyer portal submissions" on public.buyer_portal_submissions;
create policy "App can update buyer portal submissions"
on public.buyer_portal_submissions for update to anon, authenticated
using (true) with check (true);

create table if not exists public.deal_portal_submissions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  source text default 'Public Portal',
  submitter_name text,
  submitter_email text,
  submitter_phone text,
  property_address text,
  property_city text,
  property_state text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  dismissed_at timestamptz
);

alter table public.deal_portal_submissions enable row level security;
grant insert on public.deal_portal_submissions to anon;
grant select, update on public.deal_portal_submissions to authenticated;
grant all on public.deal_portal_submissions to service_role;

drop policy if exists "Public can submit deals" on public.deal_portal_submissions;
create policy "Public can submit deals"
on public.deal_portal_submissions for insert to anon
with check (true);

drop policy if exists "Authenticated can read deal submissions" on public.deal_portal_submissions;
create policy "Authenticated can read deal submissions"
on public.deal_portal_submissions for select to authenticated
using (true);

drop policy if exists "Authenticated can update deal submissions" on public.deal_portal_submissions;
create policy "Authenticated can update deal submissions"
on public.deal_portal_submissions for update to authenticated
using (true);
