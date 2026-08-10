create or replace function public.list_email_outbox_operations(
  p_workspace_id text,
  p_limit integer default 8
)
returns table (
  id uuid,
  event_type text,
  recipient text,
  provider text,
  provider_message_id text,
  status text,
  attempt_count integer,
  last_error_category text,
  created_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    o.event_type,
    o.recipient,
    o.provider,
    o.provider_message_id,
    o.status,
    o.attempt_count,
    o.last_error_category,
    o.created_at,
    o.sent_at,
    o.delivered_at
  from public.email_outbox o
  where o.workspace_id = p_workspace_id
    and auth.uid() is not null
    and exists (
      select 1
      from public.email_notification_settings s
      where s.workspace_id = p_workspace_id
        and s.user_id = auth.uid()
    )
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

revoke all on function public.list_email_outbox_operations(text, integer) from public, anon;
grant execute on function public.list_email_outbox_operations(text, integer) to authenticated;
