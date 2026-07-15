insert into storage.buckets (id, name, public)
values ('buyer-proof-files', 'buyer-proof-files', false)
on conflict (id) do update
set public = false;

drop policy if exists "Buyer proof owners can read own documents" on storage.objects;
create policy "Buyer proof owners can read own documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'buyer-proof-files'
  and name like ('buyer-documents/' || auth.uid()::text || '/%')
);

drop policy if exists "Buyer proof owners can upload own documents" on storage.objects;
create policy "Buyer proof owners can upload own documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'buyer-proof-files'
  and name like ('buyer-documents/' || auth.uid()::text || '/%')
);

drop policy if exists "Buyer proof owners can update own documents" on storage.objects;
create policy "Buyer proof owners can update own documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'buyer-proof-files'
  and name like ('buyer-documents/' || auth.uid()::text || '/%')
)
with check (
  bucket_id = 'buyer-proof-files'
  and name like ('buyer-documents/' || auth.uid()::text || '/%')
);

drop policy if exists "Buyer proof owners can delete own documents" on storage.objects;
create policy "Buyer proof owners can delete own documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'buyer-proof-files'
  and name like ('buyer-documents/' || auth.uid()::text || '/%')
);
