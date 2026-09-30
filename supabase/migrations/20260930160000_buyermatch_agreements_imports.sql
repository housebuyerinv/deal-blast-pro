begin;
create function public.bm_accept_document(p_owner uuid,p_deal uuid,p_document uuid,p_hash text,p_signature text) returns void
language plpgsql security definer set search_path=public as $$
declare doc bm_documents; d bm_deals; c bm_closings; ex bm_exposures; evidence jsonb;
begin
 select * into doc from bm_documents where id=p_document and approved and current and document_hash=p_hash for share;
 if not found then raise exception 'Current approved document required'; end if;
 if length(trim(p_signature))<2 then raise exception 'Signature required'; end if;
 if p_deal is not null then
  select * into d from bm_deals where id=p_deal and owner_id=p_owner for update;
  if not found then raise exception 'Deal not found'; end if;
 elsif doc.kind not in ('platform_terms','privacy') then raise exception 'Deal required'; end if;
 evidence:=jsonb_build_object('typedName',p_signature,'method','authenticated_typed_signature','userId',p_owner);
 if doc.kind='closing_authorization' then
  select * into c from bm_closings where deal_id=p_deal;
  if c.selected_exposure_id is null then raise exception 'Selected buyer required'; end if;
  select * into ex from bm_exposures where id=c.selected_exposure_id;
  evidence:=evidence||jsonb_build_object('selectedExposure',ex.id,'property',d.property,'title',d.title,'frozenTerms',ex.frozen_terms);
  update bm_closings set user_signed_at=now(),title_acknowledged_at=null where deal_id=p_deal;
 end if;
 insert into bm_acceptances(owner_id,deal_id,document_id,version,document_hash,signature_evidence) values(p_owner,p_deal,doc.id,doc.version,doc.document_hash,evidence);
end $$;
revoke all on function public.bm_accept_document(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.bm_accept_document(uuid,uuid,uuid,text,text) to service_role;
-- Approved legal text is immutable; publish a new version for any change.
create function public.bm_protect_document() returns trigger language plpgsql set search_path=public as $$
begin
 if old.approved and (tg_op='DELETE' or new.content<>old.content or new.document_hash<>old.document_hash or new.version<>old.version or new.kind<>old.kind) then raise exception 'Approved document is immutable'; end if;
 return new;
end $$;
create trigger bm_document_immutable before update or delete on public.bm_documents for each row execute function public.bm_protect_document();
alter table public.bm_buyers add column source_ciphertext text;
create function public.bm_import_buyers(p_actor uuid,p_rows jsonb,p_submitted integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare import_id uuid:=gen_random_uuid(); inserted integer;
begin
 insert into bm_buyers(identity_hash,identity_ciphertext,criteria,consent_evidence,source_ciphertext,import_id)
 select x->>'identity_hash',x->>'identity_ciphertext',x->'criteria',nullif(x->>'consent_evidence',''),x->>'source_ciphertext',import_id from jsonb_array_elements(p_rows) x
 on conflict(identity_hash) do nothing;
 get diagnostics inserted=row_count;
 insert into bm_imports(id,actor_id,summary) values(import_id,p_actor,jsonb_build_object('submitted',p_submitted,'inserted',inserted,'skipped',p_submitted-inserted));
 return jsonb_build_object('inserted',inserted,'skipped',p_submitted-inserted);
end $$;
revoke all on function public.bm_import_buyers(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.bm_import_buyers(uuid,jsonb,integer) to service_role;
commit;
