alter table public.account_profile_email_change_events
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists event_type text;

update public.account_profile_email_change_events
set event_type = case
  when status in ('email_change_requested', 'email_change_completed', 'email_change_failed', 'email_change_canceled', 'email_change_expired') then status
  when status in ('requested', 'verification_pending') then 'email_change_requested'
  when status = 'completed' then 'email_change_completed'
  when status = 'failed' then 'email_change_failed'
  when status = 'canceled' then 'email_change_canceled'
  when status = 'expired' then 'email_change_expired'
  else 'email_change_failed'
end
where event_type is null;

update public.account_profile_email_change_events e
set workspace_id = w.id
from public.workspaces w
where e.workspace_id is null
  and w.owner_user_id = e.user_id;

alter table public.account_profile_email_change_events
  alter column event_type set default 'email_change_requested',
  alter column event_type set not null;

create index if not exists account_profile_email_change_events_workspace_idx
  on public.account_profile_email_change_events (workspace_id, created_at desc);

create index if not exists account_profile_email_change_events_event_type_idx
  on public.account_profile_email_change_events (event_type, created_at desc);

drop policy if exists "Email change events readable by owner" on public.account_profile_email_change_events;
create policy "Email change events readable by owner"
on public.account_profile_email_change_events
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    workspace_id is null
    or exists (
      select 1
      from public.workspaces w
      where w.id = account_profile_email_change_events.workspace_id
        and w.owner_user_id = auth.uid()
    )
  )
);

drop policy if exists "Email change events insertable by owner" on public.account_profile_email_change_events;
create policy "Email change events insertable by owner"
on public.account_profile_email_change_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and event_type in (
    'email_change_requested',
    'email_change_completed',
    'email_change_failed',
    'email_change_canceled',
    'email_change_expired'
  )
  and (
    workspace_id is null
    or exists (
      select 1
      from public.workspaces w
      where w.id = account_profile_email_change_events.workspace_id
        and w.owner_user_id = auth.uid()
    )
  )
);
