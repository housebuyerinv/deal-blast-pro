-- Permission-only candidate. No function body, owner, customer row or schema change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $permissions$
declare signature text; target regprocedure;
begin
 foreach signature in array array[
  'public.insert_email_notification_log(text,uuid,text,text,text,text,text,text,integer,text,jsonb,text)',
  'public.reserve_property_intelligence_credit(uuid,uuid,text,text,text)',
  'public.finalize_property_intelligence_credit(uuid,jsonb,integer)',
  'public.release_property_intelligence_credit(uuid,text)'
 ] loop
  target:=to_regprocedure(signature);
  if target is null or not exists(select 1 from pg_proc where oid=target and prosecdef and prokind='f') then
   raise exception 'Expected server function unavailable; preserve permissions and review drift';
  end if;
  execute format('revoke all on function %s from public,anon,authenticated',target);
  execute format('grant execute on function %s to service_role',target);
  if has_function_privilege('anon',target,'execute') or has_function_privilege('authenticated',target,'execute')
    or not has_function_privilege('service_role',target,'execute') then
   raise exception 'Effective server-only function boundary not established';
  end if;
 end loop;
end $permissions$;
commit;
