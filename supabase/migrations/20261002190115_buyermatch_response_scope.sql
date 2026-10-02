-- Token hashes reference immutable exposures binding deal, buyer and owner.
-- Existing capabilities remain staging-only; none are promoted to Production.
alter table public.bm_response_tokens
 add column capability_id uuid not null default gen_random_uuid() unique,
 add column environment text not null default 'staging' check(environment in ('staging','production')),
 add column allowed_actions text[] not null default array['interested','offer','declined','unsubscribe']
 check(cardinality(allowed_actions)>0 and allowed_actions <@ array['interested','offer','declined','unsubscribe']);
create function public.bm_capability_scope_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.token_hash,new.exposure_id,new.capability_id,new.environment,new.allowed_actions)
 is distinct from row(old.token_hash,old.exposure_id,old.capability_id,old.environment,old.allowed_actions)
 then raise exception 'Capability scope is immutable';end if;
 return new;
end $$;
create trigger bm_capability_scope_immutable before update on public.bm_response_tokens for each row execute function public.bm_capability_scope_immutable();
create function public.bm_buyer_response_scoped(p_hash text,p_key uuid,p_kind text,p_amount bigint,p_terms text,p_environment text) returns jsonb language plpgsql security definer set search_path=public as $$
declare token bm_response_tokens;ex bm_exposures;d bm_deals;offer_id uuid;
begin
 select * into token from bm_response_tokens where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
 if not found or token.expires_at<=clock_timestamp() or p_kind is null or p_environment is null or token.environment<>p_environment or not(p_kind=any(token.allowed_actions)) then raise exception 'Response link unavailable';end if;
 select * into ex from bm_exposures where id=token.exposure_id;
 select * into d from bm_deals where id=ex.deal_id for update;
 if d.owner_id is distinct from ex.owner_id then raise exception 'Scope unavailable';end if;
 perform 1 from bm_buyers where id=ex.buyer_id for update;
 if p_environment='production' and exists(select 1 from bm_buyers where id=ex.buyer_id and synthetic) then raise exception 'Test capability unavailable';end if;
 if not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then raise exception 'Exposure not accepted';end if;
 -- Semantic replay is checked under the lock, including legacy responses.
 if (p_kind='offer' and exists(select 1 from bm_offers where exposure_id=ex.id and amount_cents=p_amount and terms=btrim(coalesce(p_terms,''))))
 or (p_kind<>'offer' and exists(select 1 from bm_responses where exposure_id=ex.id and kind=p_kind)) then return '{"recorded":true}'::jsonb;end if;
 if exists(select 1 from bm_responses where exposure_id=ex.id and operation_key=p_key) then raise exception 'Response key conflict';end if;
 if p_kind not in ('interested','offer','declined','unsubscribe') then raise exception 'Invalid response';end if;
 if p_kind<>'unsubscribe' and (d.status in ('closed','canceled','expired') or (d.title->>'eoc')::date<=current_date or exists(select 1 from bm_buyers where id=ex.buyer_id and opted_out_at is not null)) then raise exception 'Deal unavailable';end if;
 if (select count(*) from bm_responses where exposure_id=ex.id and created_at>now()-interval '1 hour')>=10 then raise exception 'Response limit reached';end if;
 insert into bm_responses(exposure_id,operation_key,kind) values(ex.id,p_key,p_kind);
 if p_kind='unsubscribe' then
  update bm_buyers set opted_out_at=coalesce(opted_out_at,now()),status='suppressed' where id=ex.buyer_id;
  update bm_outbox set state='suppressed' where exposure_id in(select id from bm_exposures where buyer_id=ex.buyer_id) and accepted_at is null;
 elsif p_kind='offer' then
  if p_amount is null or p_amount<=0 or p_amount>100000000000000 or length(coalesce(p_terms,''))>2000 then raise exception 'Invalid offer';end if;
  insert into bm_offers(deal_id,exposure_id,amount_cents,terms) values(d.id,ex.id,p_amount,btrim(coalesce(p_terms,''))) returning id into offer_id;
 end if;
 if p_kind in ('interested','offer') then
  update bm_buyers set last_active_at=now() where id=ex.buyer_id;
  update bm_deals set status=case when p_kind='offer' then 'offer_received' when status='offer_received' then status else 'buyer_interest' end where id=d.id and status in ('distributing','buyer_interest','offer_received');
  insert into bm_events(deal_id,actor_id,kind,public_note,evidence) values(d.id,ex.owner_id,case when p_kind='offer' then 'offer_received' else 'buyer_interest' end,case when p_kind='offer' then 'A network buyer submitted an offer.' else 'A network buyer expressed interest.' end,jsonb_build_object('exposureId',ex.id,'source','buyer_response'));
 end if;
 return '{"recorded":true}'::jsonb;
end $$;

revoke all on function public.bm_buyer_response_scoped(text,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.bm_buyer_response_scoped(text,uuid,text,bigint,text,text) to service_role;
create or replace function public.bm_buyer_response(p_hash text,p_key uuid,p_kind text,p_amount bigint,p_terms text) returns jsonb language sql security definer set search_path=public as $$
 select bm_buyer_response_scoped(p_hash,p_key,p_kind,p_amount,p_terms,'staging');
$$;

