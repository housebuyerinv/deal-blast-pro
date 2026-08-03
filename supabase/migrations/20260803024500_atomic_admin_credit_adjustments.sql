-- Owner Admin corrections append immutable ledger entries and never overwrite balances.
create or replace function public.admin_adjust_property_intelligence_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_credit_bucket text,
  p_entry_type text,
  p_idempotency_key text,
  p_reason text,
  p_created_by_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance jsonb;
  v_available integer;
  v_id uuid;
begin
  if p_workspace_id is null or p_amount = 0 or nullif(trim(p_reason), '') is null then
    raise exception 'invalid_credit_adjustment';
  end if;
  if p_credit_bucket not in ('included', 'purchased') then raise exception 'invalid_credit_bucket'; end if;
  if p_entry_type not in ('promotion', 'admin_correction', 'refund') then raise exception 'invalid_credit_entry_type'; end if;
  if p_entry_type = 'refund' and p_credit_bucket <> 'purchased' then raise exception 'refund_requires_purchased_bucket'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  if exists(select 1 from public.property_intelligence_credit_ledger where idempotency_key = p_idempotency_key) then
    return public.property_intelligence_credit_balance(p_workspace_id) || jsonb_build_object('ok', true, 'duplicate', true, 'adjusted', 0);
  end if;

  v_balance := public.property_intelligence_credit_balance(p_workspace_id);
  v_available := case p_credit_bucket
    when 'included' then (v_balance->>'includedRemaining')::integer
    else (v_balance->>'purchasedRemaining')::integer
  end;
  if p_amount < 0 and v_available < abs(p_amount) then
    return v_balance || jsonb_build_object('ok', false, 'code', 'negative_balance_prevented', 'adjusted', 0);
  end if;

  insert into public.property_intelligence_credit_ledger
    (workspace_id, entry_type, credit_bucket, amount, idempotency_key, audit_reason, created_by_user_id, metadata)
  values
    (p_workspace_id, p_entry_type, p_credit_bucket, p_amount, p_idempotency_key, p_reason, p_created_by_user_id,
     jsonb_build_object('source', 'owner_admin_credit_operations'))
  returning id into v_id;

  return public.property_intelligence_credit_balance(p_workspace_id)
    || jsonb_build_object('ok', true, 'duplicate', false, 'adjusted', p_amount, 'ledgerEntryId', v_id);
end;
$$;

revoke all on function public.admin_adjust_property_intelligence_credits(uuid,integer,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_property_intelligence_credits(uuid,integer,text,text,text,text,uuid) to service_role;
