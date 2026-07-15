create table if not exists public.cloud_snapshots (
  user_id uuid not null,
  storage_key text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, storage_key)
);

alter table public.cloud_snapshots enable row level security;

drop policy if exists "Cloud snapshots readable by owner" on public.cloud_snapshots;
create policy "Cloud snapshots readable by owner"
on public.cloud_snapshots
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Cloud snapshots insertable by owner" on public.cloud_snapshots;
create policy "Cloud snapshots insertable by owner"
on public.cloud_snapshots
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Cloud snapshots updateable by owner" on public.cloud_snapshots;
create policy "Cloud snapshots updateable by owner"
on public.cloud_snapshots
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Cloud snapshots deletable by owner" on public.cloud_snapshots;
create policy "Cloud snapshots deletable by owner"
on public.cloud_snapshots
for delete
to authenticated
using (user_id = auth.uid());
