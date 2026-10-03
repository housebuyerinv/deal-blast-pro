begin;
create table public.bm_configuration (
 id boolean primary key default true check(id), distribution_enabled boolean not null default false,
 provider_verified boolean not null default false, permissions_verified boolean not null default false,
 agreements_verified boolean not null default false, success_fees_enabled boolean not null default false
);
insert into public.bm_configuration(id) values(true);
create table public.bm_offers (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.bm_deals(id),
 exposure_id uuid not null references public.bm_exposures(id), amount_cents bigint not null check(amount_cents>0),
 terms text not null, created_at timestamptz not null default now()
);
create table public.bm_distribution_requests (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, deal_id uuid not null unique references public.bm_deals(id),
 operation_key uuid not null, created_at timestamptz not null default now(), unique(owner_id,operation_key)
);
alter table public.bm_configuration enable row level security;
alter table public.bm_offers enable row level security;
alter table public.bm_distribution_requests enable row level security;
revoke all on public.bm_configuration,public.bm_offers,public.bm_distribution_requests from public,anon,authenticated;
grant all on public.bm_configuration,public.bm_offers,public.bm_distribution_requests to service_role;
create trigger bm_distribution_immutable before update or delete on public.bm_distribution_requests for each row execute function public.bm_audit_immutable();
create trigger bm_offers_immutable before update or delete on public.bm_offers for each row execute function public.bm_audit_immutable();

create function public.bm_queue_distribution(p_owner uuid,p_deal uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d bm_deals; e bm_entitlements; a bm_analyses; policy bm_fee_policies; b bm_buyers;
 cfg bm_configuration; exposure uuid; request_id uuid; n integer:=0; accepted jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into d from bm_deals where id=p_deal and owner_id=p_owner for update;
 if not found then raise exception 'Deal not found'; end if;
 select id into request_id from bm_distribution_requests where owner_id=p_owner and operation_key=p_key and deal_id=p_deal;
 if found then return jsonb_build_object('requestId',request_id,'status','queued','sent',false); end if;
 select * into cfg from bm_configuration where id=true;
 if not (cfg.distribution_enabled and cfg.provider_verified and cfg.permissions_verified and cfg.agreements_verified) then raise exception 'Distribution disabled'; end if;
 if d.status<>'approved_for_distribution' or not d.contract_verified or not d.admin_approved or d.contract_key is null then raise exception 'Contract review required'; end if;
 if not exists(select 1 from storage.objects where bucket_id='buyermatch-private' and name=d.contract_key) then raise exception 'Private PSA missing'; end if;
 if (d.title->>'eoc')::date<=current_date or d.title->>'eoc' is null then raise exception 'Future EOC required'; end if;
 if coalesce(d.title->>'company','')='' or coalesce(d.title->>'name','')='' or coalesce(d.title->>'email','')='' or coalesce(d.title->>'phone','')='' then raise exception 'Title contact required'; end if;
 select * into e from bm_entitlements where owner_id=p_owner and product='network' and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'Network entitlement required'; end if;
 if (select count(*) from bm_distribution_requests where owner_id=p_owner and created_at>=e.period_start)>=e.allowance then raise exception 'Network allowance exhausted'; end if;
 -- All accepted document versions must still be current at first exposure.
 if exists(select required.kind from (values('network'),('fee_schedule'),('deal_certification')) required(kind)
 where not exists(select 1 from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id
 where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.kind=required.kind and doc.current and doc.approved
 and ac.document_hash=doc.document_hash and ac.version=doc.version)) then raise exception 'Current agreements and deal certification required'; end if;
 select jsonb_agg(jsonb_build_object('id',ac.id,'kind',doc.kind,'hash',ac.document_hash,'version',ac.version,'acceptedAt',ac.accepted_at)) into accepted
 from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.current and doc.approved;
 select * into policy from bm_fee_policies where state=d.property->>'state' and plan_version=e.plan_version and approved and document_id in (select ac.document_id from bm_acceptances ac join bm_documents doc on doc.id=ac.document_id where ac.owner_id=p_owner and ac.deal_id=p_deal and doc.kind='fee_schedule' and doc.approved and doc.current and ac.document_hash=doc.document_hash) order by created_at desc limit 1;
 if not found then raise exception 'Approved jurisdiction policy required'; end if;
 if policy.enabled and not cfg.success_fees_enabled then raise exception 'Success fees disabled'; end if;
 select * into a from bm_analyses where deal_id=p_deal order by created_at desc limit 1;
 if not found or a.created_at<d.updated_at or a.created_at<now()-interval '24 hours' then raise exception 'Fresh analysis required'; end if;
 insert into bm_distribution_requests(owner_id,deal_id,operation_key) values(p_owner,p_deal,p_key) returning id into request_id;
 for b in select buyer.* from bm_buyers buyer join jsonb_array_elements(a.private_result->'matches') m on buyer.id::text=m->>'buyerId'
 where (m->>'eligible')::boolean and buyer.status='active' and buyer.opted_out_at is null and coalesce(buyer.consent_evidence,'')<>'' loop
 insert into bm_exposures(deal_id,buyer_id,owner_id,operation_key,frozen_terms) values(p_deal,b.id,p_owner,p_key,
 jsonb_build_object('policy',to_jsonb(policy),'acceptances',accepted,'criteria',b.criteria,'consentEvidence',b.consent_evidence,'analysisId',a.id,'title',d.title,'property',d.property)) returning id into exposure;
 insert into bm_outbox(exposure_id,state) values(exposure,'pending'); n:=n+1;
 end loop;
 if n=0 then raise exception 'No consented recipients'; end if;
 update bm_deals set status='distributing' where id=p_deal;
 insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_owner,'distribution_queued','Distribution queued for processing. Delivery is not yet confirmed.');
 return jsonb_build_object('requestId',request_id,'status','queued','sent',false);
end $$;
revoke all on function public.bm_queue_distribution(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bm_queue_distribution(uuid,uuid,uuid) to service_role;

-- Atomic admin progress changes: identities/evidence remain private; timeline notes are allowlisted.
create function public.bm_admin_progress(p_actor uuid,p_deal uuid,p_kind text,p_evidence jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare d bm_deals; c bm_closings; ex bm_exposures; next_status text; note text;
begin
 select * into d from bm_deals where id=p_deal for update;
 if not found then raise exception 'Deal not found'; end if;
 if d.status in ('canceled','expired') then raise exception 'Terminal deal cannot advance'; end if;
 if d.status='closed' and p_kind not in ('fee_due','fee_paid','title_acknowledged') then raise exception 'Verified closing cannot regress'; end if;
 select * into c from bm_closings where deal_id=p_deal;
 if p_kind in ('buyer_interest','offer_received','buyer_selected') then
  select * into ex from bm_exposures where id=(p_evidence->>'exposureId')::uuid and deal_id=p_deal;
  if not found or not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then raise exception 'Actual exposure required'; end if;
 end if;
 if p_kind='buyer_interest' then
  if p_evidence->>'signal' not in ('reply','inquiry','showing_request') then raise exception 'Genuine interest signal required'; end if;
  next_status:=case when d.status in ('distributing','buyer_interest') then 'buyer_interest' else d.status end; note:='A network buyer expressed interest.';
 elsif p_kind='offer_received' then
  insert into bm_offers(deal_id,exposure_id,amount_cents,terms) values(p_deal,ex.id,(p_evidence->>'amountCents')::bigint,p_evidence->>'terms');
  next_status:=case when d.status in ('distributing','buyer_interest','offer_received') then 'offer_received' else d.status end; note:='An offer was received from a network buyer.';
 elsif p_kind='buyer_selected' then
  insert into bm_closings(deal_id,selected_exposure_id) values(p_deal,ex.id) on conflict(deal_id) do update set selected_exposure_id=excluded.selected_exposure_id,user_signed_at=null,title_acknowledged_at=null,scheduled_date=null,settlement_key=null,verified_at=null,fee_due_cents=null,paid_at=null,payment_reference=null;
  next_status:='buyer_selected'; note:='Buyer selected. Closing fee authorization and title acknowledgement are separate steps.';
 elsif p_kind='title_open' then
  if c.selected_exposure_id is null then raise exception 'Select a buyer first'; end if;
  next_status:='title_open'; note:='Title opened.';
 elsif p_kind='closing_scheduled' then
  if c.selected_exposure_id is null then raise exception 'Select a buyer first'; end if;
  update bm_closings set scheduled_date=(p_evidence->>'date')::date where deal_id=p_deal;
  next_status:='closing_scheduled'; note:='Closing scheduled.';
 elsif p_kind='title_acknowledged' then
  if c.user_signed_at is null or coalesce(p_evidence->>'reference','')='' then raise exception 'User signature and title evidence required'; end if;
  update bm_closings set title_acknowledged_at=now() where deal_id=p_deal; note:='Title acknowledged the closing authorization.';
 elsif p_kind='closing_verified' then
  if c.selected_exposure_id is null or not exists(select 1 from storage.objects where bucket_id='buyermatch-private' and name=p_evidence->>'settlementKey' and name like d.owner_id::text||'/'||d.id::text||'/%') then raise exception 'Private settlement evidence and selected buyer required'; end if;
  update bm_closings set verified_at=now(),settlement_key=p_evidence->>'settlementKey' where deal_id=p_deal;
  next_status:='closed'; note:='Closing verified against settlement evidence.';
 elsif p_kind='fee_due' then
  if not (select success_fees_enabled from bm_configuration where id) or c.verified_at is null or c.user_signed_at is null or c.title_acknowledged_at is null then raise exception 'Verified settlement, signature, title acknowledgement and enabled fees required'; end if;
  if (p_evidence->>'amountCents')::bigint<0 then raise exception 'Invalid amount'; end if;
  update bm_closings set fee_due_cents=(p_evidence->>'amountCents')::bigint where deal_id=p_deal; note:='Settlement fee reconciled.';
 elsif p_kind='fee_paid' then
  if c.fee_due_cents is null or c.verified_at is null or coalesce(p_evidence->>'reference','')='' then raise exception 'Fee due and actual payment evidence required'; end if;
  update bm_closings set paid_at=now(),payment_reference=p_evidence->>'reference' where deal_id=p_deal; note:='Fee payment verified.';
 elsif p_kind='canceled' then next_status:='canceled'; note:='Deal canceled. Attribution history retained.';
 elsif p_kind='expired' then
  if (d.title->>'eoc')::date>current_date or d.title->>'eoc' is null then raise exception 'Contract not expired'; end if;
  next_status:='expired'; note:='Contract expired.';
 else raise exception 'Unsupported progress event'; end if;
 if next_status is not null then update bm_deals set status=next_status where id=p_deal; end if;
 insert into bm_events(deal_id,actor_id,kind,public_note,evidence) values(p_deal,p_actor,p_kind,note,p_evidence);
end $$;
revoke all on function public.bm_admin_progress(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.bm_admin_progress(uuid,uuid,text,jsonb) to service_role;
commit;
