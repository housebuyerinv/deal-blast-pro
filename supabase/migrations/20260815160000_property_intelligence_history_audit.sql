-- Durable Property Intelligence history and operational audit.
-- The immutable credit ledger remains the only financial source of truth.

create table if not exists public.property_intelligence_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  normalized_address text not null,
  display_address text not null,
  last_lookup_operation_id uuid references public.property_intelligence_lookup_operations(id) on delete set null,
  last_audit_id uuid,
  result_reference text,
  result_metadata jsonb not null default '{}'::jsonb,
  is_saved boolean not null default false,
  saved_at timestamptz,
  last_searched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, normalized_address)
);

create table if not exists public.property_intelligence_operation_audit (
  id uuid primary key default gen_random_uuid(),
  lookup_id text not null unique,
  workspace_id uuid not null,
  user_id uuid,
  normalized_address text not null,
  display_address text,
  action_type text not null default 'lookup',
  cache_hit boolean not null default false,
  provider_called boolean not null default false,
  provider_name text not null default 'rentcast',
  provider_succeeded boolean,
  credit_operation_id uuid references public.property_intelligence_lookup_operations(id) on delete set null,
  credit_reservation_reference text,
  credit_finalization_reference text,
  credit_release_reference text,
  credits_consumed integer not null default 0 check (credits_consumed >= 0),
  cache_reference text,
  result_status text not null default 'started',
  error_code text,
  error_message text,
  request_correlation_id text,
  provider_request_count integer not null default 0 check (provider_request_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.property_intelligence_searches
    add constraint property_intelligence_searches_last_audit_fk
    foreign key (last_audit_id) references public.property_intelligence_operation_audit(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists property_intelligence_searches_recent_idx
  on public.property_intelligence_searches (workspace_id, user_id, last_searched_at desc);
create index if not exists property_intelligence_searches_saved_idx
  on public.property_intelligence_searches (workspace_id, user_id, is_saved, saved_at desc);
create index if not exists property_intelligence_audit_workspace_idx
  on public.property_intelligence_operation_audit (workspace_id, created_at desc);
create index if not exists property_intelligence_audit_lookup_idx
  on public.property_intelligence_operation_audit (lookup_id);
create index if not exists property_intelligence_audit_credit_idx
  on public.property_intelligence_operation_audit (credit_operation_id);

alter table public.property_intelligence_searches enable row level security;
alter table public.property_intelligence_operation_audit enable row level security;

drop policy if exists "Workspace users view own property searches" on public.property_intelligence_searches;
create policy "Workspace users view own property searches"
  on public.property_intelligence_searches for select to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid())
  );

drop policy if exists "Workspace users manage own property searches" on public.property_intelligence_searches;
create policy "Workspace users manage own property searches"
  on public.property_intelligence_searches for all to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid())
  );

drop policy if exists "Workspace users view own property audit" on public.property_intelligence_operation_audit;
create policy "Workspace users view own property audit"
  on public.property_intelligence_operation_audit for select to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_user_id = auth.uid())
  );

revoke insert, update, delete on public.property_intelligence_operation_audit from anon, authenticated;
grant select on public.property_intelligence_searches, public.property_intelligence_operation_audit to authenticated;
grant insert, update, delete on public.property_intelligence_searches to authenticated;
