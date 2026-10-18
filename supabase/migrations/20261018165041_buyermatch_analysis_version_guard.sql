begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Patch the existing queue atomically, preserving its other gates and grants.
-- No historical analysis, buyer, entitlement or billing records are rewritten.
do $guard$
declare source text; anchor text := 'insert into bm_distribution_requests(owner_id,deal_id,operation_key) values(p_owner,p_deal,p_key) returning id into request_id;';
begin
 source:=pg_get_functiondef('public.bm_queue_distribution(uuid,uuid,uuid)'::regprocedure);
 if position('Matching safety revalidation required' in source)>0 then
   raise exception 'Analysis version guard already present; review migration state';
 end if;
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then
   raise exception 'Unexpected distribution function: guard anchor must occur exactly once';
 end if;
 execute replace(source,anchor,
   'if a.private_result->>''engineVersion'' is distinct from ''1.0.1'' then raise exception ''Matching safety revalidation required; no analysis allowance consumed''; end if;' || E'\n ' || anchor);
end $guard$;
commit;
