-- More specific aisles (Nov 21, 2026): "Pantry" splits into pasta and grains, canned and jarred,
-- condiments, spices, baking, breakfast, snacks and drinks; "Meat and seafood" splits in two;
-- deli and household are added. Keep in step with AISLES in js/model.js.

-- Same guess as guessAisle() in js/model.js; first match wins, so the order matters.
create function pg_temp.guess_aisle(n text) returns text language sql immutable as $$
  select case
    when n ~* '(paper towel|toilet paper|napkin|foil|plastic wrap|trash bag|zip ?lock|ziploc|detergent|dish soap|sponge|tissue)' then 'household'
    when n ~* '(nugget|frozen|fried shrimp|fries|ice cream|tater tot|popsicle)' then 'frozen'
    when n ~* '(seasoning|dried|powder|flakes|paprika|cumin|cinnamon|nutmeg|turmeric|cayenne|curry|bay lea|black pepper|peppercorn|\ysalt\y|\yspices?\y)' then 'spices'
    when n ~* '(ketchup|mustard|mayo|vinegar|soy sauce|hot sauce|bbq|barbecue|salsa|dressing|relish|pickle|worcestershire|sriracha|pasta sauce|marinara|pesto|teriyaki)' then 'condiments'
    when n ~* '(flour|sugar|baking|yeast|vanilla|chocolate chip|cocoa|cornstarch|\yoil\y|shortening|honey|molasses|cake mix|brownie)' then 'baking'
    when n ~* '(canned|\ycans?\y|tomato paste|tomato sauce|diced tomato|crushed tomato|broth|stock|bouillon)' then 'canned'
    when n ~* '(deli|salami|pepperoni|prosciutto|lunch meat|rotisserie|hummus)' then 'deli'
    when n ~* '(shrimp|salmon|\ycod\y|fish|tuna|tilapia|crab|scallop|mussel|lobster)' then 'seafood'
    when n ~* '(chicken|beef|pork|sausage|turkey|bacon|\yham\y|steak|schnitzel|lamb|veal|meatball)' then 'meat'
    when n ~* '(juice|soda|coffee|\ytea\y|sparkling water|lemonade)' then 'drinks'
    when n ~* '(chips\y|cracker|cookie|pretzel|popcorn|\ynuts\y|almond)' then 'snacks'
    when n ~* '(pepper|onion|potato|corn|tomato|lettuce|garlic|carrot|celery|apple|lemon|lime|cilantro|parsley|basil|thyme|rosemary|mint|dill|chive|sage|oregano|herb|ginger|scallion|shallot|leek|spinach|kale|arugula|cabbage|broccoli|cauliflower|zucchini|squash|pumpkin|eggplant|asparagus|mushroom|cucumber|avocado|green bean|peas|radish|beet|jalape|banana|orange|berr|grape|peach|pear|mango|pineapple|melon|fruit)' then 'produce'
    when n ~* '(pasta|penne|spaghetti|macaroni|spätzle|spaetzle|noodle|\yrice\y|quinoa|couscous|lasagna|ramen|orzo)' then 'pasta'
    when n ~* '(bread|\ybuns?\y|tortilla|\yrolls?\y|pita|bagel|naan|croissant|english muffin)' then 'bakery'
    when n ~* '(cereal|\yoats?\y|oatmeal|granola|pancake|waffle|syrup|peanut butter|\yjam\y|jelly)' then 'breakfast'
    when n ~* '(beans|soup|coconut milk|olives)' then 'canned'
    when n ~* '(milk|cheese|cheddar|parmesan|mozzarella|butter|cream|yogurt|\yeggs?\y)' then 'dairy'
    else 'other'
  end
$$;

alter table public.ingredients drop constraint ingredients_aisle_check;
alter table public.list_items  drop constraint list_items_aisle_check;

-- Re-sort only the aisles that were split or are new; produce, dairy, bakery and frozen stay
-- as they are (including any we moved by hand).
update public.ingredients set aisle = pg_temp.guess_aisle(name) where aisle in ('pantry', 'meat', 'other');
update public.list_items  set aisle = pg_temp.guess_aisle(label) where aisle in ('pantry', 'meat', 'other');

alter table public.ingredients add constraint ingredients_aisle_check check (aisle in (
  'produce', 'bakery', 'deli', 'meat', 'seafood', 'dairy', 'pasta', 'canned', 'condiments', 'spices',
  'baking', 'breakfast', 'snacks', 'drinks', 'frozen', 'household', 'other'));
alter table public.list_items add constraint list_items_aisle_check check (aisle in (
  'produce', 'bakery', 'deli', 'meat', 'seafood', 'dairy', 'pasta', 'canned', 'condiments', 'spices',
  'baking', 'breakfast', 'snacks', 'drinks', 'frozen', 'household', 'other'));
