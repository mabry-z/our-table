import { esc, icon, lukePill, sourcePill, head, stars } from '../ui.js';

const FILTERS = ['All', 'Quick', 'Luke-friendly'];

function ingredientLines(M, r) {
  return M.recipeIngredients.filter(ri => ri.recipe_id === r.id).sort((a, b) => a.position - b.position)
    .map(ri => ri.note || M.ingredientById.get(ri.ingredient_id)?.name || '');
}
const stepText = s => (typeof s === 'string' ? s : [s.title, s.text].filter(Boolean).join(': '));

export function vRecipes(S, M) {
  const r = S.recipe && M.recipeById.get(S.recipe);
  return r ? (S.edit ? vEdit(S, M, r) : vRecipe(S, M, r)) : vBox(S, M);
}

function vBox(S, M) {
  let h = head('Our recipe box', 'Recipes');
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  h += `<div style="display:flex;gap:8px;margin-bottom:14px"><button class="ib" data-a="newlink" style="flex:1;justify-content:center;padding:9px">${icon('link')} Paste a link</button>`
    + `<button class="ib" data-a="newtype" style="flex:1;justify-content:center;padding:9px">${icon('pencil')} Type one in</button></div>`;
  const box = M.recipes.filter(x => x.status === 'box').sort((a, b) => a.title.localeCompare(b.title));
  const shown = box.filter(x => S.filt === 'All' || (S.filt === 'Quick' ? (x.tags || []).includes('Quick') || (x.time_min && x.time_min <= 30) : (x.tags || []).includes(S.filt) || (S.filt === 'Luke-friendly' && x.luke_note)));
  h += `<div class="row" style="margin:4px 2px 10px"><div class="sf dsp" style="font-size:22px">Recipe box</div><span class="mu">${box.length} saved</span></div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${FILTERS.map(x => `<button class="ib ${S.filt === x ? 'dk' : ''}" data-filt="${x}">${x}</button>`).join('')}</div>`;
  const count = id => M.recipeIngredients.filter(ri => ri.recipe_id === id).length;
  h += `<div class="cd" style="padding:4px 14px">` + (shown.length ? shown.map((x, j) =>
    `<button class="rrow" data-recipe="${x.id}" style="${j ? 'border-top:1px solid var(--rule2)' : ''}"><span style="flex:1"><span class="sf" style="font-size:16px;line-height:1.25;display:block">${esc(x.title)}</span>`
    + `<span class="mu">${[x.time_min ? x.time_min + ' min' : '', count(x.id) ? count(x.id) + ' ingredients' : 'No ingredients yet', x.rating ? stars(x.rating) : ''].filter(Boolean).join(' · ')}</span></span>${icon('chevron-right')}</button>`).join('')
    : `<div class="mu" style="padding:10px 0">Nothing here yet.</div>`) + `</div>`;
  return h;
}

function vRecipe(S, M, r) {
  const ings = ingredientLines(M, r), steps = r.steps || [];
  const isPick = M.picks.some(p => p.recipe_id === r.id);
  let h = `<button class="ib" data-a="backbox" style="border:none;padding:0;margin-bottom:12px">${icon('chevron-left')} Recipes</button>`;
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  h += `<div class="ey">${[r.time_min ? r.time_min + ' min' : '', r.servings ? 'serves ' + r.servings : ''].filter(Boolean).join(' · ') || 'Recipe'}</div>`
    + `<div class="sf" style="font-size:26px;line-height:1.2;margin-top:4px">${esc(r.title)}</div>`
    + `<div class="pills">${sourcePill(r)}${r.luke_note ? lukePill(r.luke_note) : ''}</div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0">`
    + (isPick ? `<span class="mu" style="align-self:center">${icon('check')} In this week's picks</span>` : `<button class="ib dk" data-a="topicks">${icon('plus')} Add to this week's picks</button>`)
    + `<button class="ib" data-a="editrecipe">${icon('pencil')} Edit</button>`
    + (r.source_url ? `<a class="ib" href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${icon('external-link')} Original</a>` : '')
    + `</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:6px">Ingredients</div>`
    + (ings.length ? `<ul class="ul">${ings.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
      : `<div class="mu">No ingredients yet. Tap Edit to add them, so this dinner fills the shopping list.</div>`) + `</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:6px">Steps</div>`
    + (steps.length ? `<ol class="ul">${steps.map(s => `<li>${esc(stepText(s))}</li>`).join('')}</ol>` : `<div class="mu">No steps saved.</div>`) + `</div>`;
  return h;
}

function vEdit(S, M, r) {
  const e = S.edit;
  return `<button class="ib" data-a="canceledit" style="border:none;padding:0;margin-bottom:12px">${icon('chevron-left')} Cancel</button>`
    + `<div class="sf dsp" style="font-size:26px;margin-bottom:4px">Edit recipe</div>`
    + `<label class="lbl" for="ed-title">Name</label><input class="in" id="ed-title" value="${esc(e.title)}" autocomplete="off">`
    + `<div style="display:flex;gap:10px"><div style="flex:1"><label class="lbl" for="ed-time">Minutes</label><input class="in" id="ed-time" inputmode="numeric" value="${esc(e.time)}"></div>`
    + `<div style="flex:1"><label class="lbl" for="ed-serves">Serves</label><input class="in" id="ed-serves" inputmode="numeric" value="${esc(e.serves)}"></div></div>`
    + `<label class="lbl" for="ed-luke">Note for Luke, optional</label><input class="in" id="ed-luke" placeholder="e.g. Plain pasta for Luke" value="${esc(e.luke)}" autocomplete="off">`
    + `<label class="lbl" for="ed-ing">Ingredients, one per line</label><textarea class="fld" id="ed-ing" rows="8">${esc(e.ing)}</textarea>`
    + `<label class="lbl" for="ed-steps">Steps, one per line</label><textarea class="fld" id="ed-steps" rows="6">${esc(e.steps)}</textarea>`
    + `<div class="err">${esc(e.err || '')}</div>`
    + `<button class="big dk" data-a="saverecipe">Save</button>`
    + `<div class="mu" style="text-align:center;margin-top:8px">Dinners already planned with this recipe update their shopping lists.</div>`;
}

export function editFields(M, r) {
  return {
    title: r.title, time: r.time_min || '', serves: r.servings || '', luke: r.luke_note || '',
    ing: ingredientLines(M, r).join('\n'), steps: (r.steps || []).map(stepText).join('\n'), err: '',
  };
}
