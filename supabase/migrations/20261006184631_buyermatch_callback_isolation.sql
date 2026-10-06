-- Reuse the unique provider receipt and immutable capability environment.
-- No backfill, new delivery, configuration enablement, or historical rewrite.
create function public.bm_delivery_scope_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if new.exposure_id is distinct from old.exposure_id
 or (old.provider_message_id is not null and new.provider_message_id is distinct from old.provider_message_id)
 or (old.accepted_at is not null and (new.accepted_at is distinct from old.accepted_at or new.test_delivery is distinct from old.test_delivery))
 then raise exception 'Delivery scope is immutable';end if;
 return new;
end $$;
revoke all on function public.bm_delivery_scope_immutable() from public,anon,authenticated;
create trigger bm_delivery_scope_immutable before update on public.bm_outbox for each row execute function public.bm_delivery_scope_immutable();
create function public.bm_record_provider_event_scoped(
 p_event text,p_message text,p_kind text,p_at timestamptz,p_environment text
) returns boolean language plpgsql security definer set search_path=public as $$
declare o bm_outbox; ex bm_exposures;
begin
 if p_environment is null or p_environment not in ('staging','production')
 or coalesce(p_event,'')='' or coalesce(p_message,'')='' or p_at is null
 or p_kind is null or p_kind not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed','email.opened','email.clicked') then return false;end if;
 select * into o from bm_outbox where provider_message_id=p_message for update;
 if not found or o.accepted_at is null or o.test_delivery is distinct from (p_environment='staging') then return false;end if;
 select e.* into ex from bm_exposures e
 join bm_deals d on d.id=e.deal_id and d.owner_id=e.owner_id
 join bm_buyers b on b.id=e.buyer_id
 join bm_response_tokens t on t.exposure_id=e.id and t.environment=p_environment
 where e.id=o.exposure_id and (p_environment<>'production' or not b.synthetic)
 and exists(select 1 from bm_distribution_requests r where r.deal_id=e.deal_id and r.owner_id=e.owner_id and r.operation_key=e.operation_key);
 if not found then return false;end if;
 -- Provider payload owner/deal/recipient fields are never inputs to this RPC.
 insert into bm_provider_events(event_id,outbox_id,kind,occurred_at)
 values(p_event,o.id,p_kind,p_at) on conflict(event_id) do nothing;
 if not found then return true;end if;
 if p_kind='email.delivered' then
  update bm_outbox set delivered_at=coalesce(delivered_at,p_at),state=case when state in ('bounced','complained','suppressed','permanent_failure') then state else 'delivered' end where id=o.id;
 elsif p_kind in ('email.bounced','email.complained','email.suppressed') then
  update bm_outbox set state=case p_kind when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' else 'suppressed' end where id=o.id;
  update bm_buyers set status='suppressed',opted_out_at=coalesce(opted_out_at,p_at) where id=ex.buyer_id;
  update bm_outbox set state='suppressed' where exposure_id in(select id from bm_exposures where buyer_id=ex.buyer_id) and accepted_at is null and test_delivery=(p_environment='staging');
 elsif p_kind='email.failed' then
  update bm_outbox set state='permanent_failure' where id=o.id and state not in ('delivered','bounced','complained','suppressed');
 end if;
 return true;
end $$;
revoke all on function public.bm_record_provider_event_scoped(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.bm_record_provider_event_scoped(text,text,text,timestamptz,text) to service_role;
-- Retire the unscoped entry point. Old deployed handlers fail closed until updated.
create or replace function public.bm_record_provider_event(p_event text,p_message text,p_kind text,p_at timestamptz)
returns boolean language sql security definer set search_path=public as $$ select false $$;
