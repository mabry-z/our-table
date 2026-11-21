import { esc, icon, weekHead } from '../ui.js';

// Grouped by dinner for now; grouping by aisle comes with the ingredients.aisle column.
const GROUPS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'],
  ['Sat', 'Saturday'], ['Sun', 'Sunday'], ['Luke', "Luke's usuals"]];

export function vList(S, M) {
  const wk = M.weeks[S.week];
  let h = weekHead(S, M, 'Shopping list');
  if (!wk || !wk.list.length) return h + `<div class="cd ghost mu">No shopping list for this week yet.</div>`;

  const items = wk.list, left = items.filter(it => !it.checked).length;
  const known = new Set(GROUPS.map(g => g[0]));
  const groups = [...GROUPS, ['', 'Other']].map(([k, name]) => [name, items.filter(it => (k ? it.for_label === k : !known.has(it.for_label)))])
    .filter(([, g]) => g.length);

  h += `<div class="mu" style="text-align:center;margin:-4px 0 12px">${left ? `${left} of ${items.length} items left` : 'All done'}</div>`;
  h += groups.map(([name, g]) => `<div class="cd"><div class="ey" style="margin-bottom:4px">${name}</div>`
    + g.map(it => {
      const d = it.checked;
      return `<div class="it${d ? ' on' : ''}" data-done="${it.id}" role="checkbox" aria-checked="${d}" tabindex="0">`
        + `<span class="bx${d ? ' on' : ''}">${d ? icon('check') : ''}</span>`
        + `<span class="lb" style="flex:1">${esc(it.label)}</span></div>`;
    }).join('') + `</div>`).join('');
  return h;
}
