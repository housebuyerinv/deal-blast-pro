alter table public.account_profiles
  add column if not exists onboarding_version_completed integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_dismissed_at timestamptz;

create index if not exists account_profiles_onboarding_version_idx
  on public.account_profiles (user_id, onboarding_version_completed);
