-- Commercial limits mirror buyermatchPlans.json; parity is verified by database tests.
-- No entitlement grants, catalog activation, provider activation, or history rewrites.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.bm_plans
 add column distribution_allowance integer not null default 0 check(distribution_allowance>=0),
 add column max_distribution_fanout integer not null default 0 check(max_distribution_fanout>=0);
update public.bm_plans set allowance=20,distribution_allowance=10,max_distribution_fanout=25 where version='buyermatch-starter-v1' and product='buyermatch';
update public.bm_plans set allowance=50,distribution_allowance=25,max_distribution_fanout=50 where version='buyermatch-pro-v1' and product='buyermatch';
-- Approval and price mappings remain exactly as installed (launch catalog is inactive).
alter table public.bm_distribution_requests
 add column plan_version text,
 add column allowed_fanout integer check(allowed_fanout>0);
create or replace function public.bm_snapshot_distribution_usage() returns trigger
language plpgsql security definer set search_path=public as $$
declare d bm_deals; e bm_entitlements; p bm_plans;
begin
 select * into d from bm_deals where id=new.deal_id and owner_id=new.owner_id;
 if not found then raise exception 'Deal not found'; end if;
 new.service_type:=coalesce(d.property->>'serviceType','managed_dispo');
 select * into e from bm_entitlements where owner_id=new.owner_id
 and product=case when new.service_type='software' then 'buyermatch' else 'network' end
 and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'Distribution entitlement required';end if;
 new.plan_version:=e.plan_version;
 new.allowed_fanout:=null;
 if new.service_type='software' then
  select * into p from bm_plans where version=e.plan_version and product='buyermatch';
  if not found or p.distribution_allowance<=0 or p.max_distribution_fanout<=0 then raise exception 'Software plan limits unavailable'; end if;
  new.allowed_fanout:=p.max_distribution_fanout;
 end if;
 new.period_start:=e.period_start;new.period_end:=e.period_end;
 return new;
end $$;
revoke all on function public.bm_snapshot_distribution_usage() from public,anon,authenticated;

create or replace function public.bm_account_usage(p_owner uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_object_agg(k.kind,jsonb_build_object(
  'allowance',limits.allowance,'used',u.used,
  'remaining',case when e.status='active' and e.period_start<=now() and e.period_end>now() then greatest(0,limits.allowance-u.used) else 0 end,
  'active',coalesce(e.status='active' and e.period_start<=now() and e.period_end>now(),false),
  'periodStart',e.period_start,'periodEnd',e.period_end,'planVersion',e.plan_version,
  'maxDistributionFanout',case when k.kind='softwareDistribution' then coalesce(p.max_distribution_fanout,0) end,
  'invitationCeiling',case when k.kind='softwareDistribution' then limits.allowance*coalesce(p.max_distribution_fanout,0) end,
  'invitations',case when k.kind='softwareDistribution' then
    (select coalesce(sum(r.fanout),0) from bm_distribution_usage r where r.owner_id=p_owner and r.service_type='software' and r.created_at>=e.period_start and r.created_at<e.period_end) end))
 from (values ('analysis','buyermatch'),('softwareDistribution','buyermatch'),('managedDispo','network')) k(kind,product)
 left join bm_entitlements e on e.owner_id=p_owner and e.product=k.product
 left join bm_plans p on p.version=e.plan_version and p.product=e.product
 cross join lateral (select case when k.kind='softwareDistribution' then coalesce(p.distribution_allowance,0) else coalesce(e.allowance,0) end allowance) limits
 cross join lateral (
  select case when k.kind='analysis' then
   (select count(*) from bm_analyses a where a.owner_id=p_owner and a.created_at>=e.period_start and a.created_at<e.period_end)
  else (select count(*) from bm_distribution_usage r where r.owner_id=p_owner and r.created_at>=e.period_start and r.created_at<e.period_end
    and (r.service_type=case when k.kind='softwareDistribution' then 'software' else 'managed_dispo' end or r.service_type='unknown')) end used
 ) u;
$$;
revoke all on function public.bm_account_usage(uuid) from public,anon,authenticated;
grant execute on function public.bm_account_usage(uuid) to service_role;


create or replace function public.bm_queue_distribution(p_owner uuid,p_deal uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d bm_deals; e bm_entitlements; a bm_analyses; policy bm_fee_policies; b bm_buyers;
 plan bm_plans; quota integer; fanout integer; software boolean; cfg bm_configuration; exposure uuid; request_id uuid; n integer:=0; accepted jsonb;
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
 quota:=e.allowance;
 if software then
  select * into plan from bm_plans where version=e.plan_version and product='buyermatch' for share;
  if not found or plan.distribution_allowance<=0 or plan.max_distribution_fanout<=0 then raise exception 'Software plan limits unavailable'; end if;
  quota:=plan.distribution_allowance;fanout:=plan.max_distribution_fanout;
 end if;
 if (select count(*) from bm_distribution_usage r where r.owner_id=p_owner and r.created_at>=e.period_start and r.created_at<e.period_end and (r.service_type=case when software then 'software' else 'managed_dispo' end or r.service_type='unknown'))>=quota then raise exception 'Distribution allowance exhausted'; end if;
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
 where (m->>'eligible')::boolean and buyer.status='active' and buyer.opted_out_at is null and coalesce(buyer.consent_evidence,'')<>''
 order by coalesce((m->>'score')::numeric,0) desc,coalesce((m->>'confidence')::numeric,0) desc,buyer.id
 limit fanout loop
 insert into bm_exposures(deal_id,buyer_id,owner_id,operation_key,frozen_terms) values(p_deal,b.id,p_owner,p_key,
 jsonb_build_object('planVersion',e.plan_version,'allowedFanout',fanout,'serviceType',case when software then 'software' else 'managed_dispo' end,'policy',to_jsonb(policy),'acceptances',accepted,'criteria',b.criteria,'consentEvidence',b.consent_evidence,'analysisId',a.id,'title',d.title,'property',d.property)) returning id into exposure;
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
