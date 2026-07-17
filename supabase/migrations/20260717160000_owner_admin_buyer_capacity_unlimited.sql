alter table public.workspace_plan_assignments
  add column if not exists buyer_capacity_mode text not null default 'finite',
  add column if not exists buyer_capacity_limit integer;

alter table public.workspace_plan_assignments
  add constraint workspace_plan_assignments_buyer_capacity_mode_valid
  check (buyer_capacity_mode in ('finite', 'custom', 'unlimited'))
  not valid;

alter table public.workspace_plan_assignments
  validate constraint workspace_plan_assignments_buyer_capacity_mode_valid;

alter table public.workspace_plan_assignments
  add constraint workspace_plan_assignments_buyer_capacity_limit_nonnegative
  check (buyer_capacity_limit is null or buyer_capacity_limit >= 0)
  not valid;

alter table public.workspace_plan_assignments
  validate constraint workspace_plan_assignments_buyer_capacity_limit_nonnegative;

create or replace function public.dealblast_buyer_plan_limit(plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(plan_name, 'free'))
    when 'owner admin' then null
    when 'free demo' then 25
    when 'free' then 25
    when 'starter' then 250
    when 'pro' then 1000
    when 'agency' then 2000
    when 'enterprise' then 5000
    else 25
  end;
$$;

create or replace function public.dealblast_effective_buyer_limit(plan_name text, purchased_capacity integer default 0)
returns integer
language sql
stable
as $$
  select case
    when public.dealblast_buyer_plan_limit(plan_name) is null then null
    else public.dealblast_buyer_plan_limit(plan_name) + greatest(0, coalesce(purchased_capacity, 0))
  end;
$$;

create or replace function public.enforce_buyer_workspace_capacity()
returns trigger
language plpgsql
as $$
declare
  assigned_plan text;
  capacity_mode text;
  capacity_limit integer;
  buyer_limit integer;
  saved_count integer;
  purchased_capacity integer;
begin
  if new.workspace_id is null then
    raise exception 'buyer_workspace_required' using errcode = '23514';
  end if;

  select
    coalesce(effective_access_plan, current_plan, plan_name),
    coalesce(buyer_capacity_mode, 'finite'),
    buyer_capacity_limit,
    greatest(0, coalesce(purchased_buyer_capacity, 0))
    into assigned_plan, capacity_mode, capacity_limit, purchased_capacity
  from public.workspace_plan_assignments
  where workspace_id = new.workspace_id
  for update;

  if capacity_mode = 'unlimited' then
    return new;
  end if;

  if capacity_mode = 'custom' and capacity_limit is not null then
    buyer_limit := greatest(0, capacity_limit);
  else
    buyer_limit := public.dealblast_effective_buyer_limit(assigned_plan, purchased_capacity);
  end if;

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
