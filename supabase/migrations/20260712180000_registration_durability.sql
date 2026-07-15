create extension if not exists pgcrypto;

create table if not exists public.account_profiles (
  user_id uuid primary key,
  email text not null unique,
  full_name text not null,
  company text,
  role text not null default 'Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique,
  owner_email text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_plan_assignments (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  plan_name text not null default 'Free Demo',
  billing_status text not null default 'Trial Active',
  trial_status text not null default 'Trial Active',
  payment_status text not null default 'No payment required',
  source text not null default 'Admin Register',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_registration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  event_type text not null default 'new_account_created',
  idempotency_key text not null unique,
  status text not null default 'created',
  diagnostics jsonb not null default '{}'::jsonb,
  notification_response jsonb,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_registration_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists account_profiles_updated_at on public.account_profiles;
create trigger account_profiles_updated_at
before update on public.account_profiles
for each row execute function public.set_registration_updated_at();

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_registration_updated_at();

drop trigger if exists workspace_plan_assignments_updated_at on public.workspace_plan_assignments;
create trigger workspace_plan_assignments_updated_at
before update on public.workspace_plan_assignments
for each row execute function public.set_registration_updated_at();

drop trigger if exists account_registration_events_updated_at on public.account_registration_events;
create trigger account_registration_events_updated_at
before update on public.account_registration_events
for each row execute function public.set_registration_updated_at();

alter table public.account_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_plan_assignments enable row level security;
alter table public.account_registration_events enable row level security;

drop policy if exists "Account profiles readable by owner" on public.account_profiles;
create policy "Account profiles readable by owner"
on public.account_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Account profiles updateable by owner" on public.account_profiles;
create policy "Account profiles updateable by owner"
on public.account_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Workspaces readable by owner" on public.workspaces;
create policy "Workspaces readable by owner"
on public.workspaces
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "Workspace plans readable by owner" on public.workspace_plan_assignments;
create policy "Workspace plans readable by owner"
on public.workspace_plan_assignments
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Registration events readable by owner" on public.account_registration_events;
create policy "Registration events readable by owner"
on public.account_registration_events
for select
to authenticated
using (user_id = auth.uid());
