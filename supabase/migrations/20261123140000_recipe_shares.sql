-- Sharing a recipe by link (Nov 23, 2026). Tapping Share on a recipe saves a frozen copy here
-- under a long random token; whoever opens the link (signed in to any household) sees that copy
-- and can save it to their own box. Its photos are copied to recipe-photos/shares/<token>/.
--
-- Only the share-recipe edge function (service key) reads or writes this table: row-level
-- security is on with no policies, so no household can list or read shares from the app. The
-- shares/ storage folder isn't a household id, so the recipe-photos policies keep it private too.

create table public.recipe_shares (
  token        text primary key,                 -- 32 random characters, the link's secret
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id    uuid references public.recipes (id) on delete set null,
  shared_by    uuid references auth.users (id) on delete set null,
  recipe       jsonb not null,  -- { title, servings, time_min, steps, ingredients[], source_url, site, origin }
  photo_paths  text[] not null default '{}',     -- shares/<token>/<n>.jpg
  created_at   timestamptz not null default now()
);
create index recipe_shares_household_idx on public.recipe_shares (household_id);

alter table public.recipe_shares enable row level security;
