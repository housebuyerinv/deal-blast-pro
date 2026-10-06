begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- New reservations freeze attribution; existing append-only records are never rewritten.
alter table public.bm_distribution_requests
 add column service_type text check(service_type in ('software','managed_dispo')),
 add column period_start timestamptz,
 add column period_end timestamptz;
create function public.bm_snapshot_distribution_usage() returns trigger
language plpgsql security definer set search_path=public as $$
declare d bm_deals; e bm_entitlements;
begin
 select * into d from bm_deals where id=new.deal_id and owner_id=new.owner_id;
 if not found then raise exception 'Deal not found'; end if;
 new.service_type:=coalesce(d.property->>'serviceType','managed_dispo');
 select * into e from bm_entitlements where owner_id=new.owner_id
 and product=case when new.service_type='software' then 'buyermatch' else 'network' end
 and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'Distribution entitlement required';end if;
 new.period_start:=e.period_start;new.period_end:=e.period_end;
 return new;
end $$;
revoke all on function public.bm_snapshot_distribution_usage() from public,anon,authenticated;
create trigger bm_distribution_usage_snapshot before insert on public.bm_distribution_requests
for each row execute function public.bm_snapshot_distribution_usage();

-- Frozen exposure evidence, never mutable deal properties, classifies legacy reservations.
create view public.bm_distribution_usage as
select r.id,r.owner_id,r.deal_id,r.operation_key,r.created_at,r.period_start,r.period_end,
 coalesce(r.service_type,case when x.kinds=1 then x.kind else 'unknown' end) service_type,
 x.fanout
from public.bm_distribution_requests r
cross join lateral (
 select count(*)::integer fanout,
 count(distinct coalesce(e.frozen_terms->>'serviceType',e.frozen_terms->'property'->>'serviceType','managed_dispo')) kinds,
 min(coalesce(e.frozen_terms->>'serviceType',e.frozen_terms->'property'->>'serviceType','managed_dispo')) kind
 from public.bm_exposures e where e.owner_id=r.owner_id and e.deal_id=r.deal_id and e.operation_key=r.operation_key
) x;
revoke all on public.bm_distribution_usage from public,anon,authenticated;
grant select on public.bm_distribution_usage to service_role;

create function public.bm_account_usage(p_owner uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_object_agg(k.kind,jsonb_build_object(
  'allowance',coalesce(e.allowance,0),'used',u.used,
  'remaining',case when e.status='active' and e.period_start<=now() and e.period_end>now() then greatest(0,e.allowance-u.used) else 0 end,
  'active',coalesce(e.status='active' and e.period_start<=now() and e.period_end>now(),false),
  'periodStart',e.period_start,'periodEnd',e.period_end))
 from (values ('analysis','buyermatch'),('softwareDistribution','buyermatch'),('managedDispo','network')) k(kind,product)
 left join bm_entitlements e on e.owner_id=p_owner and e.product=k.product
 cross join lateral (
  select case when k.kind='analysis' then
   (select count(*) from bm_analyses a where a.owner_id=p_owner and a.created_at>=e.period_start and a.created_at<e.period_end)
  else (select count(*) from bm_distribution_usage r where r.owner_id=p_owner and r.created_at>=e.period_start and r.created_at<e.period_end
    and (r.service_type=case when k.kind='softwareDistribution' then 'software' else 'managed_dispo' end or r.service_type='unknown')) end used
 ) u;
$$;
revoke all on function public.bm_account_usage(uuid) from public,anon,authenticated;
grant execute on function public.bm_account_usage(uuid) to service_role;

create function public.bm_operating_metrics(p_owner uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
 with requests as (select * from bm_distribution_usage where p_owner is null or owner_id=p_owner),
 exposures as (select e.* from bm_exposures e where p_owner is null or e.owner_id=p_owner),
 jobs as (select o.* from bm_outbox o join exposures e on e.id=o.exposure_id),
 responses as (select r.* from bm_responses r join exposures e on e.id=r.exposure_id),
 owners as (select owner_id from bm_entitlements where p_owner is null or owner_id=p_owner union select owner_id from requests),
 accounts as (select o.owner_id,bm_account_usage(o.owner_id) usage,
  (select coalesce(sum(r.fanout),0) from requests r join bm_entitlements t on t.owner_id=r.owner_id and t.product='buyermatch'
    where r.owner_id=o.owner_id and r.service_type='software' and r.created_at>=t.period_start and r.created_at<t.period_end) software_exposures
  from owners o)
 select jsonb_build_object(
  'scope','Lifetime reservations; account simulations use each current entitlement period',
  'softwareDistributions',(select count(*) from requests where service_type='software'),
  'managedDispoDistributions',(select count(*) from requests where service_type='managed_dispo'),
  'unclassifiedDistributions',(select count(*) from requests where service_type not in ('software','managed_dispo')),
  'exposures',(select count(*) from exposures),
  'softwareExposures',(select coalesce(sum(fanout),0) from requests where service_type='software'),
  'softwareFanout',(select jsonb_build_object('average',avg(fanout),'median',percentile_cont(0.5) within group(order by fanout),'minimum',min(fanout),'maximum',max(fanout)) from requests where service_type='software'),
  'acceptedInvitations',(select count(*) from jobs where accepted_at is not null),
  'deliveredInvitations',(select count(*) from jobs where delivered_at is not null),
  'uniqueAttemptedExposures',(select count(*) from jobs where attempts>0),
  'claimedAttempts',(select coalesce(sum(attempts),0) from jobs),
  'retryAttempts',(select coalesce(sum(greatest(attempts-1,0)),0) from jobs),
  'buyerInterests',(select count(*) from responses where kind='interested'),
  'buyerOffers',(select count(*) from bm_offers o join exposures e on e.id=o.exposure_id),
  'buyerMessages',(select count(*) from bm_messages m join exposures e on e.id=m.exposure_id where m.sender_kind='buyer'),
  'passes',(select count(*) from responses where kind='declined'),
  'suppressedOrUnsubscribedBuyers',(select count(*) from bm_buyers b where (b.status='suppressed' or b.opted_out_at is not null) and (p_owner is null or exists(select 1 from exposures e where e.buyer_id=b.id))),
  'deduplicatedOrRejectedAttempts',null,
  'attemptNote','Attempts count acquired outbox leases, not proven provider HTTP calls. Historical rejected/deduplicated retries were not recorded.',
  'providerCost','Provider delivery cost unavailable until Resend sandbox/provider verification.',
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('ownerId',owner_id,'usage',usage,'softwareExposures',software_exposures)), '[]'::jsonb) from accounts)
 );
$$;
revoke all on function public.bm_operating_metrics(uuid) from public,anon,authenticated;
grant execute on function public.bm_operating_metrics(uuid) to service_role;
create or replace function public.bm_queue_distribution(p_owner uuid,p_deal uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d bm_deals; e bm_entitlements; a bm_analyses; policy bm_fee_policies; b bm_buyers;
 software boolean; cfg bm_configuration; exposure uuid; request_id uuid; n integer:=0; accepted jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into d from bm_deals where id=p_deal and owner_id=p_owner for update;
 if not found then raise exception 'Deal not found'; end if;
 software:=coalesce(d.property->>'serviceType','managed_dispo')='software';
 select id into request_id from bm_distribution_requests where owner_id=p_owner and operation_key=p_key and deal_id=p_deal;
 if found then return jsonb_build_object('requestId',request_id,'status','queued','sent',false); end if;
 select * into cfg from bm_configuration where id=true;
 if not (cfg.distribution_enabled and cfg.provider_verified and cfg.permissions_verified and cfg.agreements_verified) then raise exception 'Distribution disabled'; end if;
 if d.status<>'approved_for_distribution' or not d.contract_verified or not d.admin_approved or d.contract_key is null then raise exception 'Contract review required'; end if;
 if not exists(select 1 from storage.objects where bucket_id='buyermatch-private' and name=d.contract_key) then raise exception 'Private PSA missing'; end if;
 if (d.title->>'eoc')::date<=current_date or d.title->>'eoc' is null then raise exception 'Future EOC required'; end if;
 if coalesce(d.title->>'company','')='' or coalesce(d.title->>'name','')='' or coalesce(d.title->>'email','')='' or coalesce(d.title->>'phone','')='' then raise exception 'Title contact required'; end if;
 select * into e from bm_entitlements where owner_id=p_owner and product=case when software then 'buyermatch' else 'network' end and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'Distribution entitlement required'; end if;
 if (select count(*) from bm_distribution_usage r where r.owner_id=p_owner and r.created_at>=e.period_start and r.created_at<e.period_end and (r.service_type=case when software then 'software' else 'managed_dispo' end or r.service_type='unknown'))>=e.allowance then raise exception 'Distribution allowance exhausted'; end if;
 -- All accepted document versions must still be current at first exposure.
 if exists(select required.kind from (values('network'),('fee_schedule'),('deal_certification')) required(kind)
 where (not software or required.kind<>'fee_schedule') and not exists(select 1 from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id
 where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.kind=required.kind and doc.current and doc.approved
 and ac.document_hash=doc.document_hash and ac.version=doc.version)) then raise exception 'Current agreements and deal certification required'; end if;
 select jsonb_agg(jsonb_build_object('id',ac.id,'kind',doc.kind,'hash',ac.document_hash,'version',ac.version,'acceptedAt',ac.accepted_at)) into accepted
 from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.current and doc.approved;
 if software then policy.enabled:=false;policy.approved:=false;policy.formula:='{}'::jsonb;
 else
 select * into policy from bm_fee_policies where state=d.property->>'state' and plan_version=e.plan_version and approved and document_id in (select ac.document_id from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.kind='fee_schedule' and doc.approved and doc.current and ac.document_hash=doc.document_hash) order by created_at desc limit 1;
 if not found then raise exception 'Approved jurisdiction policy required'; end if;
 if policy.enabled and not cfg.success_fees_enabled then raise exception 'Success fees disabled'; end if;
 end if;
 select * into a from bm_analyses where deal_id=p_deal order by created_at desc limit 1;
 if not found or a.created_at<d.updated_at or a.created_at<now()-interval '24 hours' then raise exception 'Fresh analysis required'; end if;
 insert into bm_distribution_requests(owner_id,deal_id,operation_key) values(p_owner,p_deal,p_key) returning id into request_id;
 for b in select buyer.* from bm_buyers buyer join jsonb_array_elements(a.private_result->'matches') m on buyer.id::text=m->>'buyerId'
 where (m->>'eligible')::boolean and buyer.status='active' and buyer.opted_out_at is null and coalesce(buyer.consent_evidence,'')<>'' loop
 insert into bm_exposures(deal_id,buyer_id,owner_id,operation_key,frozen_terms) values(p_deal,b.id,p_owner,p_key,
 jsonb_build_object('serviceType',case when software then 'software' else 'managed_dispo' end,'policy',to_jsonb(policy),'acceptances',accepted,'criteria',b.criteria,'consentEvidence',b.consent_evidence,'analysisId',a.id,'title',d.title,'property',d.property)) returning id into exposure;
 insert into bm_outbox(exposure_id,state) values(exposure,'pending'); n:=n+1;
 end loop;
 if n=0 then raise exception 'No consented recipients'; end if;
 update bm_deals set status='distributing' where id=p_deal;
 insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_owner,'distribution_queued','Distribution queued for processing. Delivery is not yet confirmed.');
 return jsonb_build_object('requestId',request_id,'status','queued','sent',false);
end $$;
revoke all on function public.bm_queue_distribution(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bm_queue_distribution(uuid,uuid,uuid) to service_role;



commit;
