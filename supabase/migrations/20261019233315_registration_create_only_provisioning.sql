-- S1 additive migration candidate. Isolated verification only; never run against Production without approval.
begin;
create function public.dbp_provision_registration(
 p_user uuid, p_email text, p_name text, p_company text, p_role text, p_plan text,
 p_documents jsonb, p_require_documents boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare workspace uuid; billing text; doc jsonb; actual_email text; confirmed timestamptz;
begin
 -- API supplies only the UUID returned by Auth.getUser(access_token). No public EXECUTE grants.
 select lower(email),email_confirmed_at into actual_email,confirmed from auth.users where id=p_user;
 if actual_email is null or confirmed is null or actual_email<>p_email then raise exception 'Verified identity required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dbp-registration:'||p_user::text,0));
 -- Existing or historically partial accounts cannot be overwritten or silently repaired by this endpoint.
 if exists(select 1 from public.account_profiles where user_id=p_user)
 or exists(select 1 from public.workspaces where owner_user_id=p_user)
 or exists(select 1 from public.workspace_plan_assignments where user_id=p_user)
 or exists(select 1 from public.account_registration_events where user_id=p_user) then
   if exists(select 1 from public.account_profiles p join public.workspaces w on w.owner_user_id=p.user_id
     join public.workspace_plan_assignments b on b.workspace_id=w.id and b.user_id=p.user_id where p.user_id=p_user)
   then return jsonb_build_object('created',false); end if;
   raise exception 'Existing account requires administrative review';
 end if;
 if p_plan not in ('Free','Starter','Pro') or p_plan is null
 or p_role not in ('Admin','Team Member / VA','Buyer','Seller / Submitter') or p_role is null
 or length(trim(p_name)) not between 1 and 200 or p_name is null
 or length(p_company)>200 or p_company is null
 or jsonb_typeof(p_documents)<>'array' or p_documents is null then raise exception 'Invalid registration'; end if;
 if p_require_documents is null or jsonb_array_length(p_documents)>2 then raise exception 'Invalid agreement requirements'; end if;
 if p_require_documents and (
   (select count(*) from public.bm_documents where kind in ('platform_terms','privacy') and current and approved)<>2
   or (select count(distinct d.kind) from public.bm_documents d join jsonb_array_elements(p_documents) x
       on d.id::text=x->>'id' and d.document_hash=x->>'hash'
       where d.kind in ('platform_terms','privacy') and d.current and d.approved)<>2
 ) then raise exception 'Current platform agreements required'; end if;
 billing:=case when p_plan='Free' then 'Free Active' else 'Pending Payment' end;
 insert into public.account_profiles(user_id,email,full_name,display_name,business_name,company,role)
 values(p_user,p_email,p_name,split_part(p_name,' ',1),nullif(p_company,''),nullif(p_company,''),p_role);
 insert into public.workspaces(owner_user_id,owner_email,name)
 values(p_user,p_email,coalesce(nullif(p_company,''),p_name||'''s Workspace')) returning id into workspace;
 insert into public.workspace_plan_assignments(workspace_id,user_id,plan_name,billing_status,trial_status,payment_status,source)
 values(workspace,p_user,p_plan,billing,billing,case when p_plan='Free' then 'No payment required' else 'Pending Stripe checkout' end,'Verified Registration');
 for doc in select value from jsonb_array_elements(p_documents) loop
   if not exists(select 1 from public.bm_documents where id::text=doc->>'id' and document_hash=doc->>'hash'
     and kind in ('platform_terms','privacy') and approved and current) then raise exception 'Current platform agreements required'; end if;
   perform public.bm_accept_document(p_user,null,(doc->>'id')::uuid,doc->>'hash',p_name);
 end loop;
 insert into public.account_registration_events(user_id,workspace_id,email,event_type,idempotency_key,status,diagnostics)
 values(p_user,workspace,p_email,'new_account_created','new_account_created:'||p_user::text,'created',
   '{"auth":{"status":"ok","detail":"Server-verified session; atomic create-only provisioning"}}'::jsonb);
 return jsonb_build_object('created',true,'workspaceId',workspace);
end $$;
revoke all on function public.dbp_provision_registration(uuid,text,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.dbp_provision_registration(uuid,text,text,text,text,text,jsonb,boolean) to service_role;
commit;
