// Cook mode (mockups/recipe-and-cook-mode.html, minus prices and stores): one step per screen in
// large type, that step's ingredients, one-tap timers read from the step's text, the screen kept
// awake, Luke's reminder at the right step, and a rating at the end.
// Also the recipe page's portions scaling, shared with cook mode.
import { esc, icon } from '../ui.js';

// ---- Scaling ingredient amounts ----------------------------------------------------------------

const UNI = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])`;
const LEAD = new RegExp(String.raw`^\s*(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?`);
const TAIL = new RegExp(String.raw`(,\s*)(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?(?=[^,]*$)`);

function toNum(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*([½⅓⅔¼¾⅛⅜⅝⅞])$/))) return +m[1] + UNI[m[2]];
  if (UNI[s] != null) return UNI[s];
  return Number(s);
}

// 1.5 → "1 1/2", 0.33 → "1/3", 12.4 → "12". Kitchen-friendly fractions below 10.
function nice(v) {
  if (v >= 10) return String(Math.round(v));
  const whole = Math.floor(v), frac = v - whole;
  const opts = [[0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, '']];
  const [f, label] = opts.reduce((a, b) => (Math.abs(b[0] - frac) < Math.abs(a[0] - frac) ? b : a));
  const w = whole + (f === 1 ? 1 : 0);
  if (!w && !label) return '1/8';
  return [w || '', label].filter(Boolean).join(' ');
}

// Scales the amount at the start of a line ("1 1/2 cups flour", "2-3 cloves garlic").
// Lines without a leading amount ("Salt to taste") stay as they are.
export function scaleLine(line, factor) {
  if (factor === 1) return line;
  const fmt = m => { const a = nice(toNum(m[1]) * factor), b = m[2] ? nice(toNum(m[2]) * factor) : null; return b ? `${a}–${b}` : a; };
  const m = line.match(LEAD);
  if (m) return fmt(m) + line.slice(m[0].length);
  // "Pork sausage, 1 lb": the amount after the last comma.
  return line.replace(TAIL, (all, lead, a, b) => lead + fmt([all, a, b]));
}

// ---- Reading steps -----------------------------------------------------------------------------

export const stepParts = s => (typeof s === 'string' ? { title: '', text: s } : { title: s.title || '', text: s.text || '', timer_sec: s.timer_sec, luke: s.luke });

// Timers named in a step: "bake for 25 to 30 minutes" → 25 minutes (check early; add more if needed).
const DUR = /(\d+(?:\.\d+)?|an?|one|half an?)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(?:more\s+)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
export function stepTimers(text, fallbackSecs) {
  const out = [];
  for (const m of text.matchAll(DUR)) {
    const n = /^half/i.test(m[1]) ? .5 : /^(an?|one)$/i.test(m[1]) ? 1 : Number(m[1]);
    const unit = m[3].toLowerCase(), mult = unit.startsWith('h') ? 3600 : unit.startsWith('s') ? 1 : 60;
    const secs = Math.round(n * mult);
    if (secs >= 10 && secs <= 24 * 3600 && !out.some(t => t.secs === secs)) {
      out.push({ secs, label: m[0].replace(/\s+/g, ' ').trim() });
    }
    if (out.length === 2) break;
  }
  if (!out.length && fallbackSecs > 0) out.push({ secs: fallbackSecs, label: mmss(fallbackSecs) });
  return out;
}

// Which ingredients a step uses, by matching the ingredient's key words in the step's text.
const SKIP_WORDS = new Set(['fresh', 'large', 'small', 'medium', 'chopped', 'diced', 'sliced', 'minced', 'ground', 'dried',
  'whole', 'extra', 'virgin', 'light', 'dark', 'cups', 'plus', 'more', 'about', 'optional', 'grated', 'shredded', 'softened',
  'melted', 'room', 'temperature', 'packed', 'finely', 'roughly', 'divided', 'pound', 'pounds', 'ounce', 'ounces', 'teaspoon',
  'teaspoons', 'tablespoon', 'tablespoons', 'pinch', 'cloves', 'clove', 'taste', 'into', 'with', 'cut', 'pieces', 'boneless',
  'skinless', 'unsalted', 'salted', 'kosher', 'cold', 'warm', 'cooked', 'raw', 'can', 'cans', 'jar', 'package', 'cup']);
const stem = w => w.toLowerCase().replace(/(ies)$/, 'y').replace(/(oes|ses|shes|ches)$/, m => m.slice(0, -2)).replace(/s$/, '');
const words = t => (t.toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length >= 3 && !SKIP_WORDS.has(w)).map(stem);

export function stepIngredients(ings, text) {
  const have = new Set(words(text));
  return ings.filter(i => words(i.name).some(w => have.has(w)));
}

// The step Luke's note belongs at: the first one sharing a word with the note, else the last.
export function lukeStep(note, steps) {
  const flagged = steps.findIndex(s => s?.luke);
  if (flagged >= 0) return flagged;
  if (!note || !steps.length) return -1;
  const want = words(note).filter(w => !['luke', 'plain', 'portion', 'set', 'aside', 'side', 'for', 'and', 'the', 'nothing'].includes(w));
  const i = steps.findIndex(s => { const have = new Set(words(stepParts(s).text + ' ' + stepParts(s).title)); return want.some(w => have.has(w)); });
  return i >= 0 ? i : steps.length - 1;
}

// ---- Screens -----------------------------------------------------------------------------------

export const mmss = s => {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
export const timerLeft = t => (t.run ? (t.end - Date.now()) / 1000 : t.left);

// A portions control: "− 4 portions +".
export function portionsControl(n) {
  return `<div class="row" style="gap:8px"><button class="ib" data-a="portm" aria-label="Fewer portions"${n <= 1 ? ' disabled' : ''}>−</button>`
    + `<span style="font-size:14px;min-width:74px;text-align:center">${n} ${n === 1 ? 'portion' : 'portions'}</span>`
    + `<button class="ib" data-a="portp" aria-label="More portions">+</button></div>`;
}

export function vCook(S, r, ings, steps) {
  const c = S.cook;
  if (c.step >= steps.length) return vDone(S, r);
  const i = c.step, n = steps.length, s = stepParts(steps[i]);
  const timers = stepTimers(s.text, s.timer_sec);
  const these = stepIngredients(ings, s.title + ' ' + s.text);
  const luke = r.luke_note && lukeStep(r.luke_note, steps) === i;
  // Timers from other steps that are still going, so they're never lost off screen.
  const others = Object.entries(c.timers).filter(([k, t]) => Number(k.split(':')[0]) !== i && (t.run || timerLeft(t) <= 0));
  let h = `<div class="row"><button class="ib" data-a="cookexit" aria-label="Leave cook mode" style="border:none;padding-left:0">${icon('x')}</button>`
    + `<span class="ey">Step ${i + 1} of ${n}</span>`
    + `<span class="mu" style="display:inline-flex;align-items:center;gap:4px">${c.awake ? `${icon('sun')} Screen on` : ''}</span></div>`
    + `<div class="cook-prog" aria-hidden="true">${steps.map((_, j) => `<div${j <= i ? ' class="on"' : ''}></div>`).join('')}</div>`;
  if (others.length) {
    h += `<div class="cook-others">${others.map(([k, t]) => {
      const up = timerLeft(t) <= 0;
      return `<button class="ib${up ? ' up' : ''}" data-cookgo="${k.split(':')[0]}">${icon(up ? 'bell-ringing' : 'clock')} Step ${Number(k.split(':')[0]) + 1} · <span data-tleft="${k}">${up ? 'Time is up' : mmss(timerLeft(t))}</span></button>`;
    }).join('')}</div>`;
  }
  if (luke) {
    h += `<div class="cd" style="background:#EDE4EE;border-color:#DCCBE0;color:#5D4663;display:flex;gap:10px;align-items:center">`
      + `<span style="font-size:20px">${icon('heart')}</span><div><div style="font-weight:700">For Luke</div><div style="font-size:14px">${esc(r.luke_note)}</div></div></div>`;
  }
  h += (s.title ? `<div class="sf cook-title">${esc(s.title)}</div>` : '')
    + `<div class="cook-text${s.title ? '' : ' solo'}">${esc(s.text)}</div>`;
  if (these.length) {
    h += `<div class="ey" style="margin-bottom:8px">For this step</div><div class="cd" style="padding:4px 14px">`
      + these.map((x, j) => `<div style="padding:9px 0;font-size:17px;${j ? 'border-top:1px solid var(--rule2)' : ''}">${esc(x.line)}</div>`).join('') + `</div>`;
    if (c.factor !== 1) h += `<div class="mu" style="margin:-4px 2px 10px">Amounts here are for ${c.portions} portions. Any amounts in the step's own words are for the original ${r.servings || 4}.</div>`;
  }
  timers.forEach((tm, j) => {
    const k = `${i}:${j}`, t = c.timers[k], left = t ? timerLeft(t) : tm.secs, up = t && left <= 0;
    h += `<div class="cd row cook-timer${up ? ' up' : ''}"><div><div class="ey">${up ? 'Time is up' : `Timer · ${esc(tm.label)}`}</div>`
      + `<div class="sf" style="font-size:34px;line-height:1.15" data-tleft="${k}">${mmss(left)}</div></div>`
      + `<div style="display:flex;gap:6px">${t && !up ? `<button class="ib" data-cooktreset="${k}" aria-label="Reset timer">${icon('rotate')}</button>` : ''}`
      + `<button class="ib ${t?.run ? '' : 'dk'}" data-cooktimer="${k}" style="padding:9px 16px;font-size:14px">${up ? 'Reset' : t ? (t.run ? 'Pause' : 'Resume') : 'Start timer'}</button></div></div>`;
  });
  h += `<div style="flex:1"></div>`
    + `<button class="lk" data-a="cookall" style="align-self:center;margin:10px 0 0">${icon('list')} All ingredients</button>`
    + `<div class="cook-nav"><button class="ib" data-a="cookprev"${i === 0 ? ' disabled' : ''}>${icon('arrow-left')} Back</button>`
    + `<button class="ib dk" data-a="cooknext">${i === n - 1 ? 'Finish' : 'Next step'} ${icon('arrow-right')}</button></div>`;
  return h;
}

function vDone(S, r) {
  const rate = S.cook.rate;
  return `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">`
    + `<span style="font-size:36px;color:var(--accent)">${icon('tools-kitchen-2')}</span>`
    + `<div class="sf dsp" style="font-size:34px;margin-top:10px">All done</div>`
    + `<div class="sf" style="font-size:18px;margin-top:4px">${esc(r.title)}</div>`
    + `<div class="mu" style="font-size:14px;margin:10px 0 22px">How did it go over?</div>`
    + `<div style="display:flex;gap:10px;justify-content:center">`
    + [['up', 'thumb-up', 'Make again'], ['down', 'thumb-down', 'Not for us']].map(([k, i, l]) =>
      `<button class="ib ${rate === k ? 'dk' : ''}" data-cookrate="${k}" style="padding:12px 18px;font-size:14px">${icon(i)} ${l}</button>`).join('')
    + `</div><div class="mu" style="margin-top:14px;min-height:18px">${rate === 'up' ? 'Saved. It will come up again in future plans.' : rate === 'down' ? 'Got it. We’ll suggest it less often.' : ''}</div></div>`
    + `<button class="ib" data-a="cookprev" style="align-self:center;margin-bottom:10px;border:none">${icon('arrow-left')} Back to the last step</button>`
    + `<button class="big dk" data-a="cookexit">Back to the recipe</button>`;
}

// All the ingredients, over the step, for a quick look.
export function vCookAll(S, ings) {
  return `<div class="ov" data-a="cookallclose"><div class="sh" data-stop>`
    + `<div class="grab"></div><div class="row" style="margin-bottom:6px"><div class="sf dsp" style="font-size:24px">Ingredients</div>`
    + `<button class="ib" data-a="cookallclose" aria-label="Close" style="border:none">${icon('x')}</button></div>`
    + `<div class="mu" style="margin-bottom:8px">For ${S.cook.portions} ${S.cook.portions === 1 ? 'portion' : 'portions'}</div>`
    + `<div class="shb"><div class="cd" style="padding:4px 14px">`
    + (ings.length ? ings.map((x, j) => `<div style="padding:9px 0;font-size:16px;${j ? 'border-top:1px solid var(--rule2)' : ''}">${esc(x.line)}</div>`).join('')
      : `<div class="mu" style="padding:8px 0">No ingredients saved.</div>`)
    + `</div></div></div></div>`;
}
