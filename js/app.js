// App state, rendering and every tap. Screens are plain functions that return markup.
import * as data from './data.js';
import { assemble, guessAisle, AISLES, DAYS, DAY_SHORT } from './model.js';
import { esc, icon, weekOf } from './ui.js';
import { vPlan, vAddSheet } from './views/plan.js';
import { vAskBar, vAskSheet, ASK_CTX, ASK_CAP, askDay } from './views/ask.js';
import { vRecipes, editFields, cookIngredients, basePortions } from './views/recipes.js';
import { vCook, vCookAll, stepTimers, stepParts, timerLeft, mmss } from './views/cook.js';
import { vList } from './views/list.js';
import { vSettings } from './views/settings.js';
import { vSignin, vNoHousehold } from './views/signin.js';
import { shrinkImage } from './photos.js';

const S = {
  screen: 'loading', // loading | signin | nohousehold | app | error
  tab: 'plan', week: 0, filt: 'All',
  add: null,         // Add sheet (see vAddSheet): { target, mealId, step, name, ing, url, pv, err }
  recipe: null, edit: null, pickOpen: null, aiSpent: null, lastFind: null,
  many: null,        // "Choose several": [{ preview, media_type, data, st: new|wait|reading|done|fail, pv, name, err }]
  photoUrls: {}, viewPhoto: null,   // recipe photo links by storage path; the photo shown full size
  ask: null, askKept: null, askFocus: false, // the Ask sheet (see js/views/ask.js); the last one closed
  pendingDel: null, swiped: null,   // recipe waiting out its Undo; recipe row swiped open
  portions: {}, got: {},            // recipe page: portions chosen and ingredients checked off, by recipe
  cook: null,                       // cook mode: { id, step, portions, factor, timers, rate, awake, all }
  page: null, newUsual: { label: '', qty: '' }, newSkip: '', newSite: '', setErr: '', // Settings sub-pages
  toast: '', newItem: '', newAisle: '', listErr: '', moveItem: null,
  email: '', signErr: '', busy: false, err: '', user: null,
};
let M = null;
let rows = null;

const $ = id => document.getElementById(id);
const TABS = [['plan', 'calendar-week', 'Plan'], ['recipes', 'book', 'Recipes'], ['list', 'basket', 'List'], ['settings', 'settings', 'Settings']];
// Sites that turned away the link reader or Anthropic's search when tested (Nov 21, 2026).
const BLOCKS_APPS = ['allrecipes.com', 'seriouseats.com', 'simplyrecipes.com', 'southernliving.com', 'foodnetwork.com',
  'thekitchn.com', 'delish.com', 'cookieandkate.com'];
// Nights marked as leftovers when a week is started, for the household's leftovers per week.
const LEFTOVER_DAYS = [3, 7, 5, 1, 6, 2, 4];

function refresh() { M = assemble(rows); }

// The Ask bar's spot above the tabs. Made here if the page doesn't have it: right after an update a
// phone can still have the old index.html cached for a few minutes.
function dockEl() {
  return $('dock') || $('app').insertBefore(Object.assign(document.createElement('div'), { id: 'dock', className: 'dock' }), $('tabs'));
}

function render() {
  dockEl();
  const body = $('body');
  body.classList.toggle('nobar', S.screen !== 'app');
  $('tabs').innerHTML = '';
  $('sheet').innerHTML = '';
  $('dock').innerHTML = '';
  body.classList.remove('withask');
  if (S.screen === 'loading') { body.innerHTML = `<div class="mu" style="text-align:center;margin-top:40vh">Loading</div>`; return; }
  if (S.screen === 'signin') { body.innerHTML = vSignin(S, data.mode); return; }
  if (S.screen === 'nohousehold') { body.innerHTML = vNoHousehold(S.user); return; }
  if (S.screen === 'error') { body.innerHTML = `<div class="cd" style="margin-top:20vh;text-align:center">${esc(S.err)}<div style="margin-top:10px"><button class="ib" data-a="reload">Try again</button></div></div>`; return; }
  body.classList.toggle('cook', !!S.cook);
  if (S.cook) { // full screen: no tabs, no Ask bar
    const r = cookRecipe();
    if (!r) { endCook(); return render(); }
    const ings = cookIngredients(M, r, S.cook.factor);
    body.classList.add('nobar');
    body.innerHTML = vCook(S, r, ings, cookSteps());
    if (S.cook.all) $('sheet').innerHTML = vCookAll(S, ings);
    return;
  }

  const view = { plan: vPlan, recipes: vRecipes, list: vList, settings: (s, m) => vSettings(s, m, data.mode, S.user) }[S.tab];
  body.innerHTML = (S.err ? `<div class="banner row"><span>${esc(S.err)}</span><button class="ib" data-a="dismiss" aria-label="Dismiss" style="border:none">${icon('x')}</button></div>` : '') + view(S, M);
  $('tabs').innerHTML = TABS.map(([k, i, l]) => `<button class="${S.tab === k ? 'a' : ''}" data-tab="${k}"${S.tab === k ? ' aria-current="page"' : ''}>${icon(i)}${l}</button>`).join('');
  $('sheet').innerHTML = S.viewPhoto
    ? `<div class="ov photo-view" data-a="closephoto"><img src="${esc(S.viewPhoto)}" alt="Recipe photo, full size"><button class="ib" data-a="closephoto" aria-label="Close">${icon('x')}</button></div>`
    : S.ask ? vAskSheet(S, M) : vAddSheet(S, M);
  const ctx = askCtx();
  if (ctx) {
    $('dock').innerHTML = vAskBar(ctx);
    $('dock').style.bottom = $('tabs').offsetHeight + 'px';
    body.classList.add('withask');
  }
  if (S.tab === 'recipes' && S.recipe) loadPhotos(M.recipeById.get(S.recipe));
}

// Fetches links for a recipe's photos the first time its page shows (links last an hour).
const PHOTO_LINK_MS = 50 * 60 * 1000;
function loadPhotos(r) {
  const want = (r?.photo_paths || []).filter(p => !S.photoUrls[p] || (S.photoUrls[p].at && Date.now() - S.photoUrls[p].at > PHOTO_LINK_MS));
  if (!want.length) return;
  want.forEach(p => { S.photoUrls[p] = { url: S.photoUrls[p]?.url || null, at: Date.now() }; }); // asked for; don't ask again
  data.photoUrls(want).then(m => {
    Object.entries(m).forEach(([p, url]) => { S.photoUrls[p] = { url, at: Date.now() }; });
    if (S.recipe === r.id) render();
  }).catch(e => console.error(e));
}

// Writes show at once and save in the background. On failure, say so.
function bg(p) {
  p.catch(e => {
    console.error(e);
    S.err = 'Couldn’t save that change. Check your connection and reload.';
    render();
  });
}
function persist(table, id, patch) { bg(data.save(table, id, patch)); refresh(); }
function add(table, row) {
  const { row: r, saved } = data.insert(table, { household_id: M.hh.id, ...row });
  bg(saved);
  return r;
}
function del(table, id) { bg(data.remove(table, id)); }

function setHousehold(patch) { persist('households', M.hh.id, patch); }

// Leftovers nights and cooked dinners always add up to 7.
function setLeftovers(n) {
  const lo = Math.max(0, Math.min(4, n));
  setHousehold({ leftovers_per_week: lo, dinners_per_week: 7 - lo });
}

// This week and next follow changes to Luke's usuals; past weeks stay as they were.
function syncComing() {
  M.weeks.filter(w => w.id && !w.past).forEach(w => syncList(w.id));
  refresh();
}

// Makes a week's list match its dinners plus Luke's usuals: one line per ingredient, naming the
// nights it's for. Our own items, checks and "have it" are kept.
function syncList(planId) {
  const want = new Map();
  const meals = rows.plan_meals.filter(m => m.plan_id === planId && m.recipe_id && !m.leftovers).sort((a, b) => a.day - b.day);
  for (const m of meals) {
    const day = DAY_SHORT[m.day - 1];
    rows.recipe_ingredients.filter(ri => ri.recipe_id === m.recipe_id).sort((a, b) => a.position - b.position).forEach(ri => {
      const k = 'r|' + ri.ingredient_id, w = want.get(k);
      if (w) { if (!w.days.includes(day)) w.days.push(day); return; }
      const ing = rows.ingredients.find(i => i.id === ri.ingredient_id);
      want.set(k, { ingredient_id: ri.ingredient_id, label: ri.note || ing?.name || 'Ingredient', days: [day] });
    });
  }
  rows.usuals.filter(u => !u.skip_this_week).forEach(u => want.set('u|' + u.ingredient_id,
    { ingredient_id: u.ingredient_id, label: u.label, for_label: 'Luke', quantity_label: u.quantity_label }));
  const forLabel = w => w.for_label || w.days.join(', ');

  for (const it of rows.list_items.filter(i => i.plan_id === planId && !i.custom)) {
    const k = (it.for_label === 'Luke' ? 'u|' : 'r|') + it.ingredient_id, w = want.get(k);
    if (!w) { del('list_items', it.id); continue; }
    if (it.for_label !== forLabel(w)) bg(data.save('list_items', it.id, { for_label: forLabel(w) }));
    want.delete(k);
  }
  let pos = Math.max(-1, ...rows.list_items.filter(i => i.plan_id === planId).map(i => i.position)) + 1;
  for (const w of want.values()) {
    add('list_items', {
      plan_id: planId, ingredient_id: w.ingredient_id, label: w.label, for_label: forLabel(w),
      quantity_label: w.quantity_label || null, quantity: 1, checked: false, position: pos++, have_it: false, custom: false,
    });
  }
}

function setMeal(mealId, patch, toast) {
  const meal = rows.plan_meals.find(m => m.id === mealId);
  bg(data.save('plan_meals', mealId, { options: [], locked: false, ...patch }));
  syncList(meal.plan_id);
  refresh();
  S.toast = toast(DAYS[meal.day - 1]);
  S.add = null;
}
function placeRecipe(recipeId) {
  const r = rows.recipes.find(x => x.id === recipeId);
  setMeal(S.add.mealId, { recipe_id: recipeId, leftovers: false }, day => `${r.title} is on ${day}. Its ingredients are on the list.`);
}

// What to call a list item in messages: its ingredient's name, else its label.
function itemName(it) { return rows.ingredients.find(i => i.id === it.ingredient_id)?.name || it.label; }

// "1 1/2 lb chicken thighs, cut up" -> "Chicken thighs"; "2 cups cheddar – divided" -> "Cheddar";
// "1 (3- to 4 pound) broiler/fryer chicken, cut into 8 pieces" -> "Broiler/fryer chicken"
const UNIT = /^\s*[\d¼½¾⅓⅔⅛.,\/\s-]*\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?|cans?|bags?|packs?|packages?|boxes?|bunch(es)?|cloves?|heads?|jars?|bottles?|pieces?|slices?|sticks?)?\.?\s+(of\s+)?/i;
function ingredientName(line) {
  const bare = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  const n = bare.replace(UNIT, '').split(/,|\s[–—-]\s/)[0].trim() || line.trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
// Names of recipes we import: "one-pot chili mac with beans" -> "One-Pot Chili Mac with Beans".
// Small words stay lowercase unless first or last; capitals already there (BBQ, McCormick) stay.
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'n', 'nor', 'of', 'on', 'or', 'the', 'to', 'with', 'from', 'into', 'over',
  'au', 'aux', 'de', 'del', 'della', 'di', 'du', 'la', 'le', 'al', 'alla', 'con', 'en', 'y']); // coq au vin, pasta alla vodka
function titleCase(s) {
  const words = (s || '').trim().split(/\s+/);
  return words.map((w, i) => {
    const bare = w.toLowerCase().replace(/[^a-z']/g, '');
    if (i > 0 && i < words.length - 1 && SMALL.has(bare) && !/[(:–—-]$/.test(words[i - 1])) return w.toLowerCase();
    return w.replace(/(^|[-/(“"])(\p{Ll})/gu, (m, pre, c) => pre + c.toUpperCase());
  }).join(' ');
}
const lines = text => (text || '').split('\n').map(l => l.trim()).filter(Boolean);
const toInt = v => (parseInt(v, 10) > 0 ? parseInt(v, 10) : null);

// Replaces a recipe's ingredients with these lines, reusing ingredients we already know.
function setIngredients(recipeId, list) {
  rows.recipe_ingredients.filter(ri => ri.recipe_id === recipeId).forEach(ri => del('recipe_ingredients', ri.id));
  list.forEach((line, i) => {
    const n = ingredientName(line);
    const ing = rows.ingredients.find(x => x.name.toLowerCase() === n.toLowerCase())
      || add('ingredients', { name: n, pantry_staple: false, aisle: guessAisle(n) });
    add('recipe_ingredients', { recipe_id: recipeId, ingredient_id: ing.id, note: line, position: i });
  });
}

// photos: the pictures it was read from, kept with it ({ data, preview } from js/photos.js).
function saveRecipe({ title, origin, source_url = null, site = null, time_min = null, servings = null, steps = [], ing, photos = [], luke_note = null }) {
  const id = data.newId();
  const photo_paths = photos.map((_, i) => `${M.hh.id}/${id}/${i + 1}.jpg`);
  const recipe = add('recipes', {
    id, title: title.charAt(0).toUpperCase() + title.slice(1), origin, status: 'box', source_url, site, time_min, luke_note,
    servings: servings || M.hh.portions, tags: [], steps, photo_paths, created_at: new Date().toISOString(),
  });
  if (photos.length) {
    photo_paths.forEach((p, i) => { S.photoUrls[p] = { url: photos[i].preview }; }); // shown before the upload finishes
    bg(data.uploadPhotos(photo_paths, photos));
  }
  setIngredients(recipe.id, ing);
  return recipe;
}

function addPick(recipeId) {
  const r = rows.recipes.find(x => x.id === recipeId);
  if (rows.picks.some(p => p.recipe_id === recipeId)) { S.toast = `${r.title} is already in this week's picks.`; return; }
  add('picks', { recipe_id: recipeId, added_by: S.user?.id ?? null, added_at: new Date().toISOString() });
  refresh();
  S.toast = `${r.title} is in this week's picks.`;
}

// After saving a recipe from the Add sheet: put it on the night, in the picks, or open it.
function finishAdd(recipe, toPicks) {
  const a = S.add;
  if (a.target === 'meal' && !toPicks) return placeRecipe(recipe.id);
  S.add = null;
  if (a.target === 'picks' || toPicks) return addPick(recipe.id);
  refresh();
  S.recipe = recipe.id;
  S.toast = 'Saved to the recipe box.';
}

// Saves the checked-over recipe from a link (or reuses it if the box already has that link).
function saveLink(toPicks) {
  const a = S.add, p = a.pv;
  const recipe = p.dupe ? rows.recipes.find(r => r.id === p.dupe) : saveRecipe({
    title: (a.name ?? p.title).trim() || p.title, origin: p.origin || 'link', source_url: p.source_url, site: p.site,
    time_min: p.time_min, servings: p.servings, steps: p.steps || [], ing: lines(a.ing ?? p.ingredients.join('\n')),
    photos: a.from === 'photo' ? a.photos : [],
  });
  finishAdd(recipe, toPicks);
}

// Shows "reading…", runs the reader (link, pasted text or photo), then the check-it-over card.
async function readRecipe(a, from, read, origin) {
  Object.assign(a, { step: 'reading', from, err: '' });
  render();
  let pv;
  try { pv = await read(); } catch (e) { Object.assign(a, { step: from, err: e.message }); return; }
  if (S.add !== a) return; // closed while reading
  pv.origin = origin;
  pv.title = titleCase(pv.title);
  pv.dupe = pv.source_url ? rows.recipes.find(r => r.source_url && r.source_url === pv.source_url)?.id || null : null;
  Object.assign(a, { step: 'preview', pv, name: undefined, ing: undefined });
  S.aiSpent = null; // refetched next time Settings opens
}

// Find: searches our sites, then shows the matches in the sheet to pick from. The last search is
// kept for half an hour, so closing the sheet (even mid-search) never wastes one: opening Find
// again brings it back.
const KEEP_FIND_MS = 30 * 60 * 1000;
async function runFind(a, q) {
  Object.assign(a, { step: 'reading', from: 'find', q, err: '' });
  render();
  let res;
  try { res = await data.aiFind(q); } catch (e) { Object.assign(a, { step: 'find', err: e.message }); return; }
  res.results.forEach(x => { x.title = titleCase(x.title); });
  S.lastFind = { q, found: res.results, foundCost: res.cost_usd, at: Date.now() };
  S.aiSpent = null;
  if (S.add !== a) { S.toast = `Your search for “${q}” is ready. Open Find a recipe to see it.`; return; }
  Object.assign(a, { step: 'find', found: res.results, foundCost: res.cost_usd, seen: null });
}
function restoreFind(a) {
  const f = S.lastFind;
  if (f && Date.now() - f.at < KEEP_FIND_MS && !a.found) Object.assign(a, { q: f.q, found: f.found, foundCost: f.foundCost });
}
// Saves a Find result (or reuses the box's copy of that link), then places it like any recipe.
function saveFound(i, toPicks) {
  const x = S.add.found[i];
  const have = rows.recipes.find(r => r.source_url && r.source_url === x.source_url);
  finishAdd(have || saveRecipe({
    title: x.title, origin: 'ai_found', source_url: x.source_url, site: x.site, time_min: x.time_min,
    servings: x.servings, steps: x.steps || [], ing: x.ingredients,
  }), toPicks);
}

// "Choose several": each screenshot is read on its own (two at a time) and becomes its own
// recipe. The batch lives outside the sheet, so closing it mid-read loses nothing: opening
// Screenshot or photo again shows it.
const MAX_MANY = 10;
async function readMany() {
  const list = S.many;
  list.forEach(x => { if (x.st === 'new') x.st = 'wait'; });
  const next = async () => {
    for (let x; (x = list.find(y => y.st === 'wait'));) {
      x.st = 'reading'; render();
      try { x.pv = await data.aiRecipe({ kind: 'photo', images: [{ media_type: x.media_type, data: x.data }] }); x.name = x.pv.title = titleCase(x.pv.title); x.st = 'done'; }
      catch (e) { x.err = e.message; x.st = 'fail'; }
      if (S.many !== list) return;
      render();
    }
  };
  await Promise.all([next(), next()]);
  S.aiSpent = null;
  if (S.many === list && !S.add) { S.toast = 'Your screenshots are read. Open Add › Screenshot or photo to check them over.'; render(); }
}
const manyBusy = () => !!S.many?.some(x => x.st === 'wait' || x.st === 'reading');

// Saves every screenshot that was read: to the picks, or just to the box from Recipes.
function saveMany() {
  const ok = S.many.filter(x => x.st === 'done'), toBox = S.add.target === 'box';
  ok.forEach(x => {
    const p = x.pv, r = saveRecipe({
      title: (x.name || '').trim() || p.title, origin: 'photo', source_url: p.source_url, site: p.site,
      time_min: p.time_min, servings: p.servings, steps: p.steps || [], ing: p.ingredients, photos: [x],
    });
    if (!toBox) add('picks', { recipe_id: r.id, added_by: S.user?.id ?? null, added_at: new Date().toISOString() });
  });
  S.many = null; S.add = null;
  refresh();
  const n = ok.length === 1 ? '1 recipe is' : `${ok.length} recipes are`;
  S.toast = toBox ? `${n} in the recipe box.` : `${n} in this week's picks.`;
}

// Starts a week: seven open nights, with the household's leftovers nights. Returns its id.
function startWeek(idx) {
  const plan = add('plans', { week_start: M.weeks[idx].week_start });
  const lo = LEFTOVER_DAYS.slice(0, M.hh.leftovers_per_week);
  for (let d = 1; d <= 7; d++) add('plan_meals', { plan_id: plan.id, day: d, recipe_id: null, options: [], locked: false, leftovers: lo.includes(d) });
  syncList(plan.id);
  refresh();
  return plan.id;
}

// The Ask bar ---------------------------------------------------------------------------------
// Which Ask the current screen offers, if any: the week on Plan (not a past one), the recipe box,
// or a recipe's page. None when AI suggestions are off in Settings.
function askCtx() {
  if (S.screen !== 'app' || M.hh.ai_suggestions === false) return null;
  if (S.tab === 'plan') return M.weeks[S.week]?.past ? null : 'plan';
  if (S.tab === 'recipes') return S.recipe ? (S.edit || !M.recipeById.get(S.recipe) ? null : 'recipe') : 'recipes';
  return null;
}

// An Ask closed with answers comes back if it's opened again on the same screen within half an
// hour, so closing the sheet (even mid-ask) never wastes one.
function openAsk() {
  const ctx = askCtx(), k = S.askKept;
  if (k && k.ctx === ctx && k.recipeId === (S.recipe || null) && k.weekIdx === S.week && Date.now() - k.at < KEEP_FIND_MS) { S.ask = k; S.askKept = null; }
  else {
    const wk = M.weeks[S.week];
    S.ask = { ctx, weekIdx: S.week, recipeId: S.recipe || null, trail: [], draft: '', photo: null, err: '', loading: false, at: Date.now(),
      label: ctx === 'plan' ? weekOf(wk.week_start) : ctx === 'recipe' ? M.recipeById.get(S.recipe).title : 'Recipes' };
  }
  S.askFocus = true;
}
function closeAsk() { if (S.ask?.trail.length || S.ask?.loading) S.askKept = S.ask; S.ask = null; }

const recipeLines = id => rows.recipe_ingredients.filter(ri => ri.recipe_id === id).sort((a, b) => a.position - b.position)
  .map(ri => ri.note || rows.ingredients.find(i => i.id === ri.ingredient_id)?.name || '');
const stepText = s => (typeof s === 'string' ? s : [s.title, s.text].filter(Boolean).join(': '));

// What the AI needs to know about the screen the ask came from.
function askContext(k, last) {
  const hh = M.hh, base = { portions: hh.portions, luke_usuals: M.usuals.map(u => u.label) };
  if (k.ctx === 'recipe') {
    const r = M.recipeById.get(k.recipeId);
    return { ...base, recipe: { title: r.title, servings: r.servings, time_min: r.time_min, luke_note: r.luke_note, ingredients: recipeLines(r.id), steps: (r.steps || []).map(stepText) } };
  }
  const box = M.recipes.filter(r => r.status === 'box');
  if (k.ctx === 'recipes') return { ...base, box_titles: box.map(r => r.title), on_hand: k.onHand || [] };
  const wk = M.weeks[k.weekIdx], lo = LEFTOVER_DAYS.slice(0, hh.leftovers_per_week);
  const nights = DAYS.map((name, i) => {
    const m = wk.meals?.find(x => x.day === i + 1);
    if (!m) return { day: i + 1, name, state: lo.includes(i + 1) ? 'leftovers' : 'open' };
    return { day: i + 1, name, state: m.locked ? 'locked' : m.recipe ? 'planned' : m.leftovers ? 'leftovers' : 'open', recipe_id: m.recipe_id, title: m.recipe?.title };
  });
  return {
    ...base, week: weekOf(wk.week_start), nights, leftovers_per_week: hh.leftovers_per_week, weeknight_time_limit_min: hh.time_limit_min,
    box: box.slice(0, 120).map(r => ({ id: r.id, title: r.title, time_min: r.time_min, rating: r.rating, luke_note: r.luke_note, tags: r.tags,
      ingredients: recipeLines(r.id).slice(0, 12).map(l => ingredientName(l)) })),
  };
}

// The last answer, as sent back with the next ask (just what the AI needs to build on it).
function askPrev(r) {
  if (!r) return null;
  if (r.kind === 'found') return { kind: 'found', query: r.query, day: r.day, titles: r.results.map(x => x.title) };
  const { kind, msg, week, changed_days, recipes, changes, ideas } = r;
  return { kind, msg, week, changed_days, recipes, changes, ideas, items: r.kind === 'seen' ? r.items.filter((_, i) => !(r.off || []).includes(i)) : r.items };
}

async function askSend(text) {
  const k = S.ask, q = (text ?? k.draft ?? '').trim();
  if (k.loading || k.trail.length >= ASK_CAP) return;
  if (!q && !k.photo) { k.err = 'Type what you’d like first.'; return; }
  const last = k.trail.at(-1)?.r;
  const req = { ctx: k.ctx, q, context: askContext(k, last), prev: askPrev(last), asks: k.trail.map(t => t.q) };
  if (k.photo) req.photo = { media_type: k.photo.media_type, data: k.photo.data };
  const hadPhoto = !!k.photo;
  Object.assign(k, { loading: true, err: '', draft: '' });
  render();
  let r;
  try { r = await data.aiAsk(req); } catch (e) { Object.assign(k, { loading: false, err: e.message, draft: q }); render(); return; }
  (r.recipes || []).forEach(x => { x.title = titleCase(x.title); });
  (r.week || []).forEach(n => {
    if (n.kind === 'new') n.title = titleCase(n.title);
    n.was = req.context.nights?.[n.day - 1]?.state; // what a "keep" night is, even before the week is started
  });
  // On a follow-up, "keep" means the night as last proposed (a locked night stays locked either way).
  if (r.kind === 'week' && last?.kind === 'week') {
    r.week = r.week.map(n => {
      const p = last.week.find(x => x.day === n.day);
      return n.kind === 'keep' && p && n.was !== 'locked' ? { ...p } : n;
    });
    for (const n of r.week) {
      if (n.kind === 'new' && !r.recipes.some(x => x.title === n.title)) {
        const x = last.recipes.find(y => y.title === n.title);
        if (x) r.recipes.push(x);
      }
    }
  }
  (r.ideas || []).forEach(x => { x.title = titleCase(x.title); });
  (r.results || []).forEach(x => { x.title = titleCase(x.title); });
  k.trail.push({ q: q || 'What can I make with this?', photo: hadPhoto, r });
  Object.assign(k, { loading: false, photo: null, at: Date.now() });
  S.aiSpent = null;
  if (S.ask !== k) { S.toast = 'Your ask is answered. Tap the Ask bar to see it.'; }
  render();
  if ($('askbody')) $('askbody').scrollTop = 0;
}

// Saves a recipe the AI wrote (or a found one), reusing the box's copy of a found link.
function saveAsked(x, found) {
  if (found) {
    const have = rows.recipes.find(r => r.source_url && r.source_url === x.source_url);
    return have || saveRecipe({ title: x.title, origin: 'ai_found', source_url: x.source_url, site: x.site, time_min: x.time_min, servings: x.servings, steps: x.steps || [], ing: x.ingredients });
  }
  return saveRecipe({ title: x.title, origin: 'ai_created', time_min: x.time_min, servings: x.servings, luke_note: x.luke_note || null,
    steps: (x.steps || []).map(s => ({ text: s })), ing: x.ingredients });
}
const lastAnswer = () => S.ask.trail.at(-1).r;

// Puts a proposed week on the plan: locked nights and "keep" nights stay; new ideas are saved
// to the recipe box once each, as "Created for you".
function useWeek() {
  const k = S.ask, r = lastAnswer();
  const planId = M.weeks[k.weekIdx].id || startWeek(k.weekIdx);
  const made = new Map();
  for (const n of r.week) {
    const m = rows.plan_meals.find(x => x.plan_id === planId && x.day === n.day);
    if (!m || m.locked || n.kind === 'keep') continue;
    let patch;
    if (n.kind === 'box' && rows.recipes.some(x => x.id === n.recipe_id)) patch = { recipe_id: n.recipe_id, leftovers: false };
    else if (n.kind === 'new') {
      const x = r.recipes.find(y => y.title === n.title);
      if (!x) continue;
      if (!made.has(x.title)) made.set(x.title, saveAsked(x).id);
      patch = { recipe_id: made.get(x.title), leftovers: false };
    } else if (n.kind === 'leftovers') patch = { recipe_id: null, leftovers: true };
    else if (n.kind === 'open') patch = { recipe_id: null, leftovers: false };
    else continue;
    bg(data.save('plan_meals', m.id, { options: [], locked: false, ...patch }));
  }
  syncList(planId);
  refresh();
  S.ask = null; S.askKept = null;
  S.week = k.weekIdx; S.tab = 'plan'; S.recipe = null;
  S.toast = `The week is set${made.size ? `, with ${made.size === 1 ? 'one new idea' : made.size + ' new ideas'} saved to the recipe box` : ''}. Its ingredients are on the list.`;
}

// A found recipe goes on the night it was asked for (or the first open one).
function askPut(i) {
  const k = S.ask, r = lastAnswer(), x = r.results[i], day = askDay(M.weeks[k.weekIdx], r);
  const planId = M.weeks[k.weekIdx].id || startWeek(k.weekIdx);
  const m = rows.plan_meals.find(y => y.plan_id === planId && y.day === day);
  const recipe = saveAsked(x, true);
  bg(data.save('plan_meals', m.id, { options: [], locked: false, recipe_id: recipe.id, leftovers: false }));
  syncList(planId);
  refresh();
  (r.done ||= {})[i] = `Added to ${DAYS[day - 1]}`;
}

// Changes on a recipe's page: a new copy, or the recipe itself rewritten (planned lists follow).
function askChanges(replace) {
  const k = S.ask, r = lastAnswer(), x = r.recipes?.[0], old = M.recipeById.get(k.recipeId);
  if (!x) { k.err = 'There’s nothing to save yet.'; return; }
  S.ask = null; S.askKept = null;
  if (replace) {
    persist('recipes', old.id, { title: x.title, servings: x.servings || old.servings, time_min: x.time_min ?? old.time_min, luke_note: x.luke_note ?? old.luke_note, steps: x.steps.map(text => ({ text })) });
    setIngredients(old.id, x.ingredients);
    refresh(); resyncRecipe(old.id); refresh();
    S.toast = 'Recipe updated. Planned weeks’ lists follow.';
    return;
  }
  const copy = saveRecipe({ title: x.title.toLowerCase() === old.title.toLowerCase() ?`${old.title} (Our Version)` : x.title, origin: old.origin, source_url: old.source_url, site: old.site,
    time_min: x.time_min, servings: x.servings, luke_note: x.luke_note, steps: x.steps.map(text => ({ text })), ing: x.ingredients });
  refresh();
  S.recipe = copy.id;
  S.toast = 'Saved as a copy. The original is unchanged.';
}

// What's on hand from a fridge photo replaces the last photo's list.
function savePantry(items) {
  rows.pantry.filter(p => p.source === 'photo').forEach(p => del('pantry', p.id));
  items.forEach(label => {
    const ing = rows.ingredients.find(x => x.name.toLowerCase() === ingredientName(label).toLowerCase());
    add('pantry', { ingredient_id: ing?.id ?? null, label, source: 'photo', updated_at: new Date().toISOString() });
  });
}

async function loadSpent() {
  try { S.aiSpent = await data.aiSpent(); } catch (e) { console.error(e); S.aiSpent = { error: true }; }
  if (S.tab === 'settings') render();
}

// Planned weeks that use a recipe get their lists redone when the recipe changes.
function resyncRecipe(recipeId) {
  const plans = new Set(rows.plan_meals.filter(m => m.recipe_id === recipeId).map(m => m.plan_id));
  plans.forEach(id => { if (!M.weeks.find(w => w.id === id)?.past) syncList(id); });
}

function openRecipe(id) { S.tab = 'recipes'; S.recipe = id; S.edit = null; S.add = null; window.scrollTo(0, 0); }

// Deleting waits a few seconds so Undo can bring it back; then the recipe goes for good.
// Its ingredients and picks go with it (the database cascades); nights that used it open up
// and their shopping lists follow.
const UNDO_MS = 6000;
let delTimer = null;
function deleteRecipe(id) {
  finishDelete();
  const r = rows.recipes.find(x => x.id === id);
  S.pendingDel = { id, title: r.title };
  S.recipe = null; S.edit = null; S.swiped = null;
  delTimer = setTimeout(() => { finishDelete(); render(); }, UNDO_MS);
}
function finishDelete() {
  clearTimeout(delTimer);
  const p = S.pendingDel;
  if (!p) return;
  S.pendingDel = null;
  const plans = new Set();
  rows.plan_meals.filter(m => m.recipe_id === p.id).forEach(m => { m.recipe_id = null; m.options = []; m.locked = false; plans.add(m.plan_id); });
  rows.picks = rows.picks.filter(x => x.recipe_id !== p.id);
  rows.recipe_ingredients = rows.recipe_ingredients.filter(x => x.recipe_id !== p.id);
  bg(data.removePhotos(rows.recipes.find(x => x.id === p.id)?.photo_paths));
  del('recipes', p.id);
  refresh();
  plans.forEach(id => { if (!M.weeks.find(w => w.id === id)?.past) syncList(id); });
  refresh();
}

// A newer version out (tools/release.ps1 stamps it)? Reload into it, at an address the phone hasn't
// cached, but never while something is under way: cooking, a sheet open, an edit, a search.
async function checkVersion() {
  const mine = window.APP_VERSION;
  if (!mine || location.hostname === 'localhost') return;
  try {
    const { v } = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
    if (!v || v <= mine) return;
    if (S.cook || S.add || S.edit || S.ask || S.many || S.busy) return; // next time the app comes back
    const url = new URL(location.href);
    if (url.searchParams.get('v') === v) return; // already tried this one; don't loop
    url.searchParams.set('v', v);
    location.replace(url.href);
  } catch { /* offline or no version file: carry on with this one */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

async function start() {
  checkVersion();
  S.screen = 'loading'; render();
  try {
    if (data.mode === 'supabase') {
      S.user = await data.currentUser();
      if (!S.user) { S.screen = 'signin'; render(); return; }
    }
    rows = await data.loadRows();
    refresh();
    if (!M) { S.screen = 'nohousehold'; render(); return; }
    S.week = Math.max(0, M.weeks.findIndex(w => w.current));
    S.screen = 'app';
  } catch (e) {
    console.error(e);
    S.err = 'Couldn’t load your data. Check your connection.';
    S.screen = 'error';
  }
  render();
}

const ACTIONS = {
  tab: v => { S.tab = v; S.add = null; S.viewPhoto = null; if (S.ask) closeAsk(); S.recipe = null; S.edit = null; S.page = null; S.swiped = null; window.scrollTo(0, 0); if (v === 'settings') loadSpent(); },
  rmphoto: i => { S.add.photos.splice(Number(i), 1); },
  rmmany: i => { S.many.splice(Number(i), 1); if (!S.many.length) S.many = null; },
  // The Ask sheet's buttons (js/views/ask.js)
  askstarter: i => { S.ask.draft = ASK_CTX[S.ask.ctx].starters[Number(i)][1]; S.askFocus = true; },
  askback: i => { S.ask.trail = S.ask.trail.slice(0, Number(i) + 1); },
  asksee: i => { const r = lastAnswer(); r.seen = r.seen === Number(i) ? null : Number(i); },
  askput: i => askPut(Number(i)),
  askpick: i => { const r = lastAnswer(); addPick(saveAsked(r.results[Number(i)], true).id); (r.done ||= {})[i] = 'In the picks'; },
  askbox: i => { const r = lastAnswer(); saveAsked(r.results[Number(i)], true); refresh(); (r.done ||= {})[i] = 'Saved to the recipe box'; },
  askmake: i => askSend(`Make this: ${lastAnswer().ideas[Number(i)].title}`),
  askseen: i => { const r = lastAnswer(), n = Number(i); r.off = (r.off || []).includes(n) ? r.off.filter(x => x !== n) : [...(r.off || []), n]; },
  viewphoto: path => { S.viewPhoto = S.photoUrls[path]?.url || null; },
  delrecipe: id => deleteRecipe(id),
  findput: i => saveFound(Number(i), false),
  findpick: i => saveFound(Number(i), true),
  findsee: i => { S.add.seen = S.add.seen === Number(i) ? null : Number(i); },
  findmore: async v => { const a = S.add; await runFind(a, `${(a.q || '').replace(/, (classic version|Luke-friendly|no dairy|something different)/g, '')}, ${v}`); },
  rmusual: id => {
    const u = rows.usuals.find(x => x.id === id);
    del('usuals', id); refresh(); syncComing();
    S.toast = `${u.label} is off Luke's usuals.`;
  },
  rmskip: i => setHousehold({ foods_we_skip: (M.hh.foods_we_skip || []).filter((_, j) => j !== Number(i)) }),
  rmsite: i => setHousehold({ recipe_sites: (M.hh.recipe_sites || []).filter((_, j) => j !== Number(i)) }),
  week: v => { S.week = Math.min(M.weeks.length - 1, Math.max(0, S.week + Number(v))); },
  lock: id => { const m = rows.plan_meals.find(x => x.id === id); persist('plan_meals', id, { locked: !m.locked }); },
  swap: id => {
    const m = rows.plan_meals.find(x => x.id === id);
    const opts = m.options;
    bg(data.save('plan_meals', id, { recipe_id: opts[(opts.indexOf(m.recipe_id) + 1) % opts.length] }));
    syncList(m.plan_id);
    refresh();
  },
  clear: id => setMeal(id, { recipe_id: null, leftovers: false }, day => `${day} is open again.`),
  add: id => { S.add = { target: 'meal', mealId: id, step: 'menu' }; },
  addstep: v => {
    Object.assign(S.add, { step: v, err: '' });
    if (v !== 'link') Object.assign(S.add, { name: undefined, ing: undefined });
    if (v === 'find') restoreFind(S.add);
  },
  boxpick: id => { if (S.add.target === 'picks') { S.add = null; addPick(id); } else placeRecipe(id); },
  frompick: id => { const p = rows.picks.find(x => x.id === id); placeRecipe(p.recipe_id); del('picks', id); refresh(); },
  filt: v => { S.filt = v; },
  recipe: id => openRecipe(id),
  openrecipe: id => openRecipe(id),
  pickopen: id => { S.pickOpen = S.pickOpen === id ? null : id; },
  pickto: mealId => {
    const p = rows.picks.find(x => x.id === S.pickOpen), r = rows.recipes.find(x => x.id === p.recipe_id);
    del('picks', p.id);
    S.pickOpen = null;
    setMeal(mealId, { recipe_id: r.id, leftovers: false }, day => `${r.title} is on ${day}. Its ingredients are on the list.`);
  },
  unpick: id => { del('picks', id); S.pickOpen = null; refresh(); S.toast = 'Taken out of the picks. It stays in the recipe box.'; },
  done: id => { const it = rows.list_items.find(x => x.id === id); persist('list_items', id, { checked: !it.checked }); },
  haveit: id => { const it = rows.list_items.find(x => x.id === id); persist('list_items', id, { have_it: !it.have_it, checked: false }); },
  rmitem: id => { del('list_items', id); refresh(); },
  moveitem: id => { S.moveItem = S.moveItem === id ? null : id; },
  // The aisle is saved on the ingredient, so every list that uses it follows from now on.
  aisleto: key => {
    const it = rows.list_items.find(x => x.id === S.moveItem);
    S.moveItem = null;
    if (!it) return;
    if (it.ingredient_id) {
      persist('ingredients', it.ingredient_id, { aisle: key });
      if (it.aisle) persist('list_items', it.id, { aisle: null });
    } else persist('list_items', it.id, { aisle: key }); // items added before ingredients were linked
    S.toast = `${itemName(it)} is in ${AISLES.find(a => a[0] === key)[1]} now. We'll remember that.`;
  },
  units: v => setHousehold({ units: v }),
  // Recipe page: check off ingredients as they're gathered.
  got: v => { const j = Number(v), g = (S.got[S.recipe] ||= []); S.got[S.recipe] = g.includes(j) ? g.filter(x => x !== j) : [...g, j]; },
  // Cook mode timers ("<step>:<n>"): start, pause, resume; once up, reset.
  cooktimer: k => {
    const c = S.cook, t = c.timers[k];
    unlockSound();
    if (!t) { const [i, j] = k.split(':').map(Number); const secs = (p => stepTimers(p.text, p.timer_sec))(stepParts(cookSteps()[i]))[j].secs; c.timers[k] = { run: true, end: Date.now() + secs * 1000, left: secs }; }
    else if (timerLeft(t) <= 0) delete c.timers[k];
    else if (t.run) { t.left = timerLeft(t); t.run = false; }
    else { t.run = true; t.end = Date.now() + t.left * 1000; }
    tickTimers();
  },
  cooktreset: k => { delete S.cook.timers[k]; },
  cookgo: i => { S.cook.step = Number(i); window.scrollTo(0, 0); },
  cookrate: v => {
    S.cook.rate = v;
    persist('recipes', S.cook.id, { rating: v === 'up' ? 5 : 1 }); // shown as stars in the box; Ask sees it when planning
  },
};

// ---- Cook mode (js/views/cook.js) ----
const cookRecipe = () => M.recipeById.get(S.cook.id);
const cookSteps = () => cookRecipe()?.steps || [];
let wakeLock = null, tick = null, audio = null;

function startCook() {
  const r = M.recipeById.get(S.recipe), base = basePortions(M, r), portions = S.portions[r.id] || base;
  S.cook = { id: r.id, step: 0, portions, factor: portions / base, timers: {}, rate: null, awake: false, all: false };
  history.pushState({ cook: 1 }, ''); // the phone's back gesture leaves cook mode, not the app
  keepAwake();
  window.scrollTo(0, 0);
}
function endCook() {
  S.cook = null;
  wakeLock?.release().catch(() => {}); wakeLock = null;
  clearInterval(tick); tick = null;
  window.scrollTo(0, 0);
}
// Keeps the screen on while cooking (Wake Lock API). Phones drop the lock when the app is hidden,
// so it's asked for again when the app comes back.
async function keepAwake() {
  if (!S.cook || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    S.cook && (S.cook.awake = true);
    wakeLock.addEventListener('release', () => { if (S.cook) { S.cook.awake = false; render(); } });
    render();
  } catch (e) { console.warn('Wake lock', e); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.cook) { keepAwake(); tickTimers(); } });
window.addEventListener('popstate', () => { if (S.cook) { endCook(); render(); } });

// One clock for every running timer; it updates the numbers in place and re-draws when one is up.
function tickTimers() {
  if (tick || !S.cook) return;
  tick = setInterval(() => {
    const c = S.cook;
    if (!c) { clearInterval(tick); tick = null; return; }
    let running = false, rang = false;
    for (const [k, t] of Object.entries(c.timers)) {
      if (!t.run) continue;
      const left = timerLeft(t);
      if (left <= 0) { t.run = false; t.left = 0; rang = true; } else running = true;
      document.querySelectorAll(`[data-tleft="${k}"]`).forEach(el => { el.textContent = left <= 0 ? 'Time is up' : mmss(left); });
    }
    if (rang) { ring(); render(); }
    if (!running) { clearInterval(tick); tick = null; }
  }, 500);
}
// A sound needs a tap first on phones, so Start timer unlocks it.
function unlockSound() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* no sound, still vibrates and shows */ }
}
function ring() {
  navigator.vibrate?.([300, 150, 300, 150, 300]);
  if (!audio) return;
  [0, .45, .9].forEach(at => {
    const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + at;
    o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.3, t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + .35);
    o.start(t0); o.stop(t0 + .4);
  });
}

const A = {
  cookstart: () => startCook(),
  cookexit: () => { const back = history.state?.cook; endCook(); if (back) history.back(); },
  cookprev: () => { S.cook.step = Math.max(0, S.cook.step - 1); window.scrollTo(0, 0); },
  cooknext: () => { S.cook.step = Math.min(cookSteps().length, S.cook.step + 1); window.scrollTo(0, 0); },
  cookall: () => { S.cook.all = true; },
  cookallclose: () => { S.cook.all = false; },
  portm: () => { const r = M.recipeById.get(S.recipe); S.portions[r.id] = Math.max(1, (S.portions[r.id] || basePortions(M, r)) - 1); },
  portp: () => { const r = M.recipeById.get(S.recipe); S.portions[r.id] = Math.min(48, (S.portions[r.id] || basePortions(M, r)) + 1); },
  tolist: () => { S.tab = 'list'; window.scrollTo(0, 0); },
  startweek: () => { startWeek(S.week); S.toast = 'Week started. Add a dinner to each open night.'; },
  leftovers: () => setMeal(S.add.mealId, { recipe_id: null, leftovers: true }, day => `${day} is a leftovers night.`),
  typego: () => {
    const name = (S.add.name || '').trim();
    if (!name) { S.add.err = 'Give the dinner a name first.'; return; }
    finishAdd(saveRecipe({ title: name, origin: 'typed', ing: lines(S.add.ing) }), false);
  },
  linkgo: async () => {
    const a = S.add, url = (a.url || '').trim();
    if (!url) { a.err = 'Paste a recipe link first.'; return; }
    await readRecipe(a, 'link', () => data.importRecipe(url), 'link');
  },
  findgo: async () => {
    const a = S.add, q = (a.q || '').trim();
    if (q.length < 3) { a.err = 'Type what sounds good first.'; return; }
    await runFind(a, q);
  },
  textgo: async () => {
    const a = S.add, text = (a.text || '').trim(), url = (a.url || '').trim();
    if (text.length < 20) { a.err = 'Paste the recipe text first.'; return; }
    await readRecipe(a, 'text', () => data.aiRecipe({ kind: 'text', text, url }), url ? 'link' : 'typed');
  },
  photogo: async () => {
    const a = S.add;
    if (!a.photos?.length) { a.err = 'Choose a photo first.'; return; }
    await readRecipe(a, 'photo', () => data.aiRecipe({ kind: 'photo', images: a.photos.map(({ media_type, data: d }) => ({ media_type, data: d })) }), 'photo');
  },
  manygo: () => {
    if (manyBusy()) return;
    S.many.forEach(x => { if (x.st === 'fail') Object.assign(x, { st: 'wait', err: '' }); });
    readMany(); // runs on; each finished read re-renders
  },
  manysave: () => { if (!S.many?.some(x => x.st === 'done')) { S.add.err = 'None of these could be read yet.'; return; } saveMany(); },
  manyclear: () => { if (!manyBusy()) S.many = null; },
  closephoto: () => { S.viewPhoto = null; },
  askopen: () => openAsk(),
  askclose: () => closeAsk(),
  asksend: () => askSend(),
  askfresh: () => { Object.assign(S.ask, { trail: [], err: '', onHand: null }); S.askFocus = true; },
  askrmphoto: () => { S.ask.photo = null; },
  askuseweek: () => useWeek(),
  askcopy: () => askChanges(false),
  askreplace: () => askChanges(true),
  asksavepick: () => { const r = lastAnswer(); addPick(saveAsked(r.recipes[0]).id); (r.done ||= {}).pick = "Saved to the box and this week's picks"; },
  asksavebox: () => { const r = lastAnswer(); saveAsked(r.recipes[0]); refresh(); (r.done ||= {}).box = 'Saved to the recipe box'; },
  askideas: () => {
    const r = lastAnswer(), items = r.items.filter((_, i) => !(r.off || []).includes(i));
    if (!items.length) { S.ask.err = 'Keep at least one item.'; return; }
    S.ask.onHand = items;
    savePantry(items);
    return askSend('Show ideas from these items');
  },
  toggleai: () => setHousehold({ ai_suggestions: M.hh.ai_suggestions === false }),
  savelink: () => saveLink(false),
  savepick: () => saveLink(true),
  closeadd: () => { S.add = null; },
  addpick: () => { S.add = { target: 'picks', step: 'menu' }; },
  newrecipe: () => { S.add = { target: 'box', step: 'menu' }; },
  lm: () => setHousehold({ ai_monthly_limit: Math.max(0, Number(M.hh.ai_monthly_limit ?? 10) - 5) }),
  lp: () => setHousehold({ ai_monthly_limit: Math.min(100, Number(M.hh.ai_monthly_limit ?? 10) + 5) }),
  backbox: () => { S.recipe = null; S.edit = null; },
  tm: () => setHousehold({ time_limit_min: Math.max(10, Number(M.hh.time_limit_min) - 5) }),
  tp: () => setHousehold({ time_limit_min: Math.min(240, Number(M.hh.time_limit_min) + 5) }),
  lom: () => setLeftovers(M.hh.leftovers_per_week - 1),
  lop: () => setLeftovers(M.hh.leftovers_per_week + 1),
  openusuals: () => { S.page = 'usuals'; S.setErr = ''; window.scrollTo(0, 0); },
  openskip: () => { S.page = 'skip'; S.setErr = ''; window.scrollTo(0, 0); },
  opensites: () => { S.page = 'sites'; S.setErr = ''; window.scrollTo(0, 0); },
  addsite: () => {
    const s = S.newSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    const list = M.hh.recipe_sites || [];
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) { S.setErr = 'Type a site like budgetbytes.com.'; return; }
    if (BLOCKS_APPS.includes(s)) { S.setErr = `${s} blocks apps from reading it, so Find can't use it. Use Paste the recipe text for its recipes.`; return; }
    if (list.includes(s)) { S.setErr = 'That site is already on the list.'; return; }
    setHousehold({ recipe_sites: [...list, s] });
    S.newSite = ''; S.setErr = '';
  },
  closepage: () => { S.page = null; S.setErr = ''; },
  addusual: () => {
    const label = S.newUsual.label.trim(), qty = S.newUsual.qty.trim();
    if (!label) { S.setErr = 'Type what to add.'; return; }
    const name = label.charAt(0).toUpperCase() + label.slice(1);
    const ing = rows.ingredients.find(x => x.name.toLowerCase() === label.toLowerCase())
      || add('ingredients', { name, pantry_staple: false, aisle: guessAisle(label) });
    if (rows.usuals.some(u => u.ingredient_id === ing.id)) { S.setErr = `${name} is already one of Luke's usuals.`; return; }
    add('usuals', { ingredient_id: ing.id, label: name, quantity_label: qty || null, skip_this_week: false,
      position: Math.max(-1, ...rows.usuals.map(u => u.position)) + 1 });
    S.newUsual = { label: '', qty: '' }; S.setErr = '';
    refresh(); syncComing();
    S.toast = `${name} is on every list now.`;
  },
  addskip: () => {
    const f = S.newSkip.trim(), list = M.hh.foods_we_skip || [];
    if (!f) { S.setErr = 'Type a food first.'; return; }
    if (list.some(x => x.toLowerCase() === f.toLowerCase())) { S.setErr = 'That one is already on the list.'; return; }
    setHousehold({ foods_we_skip: [...list, f.charAt(0).toUpperCase() + f.slice(1)] });
    S.newSkip = ''; S.setErr = '';
  },
  undodel: () => { clearTimeout(delTimer); S.toast = `${S.pendingDel.title} is back.`; S.pendingDel = null; },
  topicks: () => addPick(S.recipe),
  editrecipe: () => { S.edit = editFields(M, M.recipeById.get(S.recipe)); },
  canceledit: () => { S.edit = null; },
  saverecipe: () => {
    const e = S.edit, id = S.recipe;
    if (!e.title.trim()) { e.err = 'The recipe needs a name.'; return; }
    persist('recipes', id, {
      title: e.title.trim(), time_min: toInt(e.time), servings: toInt(e.serves) || M.hh.portions,
      luke_note: e.luke.trim() || null, steps: lines(e.steps).map(text => ({ text })),
    });
    setIngredients(id, lines(e.ing));
    refresh();
    resyncRecipe(id);
    refresh();
    S.edit = null;
    S.toast = 'Saved.';
  },
  additem: () => {
    const label = S.newItem.trim(), wk = M.weeks[S.week];
    if (!label) { S.listErr = 'Type something to add.'; return; }
    const pos = Math.max(-1, ...rows.list_items.filter(i => i.plan_id === wk.id).map(i => i.position)) + 1;
    // Our own items get an ingredient too, so an aisle we chose before is remembered.
    const name = label.charAt(0).toUpperCase() + label.slice(1);
    let ing = rows.ingredients.find(i => i.name.toLowerCase() === label.toLowerCase());
    if (!ing) ing = add('ingredients', { name, pantry_staple: false, aisle: S.newAisle || guessAisle(label) });
    else if (S.newAisle && S.newAisle !== ing.aisle) bg(data.save('ingredients', ing.id, { aisle: S.newAisle }));
    add('list_items', {
      plan_id: wk.id, ingredient_id: ing.id, label, for_label: null, quantity: 1, checked: false, position: pos,
      have_it: false, custom: true,
    });
    S.newItem = ''; S.listErr = '';
    refresh();
  },
  pm: () => setHousehold({ portions: Math.max(1, M.hh.portions - 1) }),
  pp: () => setHousehold({ portions: Math.min(12, M.hh.portions + 1) }),
  dismiss: () => { S.err = ''; },
  reload: () => { S.err = ''; start(); },
  sample: () => { start(); },
  signout: async () => { await data.signOut(); rows = M = null; S.user = null; S.screen = 'signin'; S.tab = 'plan'; },
};

// Swiping a recipe row left past halfway leaves it open on Delete; vertical moves scroll.
const SWIPE = 96;
let drag = null, justSwiped = false;
document.addEventListener('pointerdown', e => {
  const f = e.target.closest('.swipe-front');
  if (f) drag = { f, id: f.dataset.recipe, x: e.clientX, y: e.clientY, base: S.swiped === f.dataset.recipe ? -SWIPE : 0, dx: 0, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved) {
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
    drag.moved = true;
    drag.f.classList.add('dragging');
  }
  drag.dx = dx;
  drag.f.style.transform = `translateX(${Math.max(-SWIPE - 24, Math.min(0, drag.base + dx))}px)`;
});
function endSwipe() {
  const d = drag;
  drag = null;
  if (!d?.moved) return;
  justSwiped = true;
  setTimeout(() => { justSwiped = false; }, 300);
  d.f.classList.remove('dragging');
  d.f.style.transform = '';
  S.swiped = d.base + d.dx < -SWIPE / 2 ? d.id : null;
  render();
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-tab],[data-week],[data-lock],[data-swap],[data-clear],[data-add],[data-addstep],[data-boxpick],[data-frompick],[data-filt],[data-recipe],[data-openrecipe],[data-pickopen],[data-pickto],[data-unpick],[data-done],[data-haveit],[data-rmitem],[data-moveitem],[data-rmphoto],[data-rmmany],[data-viewphoto],[data-askstarter],[data-askback],[data-asksee],[data-askput],[data-askpick],[data-askbox],[data-askmake],[data-askseen],[data-delrecipe],[data-rmusual],[data-rmskip],[data-findput],[data-findpick],[data-findsee],[data-findmore],[data-rmsite],[data-units],[data-got],[data-cooktimer],[data-cooktreset],[data-cookgo],[data-cookrate],[data-a]');
  if (!el || el.disabled) return;
  // Tapping outside the sheet closes it, except while it's searching or reading (the × still does).
  if (el.dataset.a === 'closeadd' && el.classList.contains('ov') && (e.target.closest('[data-stop]') || S.add?.step === 'reading' || manyBusy())) return;
  if (el.dataset.a === 'askclose' && el.classList.contains('ov') && (e.target.closest('[data-stop]') || S.ask?.loading)) return;
  if (el.dataset.a === 'cookallclose' && el.classList.contains('ov') && e.target.closest('[data-stop]')) return;
  if (el.dataset.a === 'askopen' && e.target.closest('label')) return; // the bar's camera: the photo opens the sheet
  if (justSwiped) return;                                          // the end of a swipe isn't a tap
  if (S.swiped && el.dataset.recipe) { S.swiped = null; render(); return; } // a tap closes an open row
  S.toast = '';
  const key = Object.keys(el.dataset).find(k => k in ACTIONS);
  if (key) await ACTIONS[key](el.dataset[key]);
  else if (A[el.dataset.a]) await A[el.dataset.a]();
  if (S.screen !== 'loading') render();
  if (S.add?.step === 'type' && !S.add.name) $('tyname')?.focus();
  if (S.add?.step === 'link' && !S.add.url) $('linkin')?.focus();
  if (S.ask && S.askFocus) { S.askFocus = false; const a = $('askin'); a?.focus(); a?.setSelectionRange(a.value.length, a.value.length); }
});

// Keyboard: list items are role="checkbox"; Enter adds a list item or reads a link.
document.addEventListener('keydown', async e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-done],[data-got]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.id === 'newitem') { e.preventDefault(); A.additem(); render(); $('newitem')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'linkin') { e.preventDefault(); await A.linkgo(); render(); }
  if (e.key === 'Enter' && e.target.id === 'findin') { e.preventDefault(); await A.findgo(); render(); }
  if (e.key === 'Enter' && e.target.id === 'askin') { e.preventDefault(); await askSend(); render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.askbar')) { e.preventDefault(); openAsk(); render(); $('askin')?.focus(); }
  if (e.key === 'Enter' && (e.target.id === 'us-qty' || e.target.id === 'us-label')) { e.preventDefault(); A.addusual(); render(); $('us-label')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'skip-in') { e.preventDefault(); A.addskip(); render(); $('skip-in')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'site-in') { e.preventDefault(); A.addsite(); render(); $('site-in')?.focus(); }
});

// Typing is kept in state, so a re-render never loses it.
const FIELDS = { tyname: ['add', 'name'], tying: ['add', 'ing'], linkin: ['add', 'url'], pvtitle: ['add', 'name'], pving: ['add', 'ing'],
  pastetext: ['add', 'text'], pasteurl: ['add', 'url'], findin: ['add', 'q'], askin: ['ask', 'draft'],
  'ed-title': ['edit', 'title'], 'ed-time': ['edit', 'time'], 'ed-serves': ['edit', 'serves'], 'ed-luke': ['edit', 'luke'],
  'ed-ing': ['edit', 'ing'], 'ed-steps': ['edit', 'steps'], 'us-label': ['newUsual', 'label'], 'us-qty': ['newUsual', 'qty'] };
document.addEventListener('input', e => {
  const id = e.target.id, f = FIELDS[id];
  if (f && S[f[0]]) S[f[0]][f[1]] = e.target.value;
  if (id.startsWith('many-name-') && S.many) S.many[Number(id.slice(10))].name = e.target.value;
  if (id === 'em') S.email = e.target.value;
  if (id === 'newitem') S.newItem = e.target.value;
  if (id === 'skip-in') S.newSkip = e.target.value;
  if (id === 'site-in') S.newSite = e.target.value;
});

document.addEventListener('change', async e => {
  if (e.target.id === 'photoin' && S.add) {
    const a = S.add, files = [...e.target.files].slice(0, 4 - (a.photos?.length || 0));
    a.err = '';
    try { for (const f of files) (a.photos ||= []).push(await shrinkImage(f)); } catch (err) { a.err = err.message; }
    render();
  }
  if (e.target.id === 'manyin' && S.add) {
    const room = MAX_MANY - (S.many?.length || 0), files = [...e.target.files].slice(0, room);
    S.add.err = e.target.files.length > room ? `Up to ${MAX_MANY} at a time; the first ${room} were kept.` : '';
    try { for (const f of files) (S.many ||= []).push({ ...(await shrinkImage(f)), st: 'new' }); } catch (err) { S.add.err = err.message; }
    render();
  }
  // A fridge photo for Ask, from the bar's camera, the starter or the sheet's camera.
  if (/^askphoto/.test(e.target.id) && e.target.files[0]) {
    if (!S.ask) openAsk();
    const k = S.ask;
    if (k.trail.length && !k.loading) Object.assign(k, { trail: [], onHand: null }); // a new photo starts fresh
    try { k.photo = await shrinkImage(e.target.files[0]); k.err = ''; } catch (err) { k.err = err.message; }
    if (!k.draft) k.draft = 'What can I make with this?';
    S.askFocus = true;
    render();
    if (S.askFocus) { S.askFocus = false; $('askin')?.focus(); }
  }
  if (e.target.id === 'newaisle') S.newAisle = e.target.value;
  if (e.target.id === 'moveaisle') { S.toast = ''; ACTIONS.aisleto(e.target.value); render(); }
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'signin') return;
  e.preventDefault();
  const email = $('em').value.trim(), pw = $('pw').value;
  S.email = email;
  if (!email || !pw) { S.signErr = 'Enter your email and password'; render(); return; }
  S.busy = true; S.signErr = ''; render();
  try { S.user = await data.signIn(email, pw); S.busy = false; await start(); }
  catch (err) { S.busy = false; S.signErr = err.message; render(); }
});

// Sample mode opens on the sign-in screen so it can be seen; Supabase mode checks the session.
if (data.mode === 'sample') { S.screen = 'signin'; render(); } else start();
