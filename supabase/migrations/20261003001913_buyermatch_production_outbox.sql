-- Disabled by default. This is not a Production enablement migration.
create table public.bm_production_delivery_config (
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.bm_production_delivery_config(id) values(true);
alter table public.bm_production_delivery_config enable row level security;
revoke all on public.bm_production_delivery_config from public,anon,authenticated;
grant all on public.bm_production_delivery_config to service_role;
alter table public.bm_outbox add column production_lease_id uuid;

create function public.bm_queue_production_distribution(p_owner uuid,p_deal uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from bm_production_delivery_config where id and enabled) then raise exception 'Production delivery disabled';end if;
 result:=bm_queue_distribution(p_owner,p_deal,p_key);
 if exists(select 1 from bm_exposures e join bm_buyers b on b.id=e.buyer_id where e.deal_id=p_deal and b.synthetic) then raise exception 'Synthetic production target';end if;
 return result;
end $$;

create function public.bm_claim_production_invitation(p_owner uuid,p_deal uuid,p_exposure uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare ex bm_exposures;d bm_deals;b bm_buyers;o bm_outbox;t bm_response_tokens;job jsonb;lease uuid;
begin
 if not exists(select 1 from bm_production_delivery_config where id and enabled) then raise exception 'Production delivery disabled';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid capability';end if;
 select * into ex from bm_exposures where id=p_exposure and owner_id=p_owner and deal_id=p_deal;
 if not found then raise exception 'Exposure unavailable';end if;
 select * into d from bm_deals where id=p_deal and owner_id=p_owner;
 if not found or d.status in ('closed','canceled','expired') then raise exception 'Deal unavailable';end if;
 if not exists(select 1 from bm_distribution_requests where deal_id=p_deal and owner_id=p_owner) then raise exception 'Authorized distribution required';end if;
 select * into b from bm_buyers where id=ex.buyer_id;
 if b.synthetic or b.opted_out_at is not null or b.status<>'active' or b.merged_into is not null then raise exception 'Buyer unavailable';end if;
 select * into t from bm_response_tokens where exposure_id=ex.id;
 if found and (t.revoked_at is not null or t.expires_at<=clock_timestamp() or t.environment<>'production' or t.token_hash<>p_hash) then raise exception 'Capability unavailable';end if;
 select * into o from bm_outbox where exposure_id=ex.id;
 if not found then raise exception 'Outbox unavailable';end if;
 job:=bm_claim_outbox(o.id);
 if job is null then return null;end if;
 insert into bm_response_tokens(token_hash,exposure_id,expires_at,environment)
 values(p_hash,ex.id,(job->>'expiresAt')::timestamptz,'production') on conflict(exposure_id) do nothing;
 -- Validate again under the newly inserted/existing token lock. Never un-revoke.
 select * into t from bm_response_tokens where exposure_id=ex.id for update;
 if t.token_hash<>p_hash or t.environment<>'production' or t.revoked_at is not null or t.expires_at<=clock_timestamp() then raise exception 'Capability unavailable';end if;
 lease:=gen_random_uuid();
 update bm_outbox set production_lease_id=lease,test_delivery=false where id=o.id;
 return job||jsonb_build_object('leaseId',lease);
end $$;

create function public.bm_finish_production_invitation(p_id uuid,p_lease uuid,p_message text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(p_message,'')='' or length(p_message)>300 then raise exception 'Provider receipt required';end if;
 update bm_outbox set accepted_at=now(),state='accepted',provider_message_id=p_message,lease_until=null,last_error_code=null
 where id=p_id and production_lease_id=p_lease and test_delivery=false and accepted_at is null and state='processing';
 return found;
end $$;
create function public.bm_retry_production_invitation(p_id uuid,p_lease uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update bm_outbox set state='pending',lease_until=null,last_error_code='production_delivery_retry'
 where id=p_id and production_lease_id=p_lease and test_delivery=false and accepted_at is null and state='processing';
end $$;
do $$ declare f text;begin
 foreach f in array array['bm_queue_production_distribution(uuid,uuid,uuid)','bm_claim_production_invitation(uuid,uuid,uuid,text)','bm_finish_production_invitation(uuid,uuid,text)','bm_retry_production_invitation(uuid,uuid)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to service_role';end loop;
end $$;
