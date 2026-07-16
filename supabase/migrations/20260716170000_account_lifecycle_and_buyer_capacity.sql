alter table public.workspaces
  add column if not exists scheduled_deactivation_at timestamptz,
  add column if not exists data_deletion_requested_at timestamptz,
  add column if not exists scheduled_data_deletion_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.workspace_plan_assignments
  add column if not exists purchased_buyer_capacity integer not null default 0,
  add column if not exists past_due_since timestamptz,
  add column if not exists payment_recovered_at timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_access_ends_at timestamptz,
  add column if not exists scheduled_deactivation_at timestamptz,
  add column if not exists data_deletion_requested_at timestamptz,
  add column if not exists scheduled_data_deletion_at timestamptz,
  add column if not exists retention_expires_at timestamptz;

alter table public.workspace_plan_assignments
  add constraint workspace_plan_assignments_purchased_buyer_capacity_nonnegative
  check (purchased_buyer_capacity >= 0)
  not valid;

alter table public.workspace_plan_assignments
  validate constraint workspace_plan_assignments_purchased_buyer_capacity_nonnegative;

create or replace function public.dealblast_effective_buyer_limit(plan_name text, purchased_capacity integer default 0)
returns integer
language sql
stable
as $$
  select public.dealblast_buyer_plan_limit(plan_name) + greatest(0, coalesce(purchased_capacity, 0));
$$;

create or replace function public.enforce_buyer_workspace_capacity()
returns trigger
language plpgsql
as $$
declare
  assigned_plan text;
  buyer_limit integer;
  saved_count integer;
  purchased_capacity integer;
begin
  if new.workspace_id is null then
    raise exception 'buyer_workspace_required' using errcode = '23514';
  end if;

  select plan_name, greatest(0, coalesce(purchased_buyer_capacity, 0))
    into assigned_plan, purchased_capacity
  from public.workspace_plan_assignments
  where workspace_id = new.workspace_id
  for update;

  buyer_limit := public.dealblast_effective_buyer_limit(assigned_plan, purchased_capacity);

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
