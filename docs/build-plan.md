# Grocery and meal planning app: build plan

As of Oct 27, 2026

## Overview

The app builds the cheapest week of dinners for our family from real prices at the Ramstein and Vogelweh commissaries and the German stores we choose (Globus by default), then turns it into a shopping list grouped by store.

- **Who it's for:** our household first (two adults, 4 portions per dinner with leftovers), shared with Lydia. Built so other families could use it later.
- **Main goal:** cheapest weekly plan, with Luke's usual foods added to every list and Luke-friendly nights flagged.
- **Core loop:** prices update weekly → the planner picks dinners → we lock, swap or import recipes → the shopping list sorts by store, optionally capped at a max number of stops.
- **Look:** light, warm farmhouse style (linen backgrounds, serif headings, muted sage and terracotta), matching the approved mockups.

## Architecture

A phone web app like Cadence, backed by Supabase; anything that touches outside sites or the AI key runs in Supabase edge functions, never in the browser.

```
Web app on our phones (Plan, Recipes, List, Settings; GitHub Pages)
        <->  Supabase
               - Database and sign-in (household, recipes, plans, products and dated prices)
               - Edge functions (weekly price sync on Mondays, recipe import, dinner suggestions,
                 receipt reading; holds the AI key)
                    ->  Ramstein / Vogelweh commissary (Freshop catalog and flyer)
                    ->  German store flyers (weekly offers)
                    ->  Recipe websites (embedded recipe data)
                    ->  Claude API (suggestions and reading)
```

The app reads and saves only through Supabase. A scheduled edge function pulls prices every Monday; the AI functions run when we tap Suggest, Import or scan a receipt.

## Data sources

The commissary gives us the richest data (full catalog plus sales); German stores mostly give weekly deals, so receipts and manual entries fill the gaps.

| Source | What we get | How we get it | Refresh | Caveat |
| --- | --- | --- | --- | --- |
| Ramstein commissary (CLICK2GO) | Full catalog prices, weekly flyer with sale and regular prices, DeCA recipes, digital coupons | Freshop endpoints behind shop.commissaries.com (`products`, `circulars`, `recipes`, `offers`), anonymous session, Ramstein store ID 5873, Vogelweh ID to look up | Weekly, Monday | Not a public API; site uses reCAPTCHA and has its own terms. Gentle, once-a-week pulls only |
| Lidl, Aldi, Kaufland, Globus, REWE | Weekly offers (sale price, regular price, unit, validity dates) | A flyer aggregator such as Marktguru, or a paid unofficial scraper | Weekly | Mostly deals, not full shelf prices; Kaufland is harder to read |
| Receipts | Real prices we actually paid, any store | Photo of receipt → AI reads line items → matched to products | Every trip | Fills shelf prices the flyers miss |
| Manual entry | One-off prices | Tap a price on the list to correct it | As needed | Always overrides older data |
| Recipe links | Ingredients, amounts, steps, servings | Read the recipe data most recipe sites embed (schema.org Recipe) | On import | Personal use; store a link if the app ever goes public |
| Recipe screenshots | Same as links | AI reads the image | On import | Needs the server function |
| AI suggestions | 3–5 dinner ideas built around this week's sales | Claude API with our preferences and sale items | On demand | Strict ingredient format so every item can be priced |

Every price carries a source and a "last checked" date, so the app degrades gracefully if a source stops working.

## Data model

Thirteen Supabase tables cover it; everything belongs to a household so Lydia sees the same plan and list.

| Table | Holds | Key fields |
| --- | --- | --- |
| `households` | The family and its defaults | portions (4), weekly budget, units (US/metric), default stores, max stops (0 = off), home currency |
| `members` | Who can sign in | user id, household id, role |
| `stores` | Stores we know about | name, chain, currency (USD/EUR), external id (Ramstein 5873) |
| `products` | A store's item | store id, name, brand, size, unit, external id, barcode (EAN) when known |
| `prices` | A price at a point in time | product id, price, sale price, valid from/to, source (flyer, catalog, receipt, manual), checked at |
| `ingredients` | Generic ingredient used by recipes | name ("chicken thighs"), default unit, pantry staple flag |
| `ingredient_matches` | Which products can stand in for an ingredient | ingredient id, product id, confidence, confirmed by us |
| `recipes` | Recipe box | title, source url, servings, time, tags (Quick, Luke-friendly), rating, steps |
| `recipe_ingredients` | What a recipe needs | recipe id, ingredient id, amount, unit |
| `plans` / `plan_meals` | A week and its dinners | week start; day, recipe id, locked, leftovers night |
| `usuals` | Luke's recurring items | ingredient id, quantity per week, skip this week |
| `list_items` | The generated shopping list | plan id, product id, store id, quantity, checked off |

Exchange rate is stored daily so a week's totals don't shift mid-trip.

## Price engine

The hard part is not fetching prices but matching "2 lb chicken thighs" to the right package at each store and comparing fairly.

1. **Normalize units.** Convert every product to a price per kg, liter or each, and every recipe amount to the same base. US recipes and German packaging meet here.
2. **Convert currency.** Euro prices convert to dollars at the stored rate (€1 ≈ $1.08 is a placeholder).
3. **Match ingredients to products.** Start with simple name matching, let the AI suggest matches for unclear ones, and remember every match we confirm. Confirmed matches always win.
4. **Price a recipe.** For each ingredient, cost = the package we'd actually buy at the cheapest allowed store. Pantry staples cost $0.
5. **Pick the week.** For each open night, choose the cheapest recipe that fits the time limit, skips foods we avoid, and isn't repeated. Prefer recipes that share ingredients so half-used packages get used.
6. **Build the list.** Combine duplicate ingredients across dinners and Luke's usuals, then assign each item to its cheapest selected store.
7. **Apply max stops (optional).** When set to 1–3, try every combination of selected stores up to that size (at most 63 combinations for 6 stores) and keep the one that drops the fewest items, then costs least, then has fewer stops. Off = cheapest store per item.
8. **Show the trade-off.** Report which stores were skipped and the extra cost versus visiting every selected store.

## Screens

Four tabs, as in the approved prototype.

| Tab | What it shows | Key actions |
| --- | --- | --- |
| Plan | Week of dinners, weekly total vs budget, Luke's usuals | Lock, swap, rebuild unlocked, find a dinner for a leftovers night, build shopping list |
| Recipes | Import box, this week's suggestions, recipe box | Import by link or screenshot, keep or pass suggestions, filter by Quick or Luke-friendly, rate after dinner |
| List | Items grouped by store with subtotals; one summary line for stores and stops | Check off items, open the store sheet, choose "Just this trip" or "Save as default" |
| Settings | Portions, dinners per week, time limit, budget, exchange rate, units, default stores, max stops, Luke's usuals, foods we skip, sharing | Edit defaults; changes flow to Plan and List |

**Recipe page and cook mode.** Tapping a dinner on Plan opens its recipe page: ingredients scaled by a portions control (default 4) and checked off while gathering, each tagged with the store it came from, then the steps. "Start cooking" opens cook mode: one step per screen in large type, the ingredients and amounts for that step, a one-tap timer on timed steps, the screen kept awake, and a reminder at the step where Luke's plain portion gets set aside. Finishing asks "Make again" or "Not for us", which feeds the recipe rating, and notes the leftovers night. On the day itself, Plan shows a "Tonight" banner linking straight to the recipe.

Empty and error states to design: no prices yet for a store, an item not sold at selected stores (dashed "not sold here" box), an import that couldn't read a recipe.

## Build phases

Build in five phases so the app is useful from phase 2 onward; each ends with something we use for a real week.

1. **Foundation.** Supabase project, tables, sign-in for both of us, the four tabs with the farmhouse styling and sample data; Plan switches between this week and next.
   - Done when: the prototype runs on our phones against a real database.
2. **Commissary prices.** Edge function that pulls Ramstein's and Vogelweh's catalog and flyer weekly (shown as one "Commissary", naming the store only when one is cheaper); price per unit; recipe box with manual recipes; DeCA recipes; a read-only recipe page when tapping a dinner.
   - Done when: a manually built week shows real commissary costs.
3. **German stores and the list.** Flyer offers for the stores we pick, exchange rate, ingredient matching with confirmations, shopping list by store, max stops; list editing (add our own items, remove or mark "have it", change quantities, and keep our edits when the list is rebuilt).
   - Done when: we shop a full week from the app's list.
4. **Planner and imports.** Cheapest-week planner with lock, swap and rebuild; Luke's usuals; recipe import by link; recipe page and cook mode with timers and ratings.
   - Done when: the app proposes a week we'd actually cook.
5. **AI features.** Dinner suggestions from sales, screenshot import, receipt scanning to fill shelf prices.
   - Done when: suggestions and receipts work for a month without fixes.

Later: the chat agent, ratings that shape suggestions, a Cadence link so grocery spending shows in the budget.

## Risks and open questions

The biggest risk is depending on data sources we don't control; the app should keep working on the last known prices if one breaks.

| Risk | Impact | Fallback |
| --- | --- | --- |
| Commissary site changes or blocks requests | No fresh commissary prices | Keep last prices with a "last checked" date; receipts and manual entry |
| Commissary terms or reCAPTCHA | Automated pulls not allowed | Two stores, once a week; never bypass the CAPTCHA; read the terms before phase 2 |
| German flyers only cover deals | Shelf prices missing for staples | Receipt scanning; manual prices |
| Ingredient matching picks the wrong product | Wrong totals | Confirm matches once; confirmed matches always win |
| AI key exposed in the front end | Someone runs up the bill | Key only in a Supabase edge function |
| Imported recipes reused publicly | Copyright issues if the app goes public | Store links and our own notes, not full recipe text |

Decided (Oct 27):

- [x] Default German store: Globus
- [x] Commissaries: compare Ramstein and Vogelweh
- [x] Platform: phone web app, like Cadence
- [x] German prices: Marktguru-style flyer aggregator
- [x] Starting weekly grocery budget: $150
