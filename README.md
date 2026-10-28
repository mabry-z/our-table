# Our table: grocery and meal planner

A phone web app for our household's cheapest week of dinners. Plain HTML, CSS and JavaScript
with no build step, hosted on GitHub Pages, backed by Supabase. See `CLAUDE.md` and
`docs/build-plan.md` for decisions and phases; `mockups/` holds the approved designs.

## Preview on your phone

1. On the PC: `powershell -ExecutionPolicy Bypass -File serve.ps1`
2. It prints an "On your phone" address such as `http://192.168.4.96:5173`. Open it in your
   phone's browser while on the same Wi-Fi. If Windows asks, allow PowerShell on private networks.

With `js/config.js` empty the app runs on built-in sample data ("Continue with sample data").

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `css/app.css` | App shell and the farmhouse styles |
| `js/app.js` | State, rendering and every tap |
| `js/views/` | Plan, Recipes, List, Settings and sign-in screens |
| `js/model.js` | Turns table rows into prices per store, totals, max stops |
| `js/data.js` | Supabase or sample data, same rows either way |
| `js/sample-data.js` | Sample data matching the mockups (source for `supabase/seed.sql`) |
| `js/config.js` | Supabase URL and publishable key (public by design) |
| `supabase/migrations/` | Database schema with row-level security |
| `supabase/seed.sql` | Generated sample data; regenerate with `tools/make-seed.ps1` |
| `supabase/setup-members.sql` | Links our two accounts to the household (run once) |
| `serve.ps1` | Local dev server for phone testing |

## Connecting Supabase (after approval)

1. Apply `supabase/migrations/*.sql`, then `supabase/seed.sql`.
2. In the dashboard, turn off public sign-ups and add both users (Authentication > Users).
3. Run `supabase/setup-members.sql` with both emails filled in.
4. Put the project URL and publishable key in `js/config.js`.
