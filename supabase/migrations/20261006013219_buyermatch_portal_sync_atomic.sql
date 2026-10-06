begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.bm_sync_portal_buyer(p_actor uuid,p_key uuid,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b bm_buyers; existed boolean;
begin
 if p_actor is null or p_key is null or nullif(p_value->>'identity_hash','') is null then raise exception 'Invalid sync';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_value->>'identity_hash',0));
 select * into b from bm_buyers where identity_hash=p_value->>'identity_hash' for update;
 existed:=found;
 if existed and (b.status='suppressed' or b.opted_out_at is not null) then return jsonb_build_object('id',b.id,'status','suppressed','synced',false);end if;
 if existed and exists(select 1 from bm_imports where summary->>'operationKey'=p_key::text and summary->>'buyerId'=b.id::text)
 then return jsonb_build_object('id',b.id,'status',b.status,'synced',true,'updated',true);end if;
 if not existed then
   insert into bm_buyers(identity_hash,identity_ciphertext,criteria,status,criteria_verified_at,consent_evidence,source_ciphertext,synthetic)
   values(p_value->>'identity_hash',p_value->>'identity_ciphertext',p_value->'criteria','active',now(),p_value->>'consent_evidence',p_value->>'source_ciphertext',coalesce((p_value->>'synthetic')::boolean,false))
   on conflict(identity_hash) do nothing;
   select * into b from bm_buyers where identity_hash=p_value->>'identity_hash' for update;
 end if;
 if b.status='suppressed' or b.opted_out_at is not null then return jsonb_build_object('id',b.id,'status','suppressed','synced',false);end if;
 update bm_buyers set identity_ciphertext=p_value->>'identity_ciphertext',criteria=p_value->'criteria',criteria_verified_at=now(),consent_evidence=p_value->>'consent_evidence'
 where id=b.id;
 -- Keep original import provenance; encrypted update evidence lives in immutable import history.
 insert into bm_imports(actor_id,summary) values(p_actor,jsonb_build_object('source','buyer_portal','buyerId',b.id,'operationKey',p_key,'sourceCiphertext',p_value->>'source_ciphertext','updated',existed));
 return jsonb_build_object('id',b.id,'status',b.status,'synced',true,'updated',existed);
end $$;
revoke all on function public.bm_sync_portal_buyer(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bm_sync_portal_buyer(uuid,uuid,jsonb) to service_role;
commit;
