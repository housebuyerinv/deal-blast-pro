create extension if not exists pgcrypto;

create table if not exists public.inventory_deals (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_user_id uuid not null,
  source_submission_id text,
  status text not null default 'Approved',
  deal_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_submission_id)
);

create index if not exists inventory_deals_workspace_updated_idx
  on public.inventory_deals (workspace_id, updated_at desc);

alter table public.submission_inventory_links
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.inventory_deals enable row level security;

create or replace function public.can_access_inventory_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_plan_assignments wpa
    where wpa.workspace_id = p_workspace_id and wpa.user_id = auth.uid()
      and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  )
$$;

drop policy if exists "Inventory deals readable by workspace member" on public.inventory_deals;
create policy "Inventory deals readable by workspace member"
on public.inventory_deals for select to authenticated
using (public.can_access_inventory_workspace(workspace_id));

drop policy if exists "Inventory deals insertable by workspace member" on public.inventory_deals;
create policy "Inventory deals insertable by workspace member"
on public.inventory_deals for insert to authenticated
with check (created_by_user_id = auth.uid() and public.can_access_inventory_workspace(workspace_id));

drop policy if exists "Inventory deals updateable by workspace member" on public.inventory_deals;
create policy "Inventory deals updateable by workspace member"
on public.inventory_deals for update to authenticated
using (public.can_access_inventory_workspace(workspace_id))
with check (public.can_access_inventory_workspace(workspace_id));

drop policy if exists "Inventory deals deleteable by workspace member" on public.inventory_deals;
create policy "Inventory deals deleteable by workspace member"
on public.inventory_deals for delete to authenticated
using (public.can_access_inventory_workspace(workspace_id));

drop policy if exists "Submission Inventory links readable by owner" on public.submission_inventory_links;
create policy "Submission Inventory links readable by workspace member"
on public.submission_inventory_links for select to authenticated
using (user_id = auth.uid() or public.can_access_inventory_workspace(workspace_id));

grant select, insert, update, delete on public.inventory_deals to authenticated;

create or replace function public.inventory_deal_from_submission(
  p_submission public.deal_submissions,
  p_inventory_id text
) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p_inventory_id, 'status', 'Approved', 'source', 'Public Portal',
    'sourceSubmissionId', p_submission.id::text,
    'originalSubmissionId', p_submission.id::text,
    'originalSubmission', coalesce(p_submission.deal_data, '{}'::jsonb),
    'createdAt', coalesce(p_submission.converted_at, p_submission.created_at, now()),
    'updatedAt', coalesce(p_submission.updated_at, p_submission.converted_at, p_submission.created_at, now()),
    'submitter', jsonb_build_object(
      'name', coalesce(p_submission.deal_data->>'name', p_submission.deal_data#>>'{submitter,name}', 'Unknown submitter'),
      'email', coalesce(p_submission.deal_data->>'email', p_submission.deal_data#>>'{submitter,email}', ''),
      'phone', coalesce(p_submission.deal_data->>'phone', p_submission.deal_data#>>'{submitter,phone}', ''),
      'company', coalesce(p_submission.deal_data->>'company', p_submission.deal_data#>>'{submitter,company}', '')
    ),
    'property', jsonb_build_object(
      'address', coalesce(p_submission.deal_data->>'address', p_submission.deal_data#>>'{property,address}', 'Address not provided'),
      'city', coalesce(p_submission.deal_data->>'city', p_submission.deal_data#>>'{property,city}', ''),
      'state', coalesce(p_submission.deal_data->>'state', p_submission.deal_data#>>'{property,state}', ''),
      'zip', coalesce(p_submission.deal_data->>'zip', p_submission.deal_data#>>'{property,zip}', ''),
      'type', coalesce(p_submission.deal_data->>'assetType', p_submission.deal_data#>>'{property,type}', 'Unknown'),
      'beds', coalesce(p_submission.deal_data->'beds', p_submission.deal_data#>'{property,beds}'),
      'baths', coalesce(p_submission.deal_data->'baths', p_submission.deal_data#>'{property,baths}'),
      'sqft', coalesce(p_submission.deal_data->'sqFt', p_submission.deal_data#>'{property,sqFt}'),
      'units', coalesce(p_submission.deal_data->'units', p_submission.deal_data#>'{property,units}')
    ),
    'pricing', jsonb_build_object(
      'askingPrice', coalesce(p_submission.deal_data->'askingPrice', p_submission.deal_data#>'{pricing,askingPrice}'),
      'contractPrice', coalesce(p_submission.deal_data->'contractPrice', p_submission.deal_data#>'{pricing,contractPrice}', p_submission.deal_data->'askingPrice'),
      'arv', coalesce(p_submission.deal_data->'arv', p_submission.deal_data#>'{pricing,arv}'),
      'rehab', coalesce(p_submission.deal_data->'rehab', p_submission.deal_data#>'{pricing,rehab}')
    ),
    'debt', coalesce(p_submission.deal_data->'debt', '{}'::jsonb),
    'condition', jsonb_build_object('notes', coalesce(p_submission.deal_data->>'notes', '')),
    'docs', coalesce(p_submission.deal_data->'docs', p_submission.deal_data->'uploadedFiles', '[]'::jsonb),
    'notes', coalesce(p_submission.deal_data->>'notes', '')
  )
$$;

create or replace function public.convert_deal_submission_to_inventory(
  p_submission_id text,
  p_inventory_deal jsonb default null,
  p_converted_by text default null
) returns setof public.inventory_deals
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_submission public.deal_submissions%rowtype;
  v_id text;
  v_at timestamptz;
  v_data jsonb;
begin
  if v_user is null then raise exception 'Authentication is required'; end if;
  select w.id into v_workspace from public.workspaces w
  left join public.workspace_plan_assignments wpa
    on wpa.workspace_id = w.id and wpa.user_id = v_user
  where (w.owner_user_id = v_user or wpa.user_id = v_user)
    and coalesce(wpa.access_status, 'Active') not in ('Deactivated', 'Deleted')
  order by (w.owner_user_id = v_user) desc limit 1;
  if v_workspace is null then raise exception 'No active workspace is available'; end if;

  select * into v_submission from public.deal_submissions
    where id::text = p_submission_id for update;
  if not found then raise exception 'Deal submission not found'; end if;

  select inventory_deal_id into v_id from public.submission_inventory_links
    where source_submission_id = p_submission_id;
  v_id := coalesce(v_id, nullif(v_submission.inventory_deal_id, ''),
    'submission-' || replace(p_submission_id, '-', ''));
  v_at := coalesce(v_submission.converted_at, now());
  v_data := coalesce(p_inventory_deal, public.inventory_deal_from_submission(v_submission, v_id))
    || jsonb_build_object('id', v_id, 'sourceSubmissionId', p_submission_id,
      'originalSubmissionId', p_submission_id, 'createdAt', v_at, 'updatedAt', now());

  insert into public.inventory_deals
    (id, workspace_id, created_by_user_id, source_submission_id, status, deal_data, created_at, updated_at)
  values (v_id, v_workspace, v_user, p_submission_id,
    coalesce(v_data->>'status', 'Approved'), v_data, v_at, now())
  on conflict (workspace_id, source_submission_id) do update
    set updated_at = public.inventory_deals.updated_at
  returning id into v_id;

  insert into public.submission_inventory_links
    (source_submission_id, inventory_deal_id, user_id, workspace_id, created_at, updated_at)
  values (p_submission_id, v_id, v_user, v_workspace, v_at, now())
  on conflict (source_submission_id) do update set
    inventory_deal_id = excluded.inventory_deal_id,
    workspace_id = coalesce(public.submission_inventory_links.workspace_id, excluded.workspace_id),
    updated_at = now();

  update public.deal_submissions set
    status = 'converted', inventory_deal_id = v_id, converted_at = v_at,
    converted_by = coalesce(nullif(converted_by, ''), nullif(p_converted_by, ''), v_user::text),
    deal_data = jsonb_set(jsonb_set(jsonb_set(
      coalesce(deal_data, '{}'::jsonb), '{submissionStatus}', '"Converted"', true),
      '{inventoryDealId}', to_jsonb(v_id), true), '{convertedAt}', to_jsonb(v_at), true)
      || jsonb_build_object('conversionAudit',
        case when coalesce(deal_data->'conversionAudit', '[]'::jsonb) @>
          jsonb_build_array(jsonb_build_object('event', 'submission_converted', 'inventoryDealId', v_id))
        then coalesce(deal_data->'conversionAudit', '[]'::jsonb)
        else coalesce(deal_data->'conversionAudit', '[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object(
            'event', 'submission_converted', 'previousStatus', v_submission.status,
            'newStatus', 'converted', 'inventoryDealId', v_id,
            'convertedBy', coalesce(nullif(p_converted_by, ''), v_user::text), 'at', v_at))
        end),
    updated_at = now()
  where id::text = p_submission_id;

  return query select d.* from public.inventory_deals d where d.id = v_id;
end
$$;

revoke all on function public.convert_deal_submission_to_inventory(text, jsonb, text) from public, anon;
grant execute on function public.convert_deal_submission_to_inventory(text, jsonb, text) to authenticated;

-- Duplicate-safe one-time repair. It preserves submission IDs/timestamps/audit
-- metadata and skips rows whose workspace cannot be resolved safely.
do $$
declare
  s public.deal_submissions%rowtype;
  v_workspace uuid; v_user uuid; v_id text;
begin
  for s in select ds.* from public.deal_submissions ds
    where lower(ds.status) in ('converted','imported','imported to pipeline','imported_to_pipeline')
      and not exists (select 1 from public.inventory_deals d where d.source_submission_id = ds.id::text)
  loop
    v_workspace := null; v_user := null;
    begin v_user := nullif(s.converted_by, '')::uuid;
    exception when invalid_text_representation then v_user := null; end;
    if v_user is not null then
      select id into v_workspace from public.workspaces where owner_user_id = v_user limit 1;
    end if;
    if v_workspace is null and nullif(s.converted_by, '') is not null then
      select id, owner_user_id into v_workspace, v_user from public.workspaces
        where lower(owner_email) = lower(s.converted_by) limit 1;
    end if;
    if v_workspace is null and (select count(*) from public.workspaces) = 1 then
      select id, owner_user_id into v_workspace, v_user from public.workspaces limit 1;
    end if;
    if v_workspace is null then continue; end if;
    v_id := coalesce(nullif(s.inventory_deal_id, ''), 'submission-' || replace(s.id::text, '-', ''));
    insert into public.inventory_deals
      (id, workspace_id, created_by_user_id, source_submission_id, status, deal_data, created_at, updated_at)
    values (v_id, v_workspace, v_user, s.id::text, 'Approved',
      public.inventory_deal_from_submission(s, v_id),
      coalesce(s.converted_at, s.created_at), coalesce(s.updated_at, s.converted_at, s.created_at))
    on conflict do nothing;
    if exists (select 1 from public.inventory_deals where source_submission_id = s.id::text) then
      insert into public.submission_inventory_links
        (source_submission_id, inventory_deal_id, user_id, workspace_id, created_at, updated_at)
      values (s.id::text, v_id, v_user, v_workspace,
        coalesce(s.converted_at, s.created_at), coalesce(s.updated_at, s.converted_at, s.created_at))
      on conflict (source_submission_id) do update set
        workspace_id = coalesce(public.submission_inventory_links.workspace_id, excluded.workspace_id);
    end if;
  end loop;
end
$$;
