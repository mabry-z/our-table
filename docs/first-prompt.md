Read CLAUDE.md, docs/build-plan.md and docs/commissary-data.md, and open the three mockups in mockups/ so you can see the approved design.

We're starting phase 1 (Foundation). Before writing code, give me a short plan:
- the front-end stack you recommend for a phone web app hosted on GitHub Pages (keep it simple, like my budget app Cadence) and why
- the Supabase tables for phase 1 with row-level security so only our household can see our data
- the folder structure

Wait for my OK on the plan. Then build phase 1:
1. Create the Supabase schema as a migration file in the repo. Do not apply it to the hosted project until I say so.
2. Sign-in for two users (me and Lydia) sharing one household.
3. The four tabs (Plan, Recipes, List, Settings) matching mockups/app-prototype.html: same layout, wording, colors and fonts, light only.
4. Seed data matching the mockups so every screen has something to show.
5. A local dev server I can open on my phone over Wi-Fi.

When phase 1 is built, show me how to preview it on my phone, list what's done and what's left, and wait. Don't commit, push or apply migrations until I confirm.
