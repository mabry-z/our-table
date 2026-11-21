// Turns table rows into what the screens show: weeks with their dinners and list, the recipe
// box and Luke's usuals. No prices: the price engine is parked (see docs/build-plan.md).

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function isoDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function assemble(rows, today = isoDate()) {
  const hh = rows.households[0];
  if (!hh) return null;
  const recipes = rows.recipes;
  const recipeById = new Map(recipes.map(r => [r.id, r]));

  const weeks = [...rows.plans].sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).map(p => ({
    id: p.id,
    week_start: p.week_start,
    past: addDays(p.week_start, 7) <= today,
    current: p.week_start <= today && today < addDays(p.week_start, 7),
    meals: rows.plan_meals.filter(m => m.plan_id === p.id).sort((a, b) => a.day - b.day)
      .map(m => ({ ...m, recipe: recipeById.get(m.recipe_id) || null })),
    list: rows.list_items.filter(i => i.plan_id === p.id).sort((a, b) => a.position - b.position),
  }));

  const usuals = [...rows.usuals].sort((a, b) => a.position - b.position);

  return { hh, weeks, recipes, recipeById, usuals, memberCount: rows.members.length };
}
