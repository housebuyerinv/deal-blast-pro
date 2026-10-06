begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table public.bm_live_billing_config (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  verified boolean not null default false
);
insert into public.bm_live_billing_config(id) values(true);
alter table public.bm_live_billing_config enable row level security;
revoke all on public.bm_live_billing_config from public,anon,authenticated;
grant all on public.bm_live_billing_config to service_role;
-- Allowances and Stripe price IDs require explicit approval before sale.
insert into public.bm_plans(version,product,label,allowance,approved) values
 ('buyermatch-starter-v1','buyermatch','BuyerMatch Starter',0,false),
 ('buyermatch-pro-v1','buyermatch','BuyerMatch Pro',0,false)
on conflict(version) do nothing;
create function public.bm_apply_live_billing(p_checkout uuid,p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from bm_live_billing_config where id and enabled and verified)
 then raise exception 'Live BuyerMatch billing disabled'; end if;
 if p_product <> 'buyermatch' or not exists(
   select 1 from bm_checkouts c join bm_plans p on p.version=c.plan_version
   where c.id=p_checkout and c.owner_id=p_owner and c.product=p_product
   and p.stripe_price_id=p_price and p.approved and p.allowance>0
   and p.version in ('buyermatch-starter-v1','buyermatch-pro-v1'))
 then raise exception 'Approved software checkout mapping required'; end if;
 perform bm_apply_billing(p_event,p_created,p_owner,p_product,p_price,p_subscription,p_status,p_start,p_end);
end $$;
revoke all on function public.bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.bm_apply_live_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
commit;
