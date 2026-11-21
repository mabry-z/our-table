# Meal planning app

A phone web app where our family plans the week's dinners, turns them into one grocery list, and
finds or creates recipes with an AI helper when we want one. No budget and no prices.

Read `docs/build-plan.md` for the full plan. Look at the files in `mockups/` before building any
screen: they are the approved designs. Match their layout, wording and look. `mockups/ask-bar.html`
is the reference for the Ask bar, the results sheet, Add dinner, This week's picks and AI settings.
The older mockups (`app-prototype.html`, `plan-midweek.html`, `recipe-and-cook-mode.html`) still
show prices, budget and store tags: keep their layout, drop those parts.

## How we work (always follow)

- **Build first, then confirm before committing or pushing.** Never commit, push, open a PR, or
  apply a Supabase migration to the hosted project without asking first. Show what changed and wait
  for a yes.
- **Preview before committing.** When a screen changes, give me a way to see it (local dev server
  URL, or a screenshot) before anything is committed.
- Work one build phase at a time. At the end of a phase, summarize what's done, what's left, and how
  to test it on a phone.
- Keep secrets out of the front end. The Claude API key lives only in Supabase edge functions. Use a
  `.env` file locally and never commit it.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Platform | Phone web app (like our budget app "Cadence", hosted on GitHub Pages) |
| Backend | Supabase: Postgres, auth, edge functions |
| Users | One household, two adults signed in (me and my wife Lydia) sharing one plan, picks and list |
| Portions | 4 per dinner by default (two adults plus leftovers) |
| Dinners per week | 5 cooked + 2 leftovers nights (default) |
| Budget and prices | None. Dropped Nov 21, 2026. Price and flyer work is parked (see build plan) |
| Units | US by default, metric toggle |
| Shopping list | One merged list grouped by aisle; Luke's usuals added every week. 17 specific aisles in store-walking order (AISLES in js/model.js; no catch-all "Pantry"); any item can be moved to another aisle and the app remembers it for that ingredient |
| Kids | Luke (8) is a picky eater: his "usuals" (chicken nuggets, plain pasta, fried shrimp, fried chicken) are added to every list. Adeline (10) eats what we eat. |
| Luke-friendly | Badge on dinners Luke can share (e.g. fried chicken, or pasta with a plain portion set aside) |
| Filling the week | Mixed freely night by night: Add dinner (picks, recipe box, find a recipe, link, screenshot or photo, type it) or the Ask bar ("find me a lemon caper fish dish for Thursday", "plan next week"). AI only runs when asked |
| AI style | One Ask bar + results sheet of cards that update in place, with a trail of asks to undo to. Not a chat. Quiet cap of about 6 asks per sheet |
| AI models | Claude Opus 5.5 for planning, creating and tweaking; Claude Sonnet 5.5 for search, swaps and reading photos |
| AI spending | Every request logged with cost; monthly limit (default $10) pauses AI until the 1st |
| Recipe sites | Find searches only the household's "Sites we like" (Settings). Default, tested Nov 21, 2026 to work with both Anthropic's search and the link reader: Alton Brown (used a lot), Budget Bytes, RecipeTin Eats, BBC Good Food, King Arthur Baking, Traeger, Pinch of Yum, Skinnytaste, Love and Lemons, Taste of Home, Sally's Baking Addiction, Damn Delicious. Blocked for apps (use Paste the recipe text): Allrecipes, Serious Eats, Simply Recipes, Southern Living, Food Network, The Kitchn, Delish, Cookie and Kate. No NYT Cooking |

## Screens (see mockups)

Four bottom tabs: **Plan, Recipes, List, Settings.** The Ask bar sits above the tabs on Plan,
Recipes and recipe pages (hidden when AI suggestions are off).

- **Plan:** This week's picks tray, the week of dinners, "Tonight" banner, Luke's usuals. Open nights
  have "Add dinner". Lock, move, skip, replace via the ⋯ menu; freshness check before moving a
  perishable dinner past its "cook by" day. Each dinner shows its source (site, from a photo, typed
  in, from your box, new idea).
- **Recipes:** recipe box with All, Quick and Luke-friendly filters; "Paste a link" and "Type one
  in" at the top (screenshots come in phase 3). Tapping a recipe (here or a dinner on Plan) opens
  its page: ingredients, steps, source link, "Add to this week's picks" and Edit. Ask finds recipes
  on our sites, creates new ones, or reads a fridge photo (phase 4).
- **Link import:** `supabase/functions/import-recipe` fetches the page and reads its schema.org
  Recipe data (parser in `parse.js`, shared with browser tests). Signed-in household members only;
  public http(s) pages only (no IPs, private names or odd ports; redirects checked hop by hop).
  The app shows a check-it-over card before saving; a link already in the box is reused.
- **AI helper:** `supabase/functions/ai` reads pasted recipe text (kind "text", for sites like
  Allrecipes that block the link reader) and screenshots or photos (kind "photo", up to 4, shrunk
  to 1600px JPEG in the browser by `js/photos.js`) with Claude Sonnet 5.5, structured output,
  `fallbacks: "default"`. Every call is logged in `ai_requests` (service key) and refused once the
  month's spending reaches `households.ai_monthly_limit` (Settings, $5 steps). Kind "find": Claude
  web search (`web_search_20260209`, max 4 searches, `allowed_domains` = the household's sites)
  names up to 8 well-reviewed single-recipe pages, each is read by calling `import-recipe`
  (which also returns the site's star rating and count), and the best 5 by rating come back,
  weighted by how many people rated it. Cooking time is deliberately not a factor (we choose
  that ourselves). Pages that can't be read come back as title + link. About 10–15¢ (measured Nov 21: 10–14¢; 4 searches at 1¢ plus 28–45K tokens of search results on Sonnet). Kept as is by choice; the browser plus Paste a link is the free route. Check callers with
  direct fetches to `/auth/v1/user`, not supabase-js `getUser` (it fails with this project's
  publishable key).
- **Recipe page and cook mode:** ingredients scaled by a portions control, steps, source link.
  "Start cooking" = one step per screen, large type, that step's ingredients, one-tap timers, screen
  kept awake (Wake Lock API), Luke reminder at the right step, rating at the end ("Make again" / "Not
  for us"). Ask tweaks the recipe and shows the changes before saving.
- **List:** one list grouped by aisle; check off, add our own items, "have it", quantities; edits
  survive a rebuild.
- **Settings:** portions, dinners per week, time limit, units, Luke's usuals, foods we skip, sharing;
  AI helper (AI suggestions switch, reading photos, this month's use against the limit, sites we
  like).

## Look and feel: warm farmhouse (Magnolia-style), light only

The app stays light even when the phone is in dark mode. Readability matters more than delicacy:
every text color must reach a contrast ratio of at least 4.5 against its background (checked-off
list items are the one deliberate exception, at 4.1). Readability pass approved Nov 21, 2026; the
before/after is in `mockups/readability.html`. Older mockups still show the earlier, fainter values.

| Token | Value | Use |
| --- | --- | --- |
| background | `#F7F3EC` | linen page |
| card | `#FFFDF9` | cards, inputs |
| card border | `#E2D8C8` | 1px card borders |
| rule | `#E4DCCF` / `#EFE8DC` | dividers |
| ink | `#2F2B26` | text, primary buttons |
| muted | `#6B6157` | secondary text, eyebrows |
| faint | `#756B5F` | inactive tabs, "Open" and "Leftovers night" |
| placeholder | `#7F7569` | placeholder text in inputs |
| done | `#857B6F` | checked-off list items |
| button ink / line | `#4A433B` / `#D3C8B7` | outline button text and border |
| accent line | `#B9A88F` | short rule under titles, locked card border |
| sage | `#8A9A74` | progress bars, checked boxes |
| Luke tag | bg `#EDE4EE`, text `#5D4663` | Luke-friendly |
| freshness | bg `#F8EDE6`, border `#E7CDBD`, text `#7A4632` | cook-by and warnings |
| source tags | From your box `#EAE3D3`/`#5E5338`, New idea `#E3EAF0`/`#3F5566`, quick `#E8EEE0`/`#4F5E3E`, site / photo / typed `#F1ECE3`/`#6B6157` | pill backgrounds/text |

- Fonts: **Lora 500** for dish names and other serif text (cards, banners, lists; 16–20px, 18px
  for dish names); **Cormorant Garamond 600** only for page titles and section headings (22px and
  up, class `dsp`); **Lato 400** for body.
- Sizes: body 15px, secondary text 13px, pills and buttons 12–13px, tab labels 12px. Nothing
  smaller than 12px.
- Eyebrow labels: 12px, uppercase, letter-spacing .1em, muted.
- Cards: radius 14px. Pills and buttons: fully rounded (999px). Primary button: ink background,
  linen text. Phone frame in mockups is ~380px wide; design mobile-first.
- Bottom sheets: rounded top (22px), dimmed page behind, grab handle.
- Icons: Tabler outline icons. AI actions use the sparkles icon.
- Sentence case everywhere. No emoji. Flat: no gradients or heavy shadows.

## Recipes and copyright

- Sources: our own box, pasted links, screenshots and photos, Find (our list of sites), and recipes
  Claude creates (labeled "Created for you").
- Personal use only. If the app is ever public, store links and our own notes instead of full
  recipe text for site recipes.
- Fridge photos are deleted after reading; recipe photos are kept with the recipe.

## Build phases

1. Foundation: done.
2. Build a week by hand (build order only; the finished app mixes both): schema changes, recipe box,
   link import, Add dinner, This week's picks, recipe page, list by aisle with editing, Luke's usuals.
3. Find, photos and AI groundwork: edge function, usage log and monthly limit, Find a recipe (in Add
   dinner and on Recipes, with "Add to <day>"), screenshot and photo import with flags, AI settings.
4. The Ask bar: results sheet with trail and undo, reusing Find; plan, create, fridge photo, tweak.
5. Cook mode and learning: cook mode, ratings shaping suggestions, move / skip / freshness, pantry.

Parked: Globus flyer reader, commissary flyer upload, price engine, budget and stores. See the end of
`docs/build-plan.md` and `docs/commissary-data.md`.
