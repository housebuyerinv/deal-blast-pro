-- Revised approved monthly allowances. Enterprise remains contract-configured.
alter table public.workspace_plan_assignments
  add column if not exists property_intelligence_included_credits integer
  check (property_intelligence_included_credits is null or property_intelligence_included_credits >= 0);

create or replace function public.property_intelligence_included_limit(
  p_plan_name text,
  p_enterprise_limit integer default null
) returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_plan_name, ''))
    when 'starter' then 20
    when 'pro' then 50
    when 'agency' then 150
    when 'enterprise' then greatest(0, coalesce(p_enterprise_limit, 0))
    else 0
  end
$$;

-- A verified paid invoice grants at most the plan allowance for a billing cycle.
-- Paid mid-cycle upgrades receive only the positive difference. Downgrades do not
-- claw back already-issued credits; the lower allowance begins next cycle.
create or replace function public.grant_property_intelligence_included_credits(
  p_workspace_id uuid,
  p_plan_name text,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text,
  p_enterprise_limit integer default null,
  p_reason text default 'plan_cycle_grant'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_already_granted integer;
  v_grant integer;
  v_id uuid;
begin
  if p_workspace_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'invalid_credit_grant_period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_period_start::text, 0));

  if exists(select 1 from public.property_intelligence_credit_ledger where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('ok', true, 'granted', 0, 'duplicate', true);
  end if;

  v_limit := public.property_intelligence_included_limit(p_plan_name, p_enterprise_limit);
  select coalesce(sum(amount), 0)::integer into v_already_granted
  from public.property_intelligence_credit_ledger
  where workspace_id = p_workspace_id
    and entry_type = 'included_grant'
    and credit_bucket = 'included'
    and billing_period_start = p_period_start
    and billing_period_end = p_period_end;

  v_grant := greatest(0, v_limit - greatest(0, v_already_granted));
  if v_grant <= 0 then
    return jsonb_build_object(
      'ok', true,
      'granted', 0,
      'duplicate', false,
      'allowance', v_limit,
      'alreadyGranted', v_already_granted,
      'reason', case when v_limit <= 0 then 'plan_has_no_included_credits' else 'cycle_allowance_already_satisfied' end
    );
  end if;

  insert into public.property_intelligence_credit_ledger
    (workspace_id, entry_type, credit_bucket, amount, billing_period_start, billing_period_end,
     expires_at, idempotency_key, audit_reason, metadata)
  values
    (p_workspace_id, 'included_grant', 'included', v_grant, p_period_start, p_period_end,
     p_period_end::timestamptz, p_idempotency_key, p_reason,
     jsonb_build_object('planName', p_plan_name, 'cycleAllowance', v_limit, 'priorCycleGrants', v_already_granted))
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'granted', v_grant,
    'duplicate', false,
    'ledgerEntryId', v_id,
    'allowance', v_limit,
    'alreadyGranted', v_already_granted
  );
end
$$;

revoke all on function public.property_intelligence_included_limit(text, integer) from public, anon, authenticated;
revoke all on function public.grant_property_intelligence_included_credits(uuid, text, date, date, text, integer, text) from public, anon, authenticated;
grant execute on function public.grant_property_intelligence_included_credits(uuid, text, date, date, text, integer, text) to service_role;
