create extension if not exists pgcrypto;

-- Immutable Property Intelligence credit journal. Balances are derived, never rewritten.
create table if not exists public.property_intelligence_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entry_type text not null check (entry_type in ('included_grant','purchase_grant','reservation','release','expiration','refund','dispute','promotion','admin_correction')),
  credit_bucket text not null check (credit_bucket in ('included','purchased','owner_internal')),
  amount integer not null check (amount <> 0),
  operation_id text,
  stripe_event_id text,
  purchase_id uuid references public.property_intelligence_addon_purchases(id) on delete set null,
  billing_period_start date,
  billing_period_end date,
  expires_at timestamptz,
  idempotency_key text not null unique,
  audit_reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists pi_credit_ledger_workspace_created_idx
  on public.property_intelligence_credit_ledger (workspace_id, created_at desc);
create index if not exists pi_credit_ledger_operation_idx
  on public.property_intelligence_credit_ledger (operation_id) where operation_id is not null;

create table if not exists public.stripe_event_receipts (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  payload_sha256 text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing','processed','failed','ignored','needs_review')),
  attempt_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_category text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.property_intelligence_addon_purchases
  add column if not exists pack_key text,
  add column if not exists stripe_price_id text,
  add column if not exists currency text not null default 'usd',
  add column if not exists fulfilled_ledger_entry_id uuid references public.property_intelligence_credit_ledger(id) on delete set null;

create or replace function public.property_intelligence_included_limit(p_plan_name text, p_enterprise_limit integer default null)
returns integer language sql immutable as $$
  select case lower(coalesce(p_plan_name, ''))
    when 'pro' then 25
    when 'agency' then 100
    when 'enterprise' then greatest(0, coalesce(p_enterprise_limit, 0))
    else 0
  end
$$;

create or replace function public.property_intelligence_credit_balance(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with totals as (
    select
      coalesce(sum(amount) filter (where credit_bucket = 'included' and (expires_at is null or expires_at > now())), 0)::integer included,
      coalesce(sum(amount) filter (where credit_bucket = 'purchased'), 0)::integer purchased
    from public.property_intelligence_credit_ledger where workspace_id = p_workspace_id
  )
  select jsonb_build_object(
    'includedRemaining', greatest(0, included),
    'purchasedRemaining', greatest(0, purchased),
    'totalRemaining', greatest(0, included) + greatest(0, purchased)
  ) from totals
$$;

create or replace function public.grant_property_intelligence_included_credits(
  p_workspace_id uuid, p_plan_name text, p_period_start date, p_period_end date,
  p_idempotency_key text, p_enterprise_limit integer default null, p_reason text default 'plan_cycle_grant'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_id uuid;
begin
  v_limit := public.property_intelligence_included_limit(p_plan_name, p_enterprise_limit);
  if v_limit <= 0 then return jsonb_build_object('ok', true, 'granted', 0, 'reason', 'plan_has_no_included_credits'); end if;
  insert into public.property_intelligence_credit_ledger
    (workspace_id, entry_type, credit_bucket, amount, billing_period_start, billing_period_end, expires_at, idempotency_key, audit_reason)
  values (p_workspace_id, 'included_grant', 'included', v_limit, p_period_start, p_period_end,
    p_period_end::timestamptz, p_idempotency_key, p_reason)
  on conflict (idempotency_key) do nothing returning id into v_id;
  return jsonb_build_object('ok', true, 'granted', case when v_id is null then 0 else v_limit end, 'duplicate', v_id is null);
end $$;

create or replace function public.grant_property_intelligence_purchase(
  p_workspace_id uuid, p_purchase_id uuid, p_credits integer, p_stripe_event_id text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_credits <= 0 then raise exception 'credits_must_be_positive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  insert into public.property_intelligence_credit_ledger
    (workspace_id, entry_type, credit_bucket, amount, purchase_id, stripe_event_id, idempotency_key, audit_reason)
  values (p_workspace_id, 'purchase_grant', 'purchased', p_credits, p_purchase_id, p_stripe_event_id,
    p_idempotency_key, 'verified_stripe_credit_pack_payment')
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is not null then
    update public.property_intelligence_addon_purchases set status='fulfilled', fulfilled_at=now(), fulfilled_ledger_entry_id=v_id
      where id=p_purchase_id and status <> 'fulfilled';
  end if;
  return jsonb_build_object('ok', true, 'granted', case when v_id is null then 0 else p_credits end, 'duplicate', v_id is null);
end $$;

create or replace function public.reserve_property_intelligence_credit_v2(
  p_workspace_id uuid, p_user_id uuid, p_operation_id text, p_plan_name text, p_normalized_address text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.property_intelligence_lookup_operations%rowtype; v_balance jsonb; v_bucket text; v_uuid uuid; v_expiry timestamptz;
begin
  if p_workspace_id is null or p_user_id is null or nullif(trim(p_operation_id), '') is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_operation');
  end if;
  -- Serialize all balance decisions for the workspace; different operation IDs cannot overspend the final credit.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select * into v_existing from public.property_intelligence_lookup_operations where operation_id=p_operation_id for update;
  if found then return jsonb_build_object('ok', v_existing.status in ('reserved','completed'), 'operationId', v_existing.id,
    'status', v_existing.status, 'creditSource', v_existing.credit_source, 'alreadyReserved', true); end if;
  v_balance := public.property_intelligence_credit_balance(p_workspace_id);
  if (v_balance->>'includedRemaining')::integer > 0 then v_bucket := 'included';
  elsif (v_balance->>'purchasedRemaining')::integer > 0 then v_bucket := 'purchased';
  else return v_balance || jsonb_build_object('ok', false, 'code', 'credits_exhausted'); end if;
  if v_bucket='included' then
    select max(expires_at) into v_expiry from public.property_intelligence_credit_ledger
      where workspace_id=p_workspace_id and credit_bucket='included' and entry_type='included_grant' and expires_at>now();
  end if;
  insert into public.property_intelligence_lookup_operations
    (workspace_id,user_id,operation_id,normalized_address,plan_name,billing_period_start,status,credit_source,credit_charged)
  values (p_workspace_id,p_user_id,p_operation_id,p_normalized_address,p_plan_name,date_trunc('month',now())::date,'reserved',v_bucket,true)
  returning id into v_uuid;
  insert into public.property_intelligence_credit_ledger
    (workspace_id,entry_type,credit_bucket,amount,operation_id,expires_at,idempotency_key,audit_reason,created_by_user_id)
  values (p_workspace_id,'reservation',v_bucket,-1,p_operation_id,v_expiry,'pi:reserve:'||p_operation_id,'property_intelligence_provider_reservation',p_user_id);
  return public.property_intelligence_credit_balance(p_workspace_id) || jsonb_build_object('ok',true,'operationId',v_uuid,'creditSource',v_bucket);
end $$;

create or replace function public.adjust_property_intelligence_purchased_credits(
  p_workspace_id uuid, p_requested_debit integer, p_entry_type text, p_idempotency_key text,
  p_reason text, p_stripe_event_id text default null, p_created_by_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_balance jsonb; v_available integer; v_debit integer; v_id uuid;
begin
  if p_requested_debit <= 0 or p_entry_type not in ('refund','dispute','admin_correction') then raise exception 'invalid_credit_adjustment'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
  if exists(select 1 from public.property_intelligence_credit_ledger where idempotency_key=p_idempotency_key) then
    return jsonb_build_object('ok',true,'duplicate',true,'adjusted',0);
  end if;
  v_balance := public.property_intelligence_credit_balance(p_workspace_id);
  v_available := greatest(0,(v_balance->>'purchasedRemaining')::integer);
  v_debit := least(v_available,p_requested_debit);
  if v_debit <= 0 then return jsonb_build_object('ok',true,'adjusted',0,'balanceProtected',true); end if;
  insert into public.property_intelligence_credit_ledger
    (workspace_id,entry_type,credit_bucket,amount,stripe_event_id,idempotency_key,audit_reason,created_by_user_id)
  values (p_workspace_id,p_entry_type,'purchased',-v_debit,p_stripe_event_id,p_idempotency_key,p_reason,p_created_by_user_id)
  returning id into v_id;
  return jsonb_build_object('ok',true,'adjusted',v_debit,'ledgerEntryId',v_id,'balanceProtected',v_debit<p_requested_debit);
end $$;

create or replace function public.release_property_intelligence_credit_v2(p_operation_uuid uuid, p_failure_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_op public.property_intelligence_lookup_operations%rowtype; v_expiry timestamptz;
begin
  select * into v_op from public.property_intelligence_lookup_operations where id=p_operation_uuid for update;
  if not found or v_op.status <> 'reserved' then return; end if;
  select expires_at into v_expiry from public.property_intelligence_credit_ledger where idempotency_key='pi:reserve:'||v_op.operation_id;
  insert into public.property_intelligence_credit_ledger
    (workspace_id,entry_type,credit_bucket,amount,operation_id,expires_at,idempotency_key,audit_reason)
  values (v_op.workspace_id,'release',v_op.credit_source,1,v_op.operation_id,v_expiry,'pi:release:'||v_op.operation_id,
    coalesce(nullif(p_failure_code,''),'provider_failure')) on conflict (idempotency_key) do nothing;
  update public.property_intelligence_lookup_operations set status='released',credit_charged=false,failure_code=p_failure_code,
    completed_at=now(),updated_at=now() where id=p_operation_uuid and status='reserved';
end $$;

-- Durable email outbox. Provider delivery events append status history instead of overwriting it.
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(), workspace_id text not null, user_id uuid,
  event_type text not null, recipient text not null, subject text not null, html_body text not null, text_body text not null,
  essential boolean not null default false, related_record_id text, idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','retrying','sending','sent','delivered','failed','bounced','complained','suppressed')),
  attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
  provider text not null default 'resend', provider_message_id text, last_error_category text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz, delivered_at timestamptz
);
create index if not exists email_outbox_due_idx on public.email_outbox(status,next_attempt_at);
create index if not exists email_outbox_workspace_idx on public.email_outbox(workspace_id,created_at desc);

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(), outbox_id uuid references public.email_outbox(id) on delete cascade,
  provider_event_id text not null unique, provider_message_id text, event_type text not null,
  status text not null, safe_metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null, created_at timestamptz not null default now()
);

create table if not exists public.email_suppressions (
  recipient_hash text primary key, reason text not null check(reason in ('bounce','complaint','manual')),
  provider_event_id text, created_at timestamptz not null default now()
);

-- Durable, explicit closing evidence. Generic deal status and PI searches never populate this table.
create table if not exists public.verified_closings (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inventory_deal_id text not null references public.inventory_deals(id) on delete restrict,
  closed_at timestamptz not null, verified_at timestamptz not null default now(), verified_by_user_id uuid not null,
  verification_method text not null, city text not null, state text not null, postal_code text not null, county text,
  is_demo boolean not null default false, is_sample boolean not null default false, is_duplicate boolean not null default false,
  outcome text not null default 'closed' check(outcome in ('closed','canceled','failed','reversed')),
  evidence_metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(workspace_id, inventory_deal_id)
);
create index if not exists verified_closings_workspace_date_idx on public.verified_closings(workspace_id,closed_at desc);
create index if not exists verified_closings_hot_zone_idx on public.verified_closings(postal_code,closed_at desc)
  where outcome='closed' and not is_demo and not is_sample and not is_duplicate;

alter table public.property_intelligence_credit_ledger enable row level security;
alter table public.stripe_event_receipts enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.verified_closings enable row level security;

create policy "Workspace members view credit ledger" on public.property_intelligence_credit_ledger for select to authenticated
  using (public.can_access_inventory_workspace(workspace_id));
create policy "Workspace members view email outbox" on public.email_outbox for select to authenticated
  using (exists(select 1 from public.email_notification_settings s where s.workspace_id=email_outbox.workspace_id and s.user_id=auth.uid()));
create policy "Workspace members view verified closings" on public.verified_closings for select to authenticated
  using (public.can_access_inventory_workspace(workspace_id));
create policy "Workspace members create verified closings" on public.verified_closings for insert to authenticated
  with check (verified_by_user_id=auth.uid() and public.can_access_inventory_workspace(workspace_id));

revoke all on function public.property_intelligence_credit_balance(uuid) from public,anon,authenticated;
revoke all on function public.property_intelligence_included_limit(text,integer) from public,anon,authenticated;
revoke all on function public.grant_property_intelligence_included_credits(uuid,text,date,date,text,integer,text) from public,anon,authenticated;
revoke all on function public.grant_property_intelligence_purchase(uuid,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.reserve_property_intelligence_credit_v2(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.release_property_intelligence_credit_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.adjust_property_intelligence_purchased_credits(uuid,integer,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.property_intelligence_credit_balance(uuid) to service_role;
grant execute on function public.grant_property_intelligence_included_credits(uuid,text,date,date,text,integer,text) to service_role;
grant execute on function public.grant_property_intelligence_purchase(uuid,uuid,integer,text,text) to service_role;
grant execute on function public.reserve_property_intelligence_credit_v2(uuid,uuid,text,text,text) to service_role;
grant execute on function public.release_property_intelligence_credit_v2(uuid,text) to service_role;
grant execute on function public.adjust_property_intelligence_purchased_credits(uuid,integer,text,text,text,text,uuid) to service_role;
