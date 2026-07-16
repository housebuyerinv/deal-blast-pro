alter table public.workspace_plan_assignments
  add column if not exists current_plan text,
  add column if not exists effective_access_plan text,
  add column if not exists scheduled_plan text,
  add column if not exists scheduled_plan_change_at timestamptz,
  add column if not exists scheduled_plan_change_reason text,
  add column if not exists billing_interval text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text,
  add column if not exists proration_behavior text,
  add column if not exists last_plan_sync_at timestamptz,
  add column if not exists plan_change_source text;

update public.workspace_plan_assignments
set
  current_plan = coalesce(current_plan, plan_name),
  effective_access_plan = coalesce(effective_access_plan, plan_name),
  billing_interval = coalesce(billing_interval, nullif(trial_status, ''))
where current_plan is null
   or effective_access_plan is null;

alter table public.email_notification_settings
  add column if not exists billing_transactional_required boolean not null default true,
  add column if not exists renewal_reminders boolean not null default true,
  add column if not exists annual_renewal_reminders boolean not null default true,
  add column if not exists payment_receipts boolean not null default true,
  add column if not exists invoice_notifications boolean not null default true,
  add column if not exists card_expiration_reminders boolean not null default true,
  add column if not exists billing_summary boolean not null default false,
  add column if not exists updated_by_user_id uuid;

alter table public.email_notification_settings
  drop constraint if exists email_notification_settings_billing_transactional_required_true;

alter table public.email_notification_settings
  add constraint email_notification_settings_billing_transactional_required_true
  check (billing_transactional_required is true);

create table if not exists public.billing_notification_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  user_id uuid,
  event_type text not null,
  billing_event_id text,
  stripe_event_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivery_status text not null default 'queued',
  provider text not null default 'resend',
  provider_message_id text,
  failure_reason text,
  attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_notification_events_idempotency_key_idx
  on public.billing_notification_events (idempotency_key);

create index if not exists billing_notification_events_workspace_status_idx
  on public.billing_notification_events (workspace_id, delivery_status, scheduled_for);

alter table public.billing_notification_events enable row level security;

drop policy if exists "Billing notification events readable by workspace settings owner" on public.billing_notification_events;
create policy "Billing notification events readable by workspace settings owner"
on public.billing_notification_events
for select
to authenticated
using (
  exists (
    select 1
    from public.email_notification_settings s
    where s.workspace_id = billing_notification_events.workspace_id
      and s.user_id = auth.uid()
  )
);
