import { esc, icon, head } from '../ui.js';

const row = (label, value, sub) => `<div class="row" style="padding:10px 0;border-top:1px solid var(--rule2)"><span>${label}${sub ? `<br><span class="mu">${sub}</span>` : ''}</span>${value}</div>`;
const stepper = (dec, inc, value, what) =>
  `<div class="row" style="gap:10px;flex:none"><button class="ib" data-a="${dec}" aria-label="Less ${what}">−</button><span class="sf" style="font-size:18px;min-width:44px;text-align:center">${value}</span><button class="ib" data-a="${inc}" aria-label="More ${what}">+</button></div>`;
const link = (page, label, value) => `<button class="rrow" data-a="${page}" style="border-top:1px solid var(--rule2)"><span style="flex:1">${label}</span><span class="mu">${value}</span>${icon('chevron-right')}</button>`;

export function vSettings(S, M, mode, user) {
  if (S.page === 'usuals') return vUsuals(S, M);
  if (S.page === 'skip') return vSkip(S, M);
  if (S.page === 'sites') return vSites(S, M);
  const hh = M.hh;
  let h = head('Household', 'Settings');
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">Meals</div>`
    + row('Portions per dinner', stepper('pm', 'pp', hh.portions, 'portions'))
    + row('Leftovers nights', stepper('lom', 'lop', hh.leftovers_per_week, 'leftovers nights'), `${hh.dinners_per_week} cooked dinners a week. Applies to weeks you start from now on.`)
    + row('Weeknight time limit', stepper('tm', 'tp', hh.time_limit_min, 'minutes'), 'Minutes. Recipes this quick show under the Quick filter.')
    + row('Units', `<div class="sg">${['US', 'Metric'].map(u => `<button class="${hh.units === u ? 'a' : ''}" data-units="${u}">${u}</button>`).join('')}</div>`) + `</div>`;
  const limit = Number(hh.ai_monthly_limit ?? 10), sp = S.aiSpent;
  const used = sp && !sp.error ? sp.usd : null;
  const on = hh.ai_suggestions !== false;
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">AI helper</div>`
    + `<div class="row" style="padding:8px 0 10px"><span>AI suggestions<br><span class="mu">${on ? 'The Ask bar shows on Plan, Recipes and recipe pages' : 'Off: no Ask bar. You build the week yourself'}</span></span>`
    + `<button class="sw${on ? ' on' : ''}" data-a="toggleai" role="switch" aria-checked="${on}" aria-label="AI suggestions"></button></div>`
    + `<div style="padding:8px 0 10px;border-top:1px solid var(--rule2)"><div class="row"><span>This month</span><span class="sf" style="font-size:18px">${used == null ? (sp?.error ? 'Couldn’t load' : '…') : '$' + used.toFixed(2)} <span class="mu" style="font-family:Lato">of $${limit}</span></span></div>`
    + `<div class="bar"><div style="width:${used == null ? 0 : Math.min(100, limit ? used / limit * 100 : 100).toFixed(0)}%"></div></div>`
    + `<div class="mu">${used == null ? '' : `${sp.count} ${sp.count === 1 ? 'request' : 'requests'} · `}resets on the 1st. When the limit is reached, AI reading pauses; everything else keeps working.</div></div>`
    + row('Monthly limit', stepper('lm', 'lp', '$' + limit, 'monthly AI limit'))
    + link('opensites', 'Sites we like', `${(hh.recipe_sites || []).length} sites`)
    + row('Finding a recipe', `<span class="mu">about 10–15¢ each</span>`)
    + row('Reading pasted text', `<span class="mu">about 1¢ each</span>`)
    + row('Reading screenshots and photos', `<span class="mu">about 2¢ each</span>`, 'Stays on when AI suggestions are off')
    + row('Ask: a week or a new recipe', `<span class="mu">about 5–12¢</span>`)
    + row('Ask: a change or follow-up', `<span class="mu">about 3–6¢</span>`) + `</div>`;
  const people = [...M.members.values()].filter(Boolean);
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">Family</div>`
    + link('openusuals', "Luke's usuals", `${M.usuals.length} ${M.usuals.length === 1 ? 'item' : 'items'}`)
    + link('openskip', 'Foods we skip', (hh.foods_we_skip || []).join(', ') || 'None')
    + row('Sharing', `<span class="mu">${mode === 'sample' ? 'Sample data' : people.length >= 2 ? esc(people.join(' and ')) : 'Waiting for Lydia'}</span>`) + `</div>`;
  h += `<div class="row" style="padding:6px 4px"><span class="mu">${mode === 'sample' ? 'Sample data · no database connected' : 'Signed in as ' + esc(user?.email)}</span>`
    + `<button class="ib" data-a="signout">${mode === 'sample' ? 'Sign-in screen' : 'Sign out'}</button></div>`;
  return h;
}

function back() { return `<button class="ib" data-a="closepage" style="border:none;padding:0;margin-bottom:12px">${icon('chevron-left')} Settings</button>`; }

function vUsuals(S, M) {
  let h = back() + `<div class="sf dsp" style="font-size:26px">Luke's usuals</div><div class="mu" style="margin:4px 0 12px">Added to every week's shopping list. Changes update this week and next.</div>`;
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  h += `<div class="cd" style="padding:4px 14px">` + (M.usuals.length ? M.usuals.map((u, j) =>
    `<div class="row" style="padding:10px 0;${j ? 'border-top:1px solid var(--rule2)' : ''}"><span style="flex:1">${esc(u.label)}${u.quantity_label ? `<br><span class="mu">${esc(u.quantity_label)}</span>` : ''}</span>`
    + `<button class="mini" data-rmusual="${u.id}" aria-label="Remove ${esc(u.label)}" style="border:none;background:none;color:var(--mu)">${icon('x')}</button></div>`).join('')
    : `<div class="mu" style="padding:10px 0">Nothing yet.</div>`) + `</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Add one</div>`
    + `<input class="in" id="us-label" placeholder="e.g. Chicken nuggets" autocomplete="off" value="${esc(S.newUsual.label)}" aria-label="Item">`
    + `<div style="display:flex;gap:6px;margin-top:8px"><input class="in" id="us-qty" placeholder="How much, e.g. 2 bags" autocomplete="off" value="${esc(S.newUsual.qty)}" aria-label="How much">`
    + `<button class="ib dk" data-a="addusual">Add</button></div><div class="err">${esc(S.setErr)}</div></div>`;
  return h;
}

function vSites(S, M) {
  const list = M.hh.recipe_sites || [];
  let h = back() + `<div class="sf dsp" style="font-size:26px">Sites we like</div><div class="mu" style="margin:4px 0 12px">Find searches only these. Free recipe sites with tested recipes work best.</div>`;
  h += `<div class="cd" style="padding:4px 14px">${list.length ? list.map((s, i) => `<div class="row" style="padding:10px 0;${i ? 'border-top:1px solid var(--rule2)' : ''}"><span>${esc(s)}</span><button class="mini" data-rmsite="${i}" aria-label="Remove ${esc(s)}" style="border:none;background:none;color:var(--mu)">${icon('x')}</button></div>`).join('') : '<div class="mu" style="padding:10px 0">None yet. Find needs at least one.</div>'}</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Add a site</div><div style="display:flex;gap:6px"><input class="in" id="site-in" type="url" inputmode="url" placeholder="e.g. damndelicious.net" autocomplete="off" value="${esc(S.newSite)}" aria-label="Recipe site">`
    + `<button class="ib dk" data-a="addsite">Add</button></div><div class="err">${esc(S.setErr)}</div>`
    + `<div class="mu" style="margin-top:8px">Some big sites block apps from reading them: Allrecipes, Serious Eats, Simply Recipes, Southern Living, Food Network, The Kitchn, Delish and Cookie and Kate. For those, open the recipe and use Paste the recipe text.</div></div>`;
  return h;
}

function vSkip(S, M) {
  const list = M.hh.foods_we_skip || [];
  let h = back() + `<div class="sf dsp" style="font-size:26px">Foods we skip</div><div class="mu" style="margin:4px 0 12px">Things the family doesn't eat. Find and the AI helper will steer clear of them.</div>`;
  h += `<div class="cd">${list.length ? `<div class="pills" style="margin-top:0">${list.map((f, i) => `<button class="ib" data-rmskip="${i}" aria-label="Remove ${esc(f)}">${esc(f)} ${icon('x')}</button>`).join('')}</div>` : '<div class="mu">Nothing yet.</div>'}</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Add one</div><div style="display:flex;gap:6px"><input class="in" id="skip-in" placeholder="e.g. Mushrooms" autocomplete="off" value="${esc(S.newSkip)}" aria-label="Food to skip">`
    + `<button class="ib dk" data-a="addskip">Add</button></div><div class="err">${esc(S.setErr)}</div></div>`;
  return h;
}
