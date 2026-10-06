-- Additive BuyerMatch conversation layer. Buyer identities remain private.
begin;

create table if not exists public.bm_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.bm_deals(id) on delete cascade,
  exposure_id uuid references public.bm_exposures(id) on delete set null,
  sender_kind text not null check (sender_kind in ('owner','buyer','admin','system')),
  sender_user_id uuid,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists bm_messages_deal_created_idx on public.bm_messages(deal_id, created_at);
create index if not exists bm_messages_exposure_created_idx on public.bm_messages(exposure_id, created_at);

alter table public.bm_messages enable row level security;
revoke all on table public.bm_messages from public, anon, authenticated;
grant all on table public.bm_messages to service_role;

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
  if d.status in ('closed','canceled','expired') then raise exception 'Deal unavailable'; end if;
  if not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then
    raise exception 'Exposure not accepted';
  end if;
  if not exists(
    select 1 from bm_responses
    where exposure_id=ex.id and kind in ('interested','offer')
  ) then
    raise exception 'Express interest before messaging';
  end if;
  if exists(select 1 from bm_events where deal_id=d.id and evidence->>'messageOperationKey'=p_key::text) then
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

commit;
