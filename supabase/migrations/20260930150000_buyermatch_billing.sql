begin;
create table public.bm_plans (
 version text primary key, product text not null check(product in ('buyermatch','network')), label text not null,
 allowance integer not null check(allowance>=0), stripe_price_id text unique, approved boolean not null default false
);
create table public.bm_billing_events (event_id text primary key, event_created bigint not null, owner_id uuid not null, product text not null, subscription_id text not null, created_at timestamptz not null default now());
alter table public.bm_entitlements add column billing_event_created bigint not null default 0;
alter table public.bm_plans enable row level security;
alter table public.bm_billing_events enable row level security;
revoke all on public.bm_plans,public.bm_billing_events from public,anon,authenticated;
grant all on public.bm_plans,public.bm_billing_events to service_role;
create trigger bm_billing_immutable before update or delete on public.bm_billing_events for each row execute function public.bm_audit_immutable();
create function public.bm_apply_billing(p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare plan bm_plans; previous bm_entitlements;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if exists(select 1 from bm_billing_events where event_id=p_event) then return; end if;
 select * into plan from bm_plans where stripe_price_id=p_price and product=p_product and approved;
 if not found then raise exception 'Approved product plan required'; end if;
 select * into previous from bm_entitlements where owner_id=p_owner and product=p_product;
 if found and previous.stripe_subscription_id is not null and previous.stripe_subscription_id<>p_subscription then raise exception 'Subscription conflict requires review'; end if;
 insert into bm_billing_events(event_id,event_created,owner_id,product,subscription_id) values(p_event,p_created,p_owner,p_product,p_subscription);
 if previous.billing_event_created>p_created then return; end if;
 insert into bm_entitlements(owner_id,product,plan_version,status,period_start,period_end,allowance,stripe_subscription_id,billing_event_created)
 values(p_owner,p_product,plan.version,p_status,p_start,p_end,plan.allowance,p_subscription,p_created)
 on conflict(owner_id,product) do update set plan_version=excluded.plan_version,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,allowance=excluded.allowance,stripe_subscription_id=excluded.stripe_subscription_id,billing_event_created=excluded.billing_event_created;
end $$;
revoke all on function public.bm_apply_billing(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.bm_apply_billing(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
commit;
