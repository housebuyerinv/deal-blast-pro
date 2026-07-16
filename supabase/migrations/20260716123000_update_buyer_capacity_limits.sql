create or replace function public.dealblast_buyer_plan_limit(plan_name text)
returns integer
language sql
stable
as $$
  select case lower(coalesce(plan_name, 'free'))
    when 'free demo' then 25
    when 'free' then 25
    when 'starter' then 250
    when 'pro' then 1000
    when 'agency' then 2000
    when 'enterprise' then 5000
    else 25
  end;
$$;
