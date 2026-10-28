import { f, esc, icon, pill, salePill, lukePill, head, stars } from '../ui.js';

export function vRecipes(S, M) {
  let h = head('For Thursday and beyond', 'Recipes');
  h += `<div class="cd"><div class="sf" style="font-size:19px">Bring your own recipe</div>`
    + `<div style="display:flex;gap:6px;margin-top:8px"><input class="in" id="url" type="url" inputmode="url" placeholder="allrecipes.com/recipe/…" aria-label="Recipe link" value="${esc(S.url)}"><button class="ib dk" data-a="imp">Import</button></div>`
    + `<div class="err">${esc(S.impErr)}</div>`
    + `<label class="ib" style="display:flex;justify-content:center;gap:6px;margin-top:6px;padding:8px;cursor:pointer">${icon('photo')} Upload a screenshot<input type="file" accept="image/*" style="display:none" id="shot"></label>`
    + (S.impMsg ? `<div class="mu" style="margin-top:6px">${esc(S.impMsg)}</div>` : '') + `</div>`;

  const sugg = M.recipes.filter(r => r.status === 'suggested' || S.kept[r.id]);
  h += `<div class="row" style="margin:16px 2px 4px"><div class="sf" style="font-size:22px">Suggested this week</div></div>`
    + `<div class="mu" style="margin:0 2px 10px">Built around sales · ${M.hh.portions} portions</div>`;
  h += sugg.length ? sugg.map(r => {
    const kept = S.kept[r.id];
    return `<div class="cd"${kept ? ' style="border-color:#8A9A74"' : ''}><div class="row" style="align-items:flex-start">`
      + `<div><div class="ey">${r.time_min} min</div><div class="sf" style="font-size:19px;line-height:1.25;margin-top:2px">${esc(r.title)}</div></div>`
      + `<div class="sf" style="font-size:19px">${f(r.cost)}</div></div>`
      + `<div class="pills">${r.sale_note ? salePill(r.sale_note) : ''}${r.luke_note ? lukePill(r.luke_note) : ''}</div>`
      + `<div class="acts">${kept ? `<span class="mu" style="color:#4F5E3E">${icon('check')} Saved to recipe box</span>`
        : `<button class="ib" data-pass="${r.id}">Pass</button><button class="ib dk" data-keep="${r.id}">Keep</button>`}</div></div>`;
  }).join('') : `<div class="cd ghost mu">No suggestions right now.</div>`;

  const box = M.recipes.filter(r => r.status === 'box').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const shown = box.filter(r => S.filt === 'All' || (r.tags || []).includes(S.filt));
  h += `<div class="row" style="margin:18px 2px 10px"><div class="sf" style="font-size:22px">Recipe box</div><span class="mu">${box.length} saved</span></div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${['All', 'Quick', 'Luke-friendly'].map(x => `<button class="ib ${S.filt === x ? 'dk' : ''}" data-filt="${x}">${x}</button>`).join('')}</div>`;
  h += `<div class="cd" style="padding:4px 14px">` + (shown.length ? shown.map((r, j) =>
    `<div class="row" style="padding:10px 0;${j ? 'border-top:1px solid #EFE8DC' : ''}"><div><div class="sf" style="font-size:17px;line-height:1.25">${esc(r.title)}</div>`
    + `<div class="mu">${r.time_min} min · ${stars(r.rating)}</div></div>`
    + `<div style="text-align:right"><div>${f(r.cost)}</div>${r.mainChain ? pill(r.mainChain) : ''}</div></div>`).join('')
    : `<div class="mu" style="padding:10px 0">Nothing here yet.</div>`) + `</div>`;
  return h;
}
