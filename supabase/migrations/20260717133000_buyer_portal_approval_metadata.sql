alter table public.buyer_portal_submissions
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists created_buyer_id text;

create index if not exists buyer_portal_submissions_created_buyer_idx
  on public.buyer_portal_submissions (created_buyer_id);
