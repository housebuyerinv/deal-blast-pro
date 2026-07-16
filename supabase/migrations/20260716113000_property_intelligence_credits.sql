create table if not exists public.property_intelligence_balances (
  workspace_id uuid primary key,
  billing_period_start date not null,
  included_limit integer not null default 0,
  included_used integer not null default 0,
  purchased_available integer not null default 0,
  purchased_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_intelligence_lookup_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  operation_id text not null unique,
  normalized_address text not null,
  plan_name text not null,
  billing_period_start date not null,
  status text not null check (status in ('reserved', 'completed', 'failed', 'released')),
  credit_source text check (credit_source in ('included', 'purchased', 'owner_internal')),
  credit_charged boolean not null default false,
  cache_status text not null default 'miss' check (cache_status in ('miss', 'hit', 'refresh')),
  provider_request_count integer not null default 0,
  failure_code text,
  result_summary jsonb,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_intelligence_lookup_workspace_idx
  on public.property_intelligence_lookup_operations (workspace_id, created_at desc);

create index if not exists property_intelligence_lookup_address_idx
  on public.property_intelligence_lookup_operations (workspace_id, normalized_address, created_at desc);

create table if not exists public.property_intelligence_provider_requests (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references public.property_intelligence_lookup_operations(id) on delete set null,
  workspace_id uuid not null,
  endpoint text not null,
  http_status integer,
  response_ms integer,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.property_intelligence_cache (
  workspace_id uuid not null,
  normalized_address text not null,
  payload jsonb not null,
  provider_request_count integer not null default 0,
  original_lookup_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, normalized_address)
);

create table if not exists public.property_intelligence_addon_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  stripe_event_id text unique,
  stripe_session_id text unique,
  credits_purchased integer not null check (credits_purchased > 0),
  amount_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table public.property_intelligence_balances enable row level security;
alter table public.property_intelligence_lookup_operations enable row level security;
alter table public.property_intelligence_provider_requests enable row level security;
alter table public.property_intelligence_cache enable row level security;
alter table public.property_intelligence_addon_purchases enable row level security;

drop policy if exists "Workspace owners can view property intelligence balances" on public.property_intelligence_balances;
create policy "Workspace owners can view property intelligence balances"
  on public.property_intelligence_balances
  for select
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = property_intelligence_balances.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners can view property intelligence operations" on public.property_intelligence_lookup_operations;
create policy "Workspace owners can view property intelligence operations"
  on public.property_intelligence_lookup_operations
  for select
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = property_intelligence_lookup_operations.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners can view property intelligence provider counts" on public.property_intelligence_provider_requests;
create policy "Workspace owners can view property intelligence provider counts"
  on public.property_intelligence_provider_requests
  for select
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = property_intelligence_provider_requests.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners can view property intelligence cache metadata" on public.property_intelligence_cache;
create policy "Workspace owners can view property intelligence cache metadata"
  on public.property_intelligence_cache
  for select
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = property_intelligence_cache.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Workspace owners can view property intelligence purchases" on public.property_intelligence_addon_purchases;
create policy "Workspace owners can view property intelligence purchases"
  on public.property_intelligence_addon_purchases
  for select
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = property_intelligence_addon_purchases.workspace_id
        and w.owner_user_id = auth.uid()
    )
  );

create or replace function public.property_intelligence_plan_limit(p_plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(p_plan_name, ''))
    when 'owner admin' then 100
    when 'enterprise' then 1000
    when 'agency' then 100
    when 'pro' then 25
    else 0
  end
$$;

create or replace function public.reserve_property_intelligence_credit(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_plan_name text,
  p_normalized_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_limit integer := public.property_intelligence_plan_limit(p_plan_name);
  v_existing public.property_intelligence_lookup_operations%rowtype;
  v_balance public.property_intelligence_balances%rowtype;
  v_source text := null;
  v_operation_id uuid;
begin
  if p_workspace_id is null or p_user_id is null or coalesce(p_operation_id, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;

  select * into v_existing
  from public.property_intelligence_lookup_operations
  where operation_id = p_operation_id;

  if found then
    return jsonb_build_object(
      'ok', v_existing.status in ('reserved', 'completed'),
      'operationId', v_existing.id,
      'status', v_existing.status,
      'creditSource', v_existing.credit_source,
      'alreadyReserved', true
    );
  end if;

  insert into public.property_intelligence_balances (
    workspace_id,
    billing_period_start,
    included_limit,
    included_used,
    purchased_available,
    purchased_used
  )
  values (p_workspace_id, v_period, v_limit, 0, 0, 0)
  on conflict (workspace_id) do update
    set billing_period_start = case
          when property_intelligence_balances.billing_period_start <> excluded.billing_period_start
            then excluded.billing_period_start
          else property_intelligence_balances.billing_period_start
        end,
        included_limit = excluded.included_limit,
        included_used = case
          when property_intelligence_balances.billing_period_start <> excluded.billing_period_start
            then 0
          else property_intelligence_balances.included_used
        end,
        updated_at = now()
  returning * into v_balance;

  if v_limit > 0 and v_balance.included_used < v_balance.included_limit then
    update public.property_intelligence_balances
    set included_used = included_used + 1,
        updated_at = now()
    where workspace_id = p_workspace_id
      and included_used < included_limit
    returning * into v_balance;
    if found then
      v_source := case when lower(coalesce(p_plan_name, '')) = 'owner admin' then 'owner_internal' else 'included' end;
    end if;
  end if;

  if v_source is null and (v_balance.purchased_available - v_balance.purchased_used) > 0 then
    update public.property_intelligence_balances
    set purchased_used = purchased_used + 1,
        updated_at = now()
    where workspace_id = p_workspace_id
      and (purchased_available - purchased_used) > 0
    returning * into v_balance;
    if found then
      v_source := 'purchased';
    end if;
  end if;

  if v_source is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'credits_exhausted',
      'includedLimit', v_balance.included_limit,
      'includedUsed', v_balance.included_used,
      'purchasedRemaining', greatest(0, v_balance.purchased_available - v_balance.purchased_used),
      'resetDate', (v_period + interval '1 month')::date
    );
  end if;

  insert into public.property_intelligence_lookup_operations (
    workspace_id,
    user_id,
    operation_id,
    normalized_address,
    plan_name,
    billing_period_start,
    status,
    credit_source,
    credit_charged
  )
  values (
    p_workspace_id,
    p_user_id,
    p_operation_id,
    p_normalized_address,
    p_plan_name,
    v_period,
    'reserved',
    v_source,
    true
  )
  returning id into v_operation_id;

  return jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'creditSource', v_source,
    'includedLimit', v_balance.included_limit,
    'includedUsed', v_balance.included_used,
    'purchasedRemaining', greatest(0, v_balance.purchased_available - v_balance.purchased_used),
    'resetDate', (v_period + interval '1 month')::date
  );
end;
$$;

create or replace function public.finalize_property_intelligence_credit(
  p_operation_uuid uuid,
  p_result_summary jsonb,
  p_provider_request_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.property_intelligence_lookup_operations
  set status = 'completed',
      result_summary = p_result_summary,
      provider_request_count = greatest(0, coalesce(p_provider_request_count, 0)),
      completed_at = now(),
      updated_at = now()
  where id = p_operation_uuid
    and status = 'reserved';
end;
$$;

create or replace function public.release_property_intelligence_credit(
  p_operation_uuid uuid,
  p_failure_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.property_intelligence_lookup_operations%rowtype;
begin
  select * into v_operation
  from public.property_intelligence_lookup_operations
  where id = p_operation_uuid
  for update;

  if not found or v_operation.status <> 'reserved' then
    return;
  end if;

  if v_operation.credit_source in ('included', 'owner_internal') then
    update public.property_intelligence_balances
    set included_used = greatest(0, included_used - 1),
        updated_at = now()
    where workspace_id = v_operation.workspace_id;
  elsif v_operation.credit_source = 'purchased' then
    update public.property_intelligence_balances
    set purchased_used = greatest(0, purchased_used - 1),
        updated_at = now()
    where workspace_id = v_operation.workspace_id;
  end if;

  update public.property_intelligence_lookup_operations
  set status = 'released',
      credit_charged = false,
      failure_code = p_failure_code,
      completed_at = now(),
      updated_at = now()
  where id = p_operation_uuid;
end;
$$;
