-- Reconstructed missing DBP pre-migration tables, from current repository read/write contracts.
-- STAGING ONLY. All subsequent historical DBP migrations run unchanged after this prelude.
create table public.deal_submissions(id uuid primary key default gen_random_uuid(),status text not null default 'pending',source text not null default 'public_portal',deal_data jsonb not null default '{}',created_at timestamptz not null default now());
create table public.buyer_portal_submissions(id uuid primary key default gen_random_uuid(),status text not null default 'pending_review',buyer_data jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.deal_submissions enable row level security;
alter table public.buyer_portal_submissions enable row level security;
revoke all on public.deal_submissions,public.buyer_portal_submissions from public,anon,authenticated;
grant all on public.deal_submissions,public.buyer_portal_submissions to service_role;
