-- Resolve legacy converted submissions through their original authenticated
-- reservation owner, then perform the same duplicate-safe durable backfill.

update public.deal_submissions ds
set workspace_id = w.id
from public.submission_inventory_links link
join public.workspaces w on w.owner_user_id = link.user_id
where ds.workspace_id is null
  and link.source_submission_id = ds.id::text
  and lower(ds.status) in ('converted', 'imported', 'imported to pipeline', 'imported_to_pipeline');

insert into public.inventory_deals (
  id,
  workspace_id,
  created_by_user_id,
  source_submission_id,
  status,
  deal_data,
  created_at,
  updated_at
)
select
  coalesce(nullif(ds.inventory_deal_id, ''), 'submission-' || replace(ds.id::text, '-', '')),
  ds.workspace_id,
  w.owner_user_id,
  ds.id::text,
  'Approved',
  public.inventory_deal_from_submission(
    ds,
    coalesce(nullif(ds.inventory_deal_id, ''), 'submission-' || replace(ds.id::text, '-', ''))
  ),
  coalesce(ds.converted_at, ds.created_at),
  coalesce(ds.updated_at, ds.converted_at, ds.created_at)
from public.deal_submissions ds
join public.workspaces w on w.id = ds.workspace_id
where lower(ds.status) in ('converted', 'imported', 'imported to pipeline', 'imported_to_pipeline')
  and not exists (
    select 1
    from public.inventory_deals existing
    where existing.workspace_id = ds.workspace_id
      and existing.source_submission_id = ds.id::text
  )
on conflict do nothing;

insert into public.submission_inventory_links (
  source_submission_id,
  inventory_deal_id,
  user_id,
  workspace_id,
  created_at,
  updated_at
)
select
  ds.id::text,
  inventory.id,
  inventory.created_by_user_id,
  inventory.workspace_id,
  coalesce(ds.converted_at, ds.created_at),
  coalesce(ds.updated_at, ds.converted_at, ds.created_at)
from public.deal_submissions ds
join public.inventory_deals inventory
  on inventory.workspace_id = ds.workspace_id
 and inventory.source_submission_id = ds.id::text
where lower(ds.status) in ('converted', 'imported', 'imported to pipeline', 'imported_to_pipeline')
on conflict (source_submission_id) do update set
  inventory_deal_id = excluded.inventory_deal_id,
  workspace_id = excluded.workspace_id,
  updated_at = greatest(public.submission_inventory_links.updated_at, excluded.updated_at);

update public.deal_submissions ds
set inventory_deal_id = inventory.id
from public.inventory_deals inventory
where inventory.workspace_id = ds.workspace_id
  and inventory.source_submission_id = ds.id::text
  and lower(ds.status) in ('converted', 'imported', 'imported to pipeline', 'imported_to_pipeline')
  and ds.inventory_deal_id is distinct from inventory.id;
