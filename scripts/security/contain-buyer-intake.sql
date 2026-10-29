-- PREPARED ONLY. Requires explicit Production authorization and reviewed impact.
-- Standalone containment; do not run the integration migration directory.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare t regclass := to_regclass('public.buyer_portal_submissions');
begin
 if t is null or not exists(select 1 from pg_class where oid=t and relkind='r'
   and relowner=(select oid from pg_roles where rolname='postgres')) then
  raise exception 'Unexpected intake table identity/owner'; end if;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated')
   and (rolsuper or rolbypassrls)) or
   (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))<>3 then
  raise exception 'Unexpected client/service roles'; end if;
 if not has_table_privilege('service_role',t,'SELECT')
 or not has_table_privilege('service_role',t,'INSERT')
 or not has_table_privilege('service_role',t,'UPDATE')
 or not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
  raise exception 'Expected server access absent'; end if;
end $$;

lock table public.buyer_portal_submissions in access exclusive mode;
alter table public.buyer_portal_submissions enable row level security;
revoke all privileges on table public.buyer_portal_submissions from public,anon,authenticated;
-- Table REVOKE alone does not remove independent column grants.
do $$
declare columns text;
begin
 select string_agg(format('%I',attname),', ' order by attnum) into columns
 from pg_attribute where attrelid='public.buyer_portal_submissions'::regclass
 and attnum>0 and not attisdropped;
 execute format('revoke all privileges (%s) on table public.buyer_portal_submissions from public,anon,authenticated',columns);
end $$;

drop policy if exists "App can read pending buyer portal submissions" on public.buyer_portal_submissions;
drop policy if exists "App can update buyer portal submissions" on public.buyer_portal_submissions;
drop policy if exists "Public can create buyer portal submissions" on public.buyer_portal_submissions;
-- Preserve unrelated policies. This restrictive deny also intersects future grants.
drop policy if exists dbp_emergency_intake_deny on public.buyer_portal_submissions;
create policy dbp_emergency_intake_deny on public.buyer_portal_submissions
 as restrictive for all to anon,authenticated using(false) with check(false);

do $$
declare r text; p text; c record;
begin
 foreach r in array array['anon','authenticated'] loop
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   if has_table_privilege(r,'public.buyer_portal_submissions',p) then
    raise exception 'Unexpected residual table privilege: % %',r,p; end if;
  end loop;
  for c in select attnum from pg_attribute where attrelid='public.buyer_portal_submissions'::regclass
   and attnum>0 and not attisdropped loop
   foreach p in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
    if has_column_privilege(r,'public.buyer_portal_submissions',c.attnum,p) then
     raise exception 'Unexpected residual column privilege: % %',r,p; end if;
   end loop;
  end loop;
 end loop;
end $$;
commit;
