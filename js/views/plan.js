import { DAYS, pick } from '../model.js';
import { f, esc, icon, pill, salePill, lukePill, weekHead } from '../ui.js';

export function usualsCost(M, on) {
  return M.usuals.reduce((a, u) => { const k = pick(u.prices, on); return a + (k ? u.prices[k].usd : 0); }, 0);
}

export function weekTotal(M, wk, on) {
  return wk.meals.reduce((a, m) => a + (!m.leftovers && m.recipe ? m.recipe.cost : 0), 0) + usualsCost(M, on);
}

function mealCard(m, ro) {
  const day = DAYS[m.day - 1];
  if (m.leftovers || !m.recipe) {
    return `<div class="cd ghost row"><div><div class="ey">${day}</div><div class="sf" style="font-size:18px;color:#857B6F">Leftovers night</div></div>`
      + (ro ? '' : `<button class="ib" data-a="find">Find a dinner</button>`) + `</div>`;
  }
  const r = m.recipe, L = m.locked;
  return `<div class="cd"${L ? ' style="border-color:#B9A88F"' : ''}>`
    + `<div class="row" style="align-items:flex-start"><div><div class="ey">${day}${L ? ' · locked' : ''}</div>`
    + `<div class="sf" style="font-size:19px;line-height:1.25;margin-top:2px">${esc(r.title)}</div></div>`
    + `<div class="sf" style="font-size:19px">${f(r.cost)}</div></div>`
    + `<div class="pills">${r.chains.map(k => pill(k)).join('')}${r.sale_note ? salePill('On sale') : ''}${r.luke_note ? lukePill(r.luke_note) : ''}</div>`
    + (ro ? '' : `<div class="acts"><button class="ib ${L ? 'dk' : ''}" data-lock="${m.id}">${icon(L ? 'lock' : 'lock-open')} ${L ? 'Locked' : 'Lock'}</button>`
      + (L || m.options.length < 2 ? '' : `<button class="ib" data-swap="${m.id}">${icon('arrows-exchange')} Swap</button>`) + `</div>`)
    + `</div>`;
}

export function vPlan(S, M) {
  const wk = M.weeks[S.week];
  if (!wk) return weekHead(S, M, 'Our table this week') + `<div class="cd ghost mu">No dinners planned yet.</div>`;
  const ro = wk.past, budget = Number(M.hh.weekly_budget), t = weekTotal(M, wk, S.def.on);
  const left = budget - t;
  let h = weekHead(S, M, 'Our table this week');
  h += `<div class="cd" style="padding:14px 16px"><div class="row" style="align-items:flex-end">`
    + `<div><div class="ey">Weekly total</div><div class="sf" style="font-size:32px;line-height:1.1">${f(t)}</div></div>`
    + `<div style="text-align:right"><div class="ey">Budget</div><div class="sf" style="font-size:20px">$${budget}</div></div></div>`
    + `<div class="bar"><div style="width:${Math.min(100, budget ? t / budget * 100 : 100).toFixed(0)}%"></div></div>`
    + `<div class="mu">${left >= 0 ? f(left) + ' left this week' : f(-left) + ' over budget'}</div></div>`;
  h += `<div class="row sec"><div class="sf">Dinners</div>`
    + (ro ? '' : `<button class="ib" data-a="rebuild">${icon('refresh')} Rebuild unlocked</button>`) + `</div>`;
  h += wk.meals.map(m => mealCard(m, ro)).join('');
  h += `<div class="row sec"><div class="sf">Luke's usuals</div><div class="mu">${f(usualsCost(M, S.def.on))}</div></div><div class="cd">`
    + M.usuals.map((u, j) => {
      const k = pick(u.prices, S.def.on);
      return `<div class="row" style="padding:6px 0;${j ? 'border-top:1px solid #EFE8DC' : ''}"><div>${esc(u.label)} <span class="mu">· ${esc(u.quantity_label)}</span></div><span>${k ? f(u.prices[k].usd) : '<span class="mu">Not at your stores</span>'}</span></div>`;
    }).join('') + `</div>`;
  h += `<button class="big dk" data-a="tolist">Build shopping list</button>`;
  return h;
}
