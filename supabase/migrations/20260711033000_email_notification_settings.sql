create extension if not exists pgcrypto;

create table if not exists public.email_notification_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  user_id uuid default auth.uid(),
  enabled boolean not null default true,
  recipients text[] not null default array['housebuyerinv@gmail.com'],
  notify_new_account boolean not null default true,
  notify_new_deal boolean not null default true,
  notify_new_buyer boolean not null default true,
  notify_buyer_verification boolean not null default true,
  notify_missing_docs boolean not null default true,
  notify_buyer_match boolean not null default true,
  notify_offer_received boolean not null default true,
  notify_offer_response_needed boolean not null default true,
  notify_inventory_conversion boolean not null default true,
  notify_deal_status_change boolean not null default true,
  notify_closing_followup boolean not null default true,
  last_test_status text,
  last_test_at timestamptz,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.email_notification_settings
  add column if not exists notify_new_account boolean not null default true;

create table if not exists public.email_notification_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  user_id uuid,
  event_type text not null,
  related_record_id text,
  recipient text not null,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  attempted_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  error_message text,
  response jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists email_notification_logs_idempotency_key_idx
  on public.email_notification_logs (idempotency_key)
  where idempotency_key is not null;

create or replace function public.set_email_notification_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_notification_settings_updated_at on public.email_notification_settings;
create trigger email_notification_settings_updated_at
before update on public.email_notification_settings
for each row execute function public.set_email_notification_settings_updated_at();

alter table public.email_notification_settings enable row level security;
alter table public.email_notification_logs enable row level security;

drop policy if exists "Email settings readable by owner" on public.email_notification_settings;
create policy "Email settings readable by owner"
on public.email_notification_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Email settings insertable by owner" on public.email_notification_settings;
create policy "Email settings insertable by owner"
on public.email_notification_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Email settings updateable by owner" on public.email_notification_settings;
create policy "Email settings updateable by owner"
on public.email_notification_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Email logs readable by workspace settings owner" on public.email_notification_logs;
create policy "Email logs readable by workspace settings owner"
on public.email_notification_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.email_notification_settings s
    where s.workspace_id = email_notification_logs.workspace_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "Email logs insertable by authenticated owner" on public.email_notification_logs;
create policy "Email logs insertable by authenticated owner"
on public.email_notification_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.email_notification_settings s
    where s.workspace_id = email_notification_logs.workspace_id
      and s.user_id = auth.uid()
  )
);
