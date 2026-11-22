// App state, rendering and every tap. Screens are plain functions that return markup.
import * as data from './data.js';
import { assemble, guessAisle, AISLES, DAYS, DAY_SHORT } from './model.js';
import { esc, icon } from './ui.js';
import { vPlan, vAddSheet } from './views/plan.js';
import { vRecipes, editFields } from './views/recipes.js';
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
  pendingDel: null, swiped: null,   // recipe waiting out its Undo; recipe row swiped open
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

function render() {
  const body = $('body');
  body.classList.toggle('nobar', S.screen !== 'app');
  $('tabs').innerHTML = '';
  $('sheet').innerHTML = '';
  if (S.screen === 'loading') { body.innerHTML = `<div class="mu" style="text-align:center;margin-top:40vh">Loading</div>`; return; }
  if (S.screen === 'signin') { body.innerHTML = vSignin(S, data.mode); return; }
  if (S.screen === 'nohousehold') { body.innerHTML = vNoHousehold(S.user); return; }
  if (S.screen === 'error') { body.innerHTML = `<div class="cd" style="margin-top:20vh;text-align:center">${esc(S.err)}<div style="margin-top:10px"><button class="ib" data-a="reload">Try again</button></div></div>`; return; }

  const view = { plan: vPlan, recipes: vRecipes, list: vList, settings: (s, m) => vSettings(s, m, data.mode, S.user) }[S.tab];
  body.innerHTML = (S.err ? `<div class="banner row"><span>${esc(S.err)}</span><button class="ib" data-a="dismiss" aria-label="Dismiss" style="border:none">${icon('x')}</button></div>` : '') + view(S, M);
  $('tabs').innerHTML = TABS.map(([k, i, l]) => `<button class="${S.tab === k ? 'a' : ''}" data-tab="${k}"${S.tab === k ? ' aria-current="page"' : ''}>${icon(i)}${l}</button>`).join('');
  $('sheet').innerHTML = S.viewPhoto
    ? `<div class="ov photo-view" data-a="closephoto"><img src="${esc(S.viewPhoto)}" alt="Recipe photo, full size"><button class="ib" data-a="closephoto" aria-label="Close">${icon('x')}</button></div>`
    : vAddSheet(S, M);
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
function saveRecipe({ title, origin, source_url = null, site = null, time_min = null, servings = null, steps = [], ing, photos = [] }) {
  const id = data.newId();
  const photo_paths = photos.map((_, i) => `${M.hh.id}/${id}/${i + 1}.jpg`);
  const recipe = add('recipes', {
    id, title: title.charAt(0).toUpperCase() + title.slice(1), origin, status: 'box', source_url, site, time_min,
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

async function start() {
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
  tab: v => { S.tab = v; S.add = null; S.viewPhoto = null; S.recipe = null; S.edit = null; S.page = null; S.swiped = null; window.scrollTo(0, 0); if (v === 'settings') loadSpent(); },
  rmphoto: i => { S.add.photos.splice(Number(i), 1); },
  rmmany: i => { S.many.splice(Number(i), 1); if (!S.many.length) S.many = null; },
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
};

const A = {
  tolist: () => { S.tab = 'list'; window.scrollTo(0, 0); },
  startweek: () => {
    const wk = M.weeks[S.week];
    const plan = add('plans', { week_start: wk.week_start });
    const lo = LEFTOVER_DAYS.slice(0, M.hh.leftovers_per_week);
    for (let d = 1; d <= 7; d++) add('plan_meals', { plan_id: plan.id, day: d, recipe_id: null, options: [], locked: false, leftovers: lo.includes(d) });
    syncList(plan.id);
    refresh();
    S.toast = 'Week started. Add a dinner to each open night.';
  },
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
  const el = e.target.closest('[data-tab],[data-week],[data-lock],[data-swap],[data-clear],[data-add],[data-addstep],[data-boxpick],[data-frompick],[data-filt],[data-recipe],[data-openrecipe],[data-pickopen],[data-pickto],[data-unpick],[data-done],[data-haveit],[data-rmitem],[data-moveitem],[data-rmphoto],[data-rmmany],[data-viewphoto],[data-delrecipe],[data-rmusual],[data-rmskip],[data-findput],[data-findpick],[data-findsee],[data-findmore],[data-rmsite],[data-units],[data-a]');
  if (!el || el.disabled) return;
  // Tapping outside the sheet closes it, except while it's searching or reading (the × still does).
  if (el.dataset.a === 'closeadd' && el.classList.contains('ov') && (e.target.closest('[data-stop]') || S.add?.step === 'reading' || manyBusy())) return;
  if (justSwiped) return;                                          // the end of a swipe isn't a tap
  if (S.swiped && el.dataset.recipe) { S.swiped = null; render(); return; } // a tap closes an open row
  S.toast = '';
  const key = Object.keys(el.dataset).find(k => k in ACTIONS);
  if (key) await ACTIONS[key](el.dataset[key]);
  else if (A[el.dataset.a]) await A[el.dataset.a]();
  if (S.screen !== 'loading') render();
  if (S.add?.step === 'type' && !S.add.name) $('tyname')?.focus();
  if (S.add?.step === 'link' && !S.add.url) $('linkin')?.focus();
});

// Keyboard: list items are role="checkbox"; Enter adds a list item or reads a link.
document.addEventListener('keydown', async e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-done]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.id === 'newitem') { e.preventDefault(); A.additem(); render(); $('newitem')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'linkin') { e.preventDefault(); await A.linkgo(); render(); }
  if (e.key === 'Enter' && e.target.id === 'findin') { e.preventDefault(); await A.findgo(); render(); }
  if (e.key === 'Enter' && (e.target.id === 'us-qty' || e.target.id === 'us-label')) { e.preventDefault(); A.addusual(); render(); $('us-label')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'skip-in') { e.preventDefault(); A.addskip(); render(); $('skip-in')?.focus(); }
  if (e.key === 'Enter' && e.target.id === 'site-in') { e.preventDefault(); A.addsite(); render(); $('site-in')?.focus(); }
});

// Typing is kept in state, so a re-render never loses it.
const FIELDS = { tyname: ['add', 'name'], tying: ['add', 'ing'], linkin: ['add', 'url'], pvtitle: ['add', 'name'], pving: ['add', 'ing'],
  pastetext: ['add', 'text'], pasteurl: ['add', 'url'], findin: ['add', 'q'],
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
