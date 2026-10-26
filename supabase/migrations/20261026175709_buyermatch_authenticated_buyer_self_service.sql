-- DRAFT ONLY. Never links legacy buyers by email or a public intake receipt.
-- Requires verified Auth AND a valid, delivered, identity-matched invitation.
begin;
create table public.bm_buyer_accounts (
 user_id uuid primary key references auth.users(id),
 buyer_id uuid not null unique references public.bm_buyers(id),
 revision bigint not null default 0,
 linked_at timestamptz not null default now()
);
create table public.bm_buyer_account_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 buyer_id uuid not null references public.bm_buyers(id),
 operation_key uuid not null, kind text not null,
 payload jsonb not null, revision bigint not null,
 created_at timestamptz not null default now(), unique(user_id,operation_key)
);
create table public.bm_buyer_proofs (
 id uuid primary key, buyer_id uuid not null references public.bm_buyers(id),
 storage_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 mime text not null check(mime in ('application/pdf','image/png','image/jpeg')),
 bytes integer not null check(bytes between 1 and 2097152),
 expires_on date not null, created_at timestamptz not null default now()
);
create table public.bm_buyer_proof_uploads (
 user_id uuid not null references auth.users(id),operation_key uuid not null,
 payload jsonb not null,created_at timestamptz not null default now(),primary key(user_id,operation_key)
);
create table public.bm_buyer_proof_reviews (
 proof_id uuid primary key references public.bm_buyer_proofs(id),
 reviewer_id uuid not null references auth.users(id),
 decision text not null check(decision in ('approved','rejected')),
 created_at timestamptz not null default now()
);
create index bm_buyer_proofs_buyer_created on public.bm_buyer_proofs(buyer_id,created_at desc,id desc);
create index bm_buyer_history_buyer_created on public.bm_exposures(buyer_id,created_at desc,id desc);
alter table public.bm_buyer_proof_reviews enable row level security;
revoke all on public.bm_buyer_proof_reviews from public,anon,authenticated;
grant select,insert on public.bm_buyer_proof_reviews to service_role;
create trigger bm_buyer_proof_reviews_immutable before update or delete on public.bm_buyer_proof_reviews
 for each row execute function public.bm_audit_immutable();
alter table public.bm_buyer_proof_uploads enable row level security;
revoke all on public.bm_buyer_proof_uploads from public,anon,authenticated;
grant select,insert on public.bm_buyer_proof_uploads to service_role;
create trigger bm_buyer_proof_uploads_immutable before update or delete on public.bm_buyer_proof_uploads
 for each row execute function public.bm_audit_immutable();
-- Proofs are immutable evidence. Upload never sets buyer verification/eligibility.
create trigger bm_buyer_proofs_immutable before update or delete on public.bm_buyer_proofs
 for each row execute function public.bm_audit_immutable();
create trigger bm_buyer_account_events_immutable before update or delete on public.bm_buyer_account_events
 for each row execute function public.bm_audit_immutable();
create function public.bm_buyer_binding_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if row(new.user_id,new.buyer_id,new.linked_at) is distinct from row(old.user_id,old.buyer_id,old.linked_at)
 then raise exception 'Buyer binding is immutable';end if;
 return new;
end $$;
create trigger bm_buyer_binding_immutable before update on public.bm_buyer_accounts
 for each row execute function public.bm_buyer_binding_immutable();
alter table public.bm_buyer_accounts enable row level security;
alter table public.bm_buyer_account_events enable row level security;
alter table public.bm_buyer_proofs enable row level security;
revoke all on public.bm_buyer_accounts,public.bm_buyer_account_events,public.bm_buyer_proofs from public,anon,authenticated;
grant select,insert,update on public.bm_buyer_accounts to service_role;
grant select,insert on public.bm_buyer_account_events,public.bm_buyer_proofs to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bm-buyer-self-service','bm-buyer-self-service',false,2097152,array['application/pdf','image/png','image/jpeg']);
-- Restrictive isolation survives unrelated broad permissive Storage policies.
-- Signed service-issued downloads use Storage's scoped capability flow.
create policy bm_buyer_proof_no_direct_browser on storage.objects as restrictive
 for all to anon,authenticated using(bucket_id<>'bm-buyer-self-service')
 with check(bucket_id<>'bm-buyer-self-service');

create function public.bm_buyer_account_authorized(p_user uuid) returns boolean
 language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()))
$$;

create function public.bm_buyer_account_create(p_user uuid,p_key uuid,p_identity_hash text,p_ciphertext text,p_environment text,p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a bm_buyer_accounts; previous bm_buyer_account_events; new_buyer uuid;
begin
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()) for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 if p_environment is null or p_environment not in ('staging','production')
  or p_payload->>'consentVersion' is distinct from 'buyer-maintenance-v1'
  or p_payload->'accurate' is distinct from 'true'::jsonb
  or jsonb_typeof(p_payload->'invitations') is distinct from 'boolean'
  or jsonb_typeof(p_payload->'criteria') is distinct from 'object'
 then raise exception 'Invalid profile consent';end if;
 select * into a from bm_buyer_accounts where user_id=p_user;
 if found then
  select * into previous from bm_buyer_account_events where user_id=p_user and operation_key=p_key;
  if found and previous.kind='created' and previous.payload=p_payload then return '{"saved":true}'::jsonb;end if;
  raise exception 'Buyer profile already linked';
 end if;
 -- A legacy email match can NEVER authorize an UPDATE, UPSERT, merge or binding.
 if exists(select 1 from bm_buyers where identity_hash=p_identity_hash) then raise exception 'Use a verified invitation to connect an existing profile';end if;
 insert into bm_buyers(identity_hash,identity_ciphertext,criteria,status,consent_evidence,opted_out_at,synthetic)
 values(p_identity_hash,p_ciphertext,p_payload->'criteria',case when p_payload->'invitations'='true'::jsonb then 'inactive' else 'suppressed' end,
  case when p_payload->'invitations'='true'::jsonb then jsonb_build_object('source','authenticated_buyer','version','buyer-maintenance-v1','recordedAt',now(),'dealInvitations',true)::text else null end,
  case when p_payload->'invitations'='false'::jsonb then now() else null end,p_environment='staging') returning id into new_buyer;
 insert into bm_buyer_accounts(user_id,buyer_id) values(p_user,new_buyer);
 insert into bm_buyer_account_events(user_id,buyer_id,operation_key,kind,payload,revision) values(p_user,new_buyer,p_key,'created',p_payload,0);
 return '{"saved":true}'::jsonb;
end $$;

create function public.bm_buyer_account_claim(p_user uuid,p_hash text,p_identity_hash text,p_environment text)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t bm_response_tokens; e bm_exposures; b bm_buyers;
begin
 -- Serialize concurrent claim attempts for this Auth identity, including no-row races.
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()) for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 select * into t from bm_response_tokens where token_hash=p_hash and environment=p_environment
  and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 select * into e from bm_exposures where id=t.exposure_id;
 if not exists(select 1 from bm_outbox where exposure_id=e.id and accepted_at is not null)
  or not exists(select 1 from bm_deals where id=e.deal_id and owner_id=e.owner_id)
 then raise exception 'Buyer access unavailable';end if;
 select * into b from bm_buyers where id=e.buyer_id for update;
 if b.identity_hash is distinct from p_identity_hash or (p_environment='production' and b.synthetic)
 then raise exception 'Buyer access unavailable';end if;
 if exists(select 1 from bm_buyer_accounts where user_id=p_user and buyer_id=b.id) then
  return '{"linked":true}'::jsonb;end if;
 if exists(select 1 from bm_buyer_accounts where user_id=p_user or buyer_id=b.id)
 then raise exception 'Buyer access unavailable';end if;
 insert into bm_buyer_accounts(user_id,buyer_id) values(p_user,b.id);
 insert into bm_buyer_account_events(user_id,buyer_id,operation_key,kind,payload,revision)
 values(p_user,b.id,gen_random_uuid(),'linked','{}',0);
 return '{"linked":true}'::jsonb;
end $$;

create function public.bm_buyer_account_reserve_proof(p_user uuid,p_key uuid,p_revision bigint,p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a bm_buyer_accounts; old_payload jsonb;
begin
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()) for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 select * into a from bm_buyer_accounts where user_id=p_user for update;
 if not found or a.revision is distinct from p_revision then raise exception 'Profile changed';end if;
 if p_payload is null or not(p_payload ?& array['path','id','expiresOn','bytes','mime','sha256'])
  or p_payload->>'path' is distinct from (p_user::text||'/'||p_key::text)
  or p_payload->>'id' is distinct from p_key::text
  or (p_payload->>'expiresOn')::date<=current_date
  or (p_payload->>'expiresOn')::date>current_date+366
  or (p_payload->>'bytes')::integer not between 1 and 2097152
  or p_payload->>'mime' not in ('application/pdf','image/png','image/jpeg')
  or p_payload->>'sha256' !~ '^[a-f0-9]{64}$'
  or exists(select 1 from jsonb_each(p_payload) entry where entry.value='null'::jsonb)
 then raise exception 'Invalid proof';end if;
 select payload into old_payload from bm_buyer_proof_uploads where user_id=p_user and operation_key=p_key;
 if found then
  if old_payload is distinct from p_payload then raise exception 'Operation conflict';end if;
  raise exception 'Upload already reserved; review before retry';
 end if;
 if (select count(*) from bm_buyer_proof_uploads where user_id=p_user and created_at>now()-interval '1 hour')>=5
 then raise exception 'Upload limit reached';end if;
 insert into bm_buyer_proof_uploads(user_id,operation_key,payload) values(p_user,p_key,p_payload);
 return '{"reserved":true}'::jsonb;
end $$;

create function public.bm_buyer_account_mutate(p_user uuid,p_key uuid,p_revision bigint,p_kind text,p_payload jsonb,p_ciphertext text default null)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a bm_buyer_accounts; prior bm_buyer_account_events; next_revision bigint;
begin
 perform 1 from auth.users where id=p_user and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()) for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 select * into a from bm_buyer_accounts where user_id=p_user for update;
 if not found then raise exception 'Buyer access unavailable';end if;
 select * into prior from bm_buyer_account_events where user_id=p_user and operation_key=p_key;
 if found then
  if prior.kind is distinct from p_kind or prior.payload is distinct from p_payload then raise exception 'Operation conflict';end if;
  return jsonb_build_object('saved',true,'revision',prior.revision);
 end if;
 if a.revision is distinct from p_revision then raise exception 'Profile changed; reload before saving';end if;
 perform 1 from bm_buyers where id=a.buyer_id for update;
 if p_kind='criteria' then
  if jsonb_typeof(p_payload->'criteria') is distinct from 'object'
   or p_payload->>'consentVersion' is distinct from 'buyer-maintenance-v1'
   or p_payload->'accurate' is distinct from 'true'::jsonb
   or jsonb_typeof(p_payload->'invitations') is distinct from 'boolean'
  then raise exception 'Invalid consent';end if;
  update bm_buyers set criteria=p_payload->'criteria',criteria_verified_at=null,
   status=case when opted_out_at is not null or status='suppressed' or p_payload->'invitations'='false'::jsonb
     then 'suppressed' else 'inactive' end,
   opted_out_at=case when p_payload->'invitations'='false'::jsonb then coalesce(opted_out_at,now()) else opted_out_at end
   where id=a.buyer_id;
  -- Updating criteria or opting back in cannot reactivate a suppressed buyer.
  update bm_outbox set state='suppressed' where accepted_at is null and exposure_id in
   (select id from bm_exposures where buyer_id=a.buyer_id);
 elsif p_kind='profile' then
  if p_ciphertext is null or length(p_ciphertext)<20 or jsonb_typeof(p_payload->'name') is distinct from 'string'
   or length(btrim(p_payload->>'name')) not between 1 and 120
   or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','company','phone'))
   then raise exception 'Invalid profile';end if;
  update bm_buyers set identity_ciphertext=p_ciphertext,
   status=case when opted_out_at is not null or status='suppressed' then 'suppressed' else 'inactive' end where id=a.buyer_id;
 elsif p_kind='withdraw' then
  update bm_buyers set status='suppressed',opted_out_at=coalesce(opted_out_at,now()) where id=a.buyer_id;
  update bm_outbox set state='suppressed' where accepted_at is null and exposure_id in
   (select id from bm_exposures where buyer_id=a.buyer_id);
 elsif p_kind='proof' then
  if not exists(select 1 from bm_buyer_proof_uploads where user_id=p_user and operation_key=p_key
   and payload=p_payload and created_at>now()-interval '10 minutes') then raise exception 'Upload unavailable';end if;
  if (p_payload->>'path') not like (p_user::text||'/%')
   or (p_payload->>'expiresOn')::date<=current_date
   or (p_payload->>'expiresOn')::date>current_date+366
  then raise exception 'Invalid proof';end if;
  insert into bm_buyer_proofs(id,buyer_id,storage_path,sha256,mime,bytes,expires_on)
   values((p_payload->>'id')::uuid,a.buyer_id,p_payload->>'path',p_payload->>'sha256',
    p_payload->>'mime',(p_payload->>'bytes')::integer,(p_payload->>'expiresOn')::date);
 else raise exception 'Invalid operation';end if;
 next_revision:=a.revision+1;
 update bm_buyer_accounts set revision=next_revision where user_id=p_user;
 insert into bm_buyer_account_events(user_id,buyer_id,operation_key,kind,payload,revision)
 values(p_user,a.buyer_id,p_key,p_kind,p_payload,next_revision);
 return jsonb_build_object('saved',true,'revision',next_revision);
end $$;

create function public.bm_buyer_proof_review(p_actor uuid,p_proof uuid,p_decision text)
 returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare document bm_buyer_proofs; previous bm_buyer_proof_reviews;
begin
 perform 1 from auth.users u join account_profiles p on p.user_id=u.id
  where u.id=p_actor and lower(u.email)='housebuyerinv@gmail.com'
  and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
  and p.role='Admin' and p.account_status='Active' for update of u;
 if not found then raise exception 'Owner review required';end if;
 select * into document from bm_buyer_proofs where id=p_proof for update;
 if not found or p_decision is null or p_decision not in ('approved','rejected')
  or (p_decision='approved' and document.expires_on<=current_date) then raise exception 'Invalid review';end if;
 select * into previous from bm_buyer_proof_reviews where proof_id=p_proof;
 if found then
  if previous.reviewer_id<>p_actor or previous.decision<>p_decision then raise exception 'Review is immutable';end if;
  return '{"recorded":true}'::jsonb;
 end if;
 insert into bm_buyer_proof_reviews(proof_id,reviewer_id,decision) values(p_proof,p_actor,p_decision);
 -- Document acceptance is NOT a verified balance, buyer activation, or consent change.
 return '{"recorded":true}'::jsonb;
end $$;

create function public.bm_buyer_account_history(p_user uuid,p_before timestamptz,p_before_id uuid)
 returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb) from (
  select e.created_at,e.id,jsonb_build_object('id',e.id,'createdAt',e.created_at,'status',d.status,
   'property',jsonb_build_object('address',coalesce(e.frozen_terms->'property',d.property)->>'address',
    'city',coalesce(e.frozen_terms->'property',d.property)->>'city','state',coalesce(e.frozen_terms->'property',d.property)->>'state'),
   'offers',coalesce((select jsonb_agg(jsonb_build_object('amountCents',f.amount_cents,'terms',f.terms,'createdAt',f.created_at) order by f.created_at,f.id)
    from bm_offers f where f.exposure_id=e.id),'[]'::jsonb),
   'responses',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'createdAt',r.created_at) order by r.created_at,r.id)
    from bm_responses r where r.exposure_id=e.id),'[]'::jsonb),
   'messages',coalesce((select jsonb_agg(jsonb_build_object('sender',m.sender_kind,'body',m.body,'createdAt',m.created_at) order by m.created_at,m.id)
    from bm_messages m where m.exposure_id=e.id),'[]'::jsonb)) row_data
  from bm_buyer_accounts a join bm_exposures e on e.buyer_id=a.buyer_id
  join bm_deals d on d.id=e.deal_id and d.owner_id=e.owner_id
  join bm_outbox o on o.exposure_id=e.id and o.accepted_at is not null
  join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
  where a.user_id=p_user and (p_before is null or (e.created_at,e.id)<(p_before,p_before_id))
  order by e.created_at desc,e.id desc limit 26
 ) page
$$;
revoke all on function public.bm_buyer_account_claim(uuid,text,text,text),
 public.bm_buyer_account_create(uuid,uuid,text,text,text,jsonb),
 public.bm_buyer_account_authorized(uuid),
 public.bm_buyer_proof_review(uuid,uuid,text),
 public.bm_buyer_account_reserve_proof(uuid,uuid,bigint,jsonb),
 public.bm_buyer_account_mutate(uuid,uuid,bigint,text,jsonb,text),
 public.bm_buyer_account_history(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.bm_buyer_account_claim(uuid,text,text,text),
 public.bm_buyer_account_create(uuid,uuid,text,text,text,jsonb),
 public.bm_buyer_account_authorized(uuid),
 public.bm_buyer_proof_review(uuid,uuid,text),
 public.bm_buyer_account_reserve_proof(uuid,uuid,bigint,jsonb),
 public.bm_buyer_account_mutate(uuid,uuid,bigint,text,jsonb,text),
 public.bm_buyer_account_history(uuid,timestamptz,uuid) to service_role;
commit;
