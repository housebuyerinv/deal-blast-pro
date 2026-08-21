-- Durable, promotion-versioned trial eligibility and dismissal state.
alter table public.workspace_plan_assignments
  add column if not exists trial_consumed_at timestamptz,
  add column if not exists first_paid_at timestamptz,
  add column if not exists trial_checkout_session_id text,
  add column if not exists trial_checkout_created_at timestamptz;

alter table public.account_profiles
  add column if not exists dismissed_promotion_key text,
  add column if not exists dismissed_promotion_at timestamptz,
  add column if not exists product_updates_opt_in boolean not null default false,
  add column if not exists product_updates_preference_updated_at timestamptz;

create index if not exists workspace_plan_assignments_trial_consumed_idx
  on public.workspace_plan_assignments (trial_consumed_at)
  where trial_consumed_at is not null;

comment on column public.workspace_plan_assignments.trial_consumed_at is
  'Set when a DBP-managed free trial is created. Never cleared by cancellation or failed conversion.';
comment on column public.account_profiles.dismissed_promotion_key is
  'Versioned promotion key permanently dismissed by this account; not a global promotion boolean.';
