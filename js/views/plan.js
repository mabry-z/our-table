import { DAYS } from '../model.js';
import { esc, icon, lukePill, sourcePill, weekHead } from '../ui.js';

function addBtn(m) { return `<button class="ib" data-add="${m.id}">${icon('plus')} Add dinner</button>`; }

function mealCard(m, ro) {
  const day = DAYS[m.day - 1];
  if (m.leftovers || !m.recipe) {
    return `<div class="cd ghost row"><div><div class="ey">${day}</div><div class="sf" style="font-size:17px;color:var(--faint)">${m.leftovers ? 'Leftovers night' : 'Open'}</div></div>`
      + (ro ? '' : addBtn(m)) + `</div>`;
  }
  const r = m.recipe, L = m.locked;
  const pills = [sourcePill(r), r.time_min ? `<span class="pl" style="background:#E8EEE0;color:#4F5E3E">${icon('clock')} ${r.time_min} min</span>` : '', r.luke_note ? lukePill(r.luke_note) : ''].join('');
  return `<div class="cd"${L ? ' style="border-color:#B9A88F"' : ''}>`
    + `<div class="ey">${day}${L ? ' · locked' : ''}</div>`
    + `<div class="sf" style="font-size:18px;line-height:1.25;margin-top:2px">${esc(r.title)}</div>`
    + (pills ? `<div class="pills">${pills}</div>` : '')
    + (ro ? '' : `<div class="acts"><button class="ib ${L ? 'dk' : ''}" data-lock="${m.id}">${icon(L ? 'lock' : 'lock-open')} ${L ? 'Locked' : 'Lock'}</button>`
      + (L || m.options.length < 2 ? '' : `<button class="ib" data-swap="${m.id}">${icon('arrows-exchange')} Swap</button>`)
      + (L ? '' : `<button class="ib" data-clear="${m.id}" aria-label="Clear ${day}">${icon('x')} Clear</button>`) + `</div>`)
    + `</div>`;
}

export function vPlan(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Our table this week');
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  if (!wk.id) {
    return h + `<div class="cd ghost" style="text-align:center;padding:20px 16px"><div class="sf" style="font-size:18px">Nothing planned yet</div>`
      + `<div class="mu" style="margin:4px 0 12px">Start the week, then add a dinner to each night.</div>`
      + `<button class="ib dk" data-a="startweek" style="padding:8px 16px">${icon('calendar-plus')} Start this week</button></div>`;
  }
  const ro = wk.past;
  const open = wk.meals.filter(m => !m.leftovers && !m.recipe).length;
  h += `<div class="row sec"><div class="sf dsp">Dinners</div>${open && !ro ? `<span class="mu">${open} open</span>` : ''}</div>`;
  h += wk.meals.map(m => mealCard(m, ro)).join('');
  h += `<div class="row sec"><div class="sf dsp">Luke's usuals</div><div class="mu">On every list</div></div><div class="cd">`
    + M.usuals.map((u, j) => `<div class="row" style="padding:6px 0;${j ? 'border-top:1px solid var(--rule2)' : ''}"><div>${esc(u.label)}</div><span class="mu">${esc(u.quantity_label || '')}</span></div>`).join('')
    + `</div>`;
  h += `<button class="big dk" data-a="tolist">See shopping list</button>`;
  return h;
}

// The Add dinner sheet: from this week's picks, the recipe box, typed in, or a leftovers night.
export function vAddSheet(S, M) {
  const a = S.add;
  if (!a) return '';
  const meal = M.weeks[S.week].meals.find(m => m.id === a.mealId);
  if (!meal) return '';
  const day = DAYS[meal.day - 1];
  const opt = (data, ic, label, sub) => `<button class="opt" ${data}>${icon(ic)}<span style="flex:1">${label}${sub ? `<br><span class="mu">${sub}</span>` : ''}</span>${icon('chevron-right')}</button>`;
  let b = '';
  if (a.step === 'menu') {
    if (M.picks.length) {
      b += `<div class="ey" style="margin:4px 2px 8px">From this week's picks</div>`
        + M.picks.map(p => `<button class="opt" data-frompick="${p.id}">${icon(p.recipe.origin === 'photo' ? 'photo' : p.recipe.origin === 'link' ? 'link' : 'book')}<span style="flex:1">${esc(p.recipe.title)}${M.members.get(p.added_by) ? `<br><span class="mu">added by ${esc(M.members.get(p.added_by))}</span>` : ''}</span></button>`).join('')
        + `<div class="ey" style="margin:14px 2px 8px">Or add something else</div>`;
    }
    b += opt('data-addstep="box"', 'book', 'From our recipe box', 'Pick something we already have')
      + opt('data-addstep="type"', 'pencil', 'Type it', 'Just a name, plus ingredients if you want them on the list')
      + (meal.leftovers ? '' : opt('data-a="leftovers"', 'bowl', 'Leftovers night', 'No cooking; nothing added to the list'))
      + `<div class="mu" style="margin:10px 2px 0">Pasting a link, Find and photos are coming in the next updates.</div>`;
  }
  if (a.step === 'box') {
    const box = M.recipes.filter(r => r.status === 'box').sort((x, y) => x.title.localeCompare(y.title));
    b += box.length ? box.map(r => `<button class="opt" data-boxpick="${r.id}">${icon('book')}<span style="flex:1">${esc(r.title)}<br><span class="mu">${r.time_min ? r.time_min + ' min' : 'No time set'}${r.luke_note ? ' · ' + esc(r.luke_note) : ''}</span></span></button>`).join('')
      : `<div class="cd ghost mu">The recipe box is empty. Type a dinner in instead.</div>`;
  }
  if (a.step === 'type') {
    b += `<label class="lbl" for="tyname">Dinner</label><input class="in" id="tyname" placeholder="e.g. Tacos" autocomplete="off" value="${esc(a.name || '')}">`
      + `<label class="lbl" for="tying">Ingredients, optional</label><textarea class="fld" id="tying" rows="5" placeholder="One per line, e.g.&#10;1 lb ground beef&#10;8 tortillas&#10;1 bag shredded cheese">${esc(a.ing || '')}</textarea>`
      + `<div class="mu" style="margin-top:4px">They go on the shopping list. Saved to the recipe box too.</div>`
      + `<div class="err">${esc(a.err || '')}</div>`
      + `<button class="big dk" data-a="typego">Add to ${day}</button>`;
  }
  return `<div class="ov" data-a="closeadd"><div class="sh" data-stop="1" role="dialog" aria-label="Add dinner to ${day}"><div class="grab"></div>`
    + `<div class="row" style="margin-bottom:10px"><div class="row" style="gap:2px">${a.step !== 'menu' ? `<button class="ib" data-addstep="menu" aria-label="Back" style="border:none;padding:4px">${icon('chevron-left')}</button>` : ''}<div class="sf dsp" style="font-size:22px">Add to ${day}</div></div>`
    + `<button class="ib" data-a="closeadd" aria-label="Close" style="border:none">${icon('x')}</button></div>`
    + `<div class="shb">${b}</div></div></div>`;
}
