import { DAYS } from '../model.js';
import { esc, icon, lukePill, sourcePill, weekHead } from '../ui.js';

// A site's own rating, e.g. "★ 4.8 · 1,200 ratings".
function stars(r) {
  if (!r.rating) return '';
  return `<div class="rate">${icon('star-filled')} ${r.rating.toFixed(1)}${r.rating_count ? ` <span class="mu">· ${r.rating_count.toLocaleString('en-US')} ${r.rating_count === 1 ? 'rating' : 'ratings'}</span>` : ''}</div>`;
}

function addBtn(m) { return `<button class="ib" data-add="${m.id}">${icon('plus')} Add dinner</button>`; }
const originIcon = r => (r.origin === 'photo' ? 'photo' : r.origin === 'link' || r.origin === 'ai_found' ? 'link' : r.origin === 'typed' ? 'pencil' : 'book');

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
    + `<button class="rrow" data-openrecipe="${r.id}" style="padding:2px 0 0"><span class="sf" style="flex:1;font-size:18px;line-height:1.25">${esc(r.title)}</span>${icon('chevron-right')}</button>`
    + (pills ? `<div class="pills">${pills}</div>` : '')
    + (ro ? '' : `<div class="acts"><button class="ib ${L ? 'dk' : ''}" data-lock="${m.id}">${icon(L ? 'lock' : 'lock-open')} ${L ? 'Locked' : 'Lock'}</button>`
      + (L || m.options.length < 2 ? '' : `<button class="ib" data-swap="${m.id}">${icon('arrows-exchange')} Swap</button>`)
      + (L ? '' : `<button class="ib" data-clear="${m.id}" aria-label="Clear ${day}">${icon('x')} Clear</button>`) + `</div>`)
    + `</div>`;
}

// This week's picks: recipes either of us drops in, waiting for a night.
function picksTray(S, M, wk) {
  const by = p => (p.added_by && p.added_by === S.user?.id ? 'you' : M.members.get(p.added_by));
  const nights = wk.id && !wk.past ? wk.meals.filter(m => !m.recipe) : [];
  let h = `<div class="cd"><div class="row"><div class="ey">This week's picks${M.picks.length ? ' · ' + M.picks.length : ''}</div>`
    + `<button class="ib" data-a="addpick">${icon('plus')} Add</button></div>`;
  if (!M.picks.length) return h + `<div class="mu" style="margin-top:6px">Drop links and recipes here as you find them. Either of you can add; give them a night when you're ready.</div></div>`;
  return h + M.picks.map((p, j) => {
    const open = S.pickOpen === p.id;
    return `<button class="rrow" data-pickopen="${p.id}" aria-expanded="${open}" style="${j ? 'border-top:1px solid var(--rule2);' : ''}">`
      + `<span class="src">${icon(originIcon(p.recipe))}</span><span style="flex:1"><span class="sf" style="display:block;font-size:16px;line-height:1.25">${esc(p.recipe.title)}</span>`
      + `<span class="mu">${[p.recipe.site, by(p) ? 'added by ' + esc(by(p)) : ''].filter(Boolean).join(' · ')}</span></span>${icon(open ? 'chevron-up' : 'chevron-down')}</button>`
      + (open ? `<div style="padding:0 0 10px 40px"><div class="mu" style="margin-bottom:6px">${!wk.id ? 'Start this week to give it a night.' : nights.length ? 'Put it on' : 'Every night has a dinner. Clear one to make room.'}</div>`
        + `<div class="pills" style="margin-top:0">${nights.map(m => `<button class="ib dk" data-pickto="${m.id}">${DAYS[m.day - 1].slice(0, 3)}</button>`).join('')}`
        + `<button class="ib" data-openrecipe="${p.recipe.id}">Recipe</button><button class="ib" data-unpick="${p.id}">Remove</button></div></div>` : '');
  }).join('') + `</div>`;
}

export function vPlan(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Our table this week');
  if (S.toast) h += `<div class="toast">${icon('check')}<span style="flex:1">${esc(S.toast)}</span></div>`;
  if (!wk.past) h += picksTray(S, M, wk);
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

// "Choose several": the screenshots, then each one's recipe to check over before they're saved.
function manyStep(S, a) {
  const L = S.many, n = L.length, read = L.filter(x => x.st === 'done');
  const busy = L.some(x => x.st === 'wait' || x.st === 'reading'), fresh = L.every(x => x.st === 'new');
  const toBox = a.target === 'box';
  let b = `<div class="mu" style="margin:0 2px 8px">${fresh ? `${n} ${n === 1 ? 'screenshot' : 'screenshots'}, one recipe each. ${toBox ? 'Each is saved to the recipe box.' : "Each becomes its own pick in this week's picks."}`
    : busy ? `Read ${L.filter(x => x.st === 'done' || x.st === 'fail').length} of ${n}… You can close this; they keep reading.`
      : 'Check them over. Fix a name here, or anything else later from the recipe’s Edit.'}</div>`;
  b += L.map((x, i) => {
    const thumb = `<div class="thumb" style="flex:none;width:56px;height:74px"><img src="${x.preview}" alt="Screenshot ${i + 1}"></div>`;
    const rm = busy ? '' : `<button class="ib" data-rmmany="${i}" aria-label="Remove screenshot ${i + 1}" style="border:none;padding:4px;align-self:flex-start">${icon('x')}</button>`;
    let body;
    if (x.st === 'done') {
      const p = x.pv;
      body = `<div class="ey">${[p.site ? esc(p.site) : '', p.time_min ? p.time_min + ' min' : '', p.ingredients.length + ' ingredients', p.steps?.length ? p.steps.length + ' steps' : ''].filter(Boolean).join(' · ')}</div>`
        + `<input class="in" id="many-name-${i}" aria-label="Name of recipe ${i + 1}" value="${esc(x.name ?? p.title)}" autocomplete="off" style="margin-top:4px">`
        + (p.unclear || []).map(u => `<div class="banner" style="margin:6px 0 0">${icon('alert-circle')} ${esc(u)}</div>`).join('');
    } else if (x.st === 'fail') body = `<div class="sf" style="font-size:16px">Couldn’t read this one</div><div class="mu">${esc(x.err)}</div>`;
    else body = `<div class="sf" style="font-size:16px;color:var(--faint)">${x.st === 'reading' ? 'Claude is reading it…' : x.st === 'wait' ? 'Waiting its turn' : 'Ready to read'}</div>`;
    return `<div class="cd${x.st === 'done' ? '' : ' ghost'}" style="display:flex;gap:10px;align-items:flex-start">${thumb}<div style="flex:1;min-width:0">${body}</div>${rm}</div>`;
  }).join('');
  const cost = read.reduce((s, x) => s + (x.pv.cost_usd || 0), 0), failed = L.filter(x => x.st === 'fail').length;
  if (!busy && !fresh && cost) b += `<div class="mu" style="margin:0 2px 6px">Read by Claude · about ${Math.max(1, Math.round(cost * 100))}¢ in all</div>`;
  b += `<div class="err">${esc(a.err || '')}</div>`;
  if (fresh) {
    b += (n < 10 ? `<label class="opt" style="cursor:pointer">${icon('photo-plus')}<span style="flex:1">Add more screenshots</span><input type="file" id="manyin" accept="image/*" multiple style="display:none"></label>` : '')
      + `<button class="big dk" data-a="manygo">Read ${n === 1 ? 'it' : `all ${n}`} · about ${2 * n}¢</button>`;
  } else if (!busy) {
    b += (failed ? `<button class="ib" data-a="manygo" style="width:100%;justify-content:center;padding:10px;margin-top:6px">Try the ${failed === 1 ? 'one' : failed} that failed again</button>` : '')
      + (read.length ? `<button class="big dk" data-a="manysave">${toBox ? `Save ${read.length} to the recipe box` : `Add ${read.length} to this week's picks`}</button>` : '');
  }
  if (!busy) b += `<button class="ib" data-a="manyclear" style="display:flex;margin:10px auto 0;border:none">Start over</button>`;
  return b;
}

// The Add sheet, for a night, for This week's picks, or for the recipe box.
// S.add = { target: 'meal' | 'picks' | 'box', mealId?, step, name, ing, url, pv, err }
export function vAddSheet(S, M) {
  const a = S.add;
  if (!a) return '';
  const meal = a.target === 'meal' ? M.weeks[S.week].meals.find(m => m.id === a.mealId) : null;
  if (a.target === 'meal' && !meal) return '';
  const day = meal && DAYS[meal.day - 1];
  const title = a.target === 'meal' ? `Add to ${day}` : a.target === 'picks' ? "Add to this week's picks" : 'Add a recipe';
  const done = a.target === 'meal' ? `Add to ${day}` : a.target === 'picks' ? 'Add to picks' : 'Save to recipe box';
  const opt = (data, ic, label, sub) => `<button class="opt" ${data}>${icon(ic)}<span style="flex:1">${label}${sub ? `<br><span class="mu">${sub}</span>` : ''}</span>${icon('chevron-right')}</button>`;
  let b = '';
  if (a.step === 'menu') {
    if (a.target === 'meal' && M.picks.length) {
      b += `<div class="ey" style="margin:4px 2px 8px">From this week's picks</div>`
        + M.picks.map(p => `<button class="opt" data-frompick="${p.id}">${icon(originIcon(p.recipe))}<span style="flex:1">${esc(p.recipe.title)}${M.members.get(p.added_by) ? `<br><span class="mu">added by ${esc(M.members.get(p.added_by))}</span>` : ''}</span></button>`).join('')
        + `<div class="ey" style="margin:14px 2px 8px">Or add something else</div>`;
    }
    if (a.target !== 'box') b += opt('data-addstep="box"', 'book', 'From our recipe box', 'Pick something we already have');
    b += opt('data-addstep="find"', 'search', 'Find a recipe', 'Searches our recipe sites, e.g. lemon caper fish · about 10–15¢')
      + opt('data-addstep="link"', 'link', 'Paste a link', 'From a recipe site; its ingredients come too')
      + opt('data-addstep="text"', 'clipboard-text', 'Paste the recipe text', 'For sites that block links, like Allrecipes · about 1¢')
      + opt('data-addstep="photo"', 'photo', 'Screenshot or photo', 'A web page, cookbook page or recipe card · about 2¢')
      + opt('data-addstep="type"', 'pencil', 'Type it', 'Just a name, plus ingredients if you want them on the list')
      + (a.target === 'meal' && !meal.leftovers ? opt('data-a="leftovers"', 'bowl', 'Leftovers night', 'No cooking; nothing added to the list') : '')
;
  }
  if (a.step === 'find') {
    const put = a.target === 'meal' ? `Add to ${day}` : a.target === 'picks' ? 'Add to picks' : 'Save';
    b += `<label class="lbl" for="findin">What sounds good?</label><div style="display:flex;gap:6px"><input class="in" id="findin" autocomplete="off" placeholder="e.g. lemon caper fish" value="${esc(a.q || '')}">`
      + `<button class="ib dk" data-a="findgo">Search</button></div><div class="err">${esc(a.err || '')}</div>`;
    if (!a.found) b += `<div class="mu" style="margin-top:6px">Searches our recipe sites (Settings › Sites we like) for well-reviewed recipes and shows the best rated first. About 10–15¢ a search; for a quick look, your phone's browser plus Paste a link costs nothing.</div>`;
    else {
      b += `<div class="mu" style="margin:12px 2px 8px">${a.found.length} ${a.found.length === 1 ? 'match' : 'matches'}${a.foundCost != null ? ` · about ${Math.max(1, Math.round(a.foundCost * 100))}¢` : ''}</div>`
        + a.found.map((x, i) => x.readable
          ? `<div class="cd">${stars(x)}<div class="ey">${[esc(x.site), x.time_min ? x.time_min + ' min' : '', x.ingredients.length + ' ingredients'].filter(Boolean).join(' · ')}</div>`
            + `<div class="sf" style="font-size:18px;line-height:1.25;margin-top:2px">${esc(x.title)}</div>${x.why ? `<div class="mu" style="margin-top:2px">${esc(x.why)}</div>` : ''}`
            + `<div class="acts">${a.target === 'meal' ? `<button class="ib" data-findpick="${i}">Save to picks</button>` : ''}<button class="ib dk" data-findput="${i}">${put}</button></div></div>`
          : `<div class="cd ghost"><div class="ey">${esc(x.site)}</div><div class="sf" style="font-size:17px;line-height:1.25;margin-top:2px">${esc(x.title)}</div>`
            + `<div class="mu" style="margin-top:4px">This site doesn't let apps read it. Open it, copy the recipe, and use Paste the recipe text.</div>`
            + `<div class="acts"><a class="ib" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${icon('external-link')} Open</a></div></div>`).join('')
        + `<div class="ey" style="margin:6px 2px 6px">Narrow it down</div><div class="pills" style="margin-top:0">${['classic version', 'Luke-friendly', 'no dairy', 'something different'].map(c => `<button class="ib" data-findmore="${c}">${c}</button>`).join('')}</div>`;
    }
  }
  if (a.step === 'text') {
    b += `<div class="mu" style="margin:0 2px 8px">On the recipe page, select from the title down through the steps, copy, and paste here. Claude sorts out the ingredients and steps.</div>`
      + `<label class="lbl" for="pastetext">Recipe text</label><textarea class="fld" id="pastetext" rows="8" placeholder="Paste the recipe here">${esc(a.text || '')}</textarea>`
      + `<label class="lbl" for="pasteurl">Link to the original, optional</label><input class="in" id="pasteurl" type="url" inputmode="url" autocomplete="off" placeholder="allrecipes.com/recipe/…" value="${esc(a.url || '')}">`
      + `<div class="err">${esc(a.err || '')}</div><button class="big dk" data-a="textgo">Read it</button>`;
  }
  if (a.step === 'photo' && S.many) b += manyStep(S, a);
  else if (a.step === 'photo') {
    const ph = a.photos || [];
    b += `<div class="mu" style="margin:0 2px 8px">Screenshots of a recipe page, a cookbook page, or a recipe card. Up to 4 pictures of one recipe, for example ingredients and steps.</div>`
      + (ph.length ? `<div class="thumbs">${ph.map((p, i) => `<div class="thumb"><img src="${p.preview}" alt="Picture ${i + 1}"><button class="ib" data-rmphoto="${i}" aria-label="Remove picture ${i + 1}">${icon('x')}</button></div>`).join('')}</div>` : '')
      + (ph.length < 4 ? `<label class="opt" style="cursor:pointer">${icon('photo-plus')}<span style="flex:1">${ph.length ? 'Add another picture' : 'Choose a screenshot or photo'}</span><input type="file" id="photoin" accept="image/*" multiple style="display:none"></label>` : '')
      + (ph.length ? '' : `<label class="opt" style="cursor:pointer">${icon('photo-plus')}<span style="flex:1">Choose several<br><span class="mu">${a.target === 'box' ? 'Each screenshot becomes its own recipe' : 'Each screenshot becomes its own pick'} · about 2¢ each</span></span><input type="file" id="manyin" accept="image/*" multiple style="display:none"></label>`)
      + `<div class="err">${esc(a.err || '')}</div>`
      + (ph.length ? `<button class="big dk" data-a="photogo">Read ${ph.length > 1 ? 'them' : 'it'}</button>` : '');
  }
  if (a.step === 'box') {
    const box = M.recipes.filter(r => r.status === 'box').sort((x, y) => x.title.localeCompare(y.title));
    b += box.length ? box.map(r => `<button class="opt" data-boxpick="${r.id}">${icon(originIcon(r))}<span style="flex:1">${esc(r.title)}<br><span class="mu">${r.time_min ? r.time_min + ' min' : 'No time set'}${r.luke_note ? ' · ' + esc(r.luke_note) : ''}</span></span></button>`).join('')
      : `<div class="cd ghost mu">The recipe box is empty. Paste a link or type a dinner in instead.</div>`;
  }
  if (a.step === 'link') {
    b += `<label class="lbl" for="linkin">Recipe link</label><div style="display:flex;gap:6px"><input class="in" id="linkin" type="url" inputmode="url" autocomplete="off" placeholder="budgetbytes.com/…" value="${esc(a.url || '')}">`
      + `<button class="ib dk" data-a="linkgo">Read it</button></div>`
      + `<div class="err">${esc(a.err || '')}</div>`
      + `<div class="mu" style="margin-top:6px">Works with most recipe sites. You'll get to check it before it's saved.</div>`;
  }
  if (a.step === 'reading') b += `<div class="cd" style="text-align:center"><div class="sf" style="font-size:18px">${a.from === 'link' ? 'Reading the recipe…' : a.from === 'find' ? 'Searching our recipe sites…' : 'Claude is reading it…'}</div><div class="mu">${a.from === 'link' ? esc(a.url || '') : a.from === 'find' ? esc(a.q || '') + ' · this takes up to half a minute' : 'This takes a few seconds.'}</div></div>`;
  if (a.step === 'preview') {
    const p = a.pv;
    b += `<div class="mu" style="margin:0 2px 8px">Check it over. You can fix anything before it's saved.</div>`
      + stars(p) + `<div class="ey">${[esc(p.site || (p.origin === 'photo' ? 'From your photo' : '')), p.time_min ? p.time_min + ' min' : '', p.servings ? 'serves ' + p.servings : '', p.steps?.length ? p.steps.length + ' steps' : ''].filter(Boolean).join(' · ')}</div>`
      + `<label class="lbl" for="pvtitle">Name</label><input class="in" id="pvtitle" value="${esc(a.name ?? p.title)}" autocomplete="off">`
      + `<label class="lbl" for="pving">Ingredients · they go on the list</label><textarea class="fld" id="pving" rows="${Math.min(10, Math.max(3, p.ingredients.length))}">${esc(a.ing ?? p.ingredients.join('\n'))}</textarea>`
      + (p.unclear?.length ? p.unclear.map(u => `<div class="banner" style="margin:8px 0 0">${icon('alert-circle')} ${esc(u)}</div>`).join('') : '')
      + (p.dupe ? `<div class="mu" style="margin-top:6px">${icon('info-circle')} This recipe is already in the box; it'll be used, not copied.</div>` : '')
      + (p.cost_usd != null ? `<div class="mu" style="margin-top:6px">Read by Claude · about ${Math.max(1, Math.round(p.cost_usd * 100))}¢</div>` : '')
      + `<div class="err">${esc(a.err || '')}</div>`
      + (a.target === 'meal'
        ? `<div style="display:flex;gap:8px;margin-top:10px"><button class="ib" data-a="savepick" style="flex:1;justify-content:center;padding:10px">Save to picks instead</button><button class="ib dk" data-a="savelink" style="flex:1;justify-content:center;padding:10px">${done}</button></div>`
        : `<button class="big dk" data-a="savelink">${done}</button>`);
  }
  if (a.step === 'type') {
    b += `<label class="lbl" for="tyname">Dinner</label><input class="in" id="tyname" placeholder="e.g. Tacos" autocomplete="off" value="${esc(a.name || '')}">`
      + `<label class="lbl" for="tying">Ingredients, optional</label><textarea class="fld" id="tying" rows="5" placeholder="One per line, e.g.&#10;1 lb ground beef&#10;8 tortillas&#10;1 bag shredded cheese">${esc(a.ing || '')}</textarea>`
      + `<div class="mu" style="margin-top:4px">They go on the shopping list. Saved to the recipe box too.</div>`
      + `<div class="err">${esc(a.err || '')}</div>`
      + `<button class="big dk" data-a="typego">${done}</button>`;
  }
  const back = !['menu', 'reading'].includes(a.step) && !(a.target === 'box' && a.step === a.first);
  return `<div class="ov" data-a="closeadd"><div class="sh" data-stop="1" role="dialog" aria-label="${title}"><div class="grab"></div>`
    + `<div class="row" style="margin-bottom:10px"><div class="row" style="gap:2px">${back ? `<button class="ib" data-addstep="${a.step === 'preview' ? a.from || 'link' : 'menu'}" aria-label="Back" style="border:none;padding:4px">${icon('chevron-left')}</button>` : ''}<div class="sf dsp" style="font-size:22px">${title}</div></div>`
    + `<button class="ib" data-a="closeadd" aria-label="Close" style="border:none">${icon('x')}</button></div>`
    + `<div class="shb">${b}</div></div></div>`;
}
