-- Additive, server-only BuyerMatch foundation. No CRM tables or balances changed.
begin;
create table public.bm_deals (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 property jsonb not null, status text not null default 'draft', title jsonb,
 contract_key text, contract_verified boolean not null default false, admin_approved boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.bm_deals(owner_id,created_at desc);
create table public.bm_buyers (
 id uuid primary key default gen_random_uuid(), identity_ciphertext text not null, identity_hash text not null unique,
 criteria jsonb not null, status text not null default 'inactive' check(status in ('inactive','active','suppressed')),
 verification_evidence text, criteria_verified_at timestamptz, last_active_at timestamptz,
 verification_level text not null default 'unverified', consent_evidence text, opted_out_at timestamptz,
 import_id uuid, created_at timestamptz not null default now()
);
create table public.bm_imports(id uuid primary key default gen_random_uuid(), actor_id uuid not null, summary jsonb not null, created_at timestamptz not null default now());
create table public.bm_entitlements (
 owner_id uuid not null references auth.users(id), product text not null check(product in ('buyermatch','network')),
 plan_version text not null, status text not null check(status in ('active','inactive')),
 period_start timestamptz not null, period_end timestamptz not null, allowance integer not null check(allowance>=0),
 stripe_subscription_id text, primary key(owner_id,product), check(period_end>period_start)
);
create table public.bm_analyses (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.bm_deals(id), owner_id uuid not null,
 operation_key uuid not null, private_result jsonb not null, public_result jsonb not null,
 created_at timestamptz not null default now(), unique(owner_id,operation_key)
);
create table public.bm_events (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.bm_deals(id),
 actor_id uuid not null, kind text not null, public_note text, evidence jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.bm_documents (
 id uuid primary key default gen_random_uuid(), kind text not null, version text not null, document_hash text not null,
 content text not null, approved boolean not null default false, current boolean not null default false,
 unique(kind,version)
);
create unique index bm_current_document on public.bm_documents(kind) where current;
create table public.bm_acceptances (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, deal_id uuid references public.bm_deals(id),
 document_id uuid not null references public.bm_documents(id), version text not null, document_hash text not null,
 signature_evidence jsonb not null, accepted_at timestamptz not null default now()
);
create table public.bm_fee_policies (
 id uuid primary key default gen_random_uuid(), state text not null, plan_version text not null, version text not null,
 approved boolean not null default false, enabled boolean not null default false, formula jsonb not null,
 document_id uuid references public.bm_documents(id), created_at timestamptz not null default now(), unique(state,plan_version,version)
);
create table public.bm_exposures (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.bm_deals(id), buyer_id uuid not null references public.bm_buyers(id),
 owner_id uuid not null, operation_key uuid not null, frozen_terms jsonb not null, created_at timestamptz not null default now(), unique(deal_id,buyer_id)
);
create table public.bm_outbox (
 id uuid primary key default gen_random_uuid(), exposure_id uuid not null unique references public.bm_exposures(id),
 state text not null default 'disabled', provider_message_id text unique, attempts integer not null default 0,
 accepted_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now()
);
create table public.bm_closings (
 deal_id uuid primary key references public.bm_deals(id), selected_exposure_id uuid references public.bm_exposures(id),
 scheduled_date date, reported_at timestamptz, verified_at timestamptz, settlement_key text,
 user_signed_at timestamptz, title_acknowledged_at timestamptz, fee_due_cents bigint check(fee_due_cents>=0), paid_at timestamptz, payment_reference text
);
create function public.bm_audit_immutable() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Append-only audit record'; end $$;
create trigger bm_exposures_immutable before update or delete on public.bm_exposures for each row execute function public.bm_audit_immutable();
create trigger bm_events_immutable before update or delete on public.bm_events for each row execute function public.bm_audit_immutable();
create trigger bm_acceptances_immutable before update or delete on public.bm_acceptances for each row execute function public.bm_audit_immutable();
create trigger bm_analyses_immutable before update or delete on public.bm_analyses for each row execute function public.bm_audit_immutable();
-- Single transaction reserves quota and persists analysis. Failed transactions consume no quota.
create function public.bm_commit_analysis(p_owner uuid,p_deal uuid,p_key uuid,p_private jsonb,p_public jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare entitlement public.bm_entitlements; previous public.bm_analyses; used integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(select 1 from bm_deals where id=p_deal and owner_id=p_owner) then raise exception 'Deal not found'; end if;
 select * into previous from bm_analyses where owner_id=p_owner and operation_key=p_key;
 if found then
   if previous.deal_id<>p_deal then raise exception 'Operation key conflict'; end if;
   return previous.public_result;
 end if;
 select * into entitlement from bm_entitlements where owner_id=p_owner and product='buyermatch' and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'BuyerMatch entitlement required'; end if;
 select count(*) into used from bm_analyses where owner_id=p_owner and created_at>=entitlement.period_start;
 if used>=entitlement.allowance then raise exception 'Analysis allowance exhausted'; end if;
 if (select count(*) from bm_analyses where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'Hourly query limit reached'; end if;
 insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result) values(p_deal,p_owner,p_key,p_private,p_public);
 update bm_deals set status=case when status in ('draft','analyzed') then 'analyzed' else status end, updated_at=now() where id=p_deal;
 insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_owner,'analyzed','Private network analysis completed. No buyers contacted.');
 return p_public;
end $$;
-- No anonymous/authenticated direct access, even if tables are exposed through PostgREST.
do $$ declare t text; begin
 foreach t in array array['bm_deals','bm_buyers','bm_imports','bm_entitlements','bm_analyses','bm_events','bm_documents','bm_acceptances','bm_fee_policies','bm_exposures','bm_outbox','bm_closings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('buyermatch-private','buyermatch-private',false,10485760,array['application/pdf']) on conflict(id) do nothing;
-- No browser storage policies: uploads use short-lived server-issued URLs after ownership checks.
commit;
