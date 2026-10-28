import { pick, evalSet, bestSubset } from '../model.js';
import { f, esc, icon, pill, weekHead, STORE_FG } from '../ui.js';

const DAY_NAMES = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun', Luke: "Luke's usuals" };

export function vList(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Shopping list');
  if (!wk || !wk.list.length) return h + `<div class="cd ghost mu">No shopping list for this week yet.</div>`;

  const c = S.trip || S.def, sel = M.chains.filter(k => c.on[k]), items = wk.list;
  const free = evalSet(items, c.on);
  let use = c.on, skipped = [];
  if (c.max && c.max < sel.length) { use = bestSubset(items, sel, c.max).on; skipped = sel.filter(k => !use[k]); }
  const groups = {}, miss = [];
  let t = 0;
  items.forEach(it => {
    const k = pick(it.prices, use);
    if (!k) { miss.push(it); return; }
    (groups[k] ||= []).push(it);
    t += it.prices[k].usd;
  });

  h += `<button data-a="sheet" style="width:100%;display:flex;align-items:center;gap:8px;background:#FFFDF9;border:1px solid #E9E2D6;border-radius:999px;padding:8px 14px;font-size:12px;color:#5E564C;text-align:left">`
    + `${icon('building-store')}<span style="flex:1">${sel.join(', ')} · ${c.max ? 'max ' + c.max + ' stop' + (c.max > 1 ? 's' : '') : 'no stop limit'}${S.trip ? ' · this trip' : ''}</span>${icon('adjustments-horizontal')}</button>`;
  h += `<div class="cd" style="margin-top:12px;padding:14px 16px"><div class="row" style="align-items:flex-end">`
    + `<div><div class="ey">List total</div><div class="sf" style="font-size:32px;line-height:1.1">${f(t)}</div></div>`
    + `<div style="text-align:right"><div class="ey">Stops</div><div class="sf" style="font-size:20px">${Object.keys(groups).length}</div></div></div>`
    + `<div class="mu" style="margin-top:6px">${skipped.length
      ? `Skipping ${skipped.length > 1 ? skipped.slice(0, -1).join(', ') + ' and ' + skipped.at(-1) : skipped[0]} ·${t - free.total > 0.005 ? f(t - free.total) + ' more' : 'no extra cost'} than visiting every store`
      : 'Cheapest price for every item at your stores'}</div></div>`;

  h += sel.filter(k => groups[k]).map(k => {
    const g = groups[k], left = g.filter(it => !it.checked).length;
    return `<div class="cd"><div class="row" style="margin-bottom:4px"><div class="row" style="gap:8px">${pill(k)}<span class="mu">${left} of ${g.length} left</span></div>`
      + `<span class="sf" style="font-size:19px">${f(g.reduce((a, it) => a + it.prices[k].usd, 0))}</span></div>`
      + g.map(it => {
        const p = it.prices[k], d = it.checked;
        const where = p.store ? ` · <span style="color:${STORE_FG[k]}">at ${esc(p.store)}</span>` : '';
        return `<div class="it${d ? ' on' : ''}" data-done="${it.id}" role="checkbox" aria-checked="${d}" tabindex="0">`
          + `<span class="bx${d ? ' on' : ''}">${d ? icon('check') : ''}</span>`
          + `<span class="lb" style="flex:1">${esc(it.label)}<br><span class="mu">${esc(DAY_NAMES[it.for_label] || it.for_label || '')}${where}</span></span>`
          + `<span class="pr">${f(p.usd)}</span></div>`;
      }).join('') + `</div>`;
  }).join('');

  if (miss.length) {
    h += `<div class="cd ghost"><div class="ey" style="margin-bottom:6px">Not sold at these stops</div>`
      + miss.map(it => `<div class="row" style="padding:3px 0;font-size:13px"><span>${esc(it.label)}</span><span class="mu">${Object.keys(it.prices).join(', ') || 'No prices yet'}</span></div>`).join('')
      + `</div>`;
  }
  return h;
}

export function vSheet(S, M) {
  if (!S.sheet) return '';
  const d = S.draft, sel = M.chains.filter(k => d.on[k]);
  return `<div class="ov" data-a="closebg"><div class="sh" data-stop="1" role="dialog" aria-label="Stores for this list"><div class="grab"></div>`
    + `<div class="row"><div class="sf" style="font-size:22px">Stores for this list</div><button class="ib" data-a="close" aria-label="Close" style="border:none">${icon('x')}</button></div>`
    + `<div class="ey" style="margin:12px 0 8px">Stores we shop · ${sel.length} selected</div>`
    + chips(M, d.on, 'ds')
    + `<div class="err">${esc(S.sheetErr)}</div>`
    + `<div class="row" style="margin-top:14px"><div><div>Max stops</div><div class="mu">${d.max ? 'Cheapest mix of up to ' + d.max : 'Off · cheapest store per item'}</div></div>${stopsSeg(d.max, 'dm')}</div>`
    + `<div style="display:flex;gap:8px;margin-top:18px"><button class="ib" data-a="trip" style="flex:1;padding:10px">Just this trip</button><button class="ib dk" data-a="savedef" style="flex:1;padding:10px">Save as default</button></div>`
    + `</div></div>`;
}

export function chips(M, on, attr) {
  return `<div style="display:flex;flex-wrap:wrap;gap:6px">` + M.chains.map(k => {
    const a = on[k], fg = STORE_FG[k] || '#6B6157';
    return `<button class="ch" data-${attr}="${esc(k)}" aria-pressed="${!!a}" style="background:${a ? fg : 'transparent'};color:${a ? '#FFFDF9' : fg};border:1px solid ${a ? fg : '#DCD3C5'}">${icon(a ? 'check' : 'plus')}${esc(k)}</button>`;
  }).join('') + `</div>`;
}

export function stopsSeg(max, attr) {
  return `<div class="sg">` + ['Off', 1, 2, 3].map(v => {
    const val = v === 'Off' ? 0 : v;
    return `<button class="${max === val ? 'a' : ''}" data-${attr}="${val}">${v}</button>`;
  }).join('') + `</div>`;
}
