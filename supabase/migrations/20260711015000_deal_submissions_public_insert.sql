alter table public.deal_submissions enable row level security;

drop policy if exists "Public can create deal submissions" on public.deal_submissions;
create policy "Public can create deal submissions"
on public.deal_submissions
for insert
to anon, authenticated
with check (
  source = 'public_portal'
  and status in ('pending', 'submitted')
);

drop policy if exists "Service role can manage deal submissions" on public.deal_submissions;
create policy "Service role can manage deal submissions"
on public.deal_submissions
for all
to service_role
using (true)
with check (true);
