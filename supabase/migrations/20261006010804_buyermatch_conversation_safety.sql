begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.bm_buyer_message_scoped(
  p_hash text,
  p_key uuid,
  p_body text,
  p_environment text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  token bm_response_tokens;
  ex bm_exposures;
  d bm_deals;
begin
  if char_length(btrim(coalesce(p_body,''))) < 1 or char_length(p_body) > 2000 then
    raise exception 'Invalid message';
  end if;

  select * into token
  from bm_response_tokens
  where token_hash=p_hash and revoked_at is null and expires_at>now()
  for update;

  if not found or token.expires_at<=clock_timestamp() or p_environment is null or token.environment<>p_environment then
    raise exception 'Response link unavailable';
  end if;

  select * into ex from bm_exposures where id=token.exposure_id;
  select * into d from bm_deals where id=ex.deal_id for update;

  if d.owner_id is distinct from ex.owner_id then raise exception 'Scope unavailable'; end if;
  perform 1 from bm_buyers where id=ex.buyer_id for update;
  if not ('interested'=any(token.allowed_actions) or 'offer'=any(token.allowed_actions)) then raise exception 'Message capability unavailable'; end if;
  if p_environment='production' and exists(select 1 from bm_buyers where id=ex.buyer_id and synthetic) then raise exception 'Test capability unavailable';end if;
  if d.status in ('closed','canceled','expired') or (d.title->>'eoc')::date<=current_date
    or exists(select 1 from bm_buyers where id=ex.buyer_id and (opted_out_at is not null or status='suppressed'))
  then raise exception 'Deal unavailable'; end if;
  if not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then
    raise exception 'Exposure not accepted';
  end if;
  if not exists(
    select 1 from bm_responses
    where exposure_id=ex.id and kind in ('interested','offer')
  ) then
    raise exception 'Express interest before messaging';
  end if;
  if exists(select 1 from bm_events where deal_id=d.id and evidence->>'exposureId'=ex.id::text and evidence->>'messageOperationKey'=p_key::text) then
    return '{"recorded":true}'::jsonb;
  end if;
  if (select count(*) from bm_messages where exposure_id=ex.id and sender_kind='buyer' and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Message limit reached';
  end if;

  insert into bm_messages(deal_id,exposure_id,sender_kind,body)
  values(d.id,ex.id,'buyer',btrim(p_body));

  insert into bm_events(deal_id,actor_id,kind,public_note,evidence)
  values(
    d.id,
    ex.owner_id,
    'buyer_message',
    'A network buyer sent a message.',
    jsonb_build_object('exposureId',ex.id,'source','buyer_response','messageOperationKey',p_key::text)
  );

  update bm_buyers set last_active_at=now() where id=ex.buyer_id;
  return '{"recorded":true}'::jsonb;
end $$;

revoke all on function public.bm_buyer_message_scoped(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.bm_buyer_message_scoped(text,uuid,text,text) to service_role;

create function public.bm_owner_message(p_owner uuid,p_deal uuid,p_exposure uuid,p_key uuid,p_body text)
returns void language plpgsql security definer set search_path=public as $$
declare d bm_deals;
begin
 select * into d from bm_deals where id=p_deal and owner_id=p_owner for update;
 if not found or d.status in ('closed','canceled','expired') or (d.title->>'eoc')::date<=current_date then raise exception 'Deal unavailable';end if;
 if p_key is null or char_length(btrim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Invalid message';end if;
 if not exists(select 1 from bm_exposures ex join bm_buyers b on b.id=ex.buyer_id
   where ex.id=p_exposure and ex.deal_id=d.id and ex.owner_id=p_owner and b.opted_out_at is null and b.status<>'suppressed'
   and exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null)
   and exists(select 1 from bm_responses where exposure_id=ex.id and kind in ('interested','offer')))
 then raise exception 'Conversation unavailable';end if;
 if exists(select 1 from bm_events where deal_id=d.id and actor_id=p_owner and kind='message_sent'
   and evidence->>'messageOperationKey'=p_key::text) then return;end if;
 if (select count(*) from bm_messages where deal_id=d.id and sender_user_id=p_owner and created_at>now()-interval '1 hour')>=20 then raise exception 'Message limit reached';end if;
 insert into bm_messages(deal_id,exposure_id,sender_kind,sender_user_id,body) values(d.id,p_exposure,'owner',p_owner,btrim(p_body));
 insert into bm_events(deal_id,actor_id,kind,public_note,evidence) values(d.id,p_owner,'message_sent','A private conversation message was sent.',jsonb_build_object('exposureId',p_exposure,'messageOperationKey',p_key));
end $$;
revoke all on function public.bm_owner_message(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.bm_owner_message(uuid,uuid,uuid,uuid,text) to service_role;

create function public.bm_create_draft(p_owner uuid,p_property jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare found_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if nullif(p_property->>'sourceSubmissionId','') is not null then
   select id into found_id from bm_deals where owner_id=p_owner and property->>'sourceSubmissionId'=p_property->>'sourceSubmissionId' order by created_at limit 1;
   if found_id is not null then return found_id;end if;
 end if;
 insert into bm_deals(owner_id,property) values(p_owner,p_property) returning id into found_id;
 return found_id;
end $$;
revoke all on function public.bm_create_draft(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bm_create_draft(uuid,jsonb) to service_role;
create function public.bm_buyer_conversation(p_hash text,p_environment text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t bm_response_tokens; ex bm_exposures; d bm_deals;
begin
 select * into t from bm_response_tokens where token_hash=p_hash and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found or t.environment is distinct from p_environment or not(t.allowed_actions && array['interested','offer']) then raise exception 'Link unavailable';end if;
 select * into ex from bm_exposures where id=t.exposure_id;
 select * into d from bm_deals where id=ex.deal_id for update;
 if d.owner_id is distinct from ex.owner_id or d.status in ('closed','canceled','expired') or (d.title->>'eoc')::date<=current_date then raise exception 'Deal unavailable';end if;
 perform 1 from bm_buyers where id=ex.buyer_id for update;
 if exists(select 1 from bm_buyers where id=ex.buyer_id and (opted_out_at is not null or status='suppressed' or (p_environment='production' and synthetic))) then raise exception 'Buyer unavailable';end if;
 if not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then raise exception 'Exposure unavailable';end if;
 return jsonb_build_object('address',d.property->>'address','city',d.property->>'city','state',d.property->>'state',
 'messages',coalesce((select jsonb_agg(jsonb_build_object('sender',sender_kind,'body',body,'createdAt',created_at) order by created_at)
 from (select sender_kind,body,created_at from bm_messages where exposure_id=ex.id and deal_id=d.id order by created_at desc limit 100) m),'[]'::jsonb));
end $$;
revoke all on function public.bm_buyer_conversation(text,text) from public,anon,authenticated;
grant execute on function public.bm_buyer_conversation(text,text) to service_role;
commit;

