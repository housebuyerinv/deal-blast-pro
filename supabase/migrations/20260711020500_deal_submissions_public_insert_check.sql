drop policy if exists "Public can create deal submissions" on public.deal_submissions;
create policy "Public can create deal submissions"
on public.deal_submissions
for insert
to anon, authenticated
with check (true);
