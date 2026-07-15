create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null default '',
  email text not null default '',
  company text not null default '',
  role text not null default '',
  interest_type text not null default '',
  message text not null default '',
  source_page text not null default 'Contact',
  status text not null default 'New',
  email_notification_status text not null default 'pending',
  owner_user_email text not null default 'housebuyerinv@gmail.com',
  user_agent text not null default '',
  current_url text not null default ''
);

alter table public.contact_submissions enable row level security;

drop policy if exists "Public can create contact submissions" on public.contact_submissions;
create policy "Public can create contact submissions"
  on public.contact_submissions
  for insert
  to anon, authenticated
  with check (
    source_page = 'Contact'
    and length(trim(email)) > 0
    and length(trim(full_name)) > 0
    and length(trim(message)) > 0
  );

drop policy if exists "Service role can manage contact submissions" on public.contact_submissions;
create policy "Service role can manage contact submissions"
  on public.contact_submissions
  for all
  to service_role
  using (true)
  with check (true);
