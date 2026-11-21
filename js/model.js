// Turns table rows into what the screens show: weeks with their dinners and list, the recipe
// box, This week's picks and Luke's usuals. No prices: the price engine is parked
// (see docs/build-plan.md).

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The order we walk the store, with the name shown on the list. Keep in step with the aisle
// check in supabase/migrations/20261121140000_specific_aisles.sql.
export const AISLES = [
  ['produce', 'Produce'], ['bakery', 'Bakery and bread'], ['deli', 'Deli'], ['meat', 'Meat and poultry'],
  ['seafood', 'Seafood'], ['dairy', 'Dairy and eggs'], ['pasta', 'Pasta, rice and grains'],
  ['canned', 'Canned and jarred'], ['condiments', 'Condiments and sauces'], ['spices', 'Spices and seasonings'],
  ['baking', 'Baking and oils'], ['breakfast', 'Breakfast and cereal'], ['snacks', 'Snacks'], ['drinks', 'Drinks'],
  ['frozen', 'Frozen'], ['household', 'Household'], ['other', 'Other'],
];

// Best guess from a name for new ingredients and our own list items; first match wins, so the
// order matters (same rules as the specific_aisles migration):
// frozen before meat (chicken nuggets), spices before produce (garlic powder, dried basil),
// canned tomatoes and broth before produce and meat, pasta before dairy (egg noodles),
// drinks and snacks before produce and bakery (orange juice, tortilla chips), breakfast
// before dairy (peanut butter), produce before dairy (eggplant).
const AISLE_GUESS = [
  ['household', /(paper towel|toilet paper|napkin|foil|plastic wrap|trash bag|zip ?lock|ziploc|detergent|dish soap|sponge|tissue)/i],
  ['frozen', /(nugget|frozen|fried shrimp|fries|ice cream|tater tot|popsicle)/i],
  ['spices', /(seasoning|dried|powder|flakes|paprika|cumin|cinnamon|nutmeg|turmeric|cayenne|curry|bay lea|black pepper|peppercorn|\bsalt\b|\bspices?\b)/i],
  ['condiments', /(ketchup|mustard|mayo|vinegar|soy sauce|hot sauce|bbq|barbecue|salsa|dressing|relish|pickle|worcestershire|sriracha|pasta sauce|marinara|pesto|teriyaki)/i],
  ['baking', /(flour|sugar|baking|yeast|vanilla|chocolate chip|cocoa|cornstarch|\boil\b|shortening|honey|molasses|cake mix|brownie)/i],
  ['canned', /(canned|\bcans?\b|tomato paste|tomato sauce|diced tomato|crushed tomato|broth|stock|bouillon)/i],
  ['deli', /(deli|salami|pepperoni|prosciutto|lunch meat|rotisserie|hummus)/i],
  ['seafood', /(shrimp|salmon|\bcod\b|fish|tuna|tilapia|crab|scallop|mussel|lobster)/i],
  ['meat', /(chicken|beef|pork|sausage|turkey|bacon|\bham\b|steak|schnitzel|lamb|veal|meatball)/i],
  ['drinks', /(juice|soda|coffee|\btea\b|sparkling water|lemonade)/i],
  ['snacks', /(chips\b|cracker|cookie|pretzel|popcorn|\bnuts\b|almond)/i],
  ['produce', /(pepper|onion|potato|corn|tomato|lettuce|garlic|carrot|celery|apple|lemon|lime|cilantro|parsley|basil|thyme|rosemary|mint|dill|chive|sage|oregano|herb|ginger|scallion|shallot|leek|spinach|kale|arugula|cabbage|broccoli|cauliflower|zucchini|squash|pumpkin|eggplant|asparagus|mushroom|cucumber|avocado|green bean|peas|radish|beet|jalape|banana|orange|berr|grape|peach|pear|mango|pineapple|melon|fruit)/i],
  ['pasta', /(pasta|penne|spaghetti|macaroni|spätzle|spaetzle|noodle|\brice\b|quinoa|couscous|lasagna|ramen|orzo)/i],
  ['bakery', /(bread|\bbuns?\b|tortilla|\brolls?\b|pita|bagel|naan|croissant|english muffin)/i],
  ['breakfast', /(cereal|\boats?\b|oatmeal|granola|pancake|waffle|syrup|peanut butter|\bjam\b|jelly)/i],
  ['canned', /(beans|soup|coconut milk|olives)/i],
  ['dairy', /(milk|cheese|cheddar|parmesan|mozzarella|butter|cream|yogurt|\beggs?\b)/i],
];
export function guessAisle(name) {
  return (AISLE_GUESS.find(([, re]) => re.test(name)) || ['other'])[0];
}

export function isoDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function mondayOf(iso) {
  const dow = (new Date(iso + 'T12:00:00').getDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

export function assemble(rows, today = isoDate()) {
  const hh = rows.households[0];
  if (!hh) return null;
  const recipes = rows.recipes;
  const recipeById = new Map(recipes.map(r => [r.id, r]));
  const ingredientById = new Map(rows.ingredients.map(i => [i.id, i]));
  const recipeIngredients = rows.recipe_ingredients || [];

  const week = p => ({
    id: p.id,
    week_start: p.week_start,
    past: addDays(p.week_start, 7) <= today,
    current: p.week_start <= today && today < addDays(p.week_start, 7),
    meals: rows.plan_meals.filter(m => m.plan_id === p.id).sort((a, b) => a.day - b.day)
      .map(m => ({ ...m, recipe: recipeById.get(m.recipe_id) || null })),
    list: rows.list_items.filter(i => i.plan_id === p.id).sort((a, b) => a.position - b.position)
      .map(i => ({ ...i, aisle: i.aisle || ingredientById.get(i.ingredient_id)?.aisle || 'other' })),
  });
  // This week and next always show, so they can be started before they have a plan.
  const plans = [...rows.plans];
  const thisWeek = mondayOf(today);
  for (const start of [thisWeek, addDays(thisWeek, 7)]) {
    if (!plans.some(p => p.week_start === start)) plans.push({ id: null, week_start: start });
  }
  const weeks = plans.sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).map(week);

  const usuals = [...rows.usuals].sort((a, b) => a.position - b.position);
  const picks = (rows.picks || []).map(p => ({ ...p, recipe: recipeById.get(p.recipe_id) }))
    .filter(p => p.recipe).sort((a, b) => (a.added_at < b.added_at ? -1 : 1));
  const members = new Map(rows.members.map(m => [m.user_id, m.display_name]));

  return {
    hh, weeks, recipes, recipeById, ingredientById, recipeIngredients, usuals, picks, members,
    memberCount: rows.members.length,
  };
}
