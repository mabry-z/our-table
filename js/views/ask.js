// The Ask bar and its results sheet (phase 4; mockups/ask-bar.html). Not a chat: each ask's answer
// is one card with buttons, the asks form a trail to go back to, and "Start fresh" clears it.
// S.ask = { ctx: 'plan' | 'recipes' | 'recipe', label, weekIdx, recipeId, trail: [{ q, photo, r }],
//           loading, draft, photo, err }
import { DAYS } from '../model.js';
import { esc, icon, lukePill, sourcePill } from '../ui.js';
import { stars, foundRecipe } from './plan.js';

// Starter asks fill the box so they can be edited first; the third field marks one that takes a photo.
export const ASK_CTX = {
  plan: { ph: 'Ask about this week…', working: 'Looking through your recipe box…', starters: [
    ['calendar', 'Plan the open nights, light on pasta'], ['run', 'Something quick for Thursday, we have soccer'], ['sparkles', 'Something new for Saturday']] },
  recipes: { ph: 'Find or make a recipe…', working: 'On it…', starters: [
    ['camera', "What can I make with what's in my fridge?", 1], ['search', 'Find a crockpot chili Luke might eat'], ['sparkles', 'Make a sheet-pan dinner with chicken, peppers and rice']] },
  recipe: { ph: 'Change this recipe…', working: 'Rewriting the recipe…', starters: [
    ['droplet-off', 'Make it dairy-free'], ['copy', 'Double it'], ['heart', 'Make it milder for Luke']] },
};
export const ASK_CAP = 6;

const photoInput = id => `<input type="file" id="${id}" accept="image/*" style="display:none">`;
const pNew = `<span class="pl" style="background:#E3EAF0;color:#3F5566">${icon('sparkles')} New idea</span>`;
const pQuick = t => `<span class="pl" style="background:#E8EEE0;color:#4F5E3E">${icon('clock')} ${t} min</span>`;
const cents = c => (c != null ? `about ${Math.max(1, Math.round(c * 100))}¢` : '');
const saved = t => `<span class="saved">${icon('check')} ${esc(t)}</span>`;

export function vAskBar(ctx) {
  if (!ctx) return '';
  return `<div class="askbar" data-a="askopen" role="button" tabindex="0" aria-label="Ask the AI helper">${icon('sparkles')}<span>${ASK_CTX[ctx].ph}</span>`
    + (ctx === 'recipes' ? `<label class="round" aria-label="Ask with a photo" data-stop="1">${icon('camera')}${photoInput('askphotobar')}</label>` : '') + `</div>`;
}

export function vAskSheet(S, M) {
  const k = S.ask;
  if (!k) return '';
  const c = ASK_CTX[k.ctx], t = k.trail, full = t.length >= ASK_CAP, last = t.at(-1)?.r;
  let b = '';
  if (t.length) {
    b += `<div class="trail" style="margin:0 2px 8px"><div class="mu">Your asks${t.length > 1 ? ' · tap one to go back' : ''}</div><div class="pills" style="margin-top:6px">`
      + t.map((x, i) => {
        const label = (x.photo ? icon('camera') + ' ' : '') + esc(x.q);
        return i < t.length - 1 ? `<button class="ib" data-askback="${i}" title="Go back to this">${icon('arrow-back-up')} ${label}</button>` : `<span class="ib dk">${label}</span>`;
      }).join('') + `</div></div>`;
  }
  if (k.loading) b += `<div class="cd pulse"><div class="ai-ey">${icon('sparkles')} Working</div><div class="sf" style="font-size:18px;margin-top:4px">${k.photo || t.at(-1)?.photo ? 'Looking at your photo…' : c.working}</div><div class="mu">This takes up to half a minute.</div></div>`;
  else if (last) b += result(S, M, k, last);
  else b += `<div class="mu" style="margin:2px 2px 10px">Say it however you like, or start from one of these. Tapping one fills the box so you can edit it first.</div>`
    + c.starters.map(([ic, s, ph], i) => ph
      ? `<label class="starter" style="cursor:pointer">${icon(ic)}<span style="flex:1">${esc(s)}</span><span class="mu">photo</span>${photoInput('askphotostart')}</label>`
      : `<button class="starter" data-askstarter="${i}">${icon(ic)}<span style="flex:1">${esc(s)}</span></button>`).join('');
  b += `<div class="err">${esc(k.err || '')}</div>`;
  if (full && !k.loading) b += `<div class="cd ghost mu" style="margin-top:8px">That's a lot of changes in one go. Use what you have, or start fresh.</div>`;

  const foot = `<div class="ask-foot">`
    + (k.photo ? `<div style="margin-bottom:8px"><span class="pl" style="background:#EAE3D3;color:#5E5338;padding:5px 10px">${icon('photo')} Fridge photo <button class="lk" data-a="askrmphoto" aria-label="Remove photo" style="padding:0 0 0 4px;text-decoration:none">${icon('x')}</button></span></div>` : '')
    + `<div style="display:flex;gap:6px;align-items:center">`
    + (k.ctx === 'recipes' ? `<label class="round" aria-label="Add a photo"${full || k.loading ? ' style="opacity:.4;pointer-events:none"' : ''}>${icon('camera')}${photoInput('askphotoin')}</label>` : '')
    + `<input class="in" id="askin" autocomplete="off" placeholder="${t.length ? 'Change something…' : c.ph}" value="${esc(k.draft || '')}" aria-label="Ask"${full || k.loading ? ' disabled' : ''}>`
    + `<button class="round dk" data-a="asksend" aria-label="Send"${full || k.loading ? ' disabled' : ''}>${icon('arrow-up')}</button></div></div>`;

  return `<div class="ov" data-a="askclose"><div class="sh tall" data-stop="1" role="dialog" aria-label="Ask"><div class="grab"></div>`
    + `<div class="row" style="margin-bottom:8px"><div class="ai-ey">${icon('sparkles')} ${esc(k.label)}</div><div class="row" style="gap:2px">`
    + (t.length && !k.loading ? `<button class="lk" data-a="askfresh">Start fresh</button>` : '')
    + `<button class="ib" data-a="askclose" aria-label="Close" style="border:none">${icon('x')}</button></div></div>`
    + `<div class="shb" id="askbody">${b}</div>${foot}</div></div>`;
}

function result(S, M, k, r) {
  let h = `<div style="font-size:15px;line-height:1.5;margin:2px 2px 10px">${esc(r.msg || '')}${r.cost_usd ? ` <span class="mu">· ${cents(r.cost_usd)}</span>` : ''}</div>`;
  const done = r.done || {};
  if (r.kind === 'week') {
    const wk = M.weeks[k.weekIdx];
    const byTitle = t => (r.recipes || []).find(x => x.title === t);
    h += r.week.map(n => {
      const cur = wk.meals?.find(m => m.day === n.day), hi = (r.changed_days || []).includes(n.day);
      const day = DAYS[n.day - 1];
      if (n.kind === 'leftovers' || n.kind === 'open' || (n.kind === 'keep' && (!cur?.recipe))) {
        const lo = n.kind === 'leftovers' || (n.kind === 'keep' && (cur ? cur.leftovers : n.was === 'leftovers'));
        return `<div class="cd ghost${hi ? ' hi' : ''}"><div class="ey">${day}</div><div class="sf" style="font-size:17px;color:var(--faint)">${lo ? 'Leftovers night' : 'Open'}</div></div>`;
      }
      let title, pills;
      if (n.kind === 'keep') { const x = cur.recipe; title = x.title; pills = (cur.locked ? `<span class="pl" style="background:#F1ECE3;color:#6B6157">${icon('lock')} Locked</span>` : '') + sourcePill(x) + (x.luke_note ? lukePill(x.luke_note) : ''); }
      else if (n.kind === 'box') { const x = M.recipeById.get(n.recipe_id); title = x?.title || n.title; pills = (x ? sourcePill(x) + (x.time_min ? pQuick(x.time_min) : '') + (x.luke_note ? lukePill(x.luke_note) : '') : ''); }
      else { const x = byTitle(n.title); title = n.title; pills = pNew + (x?.time_min ? pQuick(x.time_min) : '') + (x?.luke_note ? lukePill(x.luke_note) : ''); }
      return `<div class="cd${hi ? ' hi' : ''}"${cur?.locked ? ' style="border-color:#B9A88F"' : ''}><div class="ey">${day}</div><div class="sf" style="font-size:18px;line-height:1.25;margin-top:2px">${esc(title)}</div><div class="pills">${pills}</div></div>`;
    }).join('');
    h += `<button class="big dk" data-a="askuseweek">Use this week</button><div class="mu" style="text-align:center;margin-top:6px">Fills the nights, saves new ideas to the recipe box and updates the list.</div>`;
  }
  if (r.kind === 'found') {
    const wk = k.ctx === 'plan' ? M.weeks[k.weekIdx] : null;
    const day = k.ctx === 'plan' ? askDay(wk, r) : null;
    h += r.results.map((x, i) => x.readable
      ? `<div class="cd">${stars(x)}<div class="ey">${[esc(x.site), x.time_min ? x.time_min + ' min' : '', x.ingredients.length + ' ingredients'].filter(Boolean).join(' · ')}</div>`
        + `<div class="sf" style="font-size:18px;line-height:1.25;margin-top:2px">${esc(x.title)}</div>${x.why ? `<div class="mu" style="margin-top:2px">${esc(x.why)}</div>` : ''}`
        + (r.seen === i ? foundRecipe(x) : '')
        + `<div class="acts" style="flex-wrap:wrap"><button class="ib" data-asksee="${i}" aria-expanded="${r.seen === i}">${icon(r.seen === i ? 'chevron-up' : 'list-details')} ${r.seen === i ? 'Hide recipe' : 'See recipe'}</button>`
        + (done[i] ? saved(done[i])
          : (k.ctx === 'plan' && day ? `<button class="ib" data-askpick="${i}">Save to picks</button><button class="ib dk" data-askput="${i}">Add to ${DAYS[day - 1]}</button>`
            : `<button class="ib" data-askpick="${i}">Save to picks</button><button class="ib dk" data-askbox="${i}">Save</button>`))
        + `</div></div>`
      : `<div class="cd ghost"><div class="ey">${esc(x.site)}</div><div class="sf" style="font-size:17px;line-height:1.25;margin-top:2px">${esc(x.title)}</div>`
        + `<div class="mu" style="margin-top:4px">This site doesn't let apps read it. Open it, copy the recipe, and use Paste the recipe text.</div>`
        + `<div class="acts"><a class="ib" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${icon('external-link')} Open</a></div></div>`).join('');
  }
  if (r.kind === 'recipe' && r.recipes?.[0]) {
    const x = r.recipes[0];
    h += `<div class="cd"><div class="ey">${['Created for you', x.time_min ? (x.time_min >= 60 && x.time_min % 60 === 0 ? x.time_min / 60 + ' hr' : x.time_min + ' min') : '', x.servings ? x.servings + ' portions' : ''].filter(Boolean).join(' · ')}</div>`
      + `<div class="sf" style="font-size:20px;line-height:1.25;margin-top:2px">${esc(x.title)}</div><div class="pills">${pNew}${x.luke_note ? lukePill(x.luke_note) : ''}</div>`
      + changeList(r.changes, 'Changed')
      + `<div class="ey" style="margin:12px 0 4px">Ingredients · ${x.ingredients.length}</div><ul class="ul">${x.ingredients.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
      + `<div class="ey" style="margin:12px 0 4px">Steps · ${x.steps.length}</div><ol class="ul">${x.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
      + `<div class="acts">${done.pick || done.box ? saved(done.pick || done.box) : `<button class="ib" data-a="asksavepick">Save to picks</button><button class="ib dk" data-a="asksavebox">Save to recipe box</button>`}</div></div>`;
  }
  if (r.kind === 'changes') {
    h += `<div class="cd">${changeList(r.changes)}</div>`
      + `<div style="display:flex;gap:8px"><button class="ib" data-a="askcopy" style="flex:1;justify-content:center;padding:10px">Save as a copy</button><button class="ib dk" data-a="askreplace" style="flex:1;justify-content:center;padding:10px">Replace recipe</button></div>`;
  }
  if (r.kind === 'seen') {
    const off = r.off || [];
    h += `<div class="cd"><div class="row"><div class="ey">In your photo</div><span class="mu">${r.items.length - off.length} items</span></div><div class="pills">`
      + r.items.map((x, i) => off.includes(i)
        ? `<button class="ib" data-askseen="${i}" aria-pressed="false" style="text-decoration:line-through;color:var(--faint)">${esc(x)}</button>`
        : `<button class="ib" data-askseen="${i}" aria-pressed="true" style="background:#E8EEE0;border-color:#C9D3BB;color:#4F5E3E">${icon('check')} ${esc(x)}</button>`).join('')
      + `</div><div class="mu" style="margin-top:10px">The photo isn't kept. Only this list is saved, as what's on hand.</div></div>`
      + `<button class="big dk" data-a="askideas">${icon('sparkles')} Show ideas</button>`;
  }
  if (r.kind === 'ideas') {
    h += r.ideas.map((x, i) => `<div class="cd"><div class="row" style="align-items:flex-start"><div><div class="sf" style="font-size:18px;line-height:1.25">${esc(x.title)}</div>`
      + `<div class="mu">Uses ${x.uses} of your items · ${esc(x.need)}</div>${x.luke ? `<div class="pills">${lukePill('Luke-friendly')}</div>` : ''}</div>`
      + `<button class="ib dk" data-askmake="${i}" style="flex:none">Make this</button></div></div>`).join('');
  }
  return h;
}

function changeList(list, title) {
  if (!list?.length) return '';
  return (title ? `<div class="ey" style="margin:12px 0 2px">${title}</div>` : '') + list.map(c => {
    const ic = c.from ? (c.to ? 'arrow-right' : 'minus') : 'plus';
    return `<div class="chg">${icon(ic)}<span>${c.from ? `<s style="color:var(--faint)">${esc(c.from)}</s> ` : ''}`
      + `${c.to ? (c.from ? '<span class="mu">becomes</span> ' : '') + esc(c.to) : '<span class="mu">left off</span>'}</span></div>`;
  }).join('');
}

// The night a found recipe goes on: the one asked for, else the first open night.
export function askDay(wk, r) {
  if (r.day >= 1 && r.day <= 7) return r.day;
  const open = wk?.meals?.find(m => !m.recipe && !m.leftovers);
  return open ? open.day : (wk?.id ? null : 1);
}
