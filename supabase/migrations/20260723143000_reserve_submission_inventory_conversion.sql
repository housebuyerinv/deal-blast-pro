create table if not exists public.submission_inventory_links (
  source_submission_id text primary key,
  inventory_deal_id text not null unique,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_submissions
  add column if not exists updated_at timestamptz not null default now();

alter table public.submission_inventory_links enable row level security;

drop policy if exists "Submission Inventory links readable by owner" on public.submission_inventory_links;
create policy "Submission Inventory links readable by owner"
on public.submission_inventory_links
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Submission Inventory links insertable by owner" on public.submission_inventory_links;
create policy "Submission Inventory links insertable by owner"
on public.submission_inventory_links
for insert
to authenticated
with check (user_id = auth.uid());

revoke all on table public.submission_inventory_links from public, anon;
grant select, insert on table public.submission_inventory_links to authenticated;

create or replace function public.reserve_deal_submission_inventory_conversion(
  p_submission_id text,
  p_inventory_deal_id text,
  p_converted_by text
)
returns setof public.deal_submissions
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_submission public.deal_submissions%rowtype;
  reserved_inventory_deal_id text;
  reserved_converted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.submission_inventory_links (
    source_submission_id,
    inventory_deal_id,
    user_id
  )
  values (
    p_submission_id,
    p_inventory_deal_id,
    auth.uid()
  )
  on conflict (source_submission_id) do nothing;

  select link.inventory_deal_id
  into reserved_inventory_deal_id
  from public.submission_inventory_links link
  where link.source_submission_id = p_submission_id
    and link.user_id = auth.uid();

  if reserved_inventory_deal_id is null then
    raise exception 'Submission Inventory relationship belongs to another workspace or is not accessible';
  end if;

  select *
  into current_submission
  from public.deal_submissions
  where id::text = p_submission_id
  for update;

  if not found then
    raise exception 'Deal submission not found or not accessible';
  end if;

  reserved_converted_at := coalesce(current_submission.converted_at, now());

  return query
  update public.deal_submissions
  set
    status = 'converted',
    inventory_deal_id = reserved_inventory_deal_id,
    converted_at = reserved_converted_at,
    converted_by = coalesce(nullif(current_submission.converted_by, ''), nullif(p_converted_by, '')),
    deal_data = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(current_submission.deal_data, '{}'::jsonb),
          '{submissionStatus}',
          to_jsonb('Converted'::text),
          true
        ),
        '{inventoryDealId}',
        to_jsonb(reserved_inventory_deal_id),
        true
      ),
      '{convertedAt}',
      to_jsonb(reserved_converted_at),
      true
    ),
    updated_at = now()
  where id::text = p_submission_id
  returning *;
end;
$$;

revoke all on function public.reserve_deal_submission_inventory_conversion(text, text, text) from public, anon;
grant execute on function public.reserve_deal_submission_inventory_conversion(text, text, text) to authenticated;
