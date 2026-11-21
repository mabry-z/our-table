# Meal planning app: build plan

As of Nov 21, 2026. Replaces the Oct 27 price-first plan (cheapest week from store prices). Price and
flyer work is parked, not deleted; see "Parked" at the end.

## Overview

A phone web app where we plan the week's dinners, turn them into one grocery list, and find or create
recipes with an AI helper when we want one.

- **Who it's for:** our household (two adults signed in, me and Lydia, sharing one plan and list; 4
  portions per dinner with leftovers). Built so other families could use it later.
- **Main goal:** make planning the week fast, whether we already know what we want or need ideas.
- **Core loop:** fill the week (by hand from links, screenshots, photos and our recipe box, or by
  asking the AI) → one merged grocery list by aisle → cook mode → rate it → better plans next time.
- **No budget, no prices.** The app doesn't track what groceries cost.
- **Look:** light, warm farmhouse style, matching the approved mockups.

## Architecture

A phone web app like Cadence, backed by Supabase. Anything that calls the AI or fetches outside pages
runs in Supabase edge functions, never in the browser.

```
Web app on our phones (Plan, Recipes, List, Settings; GitHub Pages)
        <->  Supabase
               - Database and sign-in (household, recipes, plans, picks, list, AI usage log)
               - Edge functions (holds the AI key)
                    ->  Recipe sites (read a pasted link's built-in recipe data; search)
                    ->  Claude API (ask, search, create, tweak, read photos)
```

## Two ways to fill a week

Both are first-class, and we mix them night by night: Monday from the recipe box, Tuesday from a
pasted link, Thursday from "find me a lemon caper fish dish for Thursday". The AI only runs when we
ask it to.

### Adding dinners ourselves

- **Add dinner** on any open night opens a sheet: from this week's picks, from our recipe box, find a
  recipe, paste a link, screenshot or photo, or type it.
- **Find a recipe:** type what sounds good ("lemon caper fish"). It searches our list of sites
  (Claude with web search, 2–11¢) and shows about 3 real recipes with site and time, each with
  "Add to <day>". Quick chips narrow it down (under 30 minutes, Luke-friendly, dairy-free).
- **Paste a link:** read the recipe data most sites build into the page (schema.org Recipe). No AI
  and free. If a page has no recipe data, Claude reads the page instead (about 2¢).
- **Screenshot or photo:** a cookbook page, recipe card, Instagram screenshot or handwritten recipe.
  Claude reads it (about 2–3¢) and fills in a recipe for us to check. Anything unclear is flagged
  ("The card says 1 can of broth; we read it as 14 oz").
- **Type it:** a name, plus ingredients if we want them on the list.
- Every link or photo recipe is shown in a "check it over" card before saving, with "Add to <day>" or
  "Save to picks instead". It's saved to the recipe box and its ingredients go on the list.
- **This week's picks:** a shared tray at the top of Plan. Either of us drops links or screenshots in
  during the week ("added by Lydia on Tuesday"); tap a pick and choose a night. "Choose several"
  turns several screenshots into several picks. Unused picks carry over.
- Android can share a page or screenshot straight to the app (web share target). iPhone home-screen
  apps can't, so we copy and paste the link or pick the screenshot from Photos.

### Ask (the AI helper)

- **One Ask bar** above the bottom tabs on Plan, Recipes and recipe pages. It takes typing, a photo or
  a pasted link, and knows the screen it's on (the week on Plan, the recipe on a recipe page).
- **Results sheet, not a chat.** Answers are always cards with a button to act on: a proposed week
  ("Use this week"), found recipes ("Add to week", "Save"), a created recipe, or a list of changes
  ("Save as a copy", "Replace recipe").
- **Keep adjusting in plain words.** Cards update in place. Each ask shows as a chip in a trail above
  the results; tap an older one to go back to it. "Start fresh" clears it.
- **Quiet cap:** after about 6 asks in one sheet, a note suggests using what we have or starting
  fresh. No visible counter. Applying a result closes the sheet; next time starts fresh.
- **Starters:** each screen offers 2–3 starter asks that fill the box so we can edit them first.
- **Settings switch:** "AI suggestions" off hides the Ask bar everywhere. Reading photos and
  screenshots stays on.

What the Ask bar does on each screen:

| Screen | Examples | Result |
| --- | --- | --- |
| Plan, one night | "find me a lemon caper fish dish for Thursday", then "under 30 minutes" | Real recipes from our sites, each with "Add to Thursday" |
| Plan, the week | "plan next week, light on pasta", "make Friday fish", "Thursday leftovers" | Proposed week; locked dinners stay put; changed night highlighted |
| Recipes, find | "find a crockpot chili Luke might eat", then "no dairy" | Real recipes from our list of sites, with site name and link |
| Recipes, create | "make something with pork, apples and potatoes", then "milder" | A new recipe labeled "Created for you" |
| Recipes, photo | Photo of the fridge or pantry | Items found (tap to remove, or type what was missed) → 3 ideas → full recipe |
| Recipe page | "make it dairy-free", "no cilantro", "double it" | List of changes (struck out → new), then save as a copy or replace |

## Recipe sources

- **Find** searches only free, well-tested sites: Allrecipes, Budget Bytes, Serious Eats, Simply
  Recipes, BBC Good Food, King Arthur Baking. Editable in Settings ("Sites we like"). No NYT Cooking
  (paywalled, and its terms don't allow automated copying).
- **Create** and photo ideas are written by Claude, not copied from a site, and labeled "Created for
  you". Ratings after cooking ("Make again" / "Not for us") tell the planner which are keepers.
- Fridge photos are deleted after reading; only the confirmed item list is kept, as what's on hand.
  Recipe photos are kept with the recipe.
- Personal use only. If the app is ever public, store a link and our own notes instead of full recipe
  text for site recipes.

## AI models and cost

Claude API through one edge function. Every request is logged with its cost.

| Task | Model | Rough cost each |
| --- | --- | --- |
| Plan a week, create a recipe, tweak a recipe | Claude Opus 5.5 | 5–12¢ |
| Find recipes (web search), swap one night | Claude Sonnet 5.5 | 2–11¢ |
| Read a photo or screenshot | Claude Sonnet 5.5 | 2–3¢ |

- Expected household use: about $4–6 a month.
- **Monthly spending limit** (default $10, in Settings). When it's reached, AI buttons pause until
  the 1st; everything else keeps working.
- Strict ingredient format on every AI recipe (amount, unit, name, aisle) so it can go on the list.

## Data model

Built on the phase 1 schema. Everything belongs to a household so Lydia sees the same plan and list.

| Table | Holds | Change from phase 1 |
| --- | --- | --- |
| `households` | Defaults: portions (4), dinners per week, time limit, units, AI on/off, monthly AI limit | Drop budget, stores, max stops, currency |
| `members` | Who can sign in | Same |
| `ingredients` | Generic ingredient | Add `aisle` (produce, meat, dairy, pantry, frozen, bakery, other) |
| `recipes` | Recipe box | Add `origin` (manual, link, photo, ai_created, ai_found), `source_url`, `site`, `photo_path`, cuisine, protein |
| `recipe_ingredients` | What a recipe needs | Same |
| `plans` / `plan_meals` | A week and its dinners | Same (day, recipe, locked, leftovers night) |
| `picks` | This week's picks tray | New: recipe id, added by, added at, plan week |
| `usuals` | Luke's recurring items | Same |
| `list_items` | The shopping list | Group by aisle; drop store and price |
| `pantry` | What's on hand | New: ingredient, from photo or typed, updated at |
| `ai_requests` | AI usage log | New: kind, model, tokens, cost, created at |

The price tables (`stores`, `products`, `prices`, `ingredient_matches`, `exchange_rates`) stay in
the database, unused.

## Screens

Four tabs: **Plan, Recipes, List, Settings.** `mockups/ask-bar.html` is the reference for the Ask bar,
the results sheet, Add dinner, picks and the AI settings.

| Tab | What it shows | Key actions |
| --- | --- | --- |
| Plan | This week's picks, the week of dinners, Luke's usuals, "Tonight" banner | Add dinner, pick → night, lock, move, skip, Ask |
| Recipes | Recipe box with filters (All, Quick, Luke-friendly, New) | Open a recipe, + import (link or screenshot), Ask (find, create, photo) |
| Recipe page | Ingredients scaled by portions, steps, source | Start cooking, Ask (tweak) |
| List | One merged list grouped by aisle | Check off, add our own items, "have it", quantities; edits survive a rebuild |
| Settings | Portions, dinners per week, time limit, units, Luke's usuals, foods we skip, sharing, AI helper | AI suggestions switch, monthly limit, sites we like |

**Plan mid-week** (from `mockups/plan-midweek.html`, minus prices and store tags): ⋯ menu per dinner
with "Move to <day>", "Skip tonight" (carries to next week, ingredients count as on hand),
"Replace". Freshness check before moving a perishable dinner past its "cook by" day.

**Recipe page and cook mode** (from `mockups/recipe-and-cook-mode.html`, minus prices and store
tags): one step per screen in large type, that step's ingredients, one-tap timers, screen kept awake,
Luke reminder at the right step, rating at the end.

Empty and error states: a link with no readable recipe, a photo that couldn't be read, AI limit
reached, nothing on the list yet.

## Build phases

Each phase ends with something we use for a real week. "By hand" in phase 2 is build order only:
the non-AI pieces come first so the app is useful sooner, and the finished app mixes both freely.

1. **Foundation.** Done: Supabase project, tables, sign-in for both of us, four tabs styled like the
   mockups with sample data, week arrows on Plan.
2. **Build a week by hand.** Schema changes above; recipe box with add and edit; link import (recipe
   data on the page); Add dinner sheet (box, link, type); This week's picks shared between us; recipe
   page (read-only); list by aisle with editing; Luke's usuals on every list.
   - Done when: we plan and shop a real week from the app without any AI.
3. **Find, photos and the AI groundwork.** Edge function with the AI key, usage log and monthly
   limit; Find a recipe (search our list of sites, read the results with the phase 2 link importer)
   in the Add dinner sheet and on Recipes, with "Add to <day>", "Save" and narrowing chips;
   screenshot and photo import with the check-it-over card and flags; "Choose several" into picks;
   AI settings and sites we like.
   - Done when: we fill a real week using Find for the nights we have no recipe for, and import a
     month of recipes from screenshots and photos without fixing much.
4. **The Ask bar.** Results sheet with trail and undo, reusing phase 3's Find; Plan (find for a
   named night, propose a week, change a night); Recipes (create, fridge photo → ideas → recipe);
   recipe page tweaks.
   - Done when: the Ask bar proposes a week we'd actually cook.
5. **Cook mode and learning.** Cook mode with timers, Wake Lock and Luke reminders; ratings shaping
   suggestions; move, skip and freshness check mid-week; pantry from photos feeding "use what we
   have".
   - Done when: we cook from the app for a month and the suggestions get better.

Later: Android share target, a Cadence link, an optional "on sale this week" hint from the parked
flyer work.

## Risks and open questions

| Risk | Impact | Fallback |
| --- | --- | --- |
| A site has no recipe data on the page | Link import fails | Claude reads the page; or screenshot it |
| Photo misread (amounts, handwriting) | Wrong list | Check-it-over card with flagged items before saving |
| AI recipes untested | A dud dinner | Labeled "Created for you"; ratings teach the planner |
| AI costs creep | Surprise bill | Usage log and a hard monthly limit |
| AI key exposed in the front end | Someone runs up the bill | Key only in a Supabase edge function |
| Recipe copyright if the app goes public | Legal trouble | Store links and our own notes, not full text |

## Parked (Nov 21, 2026)

Kept in the repo and database, not built further:

- Globus Kaiserslautern flyer reader (`supabase/functions/globus-flyer`, job secret and caller
  migrations). Never scheduled.
- Commissary flyer upload and the price engine (unit prices, ingredient-to-product matching,
  cheapest store, max stops). See `docs/commissary-data.md`; no automated access to the commissary
  site is allowed under its terms.
- Budget, stores, currency and exchange rate settings.
