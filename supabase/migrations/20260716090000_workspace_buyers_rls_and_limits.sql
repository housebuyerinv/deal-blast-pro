create extension if not exists pgcrypto;

create table if not exists public.buyers (
  id text primary key,
  workspace_id uuid,
  created_by_user_id uuid,
  owner_user_id uuid,
  email text,
  name text,
  company text,
  phone text,
  status text not null default 'Active',
  source text,
  buyer_type text,
  markets text[] not null default '{}'::text[],
  asset_types text[] not null default '{}'::text[],
  strategy text,
  budget_min numeric,
  budget_max numeric,
  notes text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.buyers add column if not exists workspace_id uuid;
alter table public.buyers add column if not exists created_by_user_id uuid;
alter table public.buyers add column if not exists owner_user_id uuid;
alter table public.buyers add column if not exists email text;
alter table public.buyers add column if not exists name text;
alter table public.buyers add column if not exists company text;
alter table public.buyers add column if not exists phone text;
alter table public.buyers add column if not exists status text not null default 'Active';
alter table public.buyers add column if not exists source text;
alter table public.buyers add column if not exists buyer_type text;
alter table public.buyers add column if not exists markets text[] not null default '{}'::text[];
alter table public.buyers add column if not exists asset_types text[] not null default '{}'::text[];
alter table public.buyers add column if not exists strategy text;
alter table public.buyers add column if not exists budget_min numeric;
alter table public.buyers add column if not exists budget_max numeric;
alter table public.buyers add column if not exists notes text;
alter table public.buyers add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.buyers add column if not exists created_at timestamptz not null default now();
alter table public.buyers add column if not exists updated_at timestamptz not null default now();

create index if not exists buyers_workspace_id_idx on public.buyers(workspace_id);
create index if not exists buyers_workspace_email_idx on public.buyers(workspace_id, lower(email)) where email is not null and email <> '';
create index if not exists buyers_created_by_user_id_idx on public.buyers(created_by_user_id);

create or replace function public.set_buyers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buyers_updated_at on public.buyers;
create trigger buyers_updated_at
before update on public.buyers
for each row execute function public.set_buyers_updated_at();

create or replace function public.dealblast_buyer_plan_limit(plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(plan_name, 'free demo'))
    when 'free demo' then 25
    when 'free' then 25
    when 'starter' then 100
    when 'pro' then 999
    when 'agency' then 999
    when 'enterprise' then null
    else 25
  end;
$$;

create or replace function public.prevent_buyer_workspace_change()
returns trigger
language plpgsql
as $$
begin
  if old.workspace_id is distinct from new.workspace_id then
    raise exception 'buyer_workspace_id_immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists buyers_workspace_immutable on public.buyers;
create trigger buyers_workspace_immutable
before update on public.buyers
for each row execute function public.prevent_buyer_workspace_change();

create or replace function public.enforce_buyer_workspace_capacity()
returns trigger
language plpgsql
as $$
declare
  assigned_plan text;
  buyer_limit integer;
  saved_count integer;
begin
  if new.workspace_id is null then
    raise exception 'buyer_workspace_required' using errcode = '23514';
  end if;

  select plan_name
    into assigned_plan
  from public.workspace_plan_assignments
  where workspace_id = new.workspace_id
  for update;

  buyer_limit := public.dealblast_buyer_plan_limit(assigned_plan);

  if buyer_limit is null then
    return new;
  end if;

  select count(*)
    into saved_count
  from public.buyers
  where workspace_id = new.workspace_id;

  if saved_count >= buyer_limit then
    raise exception 'buyer_plan_limit_exceeded' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists buyers_capacity_before_insert on public.buyers;
create trigger buyers_capacity_before_insert
before insert on public.buyers
for each row execute function public.enforce_buyer_workspace_capacity();

alter table public.buyers enable row level security;

drop policy if exists "Buyers readable by workspace owner" on public.buyers;
create policy "Buyers readable by workspace owner"
on public.buyers
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_plan_assignments wpa
    where wpa.workspace_id = buyers.workspace_id
      and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
);

drop policy if exists "Buyers insertable by workspace owner" on public.buyers;
create policy "Buyers insertable by workspace owner"
on public.buyers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_plan_assignments wpa
    where wpa.workspace_id = buyers.workspace_id
      and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
);

drop policy if exists "Buyers updateable by workspace owner" on public.buyers;
create policy "Buyers updateable by workspace owner"
on public.buyers
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_plan_assignments wpa
    where wpa.workspace_id = buyers.workspace_id
      and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
)
with check (
  exists (
    select 1
    from public.workspace_plan_assignments wpa
    where wpa.workspace_id = buyers.workspace_id
      and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
);

drop policy if exists "Buyers deleteable by workspace owner" on public.buyers;
create policy "Buyers deleteable by workspace owner"
on public.buyers
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspace_plan_assignments wpa
    where wpa.workspace_id = buyers.workspace_id
      and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
);
