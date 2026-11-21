// Reads the recipe most sites build into their pages (schema.org Recipe in JSON-LD).
// Plain JavaScript with no imports, so the edge function and a browser test can share it.
// Returns { title, servings, time_min, rating, rating_count, ingredients: [], steps: [{ text }] }
// or null. rating is the site's average stars (0-5) and rating_count how many rated it, when given.

export function parseRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, body] of blocks) {
    let data;
    try { data = JSON.parse(body.trim()); } catch { continue; }
    const r = findRecipe(data);
    if (r) return toRecipe(r);
  }
  return null;
}

function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r; }
    return null;
  }
  const type = [].concat(node['@type'] || []);
  if (type.some(t => String(t).toLowerCase() === 'recipe')) return node;
  return findRecipe(node['@graph']) || findRecipe(node.mainEntity) || null;
}

function toRecipe(r) {
  const ingredients = [].concat(r.recipeIngredient || r.ingredients || []).map(clean).filter(Boolean);
  const steps = instructions(r.recipeInstructions).map(clean).filter(Boolean).map(text => ({ text }));
  const time = minutes(r.totalTime) || (minutes(r.prepTime) + minutes(r.cookTime)) || null;
  const agg = [].concat(r.aggregateRating || [])[0] || {};
  const value = parseFloat(agg.ratingValue), best = parseFloat(agg.bestRating) || 5;
  const count = parseInt(String(agg.ratingCount ?? agg.reviewCount ?? '').replace(/[^\d]/g, ''), 10);
  return {
    title: clean(r.name) || 'Untitled recipe',
    servings: servings(r.recipeYield),
    time_min: time,
    rating: value > 0 ? Math.round(value / best * 50) / 10 : null,   // on a 5-star scale, 1 decimal
    rating_count: count > 0 ? count : null,
    ingredients,
    steps,
  };
}

function instructions(x) {
  if (!x) return [];
  if (typeof x === 'string') return x.split(/\n+|(?<=\.)\s{2,}/);
  if (Array.isArray(x)) return x.flatMap(instructions);
  if (x.itemListElement) return instructions(x.itemListElement);   // HowToSection
  if (x['@type'] === 'HowToTip') return [];                         // tips aren't steps
  return [x.text || x.name || ''];                                  // HowToStep
}

// "PT1H15M" -> 75
function minutes(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(iso || '').trim());
  if (!m) return 0;
  return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

// "4 servings", ["6", "6 servings"], 8 -> number
function servings(y) {
  const first = [].concat(y ?? []).map(v => parseInt(String(v), 10)).find(n => n > 0);
  return first && first <= 50 ? first : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
function clean(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e) => e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ')
    .trim();
}
