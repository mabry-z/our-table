import { AISLES } from '../model.js';
import { esc, icon, weekHead } from '../ui.js';

const FOR = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday', Luke: "Luke's usuals" };

function item(it) {
  const d = it.checked, have = it.have_it;
  const nights = (it.for_label || '').split(', ').filter(Boolean).map(d => FOR[d] || d).join(' and ');
  const sub = [nights || (it.custom ? 'Added by us' : ''), it.quantity_label].filter(Boolean).join(' · ');
  return `<div class="it${d ? ' on' : ''}${have ? ' have' : ''}" data-done="${it.id}" role="checkbox" aria-checked="${d}" tabindex="0">`
    + `<span class="bx${d ? ' on' : ''}">${d ? icon('check') : ''}</span>`
    + `<span class="lb" style="flex:1">${esc(it.label)}${sub || have ? `<br><span class="mu">${have ? 'Have it at home' : esc(sub)}</span>` : ''}</span>`
    + `<button class="mini" data-haveit="${it.id}" aria-pressed="${!!have}">${have ? 'Need it' : 'Have it'}</button>`
    + (it.custom ? `<button class="mini" data-rmitem="${it.id}" aria-label="Remove ${esc(it.label)}">${icon('x')}</button>` : '')
    + `</div>`;
}

export function vList(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Shopping list');
  if (!wk.id) return h + `<div class="cd ghost mu">Start this week on Plan, then the list fills in as you add dinners.</div>`;

  const items = wk.list, need = items.filter(it => !it.have_it), left = need.filter(it => !it.checked).length;
  h += `<div class="mu" style="text-align:center;margin:-4px 0 12px">${!items.length ? 'Nothing on the list yet' : left ? `${left} of ${need.length} items left` : 'All done'}</div>`;
  h += AISLES.map(([key, name]) => {
    const g = items.filter(it => it.aisle === key);
    return g.length ? `<div class="cd"><div class="ey" style="margin-bottom:4px">${name}</div>${g.map(item).join('')}</div>` : '';
  }).join('');

  if (!wk.past) {
    h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Add something</div>`
      + `<div style="display:flex;gap:6px"><input class="in" id="newitem" placeholder="e.g. Paper towels" autocomplete="off" value="${esc(S.newItem)}" aria-label="Item to add">`
      + `<button class="ib dk" data-a="additem">Add</button></div>`
      + `<div class="row" style="margin-top:8px;justify-content:flex-start;gap:8px"><label class="mu" for="newaisle">Aisle</label><select class="in" id="newaisle" style="font-size:14px;padding:6px 28px 6px 12px">`
      + `<option value="">Guess for me</option>${AISLES.map(([k, n]) => `<option value="${k}"${S.newAisle === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`
      + `<div class="err">${esc(S.listErr)}</div></div>`;
  }
  return h;
}
