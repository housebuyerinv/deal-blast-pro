alter table public.deal_submissions
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by text,
  add column if not exists inventory_deal_id text;

create index if not exists deal_submissions_conversion_idx
  on public.deal_submissions (status, converted_at desc);

create index if not exists deal_submissions_inventory_deal_id_idx
  on public.deal_submissions (inventory_deal_id);
