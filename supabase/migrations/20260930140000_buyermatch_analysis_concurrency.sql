-- Analysis input must still match the saved deal at commit time (concurrent edits fail closed).
begin;
alter table public.bm_analyses add column property_snapshot jsonb;
create or replace function public.bm_commit_analysis(p_owner uuid,p_deal uuid,p_key uuid,p_private jsonb,p_public jsonb,p_property jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare entitlement public.bm_entitlements; previous public.bm_analyses; used integer; saved_property jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select property into saved_property from bm_deals where id=p_deal and owner_id=p_owner for update;
 if not found then raise exception 'Deal not found'; end if;
 select * into previous from bm_analyses where owner_id=p_owner and operation_key=p_key;
 if found then
   if previous.deal_id<>p_deal then raise exception 'Operation key conflict'; end if;
   return previous.public_result;
 end if;
 if saved_property<>p_property then raise exception 'Deal changed during analysis'; end if;
 select * into entitlement from bm_entitlements where owner_id=p_owner and product='buyermatch' and status='active' and period_start<=now() and period_end>now();
 if not found then raise exception 'BuyerMatch entitlement required'; end if;
 select count(*) into used from bm_analyses where owner_id=p_owner and created_at>=entitlement.period_start;
 if used>=entitlement.allowance then raise exception 'Analysis allowance exhausted'; end if;
 if (select count(*) from bm_analyses where owner_id=p_owner and created_at>now()-interval '1 hour')>=10 then raise exception 'Hourly query limit reached'; end if;
 insert into bm_analyses(deal_id,owner_id,operation_key,private_result,public_result,property_snapshot) values(p_deal,p_owner,p_key,p_private,p_public,p_property);
 update bm_deals set status=case when status in ('draft','analyzed') then 'analyzed' else status end where id=p_deal;
 insert into bm_events(deal_id,actor_id,kind,public_note) values(p_deal,p_owner,'analyzed','Private network analysis completed. No buyers contacted.');
 return p_public;
end $$;
drop function public.bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb);
revoke all on function public.bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bm_commit_analysis(uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
commit;
