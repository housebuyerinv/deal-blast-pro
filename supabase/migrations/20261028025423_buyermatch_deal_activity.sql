-- Read-only, service-mediated subscriber outreach history. No buyer contacts or payloads.
begin;
create or replace function public.bm_deal_activity(p_owner uuid,p_deal uuid,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog, public as $$
declare result jsonb;
begin
 if p_owner is null or p_page is null or p_page<0 or p_page>100000 then
  raise exception 'Invalid activity request';
 end if;
 if not exists(select 1 from public.bm_deals where id=p_deal and owner_id=p_owner) then
  raise exception 'Deal not found';
 end if;
 with exposures as (
  select id,buyer_id from public.bm_exposures where deal_id=p_deal and owner_id=p_owner
 ), latest as (
  select distinct on(r.exposure_id) r.exposure_id,r.kind
  from public.bm_responses r join exposures e on e.id=r.exposure_id
  where r.kind in ('interested','declined','offer','unsubscribe') order by r.exposure_id,r.created_at desc,r.id desc
 ), history as (
  select r.id,r.kind,r.created_at,
   'BM-'||upper(substr(encode(sha256(convert_to(e.buyer_id::text,'UTF8')),'hex'),1,8)) as "buyerRef"
  from public.bm_responses r join exposures e on e.id=r.exposure_id
  order by r.created_at desc,r.id desc limit 21 offset p_page*20
 ), visible as (select * from history order by created_at desc,id desc limit 20)
 select jsonb_build_object(
  'page',p_page,'hasMore',(select count(*)>20 from history),
  'summary',jsonb_build_object(
   'reserved',(select count(*) from exposures),
   'accepted',(select count(*) from public.bm_outbox o join exposures e on e.id=o.exposure_id where o.accepted_at is not null),
   'delivered',(select count(*) from public.bm_outbox o join exposures e on e.id=o.exposure_id where o.delivered_at is not null),
   'pending',(select count(*) from public.bm_outbox o join exposures e on e.id=o.exposure_id where o.state in ('pending','processing')),
   'suppressed',(select count(*) from public.bm_outbox o join exposures e on e.id=o.exposure_id where o.state='suppressed'),
   'interests',(select count(*) from latest where kind='interested'),
   'offers',(select count(*) from latest where kind='offer'),
   'declines',(select count(*) from latest where kind='declined')),
  'history',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id desc) from visible v),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.bm_deal_activity(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.bm_deal_activity(uuid,uuid,integer) to service_role;
comment on function public.bm_deal_activity(uuid,uuid,integer) is 'Read-only owner-scoped activity, accessed through authenticated BuyerMatch API only';
commit;
