-- Links the two sign-in accounts to the household. Run once, after:
--   1. the migration and seed.sql have been applied, and
--   2. both accounts exist (Supabase dashboard > Authentication > Users > Add user).
-- Replace the two emails before running. The app itself can never add members.

insert into public.members (household_id, user_id, role, display_name)
select h.id,
       u.id,
       case when u.email = 'OWNER_EMAIL' then 'owner' else 'adult' end,
       case when u.email = 'OWNER_EMAIL' then 'OWNER_NAME' else 'Lydia' end
from public.households h
cross join auth.users u
where h.name = 'Our household'
  and u.email in ('OWNER_EMAIL', 'LYDIA_EMAIL')
on conflict do nothing;
