// Sharing a recipe by link: the sheet that makes the link, and the sheet that opens one.
import { esc, icon } from '../ui.js';

const sheet = (label, title, body) => `<div class="ov" data-a="shareclose"><div class="sh" data-stop="1" role="dialog" aria-label="${esc(label)}"><div class="grab"></div>`
  + `<div class="row" style="margin-bottom:10px"><div class="sf dsp" style="font-size:22px;line-height:1.2">${title}</div>`
  + `<button class="ib" data-a="shareclose" aria-label="Close" style="border:none">${icon('x')}</button></div>`
  + `<div class="shb">${body}</div></div></div>`;

// S.shareOut = { recipeId, busy, url, err, copied }
export function vShareOut(S, M) {
  const o = S.shareOut, r = M.recipeById.get(o.recipeId);
  if (!r) return '';
  let b = `<div class="sf" style="font-size:18px;line-height:1.25;margin-bottom:6px">${esc(r.title)}</div>`;
  if (o.busy) b += `<div class="cd" style="text-align:center"><div class="sf" style="font-size:17px">Making the link…</div>${r.photo_paths?.length ? '<div class="mu">Copying its photos too.</div>' : ''}</div>`;
  else if (o.err) b += `<div class="err">${esc(o.err)}</div><button class="big dk" data-a="shareout">Try again</button>`;
  else {
    b += `<div class="mu" style="margin-bottom:10px">Anyone signed in to Our table can open this link and save their own copy${r.photo_paths?.length ? ', photos included' : ''}. Your note for Luke and your rating stay here.</div>`
      + `<input class="in" id="shareurl" readonly value="${esc(o.url)}" aria-label="Share link" style="font-size:14px">`
      + `<div style="display:flex;gap:8px;margin-top:10px">`
      + `<button class="ib" data-a="sharecopy" style="flex:1;justify-content:center;padding:10px">${icon(o.copied ? 'check' : 'copy')} ${o.copied ? 'Copied' : 'Copy link'}</button>`
      + (navigator.share ? `<button class="ib dk" data-a="sharesend" style="flex:1;justify-content:center;padding:10px">${icon('send')} Send it</button>` : '')
      + `</div>`;
  }
  return sheet('Share a recipe', 'Share this recipe', b);
}

// S.shareIn = { token, loading, data: { recipe, photos, shared_by }, err, saving, have }
export function vShareIn(S) {
  const s = S.shareIn;
  let b = '';
  if (s.loading) b = `<div class="cd" style="text-align:center"><div class="sf" style="font-size:17px">Opening the recipe…</div></div>`;
  else if (s.err) b = `<div class="cd ghost"><div class="sf" style="font-size:17px">Couldn’t open it</div><div class="mu" style="margin-top:4px">${esc(s.err)}</div></div>`;
  else {
    const r = s.data.recipe, steps = (r.steps || []).map(x => (typeof x === 'string' ? x : [x.title, x.text].filter(Boolean).join(': ')));
    b = `<div class="ey">${[s.data.shared_by ? 'Shared by ' + esc(s.data.shared_by) : 'Shared with you', r.site ? esc(r.site) : '', r.time_min ? r.time_min + ' min' : '', r.servings ? 'serves ' + r.servings : ''].filter(Boolean).join(' · ')}</div>`
      + `<div class="sf" style="font-size:22px;line-height:1.2;margin:4px 0 10px">${esc(r.title)}</div>`
      + (s.data.photos.length ? `<div class="thumbs">${s.data.photos.map((u, i) => `<button class="thumb" data-shareview="${i}" aria-label="Show photo ${i + 1} full size" style="padding:0"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : '')
      + `<div class="ey" style="margin:10px 0 4px">Ingredients · ${r.ingredients.length}</div>`
      + (r.ingredients.length ? `<ul class="ul">${r.ingredients.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<div class="mu">None listed.</div>')
      + `<div class="ey" style="margin:12px 0 4px">Steps${steps.length ? ' · ' + steps.length : ''}</div>`
      + (steps.length ? `<ol class="ul">${steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '<div class="mu">No steps saved.</div>')
      + (r.source_url ? `<a class="ib" href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;margin-top:10px;display:inline-flex">${icon('external-link')} Original</a>` : '')
      + `<div class="err">${esc(s.saveErr || '')}</div>`
      + (s.have
        ? `<div class="mu" style="margin-top:12px">${icon('info-circle')} This one is already in your recipe box.</div><button class="big dk" data-a="shareopenhave">Open it</button>`
        : `<div style="display:flex;gap:8px;margin-top:12px"><button class="ib" data-a="shareinpick" style="flex:1;justify-content:center;padding:10px"${s.saving ? ' disabled' : ''}>Add to picks</button>`
          + `<button class="ib dk" data-a="shareinsave" style="flex:1;justify-content:center;padding:10px"${s.saving ? ' disabled' : ''}>${s.saving ? 'Saving…' : 'Save to my box'}</button></div>`);
  }
  return sheet('Shared recipe', 'A recipe for you', b);
}
