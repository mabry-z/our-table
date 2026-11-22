-- The Ask bar (phase 4, Nov 22, 2026): the usage log accepts every kind of AI request the app
-- makes. "text" (Paste the recipe text) was missing since phase 3, so those reads were never
-- logged or counted toward the monthly limit. "fridge" reads a fridge or pantry photo and
-- "ideas" suggests dinners from what's on hand.

alter table public.ai_requests drop constraint ai_requests_kind_check;
alter table public.ai_requests add constraint ai_requests_kind_check
  check (kind in ('find', 'photo', 'text', 'link', 'plan', 'create', 'tweak', 'fridge', 'ideas'));
