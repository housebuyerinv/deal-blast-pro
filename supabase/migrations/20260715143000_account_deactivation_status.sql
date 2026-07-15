alter table public.account_profiles
  add column if not exists account_status text not null default 'Active',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

alter table public.workspaces
  add column if not exists account_status text not null default 'Active',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

alter table public.workspace_plan_assignments
  add column if not exists access_status text not null default 'Active',
  add column if not exists access_deactivated_at timestamptz;

create table if not exists public.account_deactivation_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  email text not null,
  requested_by text not null,
  action text not null default 'account_deactivated',
  reason text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.account_deactivation_audit enable row level security;

drop policy if exists "Account deactivation audit readable by owner" on public.account_deactivation_audit;
create policy "Account deactivation audit readable by owner"
on public.account_deactivation_audit
for select
to authenticated
using (user_id = auth.uid());
