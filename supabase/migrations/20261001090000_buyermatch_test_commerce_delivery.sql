begin;
alter table public.bm_configuration add constraint bm_fees_remain_disabled check (success_fees_enabled=false);
alter table public.bm_buyers add column merged_into uuid references public.bm_buyers(id);
alter table public.bm_buyers add column synthetic boolean not null default false;
create table public.bm_duplicate_reviews(id uuid primary key default gen_random_uuid(),source_id uuid not null references public.bm_buyers(id),target_id uuid not null references public.bm_buyers(id),decision text not null check(decision in ('merge','distinct')),actor_id uuid not null,note text not null,created_at timestamptz not null default now(),check(source_id<>target_id));
create table public.bm_checkouts(id uuid primary key default gen_random_uuid(),owner_id uuid not null,product text not null,plan_version text not null references public.bm_plans(version),operation_key uuid not null,email text not null,session_id text unique,session_url text,state text not null default 'pending',created_at timestamptz not null default now(),unique(owner_id,operation_key));
create unique index bm_pending_checkout on public.bm_checkouts(owner_id,product) where state='pending';
create table public.bm_response_tokens(token_hash text primary key,exposure_id uuid not null unique references public.bm_exposures(id),expires_at timestamptz not null,revoked_at timestamptz);
create table public.bm_responses(id uuid primary key default gen_random_uuid(),exposure_id uuid not null references public.bm_exposures(id),operation_key uuid not null,kind text not null,created_at timestamptz not null default now(),unique(exposure_id,operation_key));
create table public.bm_provider_events(event_id text primary key,outbox_id uuid not null references public.bm_outbox(id),kind text not null,occurred_at timestamptz not null,created_at timestamptz not null default now());
alter table public.bm_outbox add column first_attempt_at timestamptz;
alter table public.bm_outbox add column response_expires_at timestamptz;
alter table public.bm_outbox add column test_delivery boolean not null default true;
alter table public.bm_outbox add column last_error_code text;
do $$ declare t text; begin
 foreach t in array array['bm_duplicate_reviews','bm_checkouts','bm_response_tokens','bm_responses','bm_provider_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create trigger bm_reviews_immutable before update or delete on public.bm_duplicate_reviews for each row execute function public.bm_audit_immutable();
create trigger bm_responses_immutable before update or delete on public.bm_responses for each row execute function public.bm_audit_immutable();
create trigger bm_provider_immutable before update or delete on public.bm_provider_events for each row execute function public.bm_audit_immutable();
create function public.bm_begin_checkout(p_owner uuid,p_product text,p_version text,p_key uuid,p_email text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c bm_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,2));
 select * into c from bm_checkouts where owner_id=p_owner and operation_key=p_key;
 if found then if c.plan_version<>p_version then raise exception 'Checkout key conflict'; end if; return to_jsonb(c); end if;
 if exists(select 1 from bm_entitlements where owner_id=p_owner and product=p_product and stripe_subscription_id is not null) then raise exception 'Existing subscription must be managed through Stripe'; end if;
 select * into c from bm_checkouts where owner_id=p_owner and product=p_product and state='pending';
 if found then if c.plan_version<>p_version then raise exception 'Existing checkout requires reconciliation'; end if; return to_jsonb(c); end if;
 insert into bm_checkouts(owner_id,product,plan_version,operation_key,email) values(p_owner,p_product,p_version,p_key,p_email) returning * into c;
 return to_jsonb(c);
end $$;
create function public.bm_review_duplicate(p_actor uuid,p_source uuid,p_target uuid,p_decision text,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare s bm_buyers;t bm_buyers;
begin
 perform pg_advisory_xact_lock(741234);
 if p_source=p_target or length(trim(p_note))<3 then raise exception 'Distinct buyers and review note required'; end if;
 select * into s from bm_buyers where id=p_source for update; if not found or s.merged_into is not null then raise exception 'Source unavailable'; end if;
 select * into t from bm_buyers where id=p_target for update; if not found or t.merged_into is not null then raise exception 'Canonical buyer unavailable'; end if;
 if p_decision='merge' then
  if exists(select 1 from bm_exposures where buyer_id=p_source) then raise exception 'Exposed buyer requires manual attribution reconciliation'; end if;
  update bm_buyers set merged_into=p_target,status='inactive' where id=p_source or merged_into=p_source;
  if s.opted_out_at is not null then update bm_buyers set opted_out_at=coalesce(opted_out_at,s.opted_out_at),status='suppressed' where id=p_target; end if;
 elsif p_decision<>'distinct' then raise exception 'Invalid decision'; end if;
 insert into bm_duplicate_reviews(source_id,target_id,decision,actor_id,note) values(p_source,p_target,p_decision,p_actor,p_note);
end $$;
create or replace function public.bm_claim_outbox(p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o bm_outbox;ex bm_exposures;b bm_buyers;d bm_deals;cfg bm_configuration;
begin
 select * into cfg from bm_configuration where id;
 if not(cfg.distribution_enabled and cfg.provider_verified and cfg.permissions_verified and cfg.agreements_verified) then return null; end if;
 select * into o from bm_outbox where id=p_id for update skip locked;
 if not found or o.accepted_at is not null or o.state in ('suppressed','failed','reconciliation_required') or o.lease_until>now() then return null; end if;
 -- Resend idempotency expires after 24h: never blindly retry beyond the safe window.
 if o.first_attempt_at<now()-interval '23 hours' then update bm_outbox set state='reconciliation_required',last_error_code='idempotency_window_expired' where id=p_id;return null;end if;
 select * into ex from bm_exposures where id=o.exposure_id;
 select * into b from bm_buyers where id=ex.buyer_id;
 select * into d from bm_deals where id=ex.deal_id;
 if b.status<>'active' or b.merged_into is not null or b.opted_out_at is not null or coalesce(b.consent_evidence,'')='' or not d.contract_verified or not d.admin_approved or (d.title->>'eoc')::date<=current_date or d.title->>'eoc' is null or d.status in ('canceled','expired','closed') then update bm_outbox set state='suppressed' where id=p_id;return null;end if;
 update bm_outbox set state='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now()),response_expires_at=coalesce(response_expires_at,least(now()+interval '30 days',(d.title->>'eoc')::date+interval '1 day')) where id=p_id returning * into o;
 return jsonb_build_object('id',o.id,'exposureId',ex.id,'identityCiphertext',b.identity_ciphertext,'property',ex.frozen_terms->'property','synthetic',b.synthetic,'expiresAt',o.response_expires_at);
end $$;
create function public.bm_record_provider_event(p_event text,p_message text,p_kind text,p_at timestamptz) returns boolean language plpgsql security definer set search_path=public as $$
declare o bm_outbox;ex bm_exposures;
begin
 select * into o from bm_outbox where provider_message_id=p_message for update;
 if not found then return false;end if;
 if exists(select 1 from bm_provider_events where event_id=p_event) then return true;end if;
 select * into ex from bm_exposures where id=o.exposure_id;
 insert into bm_provider_events(event_id,outbox_id,kind,occurred_at) values(p_event,o.id,p_kind,p_at);
 if p_kind='email.delivered' then update bm_outbox set delivered_at=coalesce(delivered_at,p_at),state=case when state in ('bounced','complained','suppressed') then state else 'delivered' end where id=o.id;
 elsif p_kind in ('email.bounced','email.complained','email.suppressed') then
  update bm_outbox set state=case p_kind when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' else 'suppressed' end where id=o.id;
  update bm_buyers set status='suppressed',opted_out_at=coalesce(opted_out_at,p_at) where id=ex.buyer_id;
  update bm_outbox set state='suppressed' where exposure_id in(select id from bm_exposures where buyer_id=ex.buyer_id) and accepted_at is null;
 end if;
 -- Opens/clicks are delivery telemetry only, never buyer interest or recent activity.
 return true;
end $$;
create function public.bm_buyer_response(p_hash text,p_key uuid,p_kind text,p_amount bigint,p_terms text) returns jsonb language plpgsql security definer set search_path=public as $$
declare token bm_response_tokens;ex bm_exposures;d bm_deals;offer_id uuid;
begin
 select * into token from bm_response_tokens where token_hash=p_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Response link unavailable';end if;
 select * into ex from bm_exposures where id=token.exposure_id;
 select * into d from bm_deals where id=ex.deal_id for update;
 if not exists(select 1 from bm_outbox where exposure_id=ex.id and accepted_at is not null) then raise exception 'Exposure not accepted';end if;
 if exists(select 1 from bm_responses where exposure_id=ex.id and operation_key=p_key) then return '{"recorded":true}'::jsonb;end if;
 if p_kind not in ('interested','offer','declined','unsubscribe') then raise exception 'Invalid response';end if;
 if p_kind<>'unsubscribe' and (d.status in ('closed','canceled','expired') or (d.title->>'eoc')::date<=current_date or exists(select 1 from bm_buyers where id=ex.buyer_id and opted_out_at is not null)) then raise exception 'Deal unavailable';end if;
 if (select count(*) from bm_responses where exposure_id=ex.id and created_at>now()-interval '1 hour')>=10 then raise exception 'Response limit reached';end if;
 insert into bm_responses(exposure_id,operation_key,kind) values(ex.id,p_key,p_kind);
 if p_kind='unsubscribe' then
  update bm_buyers set opted_out_at=coalesce(opted_out_at,now()),status='suppressed' where id=ex.buyer_id;
  update bm_outbox set state='suppressed' where exposure_id in(select id from bm_exposures where buyer_id=ex.buyer_id) and accepted_at is null;
 elsif p_kind='offer' then
  if p_amount is null or p_amount<=0 or p_amount>100000000000000 or length(coalesce(p_terms,''))>2000 then raise exception 'Invalid offer';end if;
  insert into bm_offers(deal_id,exposure_id,amount_cents,terms) values(d.id,ex.id,p_amount,coalesce(p_terms,'')) returning id into offer_id;
 end if;
 if p_kind in ('interested','offer') then
  update bm_buyers set last_active_at=now() where id=ex.buyer_id;
  update bm_deals set status=case when p_kind='offer' then 'offer_received' when status='offer_received' then status else 'buyer_interest' end where id=d.id and status in ('distributing','buyer_interest','offer_received');
  insert into bm_events(deal_id,actor_id,kind,public_note,evidence) values(d.id,ex.owner_id,case when p_kind='offer' then 'offer_received' else 'buyer_interest' end,case when p_kind='offer' then 'A network buyer submitted an offer.' else 'A network buyer expressed interest.' end,jsonb_build_object('exposureId',ex.id,'source','buyer_response'));
 end if;
 return '{"recorded":true}'::jsonb;
end $$;
do $$ declare f text;begin
 foreach f in array array['bm_begin_checkout(uuid,text,text,uuid,text)','bm_review_duplicate(uuid,uuid,uuid,text,text)','bm_claim_outbox(uuid)','bm_record_provider_event(text,text,text,timestamptz)','bm_buyer_response(text,uuid,text,bigint,text)'] loop execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to service_role';end loop;
end $$;
create function public.bm_checkout_event(p_id uuid,p_owner uuid,p_session text,p_state text) returns void language plpgsql security definer set search_path=public as $$
declare c bm_checkouts;
begin
 select * into c from bm_checkouts where id=p_id and owner_id=p_owner for update;
 if not found or (c.session_id is not null and c.session_id<>p_session) or p_state not in ('completed','expired') then raise exception 'Checkout mapping unavailable';end if;
 update bm_checkouts set session_id=p_session,state=case when state='completed' then state else p_state end where id=c.id;
end $$;
create function public.bm_apply_test_billing(p_checkout uuid,p_event text,p_created bigint,p_owner uuid,p_product text,p_price text,p_subscription text,p_status text,p_start timestamptz,p_end timestamptz) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from bm_checkouts c join bm_plans p on p.version=c.plan_version where c.id=p_checkout and c.owner_id=p_owner and c.product=p_product and p.stripe_price_id=p_price) then raise exception 'Server checkout mapping required';end if;
 perform bm_apply_billing(p_event,p_created,p_owner,p_product,p_price,p_subscription,p_status,p_start,p_end);
end $$;
revoke all on function public.bm_checkout_event(uuid,uuid,text,text),public.bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.bm_checkout_event(uuid,uuid,text,text),public.bm_apply_test_billing(uuid,text,bigint,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;

-- Lock the same deal row as progress/distribution, closing read/write race windows.
create function public.bm_edit_deal(p_owner uuid,p_deal uuid,p_kind text,p_value jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare d bm_deals;
begin
 select * into d from bm_deals where id=p_deal and owner_id=p_owner for update;
 if not found then raise exception 'Deal not found';end if;
 if d.status in ('closed','canceled','expired') then raise exception 'Terminal deal cannot be edited';end if;
 if p_kind='property' then
  if d.status not in ('draft','analyzed') then raise exception 'Property locked after review';end if;
  update bm_deals set property=p_value,status='draft',contract_verified=false,admin_approved=false,updated_at=now() where id=p_deal;
 elsif p_kind='contract' then
  if d.status not in ('draft','analyzed','ready_for_review') or coalesce(p_value->>'key','') not like p_owner::text||'/'||p_deal::text||'/%' then raise exception 'Contract locked or invalid path';end if;
  update bm_deals set contract_key=p_value->>'key',contract_verified=false,admin_approved=false,updated_at=now() where id=p_deal;
 elsif p_kind='title' then
  update bm_deals set title=p_value,contract_verified=false,admin_approved=false,updated_at=now() where id=p_deal;
  insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_owner,'title_updated','Title information and EOC updated to '||(p_value->>'eoc')||'.');
 else raise exception 'Invalid edit';end if;
end $$;
create function public.bm_review_contract(p_actor uuid,p_deal uuid,p_contract text,p_title jsonb,p_property jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare d bm_deals;
begin
 select * into d from bm_deals where id=p_deal for update;
 if not found or d.status in ('closed','canceled','expired') then raise exception 'Deal unavailable for review';end if;
 if d.contract_key is distinct from p_contract or d.title is distinct from p_title or d.property is distinct from p_property then raise exception 'Deal changed; review current evidence';end if;
 if p_contract is null or d.title->>'eoc' is null or (d.title->>'eoc')::date<=current_date or not exists(select 1 from storage.objects where bucket_id='buyermatch-private' and name=p_contract and name like d.owner_id::text||'/'||d.id::text||'/%') then raise exception 'Uploaded PSA and future EOC required';end if;
 update bm_deals set contract_verified=true,admin_approved=true,status=case when status in ('draft','analyzed','ready_for_review') then 'approved_for_distribution' else status end,updated_at=now() where id=p_deal;
 insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_actor,'admin_review','Contract control reviewed by network administrator.');
end $$;
revoke all on function public.bm_edit_deal(uuid,uuid,text,jsonb),public.bm_review_contract(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bm_edit_deal(uuid,uuid,text,jsonb),public.bm_review_contract(uuid,uuid,text,jsonb,jsonb) to service_role;
commit;
