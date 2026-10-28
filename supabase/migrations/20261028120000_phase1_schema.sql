-- Phase 1 schema: one household shared by two adults.
-- Every household table carries household_id, and row-level security limits each signed-in
-- user to the households they are a member of. Members are only ever added by SQL run by us
-- (see supabase/setup-members.sql), never from the app.

-- Households and members ------------------------------------------------------------------

create table public.households (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  portions           int  not null default 4   check (portions between 1 and 12),
  dinners_per_week   int  not null default 5   check (dinners_per_week between 0 and 7),
  leftovers_per_week int  not null default 2   check (leftovers_per_week between 0 and 7),
  time_limit_min     int  not null default 45  check (time_limit_min > 0),
  weekly_budget      numeric(8,2) not null default 150 check (weekly_budget >= 0),
  units              text not null default 'US'  check (units in ('US', 'Metric')),
  home_currency      text not null default 'USD' check (home_currency in ('USD', 'EUR')),
  default_store_ids  uuid[] not null default '{}',
  max_stops          int  not null default 0 check (max_stops between 0 and 3), -- 0 = off
  foods_we_skip      text[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'adult' check (role in ('owner', 'adult')),
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index members_user_id_idx on public.members (user_id);

-- Households the signed-in user belongs to. Security definer so policies on members itself
-- don't recurse.
create function public.my_household_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select household_id from public.members where user_id = (select auth.uid())
$$;
revoke execute on function public.my_household_ids() from public, anon;
grant execute on function public.my_household_ids() to authenticated;

-- Stores, products and prices -----------------------------------------------------------

create table public.stores (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,                 -- 'Ramstein', 'Vogelweh', 'Globus'
  chain        text not null,                 -- 'Commissary', 'Globus'; the app groups by chain
  currency     text not null check (currency in ('USD', 'EUR')),
  external_id  text,                          -- Freshop store id for commissaries (5873, 5921)
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  store_id     uuid not null references public.stores (id) on delete cascade,
  name         text not null,
  brand        text,
  size_amount  numeric,
  size_unit    text,                          -- g, kg, ml, l, oz, lb, each
  external_id  text,
  ean          text,
  created_at   timestamptz not null default now()
);
create index products_store_id_idx on public.products (store_id);

create table public.prices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  price        numeric(10,2) not null check (price >= 0),   -- in the store's currency
  sale_price   numeric(10,2) check (sale_price >= 0),
  valid_from   date,
  valid_to     date,
  source       text not null check (source in ('catalog', 'flyer', 'receipt', 'manual', 'sample')),
  checked_at   timestamptz not null default now()
);
create index prices_product_checked_idx on public.prices (product_id, checked_at desc);

-- Most recent price per product. security_invoker keeps the prices policies in force.
create view public.latest_prices with (security_invoker = true) as
  select distinct on (product_id)
    id, household_id, product_id, price, sale_price, valid_from, valid_to, source, checked_at
  from public.prices
  order by product_id, checked_at desc;

-- Exchange rates are public reference data, stored daily so a week's totals don't shift.
create table public.exchange_rates (
  rate_date  date not null,
  base       text not null default 'EUR',
  quote      text not null default 'USD',
  rate       numeric(10,5) not null check (rate > 0),
  source     text not null,
  primary key (rate_date, base, quote)
);

-- Ingredients and recipes ---------------------------------------------------------------

create table public.ingredients (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null,
  default_unit   text,
  pantry_staple  boolean not null default false,
  unique (household_id, name)
);

create table public.ingredient_matches (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  product_id     uuid not null references public.products (id) on delete cascade,
  confidence     numeric(3,2) not null default 1 check (confidence between 0 and 1),
  confirmed      boolean not null default false,  -- confirmed matches always win
  unique (ingredient_id, product_id)
);
create index ingredient_matches_product_idx on public.ingredient_matches (product_id);

create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  title          text not null,
  source_url     text,
  servings       int  not null default 4 check (servings > 0),
  time_min       int  check (time_min > 0),
  tags           text[] not null default '{}',   -- 'Quick', 'Luke-friendly'
  rating         int  check (rating between 1 and 5),
  steps          jsonb not null default '[]',    -- [{title, text, timer_sec?, luke?}]
  status         text not null default 'box' check (status in ('box', 'suggested', 'passed')),
  luke_note      text,                           -- 'Plain pasta for Luke'
  sale_note      text,                           -- cached by the price engine
  cost_by_store  jsonb not null default '{}',    -- cached by the price engine: {"Commissary": 9.4}
  created_at     timestamptz not null default now()
);

create table public.recipe_ingredients (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  recipe_id      uuid not null references public.recipes (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id),
  amount         numeric,
  unit           text,
  note           text,
  step_index     int,                            -- which cook-mode step uses it
  position       int not null default 0
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- Plans, Luke's usuals and the shopping list --------------------------------------------

create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1), -- Mondays
  created_at   timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.plan_meals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_id      uuid not null references public.plans (id) on delete cascade,
  day          int  not null check (day between 1 and 7),  -- 1 = Monday
  recipe_id    uuid references public.recipes (id) on delete set null,
  options      uuid[] not null default '{}',  -- dinners the planner offered; Swap cycles them
  locked       boolean not null default false,
  leftovers    boolean not null default false,
  unique (plan_id, day)
);

create table public.usuals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  ingredient_id   uuid not null references public.ingredients (id),
  label           text not null,
  quantity_label  text,                       -- '2 bags'
  skip_this_week  boolean not null default false,
  position        int not null default 0
);

create table public.list_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  plan_id        uuid not null references public.plans (id) on delete cascade,
  ingredient_id  uuid references public.ingredients (id),
  label          text not null,
  for_label      text,                        -- 'Mon', 'Luke'
  product_id     uuid references public.products (id) on delete set null,  -- chosen package
  store_id       uuid references public.stores (id) on delete set null,
  quantity       numeric not null default 1,
  checked        boolean not null default false,
  position       int not null default 0
);
create index list_items_plan_idx on public.list_items (plan_id);

-- Row-level security ----------------------------------------------------------------------

alter table public.households         enable row level security;
alter table public.members            enable row level security;
alter table public.stores             enable row level security;
alter table public.products           enable row level security;
alter table public.prices             enable row level security;
alter table public.exchange_rates     enable row level security;
alter table public.ingredients        enable row level security;
alter table public.ingredient_matches enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.plans              enable row level security;
alter table public.plan_meals         enable row level security;
alter table public.usuals             enable row level security;
alter table public.list_items         enable row level security;

-- Households: members can read and edit settings; creating or deleting is SQL-only.
create policy "members read their household" on public.households
  for select to authenticated using (id in (select public.my_household_ids()));
create policy "members update their household" on public.households
  for update to authenticated
  using (id in (select public.my_household_ids()))
  with check (id in (select public.my_household_ids()));

-- Members: read-only from the app, so nobody can add themselves to a household.
create policy "members read their household's members" on public.members
  for select to authenticated using (household_id in (select public.my_household_ids()));

create policy "signed-in users read exchange rates" on public.exchange_rates
  for select to authenticated using (true);

-- Everything else: full access to your own household's rows, nothing else.
do $$
declare t text;
begin
  foreach t in array array['stores', 'products', 'prices', 'ingredients', 'ingredient_matches',
                           'recipes', 'recipe_ingredients', 'plans', 'plan_meals', 'usuals',
                           'list_items']
  loop
    execute format(
      'create policy "household members only" on public.%I for all to authenticated
         using (household_id in (select public.my_household_ids()))
         with check (household_id in (select public.my_household_ids()))', t);
  end loop;
end $$;
