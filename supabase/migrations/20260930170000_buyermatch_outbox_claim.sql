-- Claim an outbox item only after rechecking consent and contract status.
-- Provider adapters must support idempotency using exposure_id. No adapter is enabled by this migration.
begin;
alter table public.bm_outbox add column lease_until timestamptz;
create function public.bm_claim_outbox(p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o bm_outbox; ex bm_exposures; b bm_buyers; d bm_deals; cfg bm_configuration;
begin
 select * into cfg from bm_configuration where id;
 if not (cfg.distribution_enabled and cfg.provider_verified and cfg.permissions_verified and cfg.agreements_verified) then return null; end if;
 select * into o from bm_outbox where id=p_id for update skip locked;
 if not found or o.accepted_at is not null or o.state in ('suppressed','failed') or o.lease_until>now() then return null; end if;
 select * into ex from bm_exposures where id=o.exposure_id;
 select * into b from bm_buyers where id=ex.buyer_id;
 select * into d from bm_deals where id=ex.deal_id;
 if b.status<>'active' or b.opted_out_at is not null or coalesce(b.consent_evidence,'')='' or not d.contract_verified or not d.admin_approved or (d.title->>'eoc')::date<=current_date or d.title->>'eoc' is null or d.status in ('canceled','expired','closed') then
  update bm_outbox set state='suppressed' where id=p_id; return null;
 end if;
 update bm_outbox set state='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes' where id=p_id;
 return jsonb_build_object('id',o.id,'exposureId',ex.id,'identityCiphertext',b.identity_ciphertext,'property',ex.frozen_terms->'property');
end $$;
revoke all on function public.bm_claim_outbox(uuid) from public,anon,authenticated;
grant execute on function public.bm_claim_outbox(uuid) to service_role;
commit;
