-- Storage RLS for product-images bucket.
-- Run AFTER 009_services_appointments_tools.sql.
-- The bucket auto-creation in 009 made it public-read-capable, but Storage
-- objects also need explicit RLS policies before authenticated users can write.

-- 1. Make sure the bucket exists and is public
do $$
begin
  perform 1 from storage.buckets where id = 'product-images';
  if not found then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
  else
    update storage.buckets set public = true where id = 'product-images';
  end if;
end $$;

-- 2. RLS policies on storage.objects, scoped to product-images bucket
--    Convention: every file path starts with "{user_id}/..." so we can scope
--    write access by checking the first folder segment.

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "product_images_owner_insert" on storage.objects;
create policy "product_images_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product_images_owner_update" on storage.objects;
create policy "product_images_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product_images_owner_delete" on storage.objects;
create policy "product_images_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
