// Small shared pieces of markup, matching the mockup's look.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = name => `<i class="ti ti-${name}" aria-hidden="true"></i>`;

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
