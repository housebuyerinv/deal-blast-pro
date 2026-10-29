-- PREPARED ONLY. Execute only after separate approval using an independently
-- verified Supabase target qxhhlprentrufobpcgna. SQL alone cannot attest project ID.
-- No schema/grant/RLS/entitlement/history changes. Fail on any unexpected drift.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare
  starter public.bm_plans%rowtype;
  pro public.bm_plans%rowtype;
  changed integer;
begin
  select * into strict starter from public.bm_plans where version='buyermatch-starter-v1' for update;
  select * into strict pro from public.bm_plans where version='buyermatch-pro-v1' for update;
  if starter.product <> 'buyermatch' or pro.product <> 'buyermatch'
     or starter.approved is not true or pro.approved is not true
     or (starter.allowance,starter.distribution_allowance,starter.max_distribution_fanout) is distinct from (20,10,25)
     or (pro.allowance,pro.distribution_allowance,pro.max_distribution_fanout) is distinct from (50,25,50) then
    raise exception 'BuyerMatch S2 catalog eligibility or allowance drift';
  end if;
  if starter.stripe_price_id='price_1UTRdfL6efr9LhPIchNeE7u1'
     and pro.stripe_price_id='price_1UTRdrL6efr9LhPIpYKIYIyd' then return; end if;
  if starter.stripe_price_id is distinct from 'price_1UNYGnLwKAFEsDh6JIB6CIk8'
     or pro.stripe_price_id is distinct from 'price_1UNYGxLwKAFEsDh6WlRlDegP' then
    raise exception 'BuyerMatch S2 catalog price drift; no partial remap';
  end if;
  update public.bm_plans set stripe_price_id=case version
    when 'buyermatch-starter-v1' then 'price_1UTRdfL6efr9LhPIchNeE7u1'
    when 'buyermatch-pro-v1' then 'price_1UTRdrL6efr9LhPIpYKIYIyd' end
    where version in ('buyermatch-starter-v1','buyermatch-pro-v1') and product='buyermatch' and approved;
  get diagnostics changed=row_count;
  if changed<>2 then raise exception 'BuyerMatch S2 remap count mismatch'; end if;
end $$;
commit;
