import { esc, icon, lukePill, sourcePill, head, stars } from '../ui.js';
import { scaleLine, portionsControl } from './cook.js';

const FILTERS = ['All', 'Quick', 'Luke-friendly'];

function ingredientLines(M, r) {
  return M.recipeIngredients.filter(ri => ri.recipe_id === r.id).sort((a, b) => a.position - b.position)
    .map(ri => ri.note || M.ingredientById.get(ri.ingredient_id)?.name || '');
}
// Ingredients for cook mode and the recipe page: the line shown (scaled) and the name to match in steps.
export function cookIngredients(M, r, factor) {
  return M.recipeIngredients.filter(ri => ri.recipe_id === r.id).sort((a, b) => a.position - b.position).map(ri => {
    const name = M.ingredientById.get(ri.ingredient_id)?.name || '';
    return { line: scaleLine(ri.note || name, factor), name: name || ri.note || '' };
  });
}
export const basePortions = (M, r) => Number(r.servings) || Number(M.hh.portions) || 4;
export const stepText = s => (typeof s === 'string' ? s : [s.title, s.text].filter(Boolean).join(': '));

export function vRecipes(S, M) {
  const r = S.recipe && M.recipeById.get(S.recipe);
  return r ? (S.edit ? vEdit(S, M, r) : vRecipe(S, M, r)) : vBox(S, M);
}

function vBox(S, M) {
  let h = head('Our recipe box', 'Recipes');
  if (S.pendingDel) h += `<div class="toast"><span style="flex:1">${esc(S.pendingDel.title)} deleted.</span><button class="ib" data-a="undodel" style="border-color:#B7C2A6;color:#3F4D30">Undo</button></div>`;
  else if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  h += `<button class="ib dk" data-a="newrecipe" style="width:100%;justify-content:center;padding:10px;margin-bottom:14px;font-size:14px">${icon('plus')} Add a recipe</button>`;
  const box = M.recipes.filter(x => x.status === 'box' && x.id !== S.pendingDel?.id).sort((a, b) => a.title.localeCompare(b.title));
  const quick = Number(M.hh.time_limit_min) || 30;
  const shown = box.filter(x => S.filt === 'All' || (S.filt === 'Quick' ? (x.tags || []).includes('Quick') || (x.time_min && x.time_min <= quick) : (x.tags || []).includes(S.filt) || (S.filt === 'Luke-friendly' && x.luke_note)));
  h += `<div class="row" style="margin:4px 2px 10px"><div class="sf dsp" style="font-size:22px">Recipe box</div><span class="mu">${box.length} saved</span></div>`
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${FILTERS.map(x => `<button class="ib ${S.filt === x ? 'dk' : ''}" data-filt="${x}">${x === 'Quick' ? `Quick · ${quick} min or less` : x}</button>`).join('')}</div>`;
  const count = id => M.recipeIngredients.filter(ri => ri.recipe_id === id).length;
  // Each row slides left to show Delete (see the swipe handling in app.js).
  h += `<div class="cd" style="padding:0;overflow:hidden">` + (shown.length ? shown.map((x, j) =>
    `<div class="swipe${S.swiped === x.id ? ' open' : ''}" style="${j ? 'border-top:1px solid var(--rule2)' : ''}">`
    + `<button class="swipe-del" data-delrecipe="${x.id}" tabindex="${S.swiped === x.id ? 0 : -1}">${icon('trash')} Delete</button>`
    + `<button class="rrow swipe-front" data-recipe="${x.id}"><span style="flex:1"><span class="sf" style="font-size:16px;line-height:1.25;display:block">${esc(x.title)}</span>`
    + `<span class="mu">${[x.time_min ? x.time_min + ' min' : '', count(x.id) ? count(x.id) + ' ingredients' : 'No ingredients yet', x.rating ? stars(x.rating) : ''].filter(Boolean).join(' · ')}</span></span>${icon('chevron-right')}</button></div>`).join('')
    : `<div class="mu" style="padding:10px 14px">Nothing here yet.</div>`) + `</div>`;
  if (shown.length) h += `<div class="mu" style="text-align:center;margin-top:-2px">Swipe a recipe left to delete it.</div>`;
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
    + `<button class="ib" data-a="shareout">${icon('share')} Share</button>`
    + (r.source_url ? `<a class="ib" href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${icon('external-link')} Original</a>` : '')
    + `</div>`;
  const photos = r.photo_paths || [];
  if (photos.length) {
    h += `<div class="cd"><div class="ey" style="margin-bottom:8px">${photos.length > 1 ? 'Original photos · tap one' : 'Original photo · tap it'} to see it full size</div><div class="thumbs" style="margin:0">`
      + photos.map((p, i) => {
        const url = S.photoUrls[p]?.url;
        return url ? `<button class="thumb" data-viewphoto="${esc(p)}" aria-label="Show photo ${i + 1} full size" style="padding:0;cursor:pointer"><img src="${esc(url)}" alt=""></button>`
          : `<div class="thumb" style="display:flex;align-items:center;justify-content:center;color:var(--faint)">${icon('photo')}</div>`;
      }).join('') + `</div></div>`;
  }
  if (steps.length) h += `<button class="big dk" data-a="cookstart" style="margin:0 0 16px">${icon('chef-hat')} Start cooking</button>`;
  const base = basePortions(M, r), portions = S.portions[r.id] || base, got = S.got[r.id] || [];
  const lines = cookIngredients(M, r, portions / base).map(x => x.line);
  h += `<div class="row" style="margin:4px 2px 8px"><div class="sf dsp" style="font-size:22px">Ingredients</div>${ings.length ? portionsControl(portions) : ''}</div>`
    + (ings.length ? `<div class="cd" style="padding:2px 14px">${lines.map((l, j) => {
      const on = got.includes(j);
      return `<div class="it${on ? ' on' : ''}" data-got="${j}" role="checkbox" aria-checked="${on}" tabindex="0" style="padding:9px 0;${j ? '' : 'border-top:none'}"><span class="bx${on ? ' on' : ''}">${on ? icon('check') : ''}</span><span class="lb">${esc(l)}</span></div>`;
    }).join('')}</div><div class="mu" style="margin:-2px 2px 16px">${portions !== base ? `Scaled from ${base} portions. ` : ''}Tap to check off as you gather.</div>`
      : `<div class="cd"><div class="mu">No ingredients yet. Tap Edit to add them, so this dinner fills the shopping list.</div></div>`);
  h += `<div class="sf dsp" style="font-size:22px;margin:0 2px 8px">Steps</div><div class="cd">`
    + (steps.length ? `<ol class="ul">${steps.map(s => `<li>${esc(stepText(s))}</li>`).join('')}</ol>` : `<div class="mu">No steps saved. Tap Edit to add them, one per line, to cook from this recipe.</div>`) + `</div>`;
  const planned = M.weeks.some(w => !w.past && w.meals.some(m => m.recipe_id === r.id));
  h += `<button class="ib" data-delrecipe="${r.id}" style="display:flex;margin:18px auto 4px;border-color:#E7CDBD;color:#A3412E">${icon('trash')} Delete recipe</button>`
    + (planned ? `<div class="mu" style="text-align:center">It's planned for a night; that night will open up again.</div>` : '');
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
