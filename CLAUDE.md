# Grocery and meal planning app

A phone web app that builds the cheapest week of dinners for one family from real prices at the
Ramstein and Vogelweh commissaries (Germany, US military) and the German stores we choose, then
turns it into a shopping list grouped by store.

Read `docs/build-plan.md` for the full plan. Look at the files in `mockups/` before building any
screen: they are the approved designs. Match their layout, wording and look.

## How we work (always follow)

- **Build first, then confirm before committing or pushing.** Never commit, push, open a PR, or
  apply a Supabase migration to the hosted project without asking first. Show what changed and wait
  for a yes.
- **Preview before committing.** When a screen changes, give me a way to see it (local dev server
  URL, or a screenshot) before anything is committed.
- Work one build phase at a time. At the end of a phase, summarize what's done, what's left, and how
  to test it on a phone.
- Keep secrets out of the front end. The Claude API key and any scraping logic live only in
  Supabase edge functions. Use a `.env` file locally and never commit it.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Platform | Phone web app (like our budget app "Cadence", hosted on GitHub Pages) |
| Backend | Supabase: Postgres, auth, edge functions, scheduled jobs |
| Users | One household, two adults signed in (me and my wife Lydia) sharing one plan and list |
| Portions | 4 per dinner by default (two adults plus leftovers) |
| Dinners per week | 5 cooked + 2 leftovers nights (default) |
| Weekly budget | $150 to start, editable in Settings |
| Currency | Home currency USD; euro prices converted at a stored daily rate |
| Units | US by default, metric toggle |
| Commissaries | Compare Ramstein (Freshop store ID 5873) and Vogelweh (store ID still to look up) |
| Default German store | Globus. Others (Lidl, Aldi, Kaufland, REWE) selectable |
| German price source | Marktguru-style flyer aggregator (weekly offers) |
| Shopping list | Grouped by store; optional "max stops" (Off, 1, 2, 3); Off = cheapest store per item |
| Kids | Luke (8) is a picky eater: his "usuals" (chicken nuggets, plain pasta, fried shrimp, fried chicken) are added to every list. Adeline (10) eats what we eat. |
| Luke-friendly | Badge on dinners Luke can share (e.g. fried chicken, or pasta with a plain portion set aside) |
| AI | Claude API via an edge function for dinner suggestions, screenshot recipe import, receipt reading. No chat agent yet. |

## Screens (see mockups)

Four bottom tabs: **Plan, Recipes, List, Settings**.

- **Plan:** week of dinners, weekly total vs budget, "Tonight" banner, lock / swap / rebuild
  unlocked, Luke's usuals. After shopping: a ⋯ menu per dinner with "Move to <day>" (swaps two days),
  "Skip tonight" (carries to next week, ingredients count as on hand), "Replace" (shows extra items
  and cost). Freshness check warns before moving a perishable dinner past its "cook by" day.
- **Recipes:** import by link (read schema.org Recipe JSON-LD) or screenshot (AI), this week's
  suggestions with Keep / Pass, recipe box with Quick and Luke-friendly filters.
- **Recipe page and cook mode:** ingredients scaled by a portions control, checked off while
  gathering, store tag per ingredient. "Start cooking" = one step per screen, large type, that step's
  ingredients, one-tap timers, screen kept awake (Wake Lock API), Luke reminder at the right step,
  rating at the end ("Make again" / "Not for us").
- **List:** items grouped by store with subtotals; check off items. Store choice and max stops sit
  behind ONE summary line ("Ramstein, Globus · no stop limit") that opens a bottom sheet with
  "Just this trip" and "Save as default".
- **Settings:** portions, dinners per week, time limit, budget, exchange rate, units, default
  stores, max stops, Luke's usuals, foods we skip, sharing.

## Look and feel: warm farmhouse (Magnolia-style), light only

The app stays light even when the phone is in dark mode.

| Token | Value | Use |
| --- | --- | --- |
| background | `#F7F3EC` | linen page |
| card | `#FFFDF9` | cards, inputs |
| card border | `#E9E2D6` | 1px card borders |
| rule | `#E4DCCF` / `#EFE8DC` | dividers |
| ink | `#2F2B26` | text, primary buttons |
| muted | `#857B6F` | secondary text, eyebrows |
| accent line | `#B9A88F` | short rule under titles, locked card border |
| sage | `#8A9A74` | progress bars, checked boxes |
| sale tag | bg `#F5E9C9`, text `#6E5527` | "On sale" |
| Luke tag | bg `#EDE4EE`, text `#5D4663` | Luke-friendly |
| freshness | bg `#F8EDE6`, border `#E7CDBD`, text `#7A4632` | cook-by and warnings |
| store tags | Commissary `#E3E8D8`/`#4F5E3E`, Lidl `#DFE6EC`/`#3F5566`, Aldi `#F1E7D2`/`#6E5527`, Kaufland `#F2E0D6`/`#7A4632`, Globus `#EAE3D3`/`#5E5338`, REWE `#F1DCDC`/`#7A3434` | pill backgrounds/text |

- Fonts: **Cormorant Garamond 500** for titles, dish names and prices; **Lato 400** for body.
- Eyebrow labels: 11px, uppercase, letter-spacing .12em, muted.
- Cards: radius 14px. Pills and buttons: fully rounded (999px). Primary button: ink background,
  linen text. Phone frame in mockups is ~380px wide; design mobile-first.
- Icons: Tabler outline icons.
- Sentence case everywhere. No emoji. Flat: no gradients or heavy shadows.

## Data sources (details in docs/commissary-data.md)

- Commissaries: the Freshop API behind shop.commissaries.com. Not a public API. Pull at most once a
  week per store, never try to get around reCAPTCHA, and read the site's terms before phase 2.
  Every price stores its source and "checked at" time; the app must keep working on last known
  prices if a source breaks.
- German stores: weekly offers from a flyer aggregator. Shelf prices come from receipts and manual
  entry.
- Recipes: our own box, link imports, DeCA recipes, AI suggestions. Personal use only; if the app is
  ever public, store links and our own notes instead of full recipe text.

## Build phases

1. Foundation: Supabase project + tables, sign-in for two users, four tabs styled like the mockups
   with sample data, week arrows on Plan.
2. Commissary prices: weekly sync edge function (Ramstein 5873 and Vogelweh 5921, shown as one
   "Commissary"), unit prices, manual recipes, DeCA recipes, read-only recipe page.
3. German stores and the list: flyer offers, exchange rate, ingredient matching, list by store,
   max stops, list editing (add, remove / "have it", quantities; edits survive a rebuild).
4. Planner and imports: cheapest week, lock/swap/rebuild, move/skip mid-week, Luke's usuals, link
   import, full recipe page and cook mode.
5. AI: suggestions, screenshot import, receipt scanning.
