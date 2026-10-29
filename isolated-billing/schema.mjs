// @ts-check
import { execFileSync } from 'node:child_process';
import { BASE, validateProfile, digest } from './profile.mjs';
// Produces fresh-project-only SQL. Does not connect or execute a migration.
export function schemaPacket(input) {
  const p=validateProfile(input);
  const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'supabase/migrations'],{encoding:'utf8'}).trim().split('\n').filter(x=>x.endsWith('.sql')).sort();
  files.unshift('supabase/staging/000_baseline_prerequisites.sql');files.push('supabase/staging/999_staging_access.sql');
  const sql=files.map(f=>execFileSync('git',['show',`${BASE}:${f}`],{encoding:'utf8'})
    .replace(/^\s*(?:(?:--[^\n]*\n)\s*)*begin;\s*/i,'').replace(/\s*commit;\s*$/i,''));
  return {files,sql:`begin;
    do $$ begin if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p'))
      then raise exception 'FRESH_ISOLATED_DATABASE_REQUIRED'; end if; end $$;
    ${sql.join('\n')}
    ${leaseSql(p)}
    commit;`};
}
export function leaseSql(input) {
  const p=validateProfile(input), hash=digest(p);
  return `
    create table public.bm_isolated_run(run uuid primary key,profile_digest text not null,owner_id uuid not null,
      database_ref text not null,account_id text not null,state text not null check(state in ('paused','armed','closed')),
      started_at timestamptz not null,expires_at timestamptz not null,operation_key uuid,deliveries int not null default 0 check(deliveries between 0 and 12),
      check(expires_at>started_at and expires_at-started_at<=interval '30 minutes'));
    insert into public.bm_isolated_run values('${p.runId}','${hash}','${p.owner}','${p.database}','${p.account}','paused',
      '${new Date(p.startedAt).toISOString()}','${new Date(p.expiresAt).toISOString()}',null,0);
    alter table public.bm_isolated_run enable row level security;
    revoke all on public.bm_isolated_run from public,anon,authenticated;
    grant select,update on public.bm_isolated_run to service_role;
    create function public.bm_isolated_snapshot(p_run uuid,p_digest text) returns jsonb language plpgsql security definer set search_path=public as $$
    declare r bm_isolated_run; begin
      select * into strict r from bm_isolated_run where run=p_run and profile_digest=p_digest;
      return jsonb_build_object('profileDigest',r.profile_digest,'owner',r.owner_id,'database',r.database_ref,'account',r.account_id,
        'state',r.state,'buyers',(select count(*) from bm_buyers),
        'provenance',(select count(*) from bm_buyers where source_ciphertext is not null),
        'crmDigest',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from workspace_plan_assignments t),
        'deliveries',r.deliveries); end $$;
    create function public.bm_isolated_arm(p_run uuid,p_digest text) returns boolean language plpgsql security definer set search_path=public as $$
    begin update bm_isolated_run set state='armed' where run=p_run and profile_digest=p_digest and state='paused'
      and clock_timestamp()>=started_at and clock_timestamp()<expires_at-interval '60 seconds';
      if not found then raise exception 'ARM_DENIED';end if;return true;end $$;
    create function public.bm_isolated_pause(p_run uuid,p_digest text) returns boolean language plpgsql security definer set search_path=public as $$
    begin update bm_isolated_run set state='closed' where run=p_run and profile_digest=p_digest;
      if not found then raise exception 'PAUSE_DENIED';end if;return true;end $$;
    create function public.bm_isolated_permit(p_run uuid,p_digest text,p_owner uuid,p_operation uuid) returns boolean language plpgsql security definer set search_path=public as $$
    declare r bm_isolated_run;begin
      select * into strict r from bm_isolated_run where run=p_run and profile_digest=p_digest for update;
      if r.state<>'armed' or r.owner_id<>p_owner or p_operation<>p_run or clock_timestamp()<r.started_at
        or clock_timestamp()>=r.expires_at-interval '60 seconds' or (r.operation_key is not null and r.operation_key<>p_operation)
      then raise exception 'ISSUANCE_DENIED';end if;
      update bm_isolated_run set operation_key=p_operation where run=p_run;return true;end $$;
    create function public.bm_isolated_event(p_run uuid,p_digest text,p_event text) returns int language plpgsql security definer set search_path=public as $$
    declare n int;begin
      if p_event !~ '^evt_[A-Za-z0-9]+$' then raise exception 'EVENT_ID';end if;
      update bm_isolated_run set deliveries=deliveries+1 where run=p_run and profile_digest=p_digest and state='armed'
        and deliveries<12 and clock_timestamp()>=started_at and clock_timestamp()<expires_at-interval '30 seconds'
        returning deliveries into n;
      if not found then raise exception 'EVENT_LIMIT_OR_CLOSED';end if;return n;end $$;
    create function public.bm_isolated_checkout(p_run uuid,p_digest text) returns jsonb language plpgsql security definer set search_path=public as $$
    declare r bm_isolated_run;c bm_checkouts;begin
      select * into strict r from bm_isolated_run where run=p_run and profile_digest=p_digest;
      if (select count(*) from bm_checkouts)>1 then raise exception 'CHECKOUT_INVENTORY';end if;
      select * into c from bm_checkouts where owner_id=r.owner_id and operation_key=p_run and product='buyermatch' and plan_version='buyermatch-pro-v1';
      return jsonb_build_object('checkoutId',c.id,'session',c.session_id,'state',c.state);end $$;
    revoke all on function public.bm_isolated_snapshot(uuid,text),public.bm_isolated_arm(uuid,text),public.bm_isolated_pause(uuid,text),
      public.bm_isolated_permit(uuid,text,uuid,uuid),public.bm_isolated_event(uuid,text,text),public.bm_isolated_checkout(uuid,text) from public,anon,authenticated;
    grant execute on function public.bm_isolated_snapshot(uuid,text),public.bm_isolated_arm(uuid,text),public.bm_isolated_pause(uuid,text),
      public.bm_isolated_permit(uuid,text,uuid,uuid),public.bm_isolated_event(uuid,text,text),public.bm_isolated_checkout(uuid,text) to service_role;
  `;
}
