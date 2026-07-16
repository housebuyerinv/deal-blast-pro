alter table public.account_profiles
  add column if not exists display_name text,
  add column if not exists business_name text,
  add column if not exists avatar_url text,
  add column if not exists updated_by_user_id uuid,
  add column if not exists community_username text;

update public.account_profiles
set business_name = coalesce(business_name, nullif(company, ''))
where business_name is null;

create table if not exists public.account_profile_email_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  current_email text not null,
  requested_email text not null,
  status text not null default 'verification_pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.account_profile_email_change_events enable row level security;

drop policy if exists "Email change events readable by owner" on public.account_profile_email_change_events;
create policy "Email change events readable by owner"
on public.account_profile_email_change_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Email change events insertable by owner" on public.account_profile_email_change_events;
create policy "Email change events insertable by owner"
on public.account_profile_email_change_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Account profiles insertable by owner" on public.account_profiles;
create policy "Account profiles insertable by owner"
on public.account_profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and coalesce(role, 'Admin') = 'Admin'
);

create or replace function public.prevent_account_profile_protected_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  verified_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed from account settings';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'account status cannot be changed from account settings';
  end if;

  if new.deactivated_at is distinct from old.deactivated_at then
    raise exception 'deactivation status cannot be changed from account settings';
  end if;

  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    if verified_email = '' or lower(new.email) <> verified_email then
      raise exception 'email can only sync after Supabase Auth verifies the change';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists account_profiles_prevent_protected_updates on public.account_profiles;
create trigger account_profiles_prevent_protected_updates
before update on public.account_profiles
for each row execute function public.prevent_account_profile_protected_updates();
