begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

alter table public.buyer_portal_submissions add column submission_key uuid;
create unique index buyer_portal_submission_key_unique on public.buyer_portal_submissions(submission_key);
alter table public.buyer_portal_submissions enable row level security;

create function public.bm_can_review_buyer_intake() returns boolean
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
revoke all on public.buyer_portal_submissions from public,anon;
revoke all on public.buyer_portal_submissions from authenticated;
grant select,update on public.buyer_portal_submissions to authenticated;
create policy bm_buyer_intake_owner_read on public.buyer_portal_submissions
 for select to authenticated using ((select public.bm_can_review_buyer_intake()));
create policy bm_buyer_intake_owner_update on public.buyer_portal_submissions
 for update to authenticated using ((select public.bm_can_review_buyer_intake()))
 with check ((select public.bm_can_review_buyer_intake()));
create policy bm_buyer_intake_restrict_read on public.buyer_portal_submissions as restrictive
 for select to authenticated using ((select public.bm_can_review_buyer_intake()));
create policy bm_buyer_intake_restrict_update on public.buyer_portal_submissions as restrictive
 for update to authenticated using ((select public.bm_can_review_buyer_intake()))
 with check ((select public.bm_can_review_buyer_intake()));

create function public.bm_submit_buyer_intake(p_key uuid,p_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.buyer_portal_submissions; payload jsonb; proof jsonb; receipt uuid;
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
 if jsonb_typeof(coalesce(p_value->'proofFiles','[]')) is distinct from 'array'
 or jsonb_array_length(coalesce(p_value->'proofFiles','[]'))>10 then raise exception 'Invalid proof metadata'; end if;
 for proof in select value from jsonb_array_elements(coalesce(p_value->'proofFiles','[]')) loop
  if auth.uid() is null or proof->>'storageProvider' is distinct from 'supabase'
   or proof->>'storageBucket' is distinct from 'buyer-proof-files'
   or coalesce(proof->>'storagePath','') not like 'buyer-documents/'||auth.uid()::text||'/%'
   or proof ? 'fileDataUrl' or proof ? 'publicUrl' then raise exception 'Private proof upload required'; end if;
 end loop;
 payload:=p_value-ARRAY['submittedAt','status','submissionStatus','consent','uploadedFiles','blastEligible','verificationStatus','submissionPayload'];
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
 'verificationStatus','Submitted / Pending Review','submittedAt',now(),'uploadedFiles',coalesce(payload->'proofFiles','[]'),
 'consent',jsonb_build_object('version','buyer-intake-consent-v1','accuracy',true,
 'dealInvitations',coalesce(p_value#>'{portalForm,dealConsent}'='true'::jsonb,false),'recordedAt',now()))) returning id into receipt;
 return jsonb_build_object('id',receipt,'recorded',true);
end $$;
revoke all on function public.bm_submit_buyer_intake(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bm_submit_buyer_intake(uuid,jsonb) to anon,authenticated;
commit;
