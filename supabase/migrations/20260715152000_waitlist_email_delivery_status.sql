alter table public.waitlist_entries
  add column if not exists admin_notification_status text not null default 'pending',
  add column if not exists admin_notification_sent_at timestamptz,
  add column if not exists confirmation_email_status text not null default 'pending',
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists email_last_error text,
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists source_page text,
  add column if not exists referral_data text;

create index if not exists waitlist_entries_created_at_idx
  on public.waitlist_entries (created_at desc);

create index if not exists waitlist_entries_email_status_idx
  on public.waitlist_entries (admin_notification_status, confirmation_email_status);
