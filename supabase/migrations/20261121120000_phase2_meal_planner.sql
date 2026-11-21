-- Phase 2: the app becomes a meal planner (docs/build-plan.md, Nov 21, 2026).
-- Adds what building a week by hand needs (aisles, where a recipe came from, This week's picks,
-- list editing), plus the AI settings, pantry and AI usage log that phases 3-5 use.
-- Nothing is dropped: the price, store and budget columns and tables are parked, unused by the
-- app, so the price work can come back without a data migration.

-- Households: AI settings ------------------------------------------------------------------

alter table public.households
  add column ai_suggestions   boolean      not null default true,  -- false hides the Ask bar
  add column ai_monthly_limit numeric(6,2) not null default 10 check (ai_monthly_limit >= 0), -- USD
  add column recipe_sites     text[]       not null default array[
    'allrecipes.com', 'budgetbytes.com', 'seriouseats.com', 'simplyrecipes.com',
    'bbcgoodfood.com', 'kingarthurbaking.com'];  -- the only sites Find searches

comment on column public.households.weekly_budget     is 'Parked Nov 21, 2026; unused by the app.';
comment on column public.households.home_currency     is 'Parked Nov 21, 2026; unused by the app.';
comment on column public.households.default_store_ids is 'Parked Nov 21, 2026; unused by the app.';
comment on column public.households.max_stops         is 'Parked Nov 21, 2026; unused by the app.';

-- Ingredients: aisle, so the list groups the way we walk the store --------------------------

alter table public.ingredients
  add column aisle text not null default 'other'
    check (aisle in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'other'));
                                                     -- 'meat' is shown as "Meat and seafood"

-- One-time best guess for the ingredients we already have; we fix any misses in the app.
-- Order matters: frozen before meat (chicken nuggets), broth before meat (chicken broth).
update public.ingredients set aisle = case
  when name ~* '(nugget|frozen|fried shrimp|fries|ice cream)'                         then 'frozen'
  when name ~* '(broth|stock|bouillon|seasoning)'                                    then 'pantry'
  when name ~* '(chicken|beef|pork|sausage|turkey|bacon|ham|steak|schnitzel|shrimp|salmon|cod|fish|tuna)' then 'meat'
  when name ~* '(pepper|onion|potato|corn|tomato|lettuce|garlic|carrot|celery|apple|lemon|lime|cilantro|parsley|spinach|broccoli|zucchini|cucumber|avocado|green bean)' then 'produce'
  when name ~* '(milk|cheese|cheddar|parmesan|butter|cream|yogurt|egg)'              then 'dairy'
  when name ~* '(bread|bun|tortilla|roll|pita)'                                      then 'bakery'
  when name ~* '(pasta|penne|spätzle|spaetzle|noodle|rice|beans|flour|sugar|oil|sauce|can|spice|salt)' then 'pantry'
  else 'other'
end;

-- Recipes: where each one came from -------------------------------------------------------

alter table public.recipes
  add column origin text not null default 'manual'
    check (origin in ('manual', 'typed', 'link', 'photo', 'ai_found', 'ai_created')),
  add column site       text,   -- 'budgetbytes.com', shown on cards for link and Find recipes
  add column photo_path text,   -- storage path of a recipe photo (phase 3)
  add column cuisine    text,
  add column protein    text,
  add column notes      text;   -- our own notes

update public.recipes
  set origin = 'link',
      site   = regexp_replace(substring(source_url from '^https?://([^/]+)'), '^www\.', '')
  where source_url is not null;

comment on column public.recipes.sale_note     is 'Parked Nov 21, 2026; unused by the app.';
comment on column public.recipes.cost_by_store is 'Parked Nov 21, 2026; unused by the app.';

-- This week's picks: recipes either of us drops in, waiting for a night --------------------
-- A pick is deleted when it's put on a night. Unused picks simply stay for next week.

create table public.picks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  added_by     uuid references auth.users (id) on delete set null,  -- "added by Lydia"
  added_at     timestamptz not null default now(),
  unique (household_id, recipe_id)
);
create index picks_recipe_idx on public.picks (recipe_id);

-- Shopping list: our own items and "have it" --------------------------------------------

alter table public.list_items
  add column aisle          text check (aisle in ('produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'other')),
                                         -- for items without an ingredient; else the ingredient's
  add column quantity_label text,        -- '3 lb', shown when set
  add column have_it        boolean not null default false,  -- already at home: not bought
  add column custom         boolean not null default false;  -- added or edited by us: kept on rebuild

comment on column public.list_items.product_id is 'Parked Nov 21, 2026; unused by the app.';
comment on column public.list_items.store_id   is 'Parked Nov 21, 2026; unused by the app.';

-- Pantry: what's on hand, from fridge photos or typed (phase 5) ---------------------------

create table public.pantry (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete cascade,
  label         text not null,
  source        text not null default 'typed' check (source in ('typed', 'photo')),
  updated_at    timestamptz not null default now()
);
create index pantry_household_idx on public.pantry (household_id);
create index pantry_ingredient_idx on public.pantry (ingredient_id);

-- AI usage log: one row per AI request, written only by the edge function (phase 3) ------

create table public.ai_requests (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  kind          text not null check (kind in ('find', 'photo', 'link', 'plan', 'create', 'tweak')),
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  cost_usd      numeric(8,4) not null default 0,
  created_at    timestamptz not null default now()
);
create index ai_requests_household_created_idx on public.ai_requests (household_id, created_at);

-- Row-level security ----------------------------------------------------------------------

alter table public.picks       enable row level security;
alter table public.pantry      enable row level security;
alter table public.ai_requests enable row level security;

create policy "household members only" on public.picks for all to authenticated
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));
create policy "household members only" on public.pantry for all to authenticated
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

-- Read-only from the app, so nobody can hide or fake AI spending. The edge function writes
-- with the service role, which bypasses row-level security.
create policy "members read their AI usage" on public.ai_requests
  for select to authenticated using (household_id in (select public.my_household_ids()));
