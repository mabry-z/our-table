// Shares a recipe by link between households (Nov 23, 2026). No AI and no cost.
//
//   POST {"action": "create", "recipe_id"}   caller's own recipe -> {"token"}
//        Saves a frozen copy in recipe_shares and copies its photos to recipe-photos/shares/<token>/.
//        Our note for Luke and our rating stay behind.
//   POST {"action": "get", "token"}          -> {"recipe", "photos": [signed urls], "shared_by"}
//   POST {"action": "photos", "token", "recipe_id"}
//        After the caller saved their own copy as recipe_id: copies the shared photos into their
//        household's folder -> {"photo_paths"}
//
// Every action needs a signed-in member of a household. Shares are read and written only here,
// with the service key (recipe_shares has row-level security on and no policies), so a share can
// be reached only by someone who has its token. The caller's own recipes are always read as the
// caller, so row-level security decides what they may share or add photos to.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const API_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;             // publishable key
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "recipe-photos";
const MAX_PHOTOS = 10;
const LINK_SECONDS = 3600;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Direct calls to Supabase (supabase-js getUser fails with this project's publishable key).
const asCaller = (authorization: string) => ({ apikey: API_KEY, authorization });
const asService = (): Record<string, string> =>
  SERVICE_KEY.startsWith("sb_") ? { apikey: SERVICE_KEY } : { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };

async function rest(path: string, headers: Record<string, string>, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, "content-type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`rest ${res.status}: ${await res.text()}`);
  return res.status === 201 || res.status === 204 ? null : res.json();
}

async function caller(authorization: string) {
  if (!authorization) return null;
  const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: asCaller(authorization) });
  if (!me.ok) return null;
  const user = await me.json();
  const rows = await rest(`members?select=household_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, asCaller(authorization));
  return rows.length ? { id: user.id as string } : null;
}

async function copyPhoto(from: string, to: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
    method: "POST", headers: { ...asService(), "content-type": "application/json" },
    body: JSON.stringify({ bucketId: BUCKET, sourceKey: from, destinationKey: to }),
  });
  if (!res.ok) throw new Error(`copy ${res.status}: ${await res.text()}`);
}

async function signedUrl(path: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST", headers: { ...asService(), "content-type": "application/json" }, body: JSON.stringify({ expiresIn: LINK_SECONDS }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{32}$/.test(t);
const validId = (t: unknown): t is string => typeof t === "string" && /^[0-9a-f-]{36}$/i.test(t);

async function getShare(token: string) {
  const rows = await rest(`recipe_shares?token=eq.${token}&select=*`, asService());
  return rows[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const auth = req.headers.get("authorization") || "";
  try {
    const me = await caller(auth);
    if (!me) return json({ error: "Sign in to the app to open shared recipes." }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === "create") {
      if (!validId(body.recipe_id)) return json({ error: "Which recipe?" }, 400);
      const [r] = await rest(`recipes?id=eq.${body.recipe_id}&select=id,household_id,title,servings,time_min,steps,source_url,site,origin,photo_paths`, asCaller(auth));
      if (!r) return json({ error: "That recipe isn't in your box." }, 404);
      const ings = await rest(`recipe_ingredients?recipe_id=eq.${r.id}&select=note,position,ingredients(name)&order=position`, asCaller(auth));
      const token = newToken();
      const photo_paths: string[] = [];
      for (const [i, p] of (r.photo_paths || []).slice(0, MAX_PHOTOS).entries()) {
        const to = `shares/${token}/${i + 1}.jpg`;
        await copyPhoto(p, to);
        photo_paths.push(to);
      }
      const recipe = {
        title: r.title, servings: r.servings, time_min: r.time_min, steps: r.steps || [], source_url: r.source_url, site: r.site, origin: r.origin,
        ingredients: ings.map((x: { note: string | null; ingredients: { name: string } | null }) => x.note || x.ingredients?.name).filter(Boolean),
      };
      await rest("recipe_shares", asService(), {
        method: "POST", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ token, household_id: r.household_id, recipe_id: r.id, shared_by: me.id, recipe, photo_paths }),
      });
      return json({ token });
    }

    if (body.action === "get") {
      if (!validToken(body.token)) return json({ error: "That share link looks incomplete." }, 400);
      const s = await getShare(body.token);
      if (!s) return json({ error: "That shared recipe isn't available anymore." }, 404);
      const [who] = await rest(`members?select=display_name&user_id=eq.${s.shared_by}&household_id=eq.${s.household_id}`, asService());
      const photos = (await Promise.all(s.photo_paths.map(signedUrl))).filter(Boolean);
      return json({ recipe: s.recipe, photos, shared_by: who?.display_name || null });
    }

    if (body.action === "photos") {
      if (!validToken(body.token) || !validId(body.recipe_id)) return json({ error: "Which recipe?" }, 400);
      const s = await getShare(body.token);
      if (!s) return json({ error: "That shared recipe isn't available anymore." }, 404);
      const [r] = await rest(`recipes?id=eq.${body.recipe_id}&select=id,household_id`, asCaller(auth));
      if (!r) return json({ error: "Save the recipe to your box first." }, 404);
      const photo_paths: string[] = [];
      for (const [i, p] of s.photo_paths.entries()) {
        const to = `${r.household_id}/${r.id}/${i + 1}.jpg`;
        await copyPhoto(p, to);
        photo_paths.push(to);
      }
      return json({ photo_paths });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't share that recipe. Try again." }, 500);
  }
});
