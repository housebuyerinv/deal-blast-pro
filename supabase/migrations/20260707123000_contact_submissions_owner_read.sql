drop policy if exists "Owner can read contact submissions" on public.contact_submissions;
create policy "Owner can read contact submissions"
  on public.contact_submissions
  for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_user_email)
  );

drop policy if exists "Owner can update contact notification status" on public.contact_submissions;
create policy "Owner can update contact notification status"
  on public.contact_submissions
  for update
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_user_email)
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = lower(owner_user_email)
  );
