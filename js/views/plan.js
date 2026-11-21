import { DAYS } from '../model.js';
import { esc, icon, lukePill, weekHead } from '../ui.js';

function mealCard(m, ro) {
  const day = DAYS[m.day - 1];
  if (m.leftovers || !m.recipe) {
    return `<div class="cd ghost row"><div><div class="ey">${day}</div><div class="sf" style="font-size:17px;color:var(--faint)">Leftovers night</div></div>`
      + (ro ? '' : `<button class="ib" data-a="find">Find a dinner</button>`) + `</div>`;
  }
  const r = m.recipe, L = m.locked;
  return `<div class="cd"${L ? ' style="border-color:#B9A88F"' : ''}>`
    + `<div class="ey">${day}${L ? ' · locked' : ''}</div>`
    + `<div class="sf" style="font-size:18px;line-height:1.25;margin-top:2px">${esc(r.title)}</div>`
    + (r.luke_note || r.time_min ? `<div class="pills">${r.time_min ? `<span class="pl" style="background:#E8EEE0;color:#4F5E3E">${icon('clock')} ${r.time_min} min</span>` : ''}${r.luke_note ? lukePill(r.luke_note) : ''}</div>` : '')
    + (ro ? '' : `<div class="acts"><button class="ib ${L ? 'dk' : ''}" data-lock="${m.id}">${icon(L ? 'lock' : 'lock-open')} ${L ? 'Locked' : 'Lock'}</button>`
      + (L || m.options.length < 2 ? '' : `<button class="ib" data-swap="${m.id}">${icon('arrows-exchange')} Swap</button>`) + `</div>`)
    + `</div>`;
}

export function vPlan(S, M) {
  const wk = M.weeks[S.week];
  if (!wk) return weekHead(S, M, 'Our table this week') + `<div class="cd ghost mu">No dinners planned yet.</div>`;
  const ro = wk.past;
  let h = weekHead(S, M, 'Our table this week');
  h += `<div class="row sec"><div class="sf dsp">Dinners</div></div>`;
  h += wk.meals.map(m => mealCard(m, ro)).join('');
  h += `<div class="row sec"><div class="sf dsp">Luke's usuals</div><div class="mu">On every list</div></div><div class="cd">`
    + M.usuals.map((u, j) => `<div class="row" style="padding:6px 0;${j ? 'border-top:1px solid var(--rule2)' : ''}"><div>${esc(u.label)}</div><span class="mu">${esc(u.quantity_label || '')}</span></div>`).join('')
    + `</div>`;
  h += `<button class="big dk" data-a="tolist">See shopping list</button>`;
  return h;
}
