-- Additive conversion evidence attached to existing BuyerMatch transactions.
-- No historical backfill, buyer identity access, billing or distribution change.
begin;
create table public.bm_conversion_events (
 id uuid primary key default gen_random_uuid(), ordinal bigint generated always as identity unique, owner_id uuid not null references auth.users(id),
 deal_id uuid not null references public.bm_deals(id), actor_id uuid not null references auth.users(id),
 operation_key uuid not null, kind text not null check(kind in ('identity','inventory_verified','interested','written_offer','offer_status','emd_pending','emd_confirmed','emd_failed','closing_scheduled','closed','lost','stalled','withdrawn','canceled','reopened','fee_projected','fee_invoiced','fee_received','fee_refunded','void')),
 occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 evidence_ref text not null check(length(evidence_ref) between 2 and 80 and evidence_ref ~ '^[A-Za-z0-9][A-Za-z0-9._-]+$'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8192),
 unique(owner_id,operation_key)
);
create index bm_conversion_event_owner_deal on public.bm_conversion_events(owner_id,deal_id,occurred_at,id);
alter table public.bm_conversion_events add constraint bm_conversion_money_evidence check (
 case when kind in ('written_offer','emd_confirmed','closed','fee_projected','fee_invoiced','fee_received','fee_refunded')
 then coalesce(jsonb_typeof(payload->'amountCents')='number' and (payload->>'amountCents')::numeric>0,false) else true end
);
alter table public.bm_conversion_events add constraint bm_conversion_confirmed_evidence check (
 kind not in ('inventory_verified','written_offer','emd_confirmed','closed','fee_received','fee_refunded') or coalesce(payload->'confirmed'='true'::jsonb,false)
);
create unique index bm_conversion_receipt_once on public.bm_conversion_events(owner_id,kind,evidence_ref)
 where kind in ('written_offer','emd_confirmed','fee_received','fee_refunded','fee_invoiced');
create table public.bm_conversion_merge_reviews (
 id uuid primary key default gen_random_uuid(), ordinal bigint generated always as identity unique, owner_id uuid not null references auth.users(id),
 source_deal_id uuid not null references public.bm_deals(id), target_deal_id uuid references public.bm_deals(id),
 actor_id uuid not null references auth.users(id), operation_key uuid not null,
 reason text not null check(reason in ('same_submission','duplicate_contract','separate_transactions','incorrect_merge')),
 created_at timestamptz not null default now(), unique(owner_id,operation_key), check(source_deal_id is distinct from target_deal_id)
);
create index bm_conversion_review_owner on public.bm_conversion_merge_reviews(owner_id,source_deal_id,created_at desc);
create trigger bm_conversion_events_immutable before update or delete on public.bm_conversion_events for each row execute function public.bm_audit_immutable();
create trigger bm_conversion_merges_immutable before update or delete on public.bm_conversion_merge_reviews for each row execute function public.bm_audit_immutable();
alter table public.bm_conversion_events enable row level security;
alter table public.bm_conversion_merge_reviews enable row level security;
revoke all on public.bm_conversion_events,public.bm_conversion_merge_reviews from public,anon,authenticated;
revoke all on public.bm_conversion_events,public.bm_conversion_merge_reviews from service_role;
grant select,insert on public.bm_conversion_events,public.bm_conversion_merge_reviews to service_role;

create function public.bm_conversion_record(p_owner uuid,p_deal uuid,p_key uuid,p_kind text,p_at timestamptz,p_evidence text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare previous public.bm_conversion_events; target public.bm_conversion_events;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,29));
 if p_owner is null or p_key is null or not exists(select 1 from public.bm_deals where id=p_deal and owner_id=p_owner) then raise exception 'Owned deal required'; end if;
 if p_at is null or p_at<'2000-01-01' or p_at>now()+interval '1 minute' then raise exception 'Invalid occurrence time'; end if;
 select * into previous from public.bm_conversion_events where owner_id=p_owner and operation_key=p_key;
 if found then
  if previous.deal_id<>p_deal or previous.kind<>p_kind or previous.occurred_at<>p_at or previous.evidence_ref<>p_evidence or previous.payload<>p_payload then raise exception 'Operation key conflict'; end if;
  return jsonb_build_object('id',previous.id,'replayed',true);
 end if;
 if p_payload ? 'amountCents' and ((p_payload->>'amountCents')::numeric<0 or (p_payload->>'amountCents')::numeric>1000000000000 or (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric)) then raise exception 'Invalid amount'; end if;
 if p_kind='void' then
  select * into target from public.bm_conversion_events where id=(p_payload->>'eventId')::uuid and owner_id=p_owner and deal_id=p_deal;
  if not found or target.kind in ('void','identity') or exists(select 1 from public.bm_conversion_events where kind='void' and payload->>'eventId'=target.id::text) then raise exception 'Invalid correction'; end if;
 end if;
 if p_kind='identity' and exists(select 1 from (select distinct on(source_deal_id) * from public.bm_conversion_merge_reviews where owner_id=p_owner order by source_deal_id,ordinal desc) x where x.target_deal_id is not null and p_deal in(x.source_deal_id,x.target_deal_id)) then raise exception 'Unmerge before changing transaction identity'; end if;
 insert into public.bm_conversion_events(owner_id,actor_id,deal_id,operation_key,kind,occurred_at,evidence_ref,payload)
 values(p_owner,p_owner,p_deal,p_key,p_kind,p_at,p_evidence,p_payload) returning * into previous;
 return jsonb_build_object('id',previous.id,'replayed',false);
end $$;

create function public.bm_conversion_review(p_owner uuid,p_source uuid,p_target uuid,p_key uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a jsonb; b jsonb; previous public.bm_conversion_merge_reviews;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,29));
 if p_owner is null or p_key is null or not exists(select 1 from public.bm_deals where id=p_source and owner_id=p_owner) or
  (p_target is not null and not exists(select 1 from public.bm_deals where id=p_target and owner_id=p_owner)) then raise exception 'Owned deals required'; end if;
 select * into previous from public.bm_conversion_merge_reviews where owner_id=p_owner and operation_key=p_key;
 if found then
  if previous.source_deal_id<>p_source or previous.target_deal_id is distinct from p_target or previous.reason<>p_reason then raise exception 'Operation key conflict'; end if;
  return jsonb_build_object('id',previous.id,'replayed',true);
 end if;
 if p_target is not null then
  if p_source=p_target or p_reason not in ('same_submission','duplicate_contract') then raise exception 'Invalid merge'; end if;
  select payload into a from public.bm_conversion_events where owner_id=p_owner and deal_id=p_source and kind='identity' order by ordinal desc limit 1;
  select payload into b from public.bm_conversion_events where owner_id=p_owner and deal_id=p_target and kind='identity' order by ordinal desc limit 1;
  perform 1 from public.bm_deals where id in(p_source,p_target) order by id for update;
  if a is null or b is null then raise exception 'Distinct or unverified transaction identities'; end if;
  if a->'propertySnapshot' is distinct from (select property from public.bm_deals where id=p_source) or b->'propertySnapshot' is distinct from (select property from public.bm_deals where id=p_target) then raise exception 'Property changed since identity review'; end if;
  if a is null or b is null or exists(select 1 from unnest(array['propertyKey','unit','contractRef','interestRef','transactionRef']) k where coalesce(a->>k,'')='' or a->>k is distinct from b->>k) then raise exception 'Distinct or unverified transaction identities'; end if;
  if exists(select 1 from (select distinct on(source_deal_id) * from public.bm_conversion_merge_reviews where owner_id=p_owner order by source_deal_id,ordinal desc) x where x.target_deal_id is not null and (x.source_deal_id in(p_source,p_target) or x.target_deal_id=p_source)) then raise exception 'Merge chain or existing link rejected'; end if;
 else
  if p_reason not in ('separate_transactions','incorrect_merge') then raise exception 'Unmerge reason required'; end if;
 end if;
 insert into public.bm_conversion_merge_reviews(owner_id,source_deal_id,target_deal_id,actor_id,operation_key,reason)
 values(p_owner,p_source,p_target,p_owner,p_key,p_reason) returning * into previous;
 return jsonb_build_object('id',previous.id,'replayed',false);
end $$;

create function public.bm_conversion_property_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.property is distinct from old.property and exists(select 1 from (select distinct on(source_deal_id) * from public.bm_conversion_merge_reviews where owner_id=old.owner_id order by source_deal_id,ordinal desc) x where x.target_deal_id is not null and old.id in(x.source_deal_id,x.target_deal_id)) then raise exception 'Unmerge before editing associated property'; end if;
 return new;
end $$;
create trigger bm_conversion_property_guard before update of property on public.bm_deals for each row execute function public.bm_conversion_property_guard();
revoke all on function public.bm_conversion_property_guard() from public,anon,authenticated;
grant execute on function public.bm_conversion_property_guard() to service_role;

create function public.bm_conversion_snapshot(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if p_owner is null then raise exception 'Owner required'; end if;
 if (select count(*) from public.bm_deals where owner_id=p_owner)>5000 then raise exception 'Conversion cohort exceeds 5000 transactions; an explicit paginated report is required'; end if;
 select jsonb_build_object(
 'deals',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'property',d.property,'created_at',d.created_at,'contract_verified',d.contract_verified,'admin_approved',d.admin_approved)) from public.bm_deals d where d.owner_id=p_owner),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.ordinal) from public.bm_conversion_events e where e.owner_id=p_owner),'[]'),
 'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.ordinal) from public.bm_conversion_merge_reviews r where r.owner_id=p_owner),'[]'),
 'analyses',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'deal_id',a.deal_id,'at',a.created_at,'eligible',a.public_result->'totalMatches','version',a.public_result->'engineVersion')) from public.bm_analyses a where a.owner_id=p_owner and exists(select 1 from public.bm_deals d where d.id=a.deal_id and d.owner_id=p_owner)),'[]'),
 'workflow',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'deal_id',e.deal_id,'kind',e.kind,'at',e.created_at,'ref',case when x.id is not null then 'B-'||substr(encode(sha256(convert_to(p_owner::text||x.buyer_id::text,'UTF8')),'hex'),1,12) end)) from public.bm_events e join public.bm_deals d on d.id=e.deal_id left join public.bm_exposures x on x.id::text=e.evidence->>'exposureId' and x.deal_id=e.deal_id and x.owner_id=p_owner where d.owner_id=p_owner and e.kind in ('admin_review','buyer_interest','canceled','expired')),'[]'),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'deal_id',o.deal_id,'amountCents',o.amount_cents,'at',o.created_at,'ref','B-'||substr(encode(sha256(convert_to(p_owner::text||x.buyer_id::text,'UTF8')),'hex'),1,12))) from public.bm_offers o join public.bm_deals d on d.id=o.deal_id join public.bm_exposures x on x.id=o.exposure_id and x.deal_id=o.deal_id where d.owner_id=p_owner and x.owner_id=p_owner),'[]'),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('deal_id',x.deal_id,'ref','B-'||substr(encode(sha256(convert_to(p_owner::text||x.buyer_id::text,'UTF8')),'hex'),1,12),'delivered_at',o.delivered_at,'accepted_at',o.accepted_at)) from public.bm_exposures x left join public.bm_outbox o on o.exposure_id=x.id where x.owner_id=p_owner and exists(select 1 from public.bm_deals d where d.id=x.deal_id and d.owner_id=p_owner)),'[]'),
 'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'deal_id',x.deal_id,'kind',r.kind,'at',r.created_at,'ref','B-'||substr(encode(sha256(convert_to(p_owner::text||x.buyer_id::text,'UTF8')),'hex'),1,12))) from public.bm_responses r join public.bm_exposures x on x.id=r.exposure_id join public.bm_deals d on d.id=x.deal_id where x.owner_id=p_owner and d.owner_id=p_owner),'[]'),
 'closings',coalesce((select jsonb_agg(jsonb_build_object('deal_id',c.deal_id,'scheduled_date',c.scheduled_date,'verified_at',c.verified_at,'paid_at',c.paid_at,'fee_due_cents',c.fee_due_cents,'payment_recorded',c.payment_reference is not null)) from public.bm_closings c join public.bm_deals d on d.id=c.deal_id where d.owner_id=p_owner),'[]')
 ) into result;
 if octet_length(result::text)>8000000 then raise exception 'Report too large; export/pagination required'; end if;
 return result;
end $$;
revoke all on function public.bm_conversion_record(uuid,uuid,uuid,text,timestamptz,text,jsonb),public.bm_conversion_review(uuid,uuid,uuid,uuid,text),public.bm_conversion_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.bm_conversion_record(uuid,uuid,uuid,text,timestamptz,text,jsonb),public.bm_conversion_review(uuid,uuid,uuid,uuid,text),public.bm_conversion_snapshot(uuid) to service_role;
commit;
