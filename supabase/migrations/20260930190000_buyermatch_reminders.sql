begin;
create table public.bm_reminders (
 id uuid primary key default gen_random_uuid(),deal_id uuid not null references public.bm_deals(id),
 day_offset integer not null check(day_offset in (-14,-7,-3,0,3)),due_date date not null,
 acknowledged_at timestamptz,unique(deal_id,day_offset)
);
alter table public.bm_reminders enable row level security;
revoke all on public.bm_reminders from public,anon,authenticated;
grant all on public.bm_reminders to service_role;
create function public.bm_recalculate_reminders() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' or new.title->>'eoc' is distinct from old.title->>'eoc' then
  delete from bm_reminders where deal_id=new.id;
  if new.title->>'eoc' is not null then
   insert into bm_reminders(deal_id,day_offset,due_date) select new.id,d,(new.title->>'eoc')::date+d from unnest(array[-14,-7,-3,0,3]) d;
  end if;
 end if;
 if new.status in ('closed','canceled') then delete from bm_reminders where deal_id=new.id; end if;
 return new;
end $$;
create trigger bm_eoc_reminders after insert or update of title,status on public.bm_deals for each row execute function public.bm_recalculate_reminders();
commit;
