create or replace function public.insert_email_notification_log(
  p_workspace_id text,
  p_user_id uuid,
  p_event_type text,
  p_related_record_id text,
  p_recipient text,
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_attempt_count integer,
  p_error_message text,
  p_response jsonb,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  insert into public.email_notification_logs (
    workspace_id,
    user_id,
    event_type,
    related_record_id,
    recipient,
    provider,
    provider_message_id,
    status,
    attempt_count,
    attempted_at,
    succeeded_at,
    failed_at,
    error_message,
    response,
    idempotency_key
  )
  values (
    coalesce(p_workspace_id, 'default'),
    p_user_id,
    p_event_type,
    p_related_record_id,
    p_recipient,
    coalesce(p_provider, 'resend'),
    p_provider_message_id,
    coalesce(p_status, 'queued'),
    coalesce(p_attempt_count, 1),
    v_now,
    case when p_status = 'sent' then v_now else null end,
    case when p_status in ('failed', 'skipped') then v_now else null end,
    p_error_message,
    p_response,
    p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set
    provider_message_id = excluded.provider_message_id,
    status = excluded.status,
    attempt_count = greatest(public.email_notification_logs.attempt_count, excluded.attempt_count),
    attempted_at = excluded.attempted_at,
    succeeded_at = excluded.succeeded_at,
    failed_at = excluded.failed_at,
    error_message = excluded.error_message,
    response = excluded.response;
end;
$$;

grant execute on function public.insert_email_notification_log(
  text, uuid, text, text, text, text, text, text, integer, text, jsonb, text
) to anon, authenticated, service_role;
