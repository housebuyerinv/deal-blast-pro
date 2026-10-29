-- Require completed owned BuyerMatch Checkout for initial activation and tier changes.
-- Preserve owner serialization, conflict checks, RLS, service-only grants and live gate.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare fn text; begin
 foreach fn in array array[
   'public.bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)',
   'public.bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz)'] loop
   if to_regprocedure(fn) is null then raise exception 'Existing billing migration prerequisite missing'; end if;
   if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE')
      or not has_function_privilege('service_role',fn,'EXECUTE')
      or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where p.oid=to_regprocedure(fn) and a.privilege_type='EXECUTE'
        and a.grantee not in (p.proowner,'service_role'::regrole::oid))
      then raise exception 'Existing service-only billing grants required'; end if;
 end loop;
end $$;
create or replace function public.bm_apply_test_billing(p_checkout uuid,p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(select 1 from bm_checkouts c join bm_plans p on (p.version=c.plan_version or (p_product='buyermatch'
     and p.version in ('buyermatch-starter-v1','buyermatch-pro-v1')
     and c.state='completed' and c.session_id is not null
     and exists(select 1 from bm_entitlements e where e.owner_id=p_owner
       and e.product=p_product and e.stripe_subscription_id=p_subscription))) where c.id=p_checkout and c.owner_id=p_owner and c.product=p_product and (p_product<>'buyermatch' or (c.state='completed' and nullif(btrim(c.session_id),'') is not null)) and p.product=p_product and p.stripe_price_id=p_price and p.approved) then raise exception 'Server checkout mapping required';end if;
 perform bm_apply_billing(p_event,p_created,p_owner,p_product,p_price,p_subscription,p_status,p_start,p_end);
end $$;
create or replace function public.bm_apply_live_billing(p_checkout uuid,p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(select 1 from bm_live_billing_config where id and enabled and verified)
 then raise exception 'Live BuyerMatch billing disabled'; end if;
 if p_product <> 'buyermatch' or not exists(
   select 1 from bm_checkouts c join bm_plans p on (p.version=c.plan_version or (p_product='buyermatch'
     and p.version in ('buyermatch-starter-v1','buyermatch-pro-v1')
     and c.state='completed' and c.session_id is not null
     and exists(select 1 from bm_entitlements e where e.owner_id=p_owner
       and e.product=p_product and e.stripe_subscription_id=p_subscription)))
   where c.id=p_checkout and c.owner_id=p_owner and c.product=p_product and c.state='completed' and nullif(btrim(c.session_id),'') is not null
   and p.product=p_product and p.stripe_price_id=p_price and p.approved and p.allowance>0
   and p.version in ('buyermatch-starter-v1','buyermatch-pro-v1'))
 then raise exception 'Approved software checkout mapping required'; end if;
 perform bm_apply_billing(p_event,p_created,p_owner,p_product,p_price,p_subscription,p_status,p_start,p_end);
end $$;
commit;
