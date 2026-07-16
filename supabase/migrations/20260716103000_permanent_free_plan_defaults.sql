alter table public.workspace_plan_assignments
  alter column plan_name set default 'Free',
  alter column billing_status set default 'Free Active',
  alter column trial_status set default 'Not Trial';

update public.workspace_plan_assignments
set
  plan_name = 'Free',
  billing_status = case
    when billing_status = 'Trial Active' then 'Free Active'
    else billing_status
  end,
  trial_status = case
    when trial_status = 'Trial Active' then 'Not Trial'
    else trial_status
  end,
  updated_at = now()
where plan_name = 'Free Demo';
