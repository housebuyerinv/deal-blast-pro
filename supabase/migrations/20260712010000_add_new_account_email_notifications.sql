alter table public.email_notification_settings
  add column if not exists notify_new_account boolean not null default true;

update public.email_notification_settings
set notify_new_account = true
where notify_new_account is null;
