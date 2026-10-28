// Sample data matching the approved mockups, expanded into the same rows as the Supabase
// tables. The app runs on it until a database is connected, and tools/seed.html turns it into
// supabase/seed.sql, so the two never drift apart.

// Deterministic uuid from a readable key, so every run and the seed file agree on ids.
export function uid(key) {
  const hex = [0, 1, 2, 3].map(j => {
    let x = 0x811c9dc5 ^ (j * 0x9e3779b9);
    for (const c of key + '#' + j) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
    return (x >>> 0).toString(16).padStart(8, '0');
  }).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const RATE = 1.08; // placeholder €1 ≈ $1.08 from the build plan
const CHECKED_AT = '2026-10-26T06:00:00Z';

// key, name, chain, currency, Freshop store id
const STORES = [
  ['ramstein', 'Ramstein', 'Commissary', 'USD', '5873'],
  ['vogelweh', 'Vogelweh', 'Commissary', 'USD', '5921'],
  ['lidl', 'Lidl', 'Lidl', 'EUR', null],
  ['aldi', 'Aldi', 'Aldi', 'EUR', null],
  ['kaufland', 'Kaufland', 'Kaufland', 'EUR', null],
  ['globus', 'Globus', 'Globus', 'EUR', null],
  ['rewe', 'REWE', 'REWE', 'EUR', null],
];
const DEFAULT_STORES = ['ramstein', 'vogelweh', 'lidl', 'aldi', 'kaufland', 'globus'];

// key, ingredient, list label, for, USD price by chain ([regular, sale] when on sale),
// per-store overrides (Ramstein and Vogelweh mostly match; drumsticks don't)
const ITEMS = [
  ['pork_sausage', 'Pork sausage', 'Pork sausage roll, 1 lb', 'Mon', { Commissary: [4.80, 2.83] }],
  ['bell_peppers', 'Bell peppers', 'Bell peppers, 3 pack', 'Mon', { Lidl: 1.94, Aldi: 2.05, Kaufland: 2.15, Globus: 2.26, REWE: 2.69 }],
  ['penne', 'Penne', 'Penne, 500 g', 'Mon', { Lidl: 0.86, Aldi: 0.86, Kaufland: 0.95, Globus: 0.97, REWE: 1.18, Commissary: 1.59 }],
  ['chicken_breast', 'Chicken breast', 'Chicken breast, 600 g', 'Tue', { Lidl: 5.40, Aldi: 5.50, Kaufland: 5.62, Globus: 5.80, REWE: 6.47, Commissary: 6.90 }],
  ['black_beans', 'Black beans', 'Black beans, 2 cans', 'Tue', { Commissary: 1.78, Kaufland: 2.14, REWE: 2.56 }],
  ['taco_seasoning', 'Taco seasoning', 'Taco seasoning', 'Tue', { Commissary: 0.89 }],
  ['chicken_thighs', 'Chicken thighs', 'Chicken thighs, 1 kg', 'Thu', { Aldi: 6.15, Lidl: 6.37, Kaufland: 5.94, Globus: 6.20, REWE: 7.55 }],
  ['potatoes', 'Potatoes', 'Potatoes, 2 kg', 'Thu', { Aldi: 2.69, Lidl: 2.69, Kaufland: 2.80, Globus: 2.58, REWE: 3.23 }],
  ['drumsticks', 'Chicken drumsticks', 'Chicken drumsticks, 1.5 kg', 'Fri', { Commissary: 7.20, Kaufland: 7.45, Lidl: 7.55 }, { vogelweh: 7.65 }],
  ['corn', 'Corn on the cob', 'Corn on the cob, 4', 'Fri', { Commissary: 3.10, Kaufland: 2.80, REWE: 3.75 }],
  ['pork_schnitzel', 'Pork schnitzel', 'Pork schnitzel, 600 g', 'Sat', { Kaufland: 5.94, Globus: 5.60, Lidl: 6.15, Aldi: 6.15, REWE: 7.55 }],
  ['spaetzle', 'Spätzle', 'Spätzle, 500 g', 'Sat', { Kaufland: 1.49, Lidl: 1.18, Aldi: 1.18, Globus: 1.40, REWE: 1.83 }],
  ['nuggets', 'Chicken nuggets', 'Chicken nuggets, 2 bags', 'Luke', { Commissary: 9.98, Lidl: 8.60, Kaufland: 9.70 }],
  ['fried_shrimp', 'Fried shrimp', 'Fried shrimp', 'Luke', { Commissary: 7.49 }],
  ['pasta', 'Pasta', 'Pasta, 1 box', 'Luke', { Lidl: 1.20, Aldi: 1.20, Kaufland: 1.30, Commissary: 1.59 }],
];

// key, title, minutes, tags, rating, status, cached cost by chain, Luke note, sale note
const RECIPES = [
  ['sausage_pasta', 'Sausage and pepper pasta', 30, ['Quick', 'Luke-friendly'], 5, 'box', { Commissary: 9.4 }, 'Plain pasta for Luke', 'On sale'],
  ['oven_chicken', 'Oven fried chicken and corn', 45, ['Luke-friendly'], 5, 'box', { Commissary: 10.3 }, 'Luke eats this too', null],
  ['sheetpan', 'Sheet-pan chicken and potatoes', 40, [], 4, 'box', { Aldi: 8.6 }, null, null],
  ['taco_bowls', 'Chicken taco bowls', 25, ['Quick'], 4, 'box', { Lidl: 6.3, Commissary: 5.5 }, null, null],
  ['schnitzel', 'Schnitzel and spätzle', 35, [], 5, 'box', { Kaufland: 11.2 }, null, null],
  ['beef_skillet', 'Beef and potato skillet', 25, ['Quick'], 3, 'box', { Commissary: 10.35 }, null, null],
  ['chili_mac', 'Chili mac', 30, ['Quick', 'Luke-friendly'], 4, 'box', { Commissary: 6.1, Lidl: 4.1 }, 'Plain pasta for Luke', null],
  ['beef_tacos', 'Beef tacos', 25, ['Quick'], 4, 'box', { Commissary: 12.9 }, null, 'On sale'],
  ['pork_chops', 'Pork chops and green beans', 30, ['Quick'], 4, 'box', { Aldi: 5.4, Lidl: 4.5 }, null, null],
  ['shrimp_fries', 'Fried shrimp and fries', 30, ['Luke-friendly'], 4, 'box', { Commissary: 13.4 }, 'Luke eats this too', null],
  ['pizza', 'Homemade pizza', 40, [], 4, 'box', { Lidl: 5.6, Commissary: 4.2 }, null, null],
  ['hash', 'Sausage and sweet potato hash', 30, [], null, 'suggested', { Commissary: 9.30 }, null, 'Sausage on sale'],
  ['tuscan', 'Creamy Tuscan chicken pasta', 35, ['Luke-friendly'], null, 'suggested', { Lidl: 13.45 }, 'Plain pasta for Luke', null],
  ['honey_pork', 'Honey garlic pork chops', 30, [], null, 'suggested', { Aldi: 9.17 }, null, null],
];

// Steps for the cook-mode mockup recipe (used in phase 4).
const SAUSAGE_PASTA_STEPS = [
  { title: 'Boil the water', text: 'Bring a large pot of well-salted water to a boil.' },
  { title: 'Brown the sausage', text: 'Crumble the sausage into a large skillet over medium-high heat. Cook until browned, breaking it up as it goes.', timer_sec: 360 },
  { title: 'Soften the vegetables', text: 'Add the peppers and onion to the skillet. Cook, stirring now and then, until soft.', timer_sec: 300 },
  { title: 'Cook the pasta', text: 'Add the penne to the boiling water and cook until just tender.', timer_sec: 660 },
  { title: "Set aside Luke's portion", text: 'Drain the pasta. Before anything else touches it, scoop one plain portion into a bowl for Luke.', luke: true },
  { title: 'Bring it together', text: 'Stir the garlic and crushed tomatoes into the skillet and simmer. Toss with the pasta and top with parmesan.', timer_sec: 300 },
];

// Two weeks; each night is [recipe, options for Swap] or null for leftovers.
const WEEKS = [
  ['2026-11-02', true, [
    ['sausage_pasta', ['sausage_pasta', 'chili_mac']],
    ['taco_bowls', ['taco_bowls', 'beef_tacos']],
    null,
    ['sheetpan', ['sheetpan', 'pork_chops']],
    ['oven_chicken', ['oven_chicken', 'shrimp_fries']],
    ['schnitzel', ['schnitzel', 'pizza']],
    null]],
  ['2026-11-09', false, [
    ['chili_mac', ['chili_mac', 'sausage_pasta']],
    ['pork_chops', ['pork_chops', 'sheetpan']],
    null,
    ['beef_skillet', ['beef_skillet', 'taco_bowls']],
    ['shrimp_fries', ['shrimp_fries', 'oven_chicken']],
    ['pizza', ['pizza', 'schnitzel']],
    null]],
];

const USUALS = [['nuggets', 'Chicken nuggets', '2 bags'], ['pasta', 'Pasta', '1 box'], ['fried_shrimp', 'Fried shrimp', '1 bag']];

export function sampleRows() {
  const hh = uid('household');
  const R = {
    households: [{
      id: hh, name: 'Our household', portions: 4, dinners_per_week: 5, leftovers_per_week: 2,
      time_limit_min: 45, weekly_budget: 150, units: 'US', home_currency: 'USD',
      default_store_ids: DEFAULT_STORES.map(k => uid('store:' + k)), max_stops: 0,
      foods_we_skip: ['Mushrooms', 'Olives'],
    }],
    members: [], stores: [], ingredients: [], products: [], prices: [], ingredient_matches: [],
    recipes: [], plans: [], plan_meals: [], usuals: [], list_items: [],
    exchange_rates: [{ rate_date: '2026-10-26', base: 'EUR', quote: 'USD', rate: RATE, source: 'sample' }],
  };

  STORES.forEach(([k, name, chain, currency, ext], i) => R.stores.push({
    id: uid('store:' + k), household_id: hh, name, chain, currency, external_id: ext, sort_order: i,
  }));

  ITEMS.forEach(([k, ing, label, , byChain, overrides = {}]) => {
    const ingId = uid('ing:' + k);
    R.ingredients.push({ id: ingId, household_id: hh, name: ing, default_unit: null, pantry_staple: false });
    for (const [store, , chain, currency] of STORES) {
      if (!(chain in byChain)) continue;
      let [usd, sale] = Array.isArray(byChain[chain]) ? byChain[chain] : [byChain[chain], null];
      if (store in overrides) { usd = overrides[store]; sale = null; }
      const conv = v => (v == null ? null : currency === 'EUR' ? Math.round(v / RATE * 100) / 100 : v);
      const prodId = uid(`prod:${k}:${store}`);
      R.products.push({ id: prodId, household_id: hh, store_id: uid('store:' + store), name: label, brand: null, size_amount: null, size_unit: null, external_id: null, ean: null });
      R.prices.push({
        id: uid(`price:${k}:${store}`), household_id: hh, product_id: prodId, price: conv(usd), sale_price: conv(sale),
        valid_from: sale ? '2026-10-02' : null, valid_to: sale ? '2026-12-02' : null, source: 'sample', checked_at: CHECKED_AT,
      });
      R.ingredient_matches.push({ id: uid(`match:${k}:${store}`), household_id: hh, ingredient_id: ingId, product_id: prodId, confidence: 1, confirmed: true });
    }
  });

  RECIPES.forEach(([k, title, time_min, tags, rating, status, cost_by_store, luke_note, sale_note], i) => R.recipes.push({
    id: uid('recipe:' + k), household_id: hh, title, source_url: null, servings: 4, time_min, tags, rating,
    steps: k === 'sausage_pasta' ? SAUSAGE_PASTA_STEPS : [], status, luke_note, sale_note, cost_by_store,
    // newest first in the recipe box, in mockup order
    created_at: new Date(Date.parse('2026-10-26T12:00:00Z') - i * 60000).toISOString(),
  }));

  WEEKS.forEach(([week, withList, nights]) => {
    const planId = uid('plan:' + week);
    R.plans.push({ id: planId, household_id: hh, week_start: week });
    nights.forEach((n, d) => R.plan_meals.push({
      id: uid(`meal:${week}:${d + 1}`), household_id: hh, plan_id: planId, day: d + 1,
      recipe_id: n ? uid('recipe:' + n[0]) : null, options: n ? n[1].map(k => uid('recipe:' + k)) : [],
      locked: false, leftovers: !n,
    }));
    if (withList) ITEMS.forEach(([k, , label, forLabel], i) => R.list_items.push({
      id: uid(`item:${week}:${k}`), household_id: hh, plan_id: planId, ingredient_id: uid('ing:' + k), label,
      for_label: forLabel, product_id: null, store_id: null, quantity: 1, checked: false, position: i,
    }));
  });

  USUALS.forEach(([k, label, qty], i) => R.usuals.push({
    id: uid('usual:' + k), household_id: hh, ingredient_id: uid('ing:' + k), label, quantity_label: qty, skip_this_week: false, position: i,
  }));

  return R;
}
