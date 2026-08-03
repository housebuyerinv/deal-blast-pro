-- Final compatibility backfill for legacy rows whose conversion state was
-- recorded in metadata rather than the deal_submissions.status column.

with workspace_evidence as (
  select user_id, workspace_id
  from public.submission_inventory_links
  where workspace_id is not null
  union
  select created_by_user_id as user_id, workspace_id
  from public.inventory_deals
), resolved_user_workspace as (
  select user_id, min(workspace_id::text)::uuid as workspace_id
  from workspace_evidence
  group by user_id
  having count(distinct workspace_id) = 1
)
update public.deal_submissions ds
set workspace_id = resolved.workspace_id
from public.submission_inventory_links link
join resolved_user_workspace resolved on resolved.user_id = link.user_id
where ds.workspace_id is null
  and link.source_submission_id = ds.id::text
  and (
    ds.converted_at is not null
    or nullif(ds.inventory_deal_id, '') is not null
    or lower(coalesce(ds.deal_data->>'submissionStatus', '')) = 'converted'
  );

insert into public.inventory_deals (
  id, workspace_id, created_by_user_id, source_submission_id,
  status, deal_data, created_at, updated_at
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
where (
    ds.converted_at is not null
    or nullif(ds.inventory_deal_id, '') is not null
    or lower(coalesce(ds.deal_data->>'submissionStatus', '')) = 'converted'
  )
  and not exists (
    select 1 from public.inventory_deals existing
    where existing.workspace_id = ds.workspace_id
      and existing.source_submission_id = ds.id::text
  )
on conflict do nothing;

insert into public.submission_inventory_links (
  source_submission_id, inventory_deal_id, user_id, workspace_id,
  created_at, updated_at
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
where ds.converted_at is not null
   or nullif(ds.inventory_deal_id, '') is not null
   or lower(coalesce(ds.deal_data->>'submissionStatus', '')) = 'converted'
on conflict (source_submission_id) do update set
  inventory_deal_id = excluded.inventory_deal_id,
  workspace_id = excluded.workspace_id,
  updated_at = greatest(public.submission_inventory_links.updated_at, excluded.updated_at);

update public.deal_submissions ds
set inventory_deal_id = inventory.id,
    status = 'converted'
from public.inventory_deals inventory
where inventory.workspace_id = ds.workspace_id
  and inventory.source_submission_id = ds.id::text
  and (
    ds.converted_at is not null
    or nullif(ds.inventory_deal_id, '') is not null
    or lower(coalesce(ds.deal_data->>'submissionStatus', '')) = 'converted'
  )
  and (ds.inventory_deal_id is distinct from inventory.id or lower(ds.status) <> 'converted');
