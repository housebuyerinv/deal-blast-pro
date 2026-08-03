-- One-time idempotent grant for active Pro/Agency workspaces already mid-cycle when the immutable ledger launches.
insert into public.property_intelligence_credit_ledger
  (workspace_id,entry_type,credit_bucket,amount,billing_period_start,billing_period_end,expires_at,idempotency_key,audit_reason)
select wpa.workspace_id,'included_grant','included',
  public.property_intelligence_included_limit(wpa.plan_name,null),
  coalesce((wpa.current_period_end::date - interval '1 month')::date,date_trunc('month',now())::date),
  coalesce(wpa.current_period_end::date,(date_trunc('month',now())+interval '1 month')::date),
  coalesce(wpa.current_period_end,(date_trunc('month',now())+interval '1 month')),
  'launch:included:'||wpa.workspace_id::text||':'||coalesce(wpa.current_period_end::date::text,date_trunc('month',now())::date::text),
  'immutable_ledger_launch_backfill'
from public.workspace_plan_assignments wpa
where lower(coalesce(wpa.plan_name,'')) in ('pro','agency')
  and lower(coalesce(wpa.billing_status,'')) in ('paid active','comped','trial active')
  and public.property_intelligence_included_limit(wpa.plan_name,null)>0
on conflict(idempotency_key) do nothing;
