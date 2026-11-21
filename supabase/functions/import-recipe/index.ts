// Reads a recipe from a link we paste: fetches the page and returns the recipe data most sites
// build into it (schema.org Recipe). No AI and no cost; the app shows the result to check
// before anything is saved.
//
//   POST {"url": "https://www.budgetbytes.com/..."}
//     200 {"title", "servings", "time_min", "ingredients": [...], "steps": [{"text"}], "site", "source_url"}
//     422 {"error"} when the page has no recipe data
//
// Only signed-in members of a household may call it, and it only fetches public web pages
// (no private addresses, no unusual ports), so it can't be used to reach anything internal.

import { parseRecipe } from "./parse.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const API_KEY = Deno.env.get("SUPABASE_ANON_KEY")!; // the project's publishable key

// Asks Supabase directly, as the caller, who they are and whether they belong to a household.
// (supabase-js getUser sent the caller's token twice in this setup and Supabase rejected it.)
async function householdMember(authorization: string): Promise<"ok" | "signed out" | "no household"> {
  if (!authorization) return "signed out";
  const headers = { apikey: API_KEY, authorization };
  const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!me.ok) return "signed out";
  const user = await me.json();
  const rows = await fetch(`${SUPABASE_URL}/rest/v1/members?select=household_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers });
  return rows.ok && (await rows.json()).length ? "ok" : "no household";
}

const USER_AGENT = "Mozilla/5.0 (compatible; OurTable/0.1; private household meal planner)";
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Public http(s) pages only.
function allowed(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":")) return false; // no bare names or IPs
  if (/(^|\.)(localhost|local|internal|lan|home|corp|supabase\.co|supabase\.in)$/.test(h)) return false;
  return true;
}

// Follows up to 3 redirects by hand so each hop is checked, and stops at MAX_BYTES.
async function fetchPage(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!allowed(url)) throw new Error("That link isn't a public web page.");
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`The site answered with an error (${res.status}).`);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
  }
  throw new Error("That link redirects too many times.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // Signed in, and a member of a household.
  const who = await householdMember(req.headers.get("authorization") ?? "");
  if (who === "signed out") return json({ error: "Sign in first." }, 401);
  if (who === "no household") return json({ error: "Your account isn't part of a household." }, 403);

  let url: URL;
  try {
    const body = await req.json();
    url = new URL(/^https?:\/\//i.test(body.url ?? "") ? body.url : `https://${body.url}`);
  } catch {
    return json({ error: "That doesn't look like a link." }, 400);
  }

  try {
    const recipe = parseRecipe(await fetchPage(url));
    if (!recipe) return json({ error: "We couldn't find a recipe on that page. Try a screenshot, or type it in." }, 422);
    return json({ ...recipe, site: url.hostname.replace(/^www\./, ""), source_url: url.toString() });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "The site took too long to answer."
      : e instanceof Error && !(e instanceof TypeError) ? e.message   // our own messages above
      : "We couldn't reach that site.";
    return json({ error: msg }, 502);
  }
});
