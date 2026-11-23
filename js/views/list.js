import { AISLES, isoDate, addDays } from '../model.js';

// Days we might have shopped for a week: from the Friday before it through today (or its Sunday).
function shopDays(wk, today) {
  const out = [];
  for (let n = -3; n <= 6; n++) { const d = addDays(wk.week_start, n); if (d <= today) out.push(d); }
  return out;
}
import { esc, icon, weekHead } from '../ui.js';

const FOR = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday', Luke: "Luke's usuals" };

function item(it, S, M, ro) {
  const d = it.checked, have = it.have_it, moving = S.moveItem === it.id;
  const nights = (it.for_label || '').split(', ').filter(Boolean).map(d => FOR[d] || d).join(' and ');
  const sub = [nights || (it.custom ? 'Added by us' : ''), it.quantity_label].filter(Boolean).join(' · ');
  return `<div class="it${d ? ' on' : ''}${have ? ' have' : ''}" data-done="${it.id}" role="checkbox" aria-checked="${d}" tabindex="0">`
    + `<span class="bx${d ? ' on' : ''}">${d ? icon('check') : ''}</span>`
    + `<span class="lb" style="flex:1">${esc(it.label)}${sub || have ? `<br><span class="mu">${have ? 'Have it at home' : esc(sub)}</span>` : ''}</span>`
    + `<button class="mini" data-haveit="${it.id}" aria-pressed="${!!have}">${have ? 'Need it' : 'Have it'}</button>`
    + (ro ? '' : `<button class="mini" data-moveitem="${it.id}" aria-expanded="${moving}" aria-label="Change aisle for ${esc(it.label)}">${icon('dots')}</button>`)
    + (it.custom ? `<button class="mini" data-rmitem="${it.id}" aria-label="Remove ${esc(it.label)}">${icon('x')}</button>` : '')
    + `</div>`
    + (moving ? `<div class="mv"><label class="mu" for="moveaisle" style="display:block;margin-bottom:6px">Move to another aisle. We'll remember it for ${esc((M.ingredientById.get(it.ingredient_id)?.name || it.label).toLowerCase())}.</label>`
      + `<select class="in" id="moveaisle" style="font-size:15px;padding:7px 30px 7px 12px">${aisleOptions(it.aisle)}</select></div>` : '');
}

// Aisles in alphabetical order for the dropdowns ("Other" last).
function aisleOptions(current) {
  return [...AISLES].sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || a[1].localeCompare(b[1]))
    .map(([k, n]) => `<option value="${k}"${k === current ? ' selected' : ''}>${n}</option>`).join('');
}

export function vList(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Shopping list');
  if (!wk.id) return h + `<div class="cd ghost mu">Start this week on Plan, then the list fills in as you add dinners.</div>`;

  const items = wk.list, need = items.filter(it => !it.have_it), left = need.filter(it => !it.checked).length;
  h += `<div class="mu" style="text-align:center;margin:-4px 0 12px">${!items.length ? 'Nothing on the list yet' : left ? `${left} of ${need.length} items left` : 'All done'}</div>`;
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  const today = isoDate(), days = shopDays(wk, today);
  if (!wk.past && !wk.shopped_on && need.length && !left && days.includes(today)) {
    h += `<div class="cd row" style="border-color:var(--sage);background:#FBFCF7"><span>All checked off. Shopped today?</span>`
      + `<button class="ib dk" data-shopday="${today}">${icon('check')} Yes, today</button></div>`;
  }
  h += AISLES.map(([key, name]) => {
    const g = items.filter(it => it.aisle === key);
    return g.length ? `<div class="cd"><div class="ey" style="margin-bottom:4px">${name}</div>${g.map(it => item(it, S, M, wk.past)).join('')}</div>` : '';
  }).join('');

  if (!wk.past) {
    const wd = (iso, style) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: style });
    h += `<div class="cd"><div class="ey" style="margin-bottom:8px">When did we shop?</div>`
      + (days.length ? `<div class="pills" style="margin:0">${days.map(d => `<button class="ib${wk.shopped_on === d ? ' dk' : ''}" data-shopday="${d}" aria-pressed="${wk.shopped_on === d}">${d === today ? 'Today' : wd(d, 'short')}</button>`).join('')}</div>` : '')
      + `<div class="mu" style="margin-top:8px">${wk.shopped_on ? `Shopped ${wd(wk.shopped_on, 'long')}. Plan counts “cook by” days for raw meat and fish from it. Tap it again to clear.`
        : days.length ? 'Pick the day once you’ve shopped. Plan then shows “cook by” days for raw meat and fish.' : 'Pick the day here once you’ve shopped for this week.'}</div></div>`;
    h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Add something</div>`
      + `<div style="display:flex;gap:6px"><input class="in" id="newitem" placeholder="e.g. Paper towels" autocomplete="off" value="${esc(S.newItem)}" aria-label="Item to add">`
      + `<button class="ib dk" data-a="additem">Add</button></div>`
      + `<div class="row" style="margin-top:8px;justify-content:flex-start;gap:8px"><label class="mu" for="newaisle">Aisle</label><select class="in" id="newaisle" style="font-size:14px;padding:6px 28px 6px 12px">`
      + `<option value="">Guess for me</option>${aisleOptions(S.newAisle)}</select></div>`
      + `<div class="err">${esc(S.listErr)}</div></div>`;
  }
  return h;
}
