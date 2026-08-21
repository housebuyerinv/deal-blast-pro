-- Separate software trial access from paid external-resource entitlement.
-- Stripe subscription state remains authoritative; these columns persist the
-- lifecycle needed by DBP without introducing a second subscription table.
alter table public.workspace_plan_assignments
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_converted_at timestamptz,
  add column if not exists promotion_code text,
  add column if not exists stripe_promotion_code_id text;

-- Retire the plan-only grant signature. Existing ledger rows remain immutable.
revoke all on function public.grant_property_intelligence_included_credits(
  uuid, text, date, date, text, integer, text
) from public, anon, authenticated, service_role;

create or replace function public.grant_property_intelligence_included_credits(
  p_workspace_id uuid,
  p_plan_name text,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text,
  p_enterprise_limit integer default null,
  p_reason text default 'plan_cycle_grant',
  p_subscription_status text default null,
  p_invoice_amount_paid integer default 0,
  p_billing_reason text default null,
  p_payment_status text default null
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
  v_assignment public.workspace_plan_assignments%rowtype;
begin
  if p_workspace_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'invalid_credit_grant_period';
  end if;

  select * into v_assignment
  from public.workspace_plan_assignments
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'workspace_plan_assignment_not_found';
  end if;

  if lower(coalesce(p_subscription_status, '')) <> 'active'
     or lower(coalesce(p_payment_status, '')) <> 'paid'
     or coalesce(p_invoice_amount_paid, 0) <= 0
     or lower(coalesce(p_billing_reason, '')) not in ('subscription_create', 'subscription_cycle', 'subscription_update')
     or lower(coalesce(v_assignment.billing_status, '')) <> 'paid active'
     or lower(coalesce(v_assignment.payment_status, '')) <> 'paid'
     or lower(coalesce(v_assignment.subscription_status, '')) <> 'active'
     or lower(coalesce(v_assignment.trial_status, '')) = 'trial active' then
    return jsonb_build_object('ok', false, 'granted', 0, 'reason', 'paid_subscription_required');
  end if;

  if lower(coalesce(p_plan_name, '')) <> lower(coalesce(v_assignment.current_plan, v_assignment.plan_name, '')) then
    return jsonb_build_object('ok', false, 'granted', 0, 'reason', 'plan_mismatch');
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
      'ok', true, 'granted', 0, 'duplicate', false,
      'allowance', v_limit, 'alreadyGranted', v_already_granted,
      'reason', case when v_limit <= 0 then 'plan_has_no_included_credits' else 'cycle_allowance_already_satisfied' end
    );
  end if;

  insert into public.property_intelligence_credit_ledger
    (workspace_id, entry_type, credit_bucket, amount, billing_period_start, billing_period_end,
     expires_at, idempotency_key, audit_reason, metadata)
  values
    (p_workspace_id, 'included_grant', 'included', v_grant, p_period_start, p_period_end,
     p_period_end::timestamptz, p_idempotency_key, p_reason,
     jsonb_build_object(
       'planName', p_plan_name, 'cycleAllowance', v_limit, 'priorCycleGrants', v_already_granted,
       'subscriptionStatus', p_subscription_status, 'invoiceAmountPaid', p_invoice_amount_paid,
       'billingReason', p_billing_reason, 'paymentStatus', p_payment_status
     ))
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'granted', v_grant, 'duplicate', false,
    'ledgerEntryId', v_id, 'allowance', v_limit, 'alreadyGranted', v_already_granted
  );
end
$$;

revoke all on function public.grant_property_intelligence_included_credits(
  uuid, text, date, date, text, integer, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.grant_property_intelligence_included_credits(
  uuid, text, date, date, text, integer, text, text, integer, text, text
) to service_role;
