-- Additive release hardening for the public submission review queue.
-- Public submitters can insert only; authenticated workspace members can review
-- submissions assigned to their workspace. Existing history is never deleted.

alter table public.deal_submissions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

create index if not exists deal_submissions_workspace_created_idx
  on public.deal_submissions (workspace_id, created_at desc);

-- This installation currently has one receiving workspace. Assign legacy rows
-- only when that relationship is unambiguous; otherwise leave them untouched for
-- an operator-assisted assignment.
update public.deal_submissions ds
set workspace_id = (select id from public.workspaces limit 1)
where ds.workspace_id is null
  and (select count(*) from public.workspaces) = 1;

create or replace function public.assign_submission_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_workspace uuid;
begin
  if auth.uid() is not null
    and new.workspace_id is not null
    and public.can_access_inventory_workspace(new.workspace_id) then
    return new;
  end if;
  if (select count(*) from public.workspaces) = 1 then
    select id into v_workspace from public.workspaces limit 1;
    new.workspace_id := v_workspace;
  else
    raise exception 'A submission workspace route is required';
  end if;
  return new;
end
$$;

drop trigger if exists assign_submission_workspace_before_insert on public.deal_submissions;
create trigger assign_submission_workspace_before_insert
before insert on public.deal_submissions
for each row execute function public.assign_submission_workspace();

drop policy if exists "Public can create deal submissions" on public.deal_submissions;
create policy "Public can create deal submissions"
on public.deal_submissions for insert to anon, authenticated
with check (
  source = 'public_portal'
  and status in ('pending', 'submitted')
  and workspace_id is not null
);

drop policy if exists "Deal submissions readable by workspace member" on public.deal_submissions;
create policy "Deal submissions readable by workspace member"
on public.deal_submissions for select to authenticated
using (workspace_id is not null and public.can_access_inventory_workspace(workspace_id));

drop policy if exists "Deal submissions updateable by workspace member" on public.deal_submissions;
create policy "Deal submissions updateable by workspace member"
on public.deal_submissions for update to authenticated
using (workspace_id is not null and public.can_access_inventory_workspace(workspace_id))
with check (workspace_id is not null and public.can_access_inventory_workspace(workspace_id));

grant select, update on public.deal_submissions to authenticated;

alter table public.submission_inventory_links
  alter column workspace_id set default null;
