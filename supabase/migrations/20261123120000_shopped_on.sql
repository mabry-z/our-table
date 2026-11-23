-- Move, skip and freshness (phase 5, Nov 23, 2026): the day we did a week's shopping, picked on
-- the List tab. Plan counts "cook by" days for raw meat and fish from it. Null = not shopped yet,
-- so nothing perishable is home and moving a dinner never warns.

alter table public.plans add column shopped_on date;
