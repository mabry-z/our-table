// The app's only door to data: Supabase when js/config.js has a project, otherwise the
// in-memory sample rows. Both hand back the same table-shaped rows.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { sampleRows } from './sample-data.js';

export const mode = SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'sample';

const TABLES = ['households', 'members', 'stores', 'products', 'ingredients', 'ingredient_matches',
  'recipes', 'plans', 'plan_meals', 'usuals', 'list_items'];
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
  const get = async (name, build = q => q) => {
    const { data, error } = await build(c.from(name).select('*'));
    if (error) throw error;
    return data;
  };
  const out = {};
  await Promise.all([
    ...TABLES.map(async t => { out[t] = await get(t); }),
    (async () => { out.prices = await get('latest_prices'); })(),
    (async () => { out.exchange_rates = await get('exchange_rates', q => q.order('rate_date', { ascending: false }).limit(1)); })(),
  ]);
  return (rows = out);
}

// Applies the change locally right away (synchronously), then saves it.
export async function save(table, id, patch) {
  const row = rows?.[table]?.find(r => r.id === id);
  if (row) Object.assign(row, patch);
  if (mode === 'supabase') {
    const { error } = await (await client()).from(table).update(patch).eq('id', id);
    if (error) throw error;
  }
}
