// The app's only door to data: Supabase when js/config.js has a project, otherwise the
// in-memory sample rows. Both hand back the same table-shaped rows. Adding ?sample to the
// address runs on sample data even when a project is set, for previews.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { sampleRows } from './sample-data.js';

export const mode = SUPABASE_URL && SUPABASE_ANON_KEY && !new URLSearchParams(location.search).has('sample')
  ? 'supabase' : 'sample';

const TABLES = ['households', 'members', 'ingredients', 'recipes', 'recipe_ingredients', 'picks', 'plans',
  'plan_meals', 'usuals', 'list_items', 'pantry'];
let sb = null;
let rows = null;

async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return sb;
}

export async function currentUser() {
  if (mode === 'sample') return null;
  const { data } = await (await client()).auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email, password) {
  if (mode === 'sample') throw new Error('No database is connected yet. Continue with sample data for now.');
  const { data, error } = await (await client()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  return data.user;
}

export async function signOut() {
  if (mode === 'supabase') await (await client()).auth.signOut();
  rows = null;
}

export async function loadRows() {
  if (mode === 'sample') return (rows = sampleRows());
  const c = await client();
  const get = async name => {
    const { data, error } = await c.from(name).select('*');
    if (error) throw error;
    return data;
  };
  const out = {};
  await Promise.all(TABLES.map(async t => { out[t] = await get(t); }));
  return (rows = out);
}

// Writes change the local rows right away (synchronously), then save in the background. Saves
// run one at a time in order, so a recipe is saved before its ingredients and a plan before
// its nights. Each returns a promise that rejects if its save fails.
// Reads a recipe from a link (supabase/functions/import-recipe). Sample mode returns a canned
// recipe so the flow can be tried. Throws an Error with a message we can show.
export async function importRecipe(url) {
  if (mode === 'sample') {
    await new Promise(r => setTimeout(r, 600));
    if (!/\./.test(url)) throw new Error('That doesn’t look like a link.');
    const site = url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    return {
      title: 'One pot chili mac', servings: 6, time_min: 35, site, source_url: url,
      ingredients: ['1 lb ground beef', '1 tbsp chili powder', '1 can diced tomatoes', '2 cups beef broth', '8 oz elbow macaroni', '2 cups shredded cheddar'],
      steps: [{ text: 'Brown the beef in a large pot.' }, { text: 'Add the spices, tomatoes, broth and pasta; simmer 10 minutes.' }, { text: 'Stir in the cheddar until melted.' }],
    };
  }
  const { data, error } = await (await client()).functions.invoke('import-recipe', { body: { url } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || 'Couldn’t reach the recipe reader. Check your connection.');
  }
  return data;
}

// Reads a recipe with Claude (supabase/functions/ai): { kind: 'text', text, url } or
// { kind: 'photo', images: [{ media_type, data }] }. Sample mode returns a canned recipe.
export async function aiRecipe(req) {
  if (mode === 'sample') {
    await new Promise(r => setTimeout(r, 900));
    const photo = req.kind === 'photo';
    return {
      title: photo ? "Grandma's chicken and dumplings" : 'World’s best lasagna', servings: photo ? 6 : 12, time_min: photo ? 75 : 195,
      ingredients: photo
        ? ['1 whole chicken, cut up', '3 carrots, sliced', '3 celery stalks', '1 onion, diced', '2 cups flour', '1 tbsp baking powder', '¾ cup milk', '1 can chicken broth']
        : ['1 lb sweet Italian sausage', '¾ lb lean ground beef', '1 onion, minced', '1 (28 oz) can crushed tomatoes', '12 lasagna noodles', '16 oz ricotta cheese', '¾ lb mozzarella, sliced'],
      steps: [{ text: 'Brown the meat with the onion.' }, { text: 'Simmer the sauce.' }, { text: 'Layer and bake.' }],
      unclear: photo ? ['The card says "1 can" of broth; read as 14 oz.'] : [],
      site: req.url ? req.url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') : null,
      source_url: req.url || null, cost_usd: photo ? 0.021 : 0.012,
    };
  }
  const { data, error } = await (await client()).functions.invoke('ai', { body: req });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || 'Couldn’t reach the AI helper. Check your connection.');
  }
  return data;
}

// Find: searches the household's recipe sites. Returns { results, cost_usd }; each result is a
// full recipe (readable) or just a title and link for a site that won't let apps read it.
export async function aiFind(query) {
  if (mode === 'sample') {
    await new Promise(r => setTimeout(r, 1200));
    const R = (title, site, path, time_min, rating, rating_count, ingredients, why) => ({
      title, site, source_url: `https://www.${site}/${path}/`, time_min, servings: 4, rating, rating_count, why, readable: true, ingredients,
      steps: [{ text: 'Season the fish.' }, { text: 'Sear it in a hot pan.' }, { text: 'Make the pan sauce and spoon it over.' }],
    });
    // Already in rating order, as the AI helper returns them.
    return {
      cost_usd: 0.036,
      results: [
        R('Lemon butter fish with capers', 'recipetineats.com', 'lemon-butter-fish', 15, 4.9, 1312, ['4 white fish fillets', '2 tbsp capers', '3 tbsp butter', '1 lemon'], 'One pan, a bright caper sauce, hundreds of rave reviews'),
        R('Fish piccata', 'budgetbytes.com', 'fish-piccata', 25, 4.8, 640, ['1 lb cod fillets', '2 tbsp capers', '1 lemon', '½ cup chicken broth', '2 tbsp flour'], `Classic piccata, a good match for "${query}"`),
        R('Pan-seared halibut with lemon caper sauce', 'altonbrown.com', 'pan-seared-halibut', 30, 4.7, 212, ['2 halibut fillets', '2 tbsp capers', '1 lemon', '2 tbsp butter', '¼ cup white wine'], 'Alton Brown’s restaurant-style version'),
        R('Baked cod with lemon and capers', 'skinnytaste.com', 'baked-cod-lemon-capers', 20, 4.9, 38, ['4 cod fillets', '1 tbsp capers', '1 lemon', '2 tbsp olive oil'], 'Lighter, baked instead of pan-fried'),
        R('Grilled lemon caper fish', 'traeger.com', 'grilled-lemon-caper-fish', 35, null, null, ['2 lb white fish', '3 tbsp capers', '2 lemons', '4 tbsp butter'], 'Done on the grill'),
      ],
    };
  }
  const { data, error } = await (await client()).functions.invoke('ai', { body: { kind: 'find', query } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || 'Couldn’t reach the AI helper. Check your connection.');
  }
  return data;
}

// The Ask bar: one ask from the results sheet (see supabase/functions/ai, kind "ask"). Returns one
// result card. Sample mode answers with simple keyword rules so the sheet can be tried for free.
export async function aiAsk(req) {
  if (mode === 'sample') {
    await new Promise(r => setTimeout(r, 900));
    return sampleAsk(req);
  }
  const { data, error } = await (await client()).functions.invoke('ai', { body: { kind: 'ask', ...req } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || 'Couldn’t reach the AI helper. Check your connection.');
  }
  return data;
}

const SAMPLE_NEW = {
  title: 'Lemon Garlic Salmon and Rice', servings: 4, time_min: 25, luke_note: 'Plain rice and fish sticks for Luke',
  ingredients: ['1 1/2 lb salmon fillets', '2 lemons', '4 cloves garlic', '1 1/2 cups jasmine rice', '2 tbsp butter', '1 bunch green onions'],
  steps: ['Cook the rice.', 'Season the salmon with garlic, lemon zest, salt and pepper.', 'Roast at 425°F for 12 minutes.', 'Melt the butter with lemon juice and spoon over.'],
};
function sampleAsk({ ctx, q = '', context = {}, prev, photo }) {
  const day = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].findIndex(d => new RegExp(`\\b${d}`, 'i').test(q)) + 1 || null;
  const none = { find_query: null, find_day: null, week: [], changed_days: [], recipes: [], changes: [], ideas: [], items: [], cost_usd: 0.05 };
  if (photo) return { ...none, kind: 'seen', msg: "Here's what I can see. Tap anything that's wrong or used up, or tell me what I missed.", items: ['Chicken thighs', 'Bell peppers (3)', 'Half an onion', 'Rice', 'Canned tomatoes', 'Cheddar', 'Eggs', 'Greek yogurt'], cost_usd: 0.018 };
  if (/\b(find|search|look for)\b/i.test(q) || (prev?.kind === 'found' && !/plan|make/i.test(q))) {
    return aiFind(q).then(f => ({ kind: 'found', msg: `Searched your recipe sites for “${q}”.`, day: day || prev?.day || null, results: f.results, cost_usd: 0.15 }));
  }
  if (ctx === 'recipe') {
    const r = context.recipe, ch = [...(prev?.changes || [])];
    if (/dairy/i.test(q)) r.ingredients.filter(l => /cheese|cream|milk|butter|yogurt/i.test(l)).forEach(l => ch.push({ from: l, to: /butter/i.test(l) ? l.replace(/butter/i, 'olive oil') : null }));
    if (/double/i.test(q)) ch.push({ from: null, to: `Doubled to ${(r.servings || 4) * 2} portions` });
    if (!ch.length || ch.length === (prev?.changes || []).length) ch.push({ from: null, to: `Adjusted: “${q}”` });
    const ing = r.ingredients.map(l => { const c = ch.find(x => x.from === l); return c ? c.to : l; }).filter(Boolean);
    return { ...none, kind: 'changes', msg: 'Here is what changes. Nothing is saved until you choose.', changes: ch, recipes: [{ ...r, ingredients: ing, luke_note: r.luke_note || null }] };
  }
  if (ctx === 'recipes') {
    if (prev?.kind === 'seen' && /idea/i.test(q)) return { ...none, kind: 'ideas', msg: `Three ideas using ${context.on_hand?.length || 0} of your items.`, ideas: [
      { title: 'Chicken Fajita Rice Bowls', uses: 5, need: 'Nothing else to buy', luke: false },
      { title: 'Cheesy Chicken and Pepper Bake', uses: 4, need: 'Nothing else to buy', luke: true },
      { title: 'Shakshuka with Peppers', uses: 4, need: 'Feta, optional', luke: false }] };
    const base = prev?.kind === 'recipe' ? prev.recipes[0] : { ...SAMPLE_NEW, title: /make this/i.test(q) ? q.replace(/^make this:\s*/i, '') : 'Sheet-Pan Pork with Apples and Potatoes' };
    const changes = prev?.kind === 'recipe' ? [...(prev.changes || []), { from: null, to: /mild/i.test(q) ? 'Spices cut back; plain portion set aside for Luke' : `Adjusted: “${q}”` }] : [];
    return { ...none, kind: 'recipe', msg: prev?.kind === 'recipe' ? 'Updated the recipe.' : 'Here’s a new one, written for your family.', recipes: [base], changes };
  }
  // Plan: fill open nights from the box, with one new idea; a named night changes just that night.
  const box = context.box || [], nights = context.nights || [];
  const from = prev?.kind === 'week' ? prev.week : nights.map(n => ({ day: n.day, kind: 'keep', recipe_id: n.recipe_id || null, title: n.title || '' }));
  let bi = 0, changed = [];
  const week = from.map((n, i) => {
    const night = nights[i] || {};
    if (night.state === 'locked') return { day: n.day, kind: 'keep', recipe_id: night.recipe_id, title: night.title };
    if (day && n.day !== day) return n;
    if (/leftover/i.test(q) && day) { changed.push(n.day); return { day: n.day, kind: 'leftovers', recipe_id: null, title: 'Leftovers night' }; }
    if (day && /fish|salmon/i.test(q)) { changed.push(n.day); return { day: n.day, kind: 'new', recipe_id: null, title: SAMPLE_NEW.title }; }
    if (prev?.kind === 'week' && !day) return n;
    if (night.state !== 'open' && !day) return n;
    const b = box[bi++ % Math.max(1, box.length)];
    changed.push(n.day);
    return i === 4 || !b ? { day: n.day, kind: 'new', recipe_id: null, title: SAMPLE_NEW.title } : { day: n.day, kind: 'box', recipe_id: b.id, title: b.title };
  });
  return { ...none, kind: 'week', msg: changed.length ? 'From your box, plus one new idea. Locked nights stay put.' : "I wasn't sure which night to change. Try naming a day.", week, changed_days: changed,
    recipes: week.some(n => n.kind === 'new') ? [SAMPLE_NEW] : [] };
}

// This month's AI spending for the household (the log is read-only from the app).
export async function aiSpent() {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  if (mode === 'sample') return { usd: 0.47, count: 18 };
  const { data, error } = await (await client()).from('ai_requests').select('cost_usd').gte('created_at', start.toISOString());
  if (error) throw error;
  return { usd: data.reduce((a, r) => a + Number(r.cost_usd), 0), count: data.length };
}

// Recipe photos live in the private recipe-photos bucket at <household>/<recipe>/<n>.jpg
// (migration recipe_photos). Sample mode keeps them in memory for the session.
const BUCKET = 'recipe-photos';
const samplePhotos = new Map();

// Uploads after the recipe row is saved (same queue). photos: [{ data (base64), preview }].
export function uploadPhotos(paths, photos) {
  if (mode === 'sample') { paths.forEach((p, i) => samplePhotos.set(p, photos[i].preview)); return Promise.resolve(); }
  return Promise.all(paths.map((p, i) => enqueue(c => c.storage.from(BUCKET)
    .upload(p, new Blob([Uint8Array.from(atob(photos[i].data), ch => ch.charCodeAt(0))], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    .then(check))));
}

// Links good for an hour, as { path: url }.
export async function photoUrls(paths) {
  if (mode === 'sample') return Object.fromEntries(paths.map(p => [p, samplePhotos.get(p)]).filter(([, u]) => u));
  const { data, error } = await (await client()).storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

export function removePhotos(paths) {
  if (!paths?.length) return Promise.resolve();
  if (mode === 'sample') { paths.forEach(p => samplePhotos.delete(p)); return Promise.resolve(); }
  return enqueue(c => c.storage.from(BUCKET).remove(paths).then(check));
}

// Resolves once every save queued so far has gone through.
export const settled = () => enqueue(() => Promise.resolve());

// Sharing a recipe by link (supabase/functions/share-recipe). Sample mode keeps shares in this
// tab's sessionStorage, so a share link opened in the same tab can be tried.
const SAMPLE_SHARES = 'sample-shares';
const sampleShares = () => { try { return JSON.parse(sessionStorage.getItem(SAMPLE_SHARES) || '{}'); } catch { return {}; } };
async function shareCall(body) {
  const { data, error } = await (await client()).functions.invoke('share-recipe', { body });
  if (error) {
    const b = await error.context?.json?.().catch(() => null);
    throw new Error(b?.error || 'Couldn’t reach the app’s server. Check your connection.');
  }
  return data;
}
// recipe: { id, title, servings, time_min, steps, source_url, site, origin, photo_paths }, ingredients: [lines]
export async function shareCreate(recipe, ingredients) {
  if (mode !== 'sample') return (await shareCall({ action: 'create', recipe_id: recipe.id })).token;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const all = sampleShares();
  all[token] = { recipe: { ...recipe, ingredients, id: undefined, photo_paths: undefined }, photos: recipe.photo_paths.map(p => samplePhotos.get(p)).filter(Boolean), shared_by: 'Sample' };
  try { sessionStorage.setItem(SAMPLE_SHARES, JSON.stringify(all)); } catch { /* too big for storage: photos dropped */ }
  return token;
}
export async function shareGet(token) {
  if (mode !== 'sample') return shareCall({ action: 'get', token });
  const s = sampleShares()[token];
  if (!s) throw new Error('That shared recipe isn’t available anymore.');
  return s;
}
// After our copy is saved: its photos, copied into our household's folder. Returns the paths.
export async function sharePhotos(token, recipeId, householdId) {
  if (mode !== 'sample') return (await shareCall({ action: 'photos', token, recipe_id: recipeId })).photo_paths;
  const s = sampleShares()[token];
  return (s?.photos || []).map((url, i) => { const p = `${householdId}/${recipeId}/${i + 1}.jpg`; samplePhotos.set(p, url); return p; });
}

// crypto.randomUUID only exists on https and localhost; phones testing over Wi-Fi use plain http.
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let queue = Promise.resolve();
function enqueue(fn) {
  const p = queue.then(() => (mode === 'supabase' ? fn(sb) : null));
  queue = p.catch(() => {});
  return p;
}
const check = ({ error }) => { if (error) throw error; };

export async function save(table, id, patch) {
  const row = rows?.[table]?.find(r => r.id === id);
  if (row) Object.assign(row, patch);
  if (mode === 'supabase') await client();
  return enqueue(c => c.from(table).update(patch).eq('id', id).then(check));
}

// Adds a row, with its id made here so related rows can point at it straight away.
// Returns { row, saved }.
export function insert(table, row) {
  const full = { id: newId(), ...row };
  (rows[table] ||= []).push(full);
  const payload = { ...full };
  const saved = (mode === 'supabase' ? client() : Promise.resolve())
    .then(() => enqueue(c => c.from(table).insert(payload).then(check)));
  return { row: full, saved };
}

export function remove(table, id) {
  rows[table] = rows[table].filter(r => r.id !== id);
  return (mode === 'supabase' ? client() : Promise.resolve())
    .then(() => enqueue(c => c.from(table).delete().eq('id', id).then(check)));
}
