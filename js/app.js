// App state, rendering and every tap. Screens are plain functions that return markup.
import * as data from './data.js';
import { assemble, guessAisle, AISLES, DAYS, DAY_SHORT } from './model.js';
import { esc, icon } from './ui.js';
import { vPlan, vAddSheet } from './views/plan.js';
import { vRecipes } from './views/recipes.js';
import { vList } from './views/list.js';
import { vSettings } from './views/settings.js';
import { vSignin, vNoHousehold } from './views/signin.js';

const S = {
  screen: 'loading', // loading | signin | nohousehold | app | error
  tab: 'plan', week: 0, filt: 'All', kept: {},
  add: null,         // Add dinner sheet: { mealId, step: 'menu' | 'box' | 'type', name, ing, err }
  toast: '', newItem: '', newAisle: '', listErr: '', moveItem: null,
  url: '', impErr: '', impMsg: '', email: '', signErr: '', busy: false, err: '', user: null,
};
let M = null;
let rows = null;

const $ = id => document.getElementById(id);
const TABS = [['plan', 'calendar-week', 'Plan'], ['recipes', 'book', 'Recipes'], ['list', 'basket', 'List'], ['settings', 'settings', 'Settings']];
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
  $('sheet').innerHTML = vAddSheet(S, M);
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

// "1 1/2 lb chicken thighs, cut up" -> "Chicken thighs"
const UNIT = /^\s*[\d¼½¾⅓⅔⅛.,\/\s-]*\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?|cans?|bags?|packs?|packages?|boxes?|bunch(es)?|cloves?|heads?|jars?|bottles?|pieces?|slices?|sticks?)?\.?\s+(of\s+)?/i;
function ingredientName(line) {
  const n = line.replace(UNIT, '').split(',')[0].trim() || line.trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
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
  tab: v => { S.tab = v; S.add = null; window.scrollTo(0, 0); },
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
  add: id => { S.add = { mealId: id, step: 'menu' }; },
  addstep: v => { S.add.step = v; S.add.err = ''; },
  boxpick: id => placeRecipe(id),
  frompick: id => { const p = rows.picks.find(x => x.id === id); placeRecipe(p.recipe_id); del('picks', id); refresh(); },
  keep: id => { S.kept[id] = 1; persist('recipes', id, { status: 'box' }); },
  pass: id => { persist('recipes', id, { status: 'passed' }); },
  filt: v => { S.filt = v; },
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
    const recipe = add('recipes', {
      title: name.charAt(0).toUpperCase() + name.slice(1), origin: 'typed', status: 'box', servings: M.hh.portions,
      tags: [], steps: [], created_at: new Date().toISOString(),
    });
    (S.add.ing || '').split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
      const n = ingredientName(line);
      const ing = rows.ingredients.find(x => x.name.toLowerCase() === n.toLowerCase())
        || add('ingredients', { name: n, pantry_staple: false, aisle: guessAisle(n) });
      add('recipe_ingredients', { recipe_id: recipe.id, ingredient_id: ing.id, note: line, position: i });
    });
    placeRecipe(recipe.id);
  },
  closeadd: () => { S.add = null; },
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
  imp: () => {
    const v = S.url.trim();
    S.impMsg = '';
    if (!v) { S.impErr = 'Paste a recipe link first'; return; }
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(v)) { S.impErr = 'That doesn’t look like a link'; return; }
    S.impMsg = 'Importing from links is coming in a later update.';
  },
  dismiss: () => { S.err = ''; },
  reload: () => { S.err = ''; start(); },
  sample: () => { start(); },
  signout: async () => { await data.signOut(); rows = M = null; S.user = null; S.screen = 'signin'; S.tab = 'plan'; },
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-tab],[data-week],[data-lock],[data-swap],[data-clear],[data-add],[data-addstep],[data-boxpick],[data-frompick],[data-keep],[data-pass],[data-filt],[data-done],[data-haveit],[data-rmitem],[data-moveitem],[data-units],[data-a]');
  if (!el || el.disabled) return;
  if (el.dataset.a === 'closeadd' && el.classList.contains('ov') && e.target.closest('[data-stop]')) return;
  S.toast = '';
  const key = Object.keys(el.dataset).find(k => k in ACTIONS);
  if (key) ACTIONS[key](el.dataset[key]);
  else if (A[el.dataset.a]) await A[el.dataset.a]();
  if (S.screen !== 'loading') render();
  if (S.add?.step === 'type' && !S.add.name) $('tyname')?.focus();
});

// Keyboard: list items are role="checkbox"; Enter adds a list item.
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-done]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.id === 'newitem') { e.preventDefault(); A.additem(); render(); $('newitem')?.focus(); }
});

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'url') { S.url = e.target.value; if (S.impErr) { S.impErr = ''; e.target.closest('.cd').querySelector('.err').textContent = ''; } }
  if (id === 'em') S.email = e.target.value;
  if (id === 'tyname' && S.add) S.add.name = e.target.value;
  if (id === 'tying' && S.add) S.add.ing = e.target.value;
  if (id === 'newitem') S.newItem = e.target.value;
});

document.addEventListener('change', e => {
  if (e.target.id === 'shot' && e.target.files[0]) { S.impErr = ''; S.impMsg = 'Reading recipes from screenshots is coming in a later update.'; render(); }
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
