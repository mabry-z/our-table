// Turns table rows into what the screens show: prices per store chain in dollars, recipe
// costs, weeks with their dinners and list. Ramstein and Vogelweh share the "Commissary" chain;
// an item names its store only when one commissary is cheaper or the only one selling it.

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const r2 = v => Math.round(v * 100) / 100;

export function isoDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function assemble(rows, today = isoDate()) {
  const hh = rows.households[0];
  if (!hh) return null;
  const rate = Number(rows.exchange_rates[0]?.rate ?? 1.08);
  const stores = [...rows.stores].sort((a, b) => a.sort_order - b.sort_order);
  const storeById = new Map(stores.map(s => [s.id, s]));
  const chains = [...new Set(stores.map(s => s.chain))];
  const chainSize = {};
  stores.forEach(s => { chainSize[s.chain] = (chainSize[s.chain] || 0) + 1; });

  const productById = new Map(rows.products.map(p => [p.id, p]));
  const latest = new Map();
  for (const p of rows.prices) {
    const cur = latest.get(p.product_id);
    if (!cur || p.checked_at > cur.checked_at) latest.set(p.product_id, p);
  }

  // ingredient id -> chain -> every store's current price in USD
  const raw = {};
  for (const m of rows.ingredient_matches) {
    if (!m.confirmed) continue;
    const prod = productById.get(m.product_id);
    const st = prod && storeById.get(prod.store_id);
    const lp = prod && latest.get(prod.id);
    if (!st || !lp) continue;
    const sale = lp.sale_price != null && (!lp.valid_from || lp.valid_from <= today) && (!lp.valid_to || lp.valid_to >= today);
    const usd = r2(Number(sale ? lp.sale_price : lp.price) * (st.currency === 'EUR' ? rate : 1));
    ((raw[m.ingredient_id] ||= {})[st.chain] ||= []).push({ usd, sale, store: st.name });
  }
  const prices = {};
  for (const [ing, byChain] of Object.entries(raw)) {
    prices[ing] = {};
    for (const [chain, list] of Object.entries(byChain)) {
      list.sort((a, b) => a.usd - b.usd);
      const best = list[0];
      const split = chainSize[chain] > 1 && (list.length < chainSize[chain] || list.some(x => x.usd !== best.usd));
      prices[ing][chain] = { usd: best.usd, sale: best.sale, store: split ? best.store : null };
    }
  }

  const recipes = rows.recipes.map(r => {
    const cbs = r.cost_by_store || {};
    const keys = Object.keys(cbs);
    return {
      ...r,
      cost: r2(keys.reduce((a, k) => a + Number(cbs[k]), 0)),
      chains: keys,
      mainChain: [...keys].sort((a, b) => cbs[b] - cbs[a])[0] || null,
    };
  });
  const recipeById = new Map(recipes.map(r => [r.id, r]));

  const weeks = [...rows.plans].sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).map(p => ({
    id: p.id,
    week_start: p.week_start,
    past: addDays(p.week_start, 7) <= today,
    current: p.week_start <= today && today < addDays(p.week_start, 7),
    meals: rows.plan_meals.filter(m => m.plan_id === p.id).sort((a, b) => a.day - b.day)
      .map(m => ({ ...m, recipe: recipeById.get(m.recipe_id) || null })),
    list: rows.list_items.filter(i => i.plan_id === p.id).sort((a, b) => a.position - b.position)
      .map(i => ({ ...i, prices: prices[i.ingredient_id] || {} })),
  }));

  const usuals = [...rows.usuals].sort((a, b) => a.position - b.position)
    .map(u => ({ ...u, prices: prices[u.ingredient_id] || {} }));
  const defaultChains = [...new Set((hh.default_store_ids || []).map(id => storeById.get(id)?.chain).filter(Boolean))];

  return {
    hh, rate, rateDate: rows.exchange_rates[0]?.rate_date ?? null, stores, chains, weeks, recipes, recipeById,
    usuals, defaultChains, memberCount: rows.members.length,
  };
}

// Cheapest chain for one item among the selected chains.
export function pick(prices, on) {
  let best = null;
  for (const k in prices) {
    if (!on[k]) continue;
    if (!best || prices[k].usd < prices[best].usd) best = k;
  }
  return best;
}

export function evalSet(items, on) {
  let total = 0, missing = 0;
  items.forEach(it => { const k = pick(it.prices, on); if (k) total += it.prices[k].usd; else missing++; });
  return { total, missing };
}

// Max stops: try every combination of up to n selected chains; fewest dropped items, then
// lowest cost, then fewest stops.
export function bestSubset(items, sel, n) {
  let best = null;
  for (let mask = 1; mask < (1 << sel.length); mask++) {
    const ks = sel.filter((_, i) => (mask >> i) & 1);
    if (ks.length > n) continue;
    const on = Object.fromEntries(ks.map(k => [k, 1]));
    const r = evalSet(items, on);
    if (!best || r.missing < best.missing || (r.missing === best.missing && (r.total < best.total - 0.001
      || (Math.abs(r.total - best.total) < 0.001 && ks.length < best.n)))) {
      best = { on, total: r.total, missing: r.missing, n: ks.length };
    }
  }
  return best;
}
