create table if not exists public.announcement_campaigns (
  id uuid primary key default gen_random_uuid(),
  promotion_key text,
  subject text not null,
  html_body text not null,
  text_body text not null,
  audience jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','queued','sending','completed','cancelled')),
  recipient_count integer not null default 0,
  created_by_user_id uuid not null,
  confirmed_by_user_id uuid,
  confirmed_at timestamptz,
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_outbox add column if not exists campaign_id uuid references public.announcement_campaigns(id) on delete set null;
create unique index if not exists email_outbox_campaign_recipient_unique
  on public.email_outbox (campaign_id, recipient) where campaign_id is not null;
create index if not exists email_outbox_campaign_status_idx on public.email_outbox (campaign_id,status);

alter table public.announcement_campaigns enable row level security;
revoke all on table public.announcement_campaigns from public,anon,authenticated;
grant all on table public.announcement_campaigns to service_role;
