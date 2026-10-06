-- Existing deals without a service marker retain legacy Managed Dispo requirements.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
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
 if (select count(*) from bm_distribution_requests r join bm_deals used on used.id=r.deal_id where r.owner_id=p_owner and r.created_at>=e.period_start and (coalesce(used.property->>'serviceType','managed_dispo')='software')=software)>=e.allowance then raise exception 'Distribution allowance exhausted'; end if;
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
