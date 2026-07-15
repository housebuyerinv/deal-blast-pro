drop policy if exists "Public can submit waitlist entries" on public.waitlist_entries;

create policy "Public can submit waitlist entries"
on public.waitlist_entries
for insert
to anon, authenticated
with check (true);
