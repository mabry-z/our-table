// Small shared pieces of markup, matching the mockup's look.

export const STORE_BG = { Commissary: '#E3E8D8', Lidl: '#DFE6EC', Aldi: '#F1E7D2', Kaufland: '#F2E0D6', Globus: '#EAE3D3', REWE: '#F1DCDC' };
export const STORE_FG = { Commissary: '#4F5E3E', Lidl: '#3F5566', Aldi: '#6E5527', Kaufland: '#7A4632', Globus: '#5E5338', REWE: '#7A3434' };

export const f = v => '$' + Number(v).toFixed(2);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = name => `<i class="ti ti-${name}" aria-hidden="true"></i>`;

export const pill = (chain, text) =>
  `<span class="pl" style="background:${STORE_BG[chain] || '#EDE6DA'};color:${STORE_FG[chain] || '#6B6157'}">${esc(text || chain)}</span>`;
export const salePill = text => `<span class="pl" style="background:#F5E9C9;color:#6E5527">${icon('tag')} ${esc(text)}</span>`;
export const lukePill = text => `<span class="pl" style="background:#EDE4EE;color:#5D4663">${icon('heart')} ${esc(text)}</span>`;

export const stars = n => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'Not rated yet');

export function weekOf(iso) {
  return 'Week of ' + new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function head(eyebrow, title) {
  return `<div class="hd"><div class="ey">${eyebrow}</div><div class="sf ttl">${title}</div><div class="ln"></div></div>`;
}

// Header with arrows to move between planned weeks.
export function weekHead(S, M, title) {
  const wk = M.weeks[S.week];
  const label = wk ? weekOf(wk.week_start) + (wk.past ? ' · done' : '') : 'No week planned';
  return `<div class="hd"><div class="wk">`
    + `<button class="nb" data-week="-1" aria-label="Previous week"${S.week <= 0 ? ' disabled' : ''}>${icon('chevron-left')}</button>`
    + `<div class="ey">${label}</div>`
    + `<button class="nb" data-week="1" aria-label="Next week"${S.week >= M.weeks.length - 1 ? ' disabled' : ''}>${icon('chevron-right')}</button>`
    + `</div><div class="sf ttl">${title}</div><div class="ln"></div></div>`;
}
