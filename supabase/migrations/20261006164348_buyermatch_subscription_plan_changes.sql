begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Initial activation must match the server checkout. Later approved plan changes
-- may reuse only that owner's already-bound subscription and completed checkout.
create or replace function public.bm_apply_test_billing(p_checkout uuid,p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(
   select 1 from bm_checkouts c join bm_plans original on original.version=c.plan_version
   join bm_plans target on target.stripe_price_id=p_price and target.product=c.product and target.approved
   where c.id=p_checkout and c.owner_id=p_owner and c.product=p_product
   and (original.stripe_price_id=p_price or (
     c.state='completed' and c.session_id is not null and exists(
       select 1 from bm_entitlements ent where ent.owner_id=c.owner_id and ent.product=c.product
       and ent.stripe_subscription_id=p_subscription))))
 then raise exception 'Server checkout mapping required'; end if;
 perform bm_apply_billing(p_event,p_created,p_owner,p_product,p_price,p_subscription,p_status,p_start,p_end);
end $$;
revoke all on function public.bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
commit;
