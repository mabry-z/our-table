import { esc, icon, head } from '../ui.js';
import { chips, stopsSeg } from './list.js';

const row = (label, value) => `<div class="row" style="padding:10px 0;border-top:1px solid #EFE8DC"><span>${label}</span>${value}</div>`;
const stepper = (dec, inc, value, what) =>
  `<div class="row" style="gap:10px"><button class="ib" data-a="${dec}" aria-label="Less ${what}">−</button><span class="sf" style="font-size:19px">${value}</span><button class="ib" data-a="${inc}" aria-label="More ${what}">+</button></div>`;

export function vSettings(S, M, mode, user) {
  const hh = M.hh, d = S.def;
  const rateDate = M.rateDate ? new Date(M.rateDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const shared = mode === 'sample' || M.memberCount >= 2 ? 'Connected' : 'Waiting for Lydia';
  let h = head('Household', 'Settings');
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">Meals</div>`
    + row('Portions per dinner', stepper('pm', 'pp', hh.portions, 'portions'))
    + row('Dinners per week', `<span class="mu">${hh.dinners_per_week} + ${hh.leftovers_per_week} leftovers</span>`)
    + row('Weeknight time limit', `<span class="mu">${hh.time_limit_min} min</span>`) + `</div>`;
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">Money</div>`
    + row('Weekly budget', stepper('bm', 'bp', '$' + Number(hh.weekly_budget), 'budget'))
    + row('Euro exchange rate', `<span class="mu">€1 ≈ $${M.rate.toFixed(2)}${rateDate ? ' · ' + rateDate : ''}</span>`)
    + row('Units', `<div class="sg">${['US', 'Metric'].map(u => `<button class="${hh.units === u ? 'a' : ''}" data-units="${u}">${u}</button>`).join('')}</div>`) + `</div>`;
  h += `<div class="cd"><div class="ey" style="margin-bottom:8px">Default stores</div>${chips(M, d.on, 'defs')}`
    + `<div class="err">${esc(S.setErr)}</div>`
    + `<div class="row" style="margin-top:10px"><span>Max stops</span>${stopsSeg(d.max, 'defm')}</div></div>`;
  const more = `${icon('chevron-right')}`;
  h += `<div class="cd" style="padding:4px 14px"><div class="ey" style="padding:10px 0 4px">Family</div>`
    + row("Luke's usuals", `<span class="mu">${M.usuals.length} items ${more}</span>`)
    + row('Foods we skip', `<span class="mu">${(hh.foods_we_skip || []).length} items ${more}</span>`)
    + row('Share with Lydia', `<span class="mu">${shared} ${more}</span>`) + `</div>`;
  h += `<div class="row" style="padding:6px 4px"><span class="mu">${mode === 'sample' ? 'Sample data · no database connected' : 'Signed in as ' + esc(user?.email)}</span>`
    + `<button class="ib" data-a="signout">${mode === 'sample' ? 'Sign-in screen' : 'Sign out'}</button></div>`;
  return h;
}
