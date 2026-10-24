begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Forward reconciliation of direct Production containment (no history entry):
-- pinned security SQL at 1c7e9a7, SHA256 A0D620D5278491B7ED36E6F85E529DA1863BAC07E751265721B89E7CB0BF79DB.
-- Safe on both the legacy and contained baseline; NEVER replay bootstrap grants.
alter table public.buyer_portal_submissions add column if not exists submission_key uuid;
create unique index if not exists buyer_portal_submission_key_unique on public.buyer_portal_submissions(submission_key);
alter table public.buyer_portal_submissions enable row level security;
do $$
begin
 if not exists(select 1 from pg_attribute where attrelid='public.buyer_portal_submissions'::regclass
  and attname='submission_key' and atttypid='uuid'::regtype and not attisdropped)
 or not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='submission_key'
  where i.indexrelid='public.buyer_portal_submission_key_unique'::regclass
  and i.indrelid='public.buyer_portal_submissions'::regclass and i.indisunique and i.indisvalid and i.indisready
  and i.indnkeyatts=1 and i.indnatts=1 and i.indkey[0]=a.attnum and i.indpred is null and i.indexprs is null) then
  raise exception 'Unexpected intake receipt schema/index; preserve containment'; end if;
end $$;

create or replace function public.bm_can_review_buyer_intake() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.account_profiles p on p.user_id=u.id
 where u.id=auth.uid() and lower(u.email)='housebuyerinv@gmail.com'
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
 and p.role='Admin' and p.account_status='Active');
$$;
revoke all on function public.bm_can_review_buyer_intake() from public,anon,authenticated;
grant execute on function public.bm_can_review_buyer_intake() to authenticated;

-- Restrictive policies intersect with any historical permissive policies.
-- Preserve other protections; never assume dropping one known policy is enough.
drop policy if exists bm_buyer_intake_anon_deny on public.buyer_portal_submissions;
create policy bm_buyer_intake_anon_deny on public.buyer_portal_submissions as restrictive
 for all to anon using(false) with check(false);
drop policy if exists bm_buyer_intake_no_direct_insert on public.buyer_portal_submissions;
create policy bm_buyer_intake_no_direct_insert on public.buyer_portal_submissions as restrictive
 for insert to authenticated with check(false);
drop policy if exists bm_buyer_intake_no_direct_delete on public.buyer_portal_submissions;
create policy bm_buyer_intake_no_direct_delete on public.buyer_portal_submissions as restrictive
 for delete to authenticated using(false);
revoke all on public.buyer_portal_submissions from public,anon;
revoke all on public.buyer_portal_submissions from authenticated;
do $$
declare columns text;
begin
 select string_agg(format('%I',attname),', ' order by attnum) into columns
 from pg_attribute where attrelid='public.buyer_portal_submissions'::regclass and attnum>0 and not attisdropped;
 execute format('revoke all privileges (%s) on public.buyer_portal_submissions from public,anon,authenticated',columns);
end $$;
grant select on public.buyer_portal_submissions to authenticated;
-- Review may resolve a submission, never rewrite submitted identity/consent/proofs.
grant update(status,imported_at,approved_at,approved_by,created_buyer_id)
 on public.buyer_portal_submissions to authenticated;
drop policy if exists bm_buyer_intake_owner_read on public.buyer_portal_submissions;
create policy bm_buyer_intake_owner_read on public.buyer_portal_submissions
 for select to authenticated using ((select public.bm_can_review_buyer_intake()));
drop policy if exists bm_buyer_intake_owner_update on public.buyer_portal_submissions;
create policy bm_buyer_intake_owner_update on public.buyer_portal_submissions
 for update to authenticated using ((select public.bm_can_review_buyer_intake()))
 with check ((select public.bm_can_review_buyer_intake()));
drop policy if exists bm_buyer_intake_restrict_read on public.buyer_portal_submissions;
create policy bm_buyer_intake_restrict_read on public.buyer_portal_submissions as restrictive
 for select to authenticated using ((select public.bm_can_review_buyer_intake()));
drop policy if exists bm_buyer_intake_restrict_update on public.buyer_portal_submissions;
create policy bm_buyer_intake_restrict_update on public.buyer_portal_submissions as restrictive
 for update to authenticated using ((select public.bm_can_review_buyer_intake()))
 with check ((select public.bm_can_review_buyer_intake()));

create or replace function public.bm_submit_buyer_intake(p_key uuid,p_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.buyer_portal_submissions; payload jsonb; portal_form jsonb; proof jsonb; proofs jsonb:='[]'; receipt uuid;
begin
 if p_key is null or jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>131072
 or length(trim(coalesce(p_value->>'name',''))) not between 1 and 200
 or length(trim(coalesce(p_value->>'company',''))) not between 1 and 200
 or length(trim(coalesce(p_value->>'phone',''))) not between 1 and 100
 or length(coalesce(p_value->>'email',''))>254
 or coalesce(p_value->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or jsonb_typeof(p_value->'markets') is distinct from 'array'
 or jsonb_array_length(p_value->'markets') not between 1 and 100
 or jsonb_typeof(p_value->'assetTypes') is distinct from 'array'
 or jsonb_array_length(p_value->'assetTypes') not between 1 and 100
 or p_value#>'{portalForm,consent}' is distinct from 'true'::jsonb then
 raise exception 'Invalid buyer submission'; end if;
 if length(coalesce(p_value->>'website',''))>2048
 or (nullif(p_value->>'website','') is not null and p_value->>'website' !~ '^https?://[^[:space:]]+$')
 or exists(select 1 from jsonb_array_elements(p_value->'markets') v where jsonb_typeof(v) is distinct from 'string')
 or exists(select 1 from jsonb_array_elements(p_value->'assetTypes') v where jsonb_typeof(v) is distinct from 'string') then
 raise exception 'Invalid buyer criteria'; end if;
 if jsonb_typeof(coalesce(p_value->'proofFiles','[]')) is distinct from 'array'
 or jsonb_array_length(coalesce(p_value->'proofFiles','[]'))>10 then raise exception 'Invalid proof metadata'; end if;
 for proof in select value from jsonb_array_elements(coalesce(p_value->'proofFiles','[]')) loop
  if auth.uid() is null or proof->>'storageProvider' is distinct from 'supabase'
   or proof->>'storageBucket' is distinct from 'buyer-proof-files'
   or coalesce(proof->>'storagePath','') not like 'buyer-documents/'||auth.uid()::text||'/%'
   or coalesce(proof->>'storagePath','') !~ '^[A-Za-z0-9._/-]+$'
   or '..'=any(string_to_array(proof->>'storagePath','/'))
   or proof ? 'fileDataUrl' or proof ? 'publicUrl' then raise exception 'Private proof upload required'; end if;
  proofs:=proofs||jsonb_build_array((proof-array['verificationStatus','uploadedBy','isVerified'])||
   jsonb_build_object('verificationStatus','Pending Review','uploadedBy',auth.uid()));
 end loop;
 -- Only intake data survives. Arbitrary client role/verification/source flags
 -- must not reach the existing review/normalization tools.
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into payload from jsonb_each(p_value)
 where key=any(array['name','email','phone','company','website','type','markets','assetTypes','exitStrategies',
 'budgetMin','budgetMax','priceRange','strategy','downPaymentMax','monthlyPaymentMax','interestRateMax',
 'balloonTerm','capRateTarget','creativeStructure','bedRequirement','bathRequirement','unitRequirement',
 'cities','notes','proofFiles']);
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into portal_form from jsonb_each(p_value->'portalForm')
 where key=any(array['name','email','phone','company','buyerTypeOther','marketsOther','assetTypeOther',
 'exitStrategyOther','priceMin','priceMax','unitsMin','unitsMax','downPaymentMax','monthlyPaymentMax',
 'interestRateMax','balloonTerm','capRateTarget','creativeStructure','cities','notes','bedRequirement',
 'bathRequirement','unitRequirement','consent','dealConsent','buyerTypes','markets','assetTypes',
 'exitStrategies','cleanBuyerTypes','cleanMarkets','cleanAssetTypes','cleanExitStrategies','priceRange',
 'proofSummary','fileUploadWarning']);
 payload:=payload||jsonb_build_object('proofFiles',proofs,'portalForm',portal_form||jsonb_build_object('website',coalesce(p_value->>'website','')));
 payload:=jsonb_set(payload,'{email}',to_jsonb(lower(trim(p_value->>'email'))));
 perform pg_advisory_xact_lock(hashtextextended('buyer-intake:'||p_key::text,0));
 select * into existing from public.buyer_portal_submissions where submission_key=p_key;
 if found then
  if existing.buyer_data->'submissionPayload' is distinct from payload then raise exception 'Submission retry conflicts';end if;
  return jsonb_build_object('id',existing.id,'recorded',true); -- Never reveal review state or stored buyer data.
 end if;
 insert into public.buyer_portal_submissions(status,submission_key,buyer_data)
 values('pending_review',p_key,payload||jsonb_build_object('submissionPayload',payload,
 'submissionStatus','Pending Review','status','Submitted / Pending Review','blastEligible',false,
 'buyerPortalSubmission',true,'tags',jsonb_build_array('Buyer Portal','Pending Review'),
 'fundingStatus',case when jsonb_array_length(coalesce(payload->'proofFiles','[]'))>0 then 'Proof submitted / pending review' else 'Proof needed' end,
 'verificationStatus','Submitted / Pending Review','submittedAt',now(),'uploadedFiles',coalesce(payload->'proofFiles','[]'),
 'consent',jsonb_build_object('version','buyer-intake-consent-v1','accuracy',true,
 'dealInvitations',coalesce(p_value#>'{portalForm,dealConsent}'='true'::jsonb,false),'recordedAt',now()))) returning id into receipt;
 return jsonb_build_object('id',receipt,'recorded',true);
end $$;
revoke all on function public.bm_submit_buyer_intake(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bm_submit_buyer_intake(uuid,jsonb) to anon,authenticated;

do $$
declare p text; c record;
begin
 foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
  if has_table_privilege('anon','public.buyer_portal_submissions',p)
   or (p<>'SELECT' and has_table_privilege('authenticated','public.buyer_portal_submissions',p)) then
   raise exception 'Unexpected residual intake table privilege'; end if;
 end loop;
 foreach p in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
  if has_any_column_privilege('anon','public.buyer_portal_submissions',p) then
   raise exception 'Unexpected anonymous intake column privilege'; end if;
 end loop;
 if has_any_column_privilege('authenticated','public.buyer_portal_submissions','INSERT')
 or has_any_column_privilege('authenticated','public.buyer_portal_submissions','REFERENCES') then
  raise exception 'Unexpected inherited review column privilege'; end if;
 for c in select attname from pg_attribute where attrelid='public.buyer_portal_submissions'::regclass
  and attnum>0 and not attisdropped and attname<>all(array['status','imported_at','approved_at','approved_by','created_buyer_id']) loop
  if has_column_privilege('authenticated','public.buyer_portal_submissions',c.attname,'UPDATE') then
   raise exception 'Unexpected review identity/consent mutation privilege'; end if;
 end loop;
end $$;

-- Last restoration step, after receipt and owner-only review protections exist.
-- All changes, including deny removal, commit atomically. A failure retains containment.
drop policy if exists dbp_emergency_intake_deny on public.buyer_portal_submissions;
commit;
