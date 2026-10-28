begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Preserve every queue gate, grant and existing row. Fail closed on an unexpected body.
do $guard$
declare source text;
 old_guard text := 'if a.private_result->>''engineVersion'' is distinct from ''1.0.1''';
 new_guard text := 'if a.private_result->>''engineVersion'' is distinct from ''1.0.2''';
begin
 source:=pg_get_functiondef('public.bm_queue_distribution(uuid,uuid,uuid)'::regprocedure);
 if (length(source)-length(replace(source,old_guard,'')))/length(old_guard)<>1
  or position('Matching safety revalidation required' in source)=0 then
  raise exception 'Unexpected distribution guard; review migration state';
 end if;
 execute replace(source,old_guard,new_guard);
end $guard$;
commit;
