-- Additive email reliability hardening: atomic worker leases and explicit delivery lifecycle.
alter table public.email_outbox
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.email_outbox drop constraint if exists email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check check (status in (
  'queued','processing','provider_accepted','delivered','bounced','complained','suppressed',
  'transient_failure','permanent_failure','retry_scheduled','failed_permanently',
  -- Legacy states remain valid while existing rows and older deployments drain.
  'retrying','sending','sent','failed'
));

create index if not exists email_outbox_worker_claim_idx
  on public.email_outbox (next_attempt_at, lease_expires_at)
  where status in ('queued','retry_scheduled','retrying','transient_failure');

create or replace function public.claim_email_outbox_batch(
  p_worker_token uuid,
  p_batch_size integer default 25,
  p_lease_seconds integer default 120
)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_token is null then raise exception 'worker token is required'; end if;
  return query
  with due as (
    select o.id
    from public.email_outbox o
    where o.status in ('queued','retry_scheduled','retrying','transient_failure')
      and o.next_attempt_at <= now()
      and o.attempt_count < 6
      and (o.lease_expires_at is null or o.lease_expires_at < now())
    order by o.next_attempt_at, o.created_at
    for update skip locked
    limit least(50, greatest(1, coalesce(p_batch_size, 25)))
  )
  update public.email_outbox o
  set status = 'processing',
      attempt_count = o.attempt_count + 1,
      lease_token = p_worker_token,
      lease_expires_at = now() + make_interval(secs => least(600, greatest(30, coalesce(p_lease_seconds, 120)))),
      processing_started_at = now(),
      updated_at = now()
  from due
  where o.id = due.id
  returning o.*;
end
$$;

revoke all on function public.claim_email_outbox_batch(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_email_outbox_batch(uuid,integer,integer) to service_role;

