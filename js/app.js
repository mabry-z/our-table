// App state, rendering and every tap. Screens are plain functions that return markup.
import * as data from './data.js';
import { assemble } from './model.js';
import { esc, icon } from './ui.js';
import { vPlan } from './views/plan.js';
import { vRecipes } from './views/recipes.js';
import { vList, vSheet } from './views/list.js';
import { vSettings } from './views/settings.js';
import { vSignin, vNoHousehold } from './views/signin.js';

const S = {
  screen: 'loading', // loading | signin | nohousehold | app | error
  tab: 'plan', week: 0, def: null, trip: null, sheet: false, draft: null, filt: 'All', kept: {},
  url: '', impErr: '', impMsg: '', setErr: '', sheetErr: '', email: '', signErr: '', busy: false, err: '', user: null,
};
let M = null;
let rows = null;

const $ = id => document.getElementById(id);
const TABS = [['plan', 'calendar-week', 'Plan'], ['recipes', 'book', 'Recipes'], ['list', 'basket', 'List'], ['settings', 'settings', 'Settings']];

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
  $('sheet').innerHTML = vSheet(S, M);
}

// Save in the background; the change already shows. On failure, say so.
function persist(table, id, patch) {
  data.save(table, id, patch).catch(e => {
    console.error(e);
    S.err = 'Couldn’t save that change. Check your connection and reload.';
    render();
  });
  refresh();
}

function setHousehold(patch) { persist('households', M.hh.id, patch); }

function storeIdsFor(on) { return M.stores.filter(s => on[s.chain]).map(s => s.id); }

function selectedCount(on) { return M.chains.filter(k => on[k]).length; }

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
    S.def = { on: Object.fromEntries(M.defaultChains.map(k => [k, 1])), max: M.hh.max_stops };
    // Open on this week's plan, else the next one coming up, else the latest.
    const i = M.weeks.findIndex(w => w.current);
    const next = M.weeks.findIndex(w => !w.past);
    S.week = i >= 0 ? i : next >= 0 ? next : Math.max(0, M.weeks.length - 1);
    S.screen = 'app';
  } catch (e) {
    console.error(e);
    S.err = 'Couldn’t load your data. Check your connection.';
    S.screen = 'error';
  }
  render();
}

const ACTIONS = {
  tab: v => { S.tab = v; S.sheet = false; window.scrollTo(0, 0); },
  week: v => { S.week = Math.min(M.weeks.length - 1, Math.max(0, S.week + Number(v))); S.trip = null; },
  lock: id => { const m = rows.plan_meals.find(x => x.id === id); persist('plan_meals', id, { locked: !m.locked }); },
  swap: id => {
    const m = rows.plan_meals.find(x => x.id === id);
    const opts = m.options;
    persist('plan_meals', id, { recipe_id: opts[(opts.indexOf(m.recipe_id) + 1) % opts.length] });
  },
  keep: id => { S.kept[id] = 1; persist('recipes', id, { status: 'box' }); },
  pass: id => { persist('recipes', id, { status: 'passed' }); },
  filt: v => { S.filt = v; },
  done: id => { const it = rows.list_items.find(x => x.id === id); persist('list_items', id, { checked: !it.checked }); },
  units: v => setHousehold({ units: v }),
  defs: k => {
    if (S.def.on[k] && selectedCount(S.def.on) === 1) { S.setErr = 'Keep at least one store selected'; return; }
    S.def.on[k] = S.def.on[k] ? 0 : 1;
    setHousehold({ default_store_ids: storeIdsFor(S.def.on) });
  },
  defm: v => { S.def.max = Number(v); setHousehold({ max_stops: S.def.max }); },
  ds: k => {
    if (S.draft.on[k] && selectedCount(S.draft.on) === 1) { S.sheetErr = 'Keep at least one store selected'; return; }
    S.draft.on[k] = S.draft.on[k] ? 0 : 1;
  },
  dm: v => { S.draft.max = Number(v); },
};

const A = {
  rebuild: () => {
    const wk = M.weeks[S.week];
    wk.meals.forEach(m => {
      if (m.leftovers || m.locked || !m.options.length) return;
      const best = [...m.options].sort((a, b) => (M.recipeById.get(a)?.cost ?? 1e9) - (M.recipeById.get(b)?.cost ?? 1e9))[0];
      if (best !== m.recipe_id) persist('plan_meals', m.id, { recipe_id: best });
    });
  },
  find: () => { S.tab = 'recipes'; window.scrollTo(0, 0); },
  tolist: () => { S.tab = 'list'; window.scrollTo(0, 0); },
  sheet: () => { const c = S.trip || S.def; S.draft = { on: { ...c.on }, max: c.max }; S.sheet = true; },
  close: () => { S.sheet = false; },
  closebg: () => { S.sheet = false; },
  trip: () => { S.trip = { on: { ...S.draft.on }, max: S.draft.max }; S.sheet = false; },
  savedef: () => {
    S.def = { on: { ...S.draft.on }, max: S.draft.max };
    S.trip = null; S.sheet = false;
    setHousehold({ default_store_ids: storeIdsFor(S.def.on), max_stops: S.def.max });
  },
  pm: () => setHousehold({ portions: Math.max(1, M.hh.portions - 1) }),
  pp: () => setHousehold({ portions: Math.min(12, M.hh.portions + 1) }),
  bm: () => setHousehold({ weekly_budget: Math.max(40, Number(M.hh.weekly_budget) - 10) }),
  bp: () => setHousehold({ weekly_budget: Number(M.hh.weekly_budget) + 10 }),
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
  const el = e.target.closest('[data-tab],[data-week],[data-lock],[data-swap],[data-keep],[data-pass],[data-filt],[data-done],[data-units],[data-defs],[data-defm],[data-ds],[data-dm],[data-a]');
  if (!el || el.disabled) return;
  if (el.dataset.a === 'closebg' && e.target.closest('[data-stop]')) return;
  S.setErr = S.sheetErr = '';
  const key = Object.keys(el.dataset).find(k => k in ACTIONS);
  if (key) ACTIONS[key](el.dataset[key]);
  else if (A[el.dataset.a]) await A[el.dataset.a]();
  if (S.screen !== 'loading') render();
});

// Keyboard: list items are role="checkbox".
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-done]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'url') { S.url = e.target.value; if (S.impErr) { S.impErr = ''; e.target.closest('.cd').querySelector('.err').textContent = ''; } }
  if (e.target.id === 'em') S.email = e.target.value;
});

document.addEventListener('change', e => {
  if (e.target.id === 'shot' && e.target.files[0]) { S.impErr = ''; S.impMsg = 'Reading recipes from screenshots is coming in a later update.'; render(); }
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
