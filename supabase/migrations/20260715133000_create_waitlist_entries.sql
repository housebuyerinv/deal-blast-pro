create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  primary_market text,
  business_type text,
  notes text,
  source text not null default 'public_waitlist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

alter table public.waitlist_entries enable row level security;

drop policy if exists "Public can submit waitlist entries" on public.waitlist_entries;
create policy "Public can submit waitlist entries"
on public.waitlist_entries
for insert
to anon, authenticated
with check (
  length(trim(full_name)) >= 2
  and email = lower(trim(email))
  and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
);

drop policy if exists "Service role can manage waitlist entries" on public.waitlist_entries;
create policy "Service role can manage waitlist entries"
on public.waitlist_entries
for all
to service_role
using (true)
with check (true);
