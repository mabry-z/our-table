-- Recipe photos (phase 3, Nov 22, 2026): the screenshots and photos a recipe was read from are
-- kept with it, in a private storage bucket. Fridge photos (phase 4) are never stored here.

-- A recipe can come from several pictures (ingredients on one, steps on the next), so the
-- unused single photo_path from phase 2 becomes a list.
alter table public.recipes rename column photo_path to photo_paths;
alter table public.recipes
  alter column photo_paths type text[]
    using case when photo_paths is null then '{}'::text[] else array[photo_paths] end,
  alter column photo_paths set default '{}',
  alter column photo_paths set not null;
comment on column public.recipes.photo_paths is
  'Storage paths in the recipe-photos bucket, in reading order: <household id>/<recipe id>/<n>.jpg';

-- The app shrinks pictures to 1600px JPEGs (js/photos.js), well under 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg']);

-- Members reach only their own household's folder. No update policy: photos are only added
-- and removed, never replaced.
create policy "household members read recipe photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos'
         and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h));

create policy "household members add recipe photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos'
              and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h));

create policy "household members remove recipe photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos'
         and (storage.foldername(name))[1] in (select h::text from public.my_household_ids() h));
