// The app's only door to data: Supabase when js/config.js has a project, otherwise the
// in-memory sample rows. Both hand back the same table-shaped rows. Adding ?sample to the
// address runs on sample data even when a project is set, for previews.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { sampleRows } from './sample-data.js';

export const mode = SUPABASE_URL && SUPABASE_ANON_KEY && !new URLSearchParams(location.search).has('sample')
  ? 'supabase' : 'sample';

const TABLES = ['households', 'members', 'ingredients', 'recipes', 'recipe_ingredients', 'picks', 'plans',
  'plan_meals', 'usuals', 'list_items'];
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
