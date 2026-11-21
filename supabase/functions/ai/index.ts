// The app's AI helper. Each call reads one thing with Claude, logs what it cost in ai_requests,
// and refuses once the household's monthly limit is reached.
//
//   POST {"kind": "text", "text": "...", "url": "optional link to the original"}
//   POST {"kind": "photo", "images": [{"media_type": "image/jpeg", "data": "<base64>"}, ...]}  (1-4)
//     200 {"title", "servings", "time_min", "ingredients": [...], "steps": [{"text"}], "unclear": [...],
//          "site", "source_url", "cost_usd"}
//   POST {"kind": "find", "query": "lemon caper fish"}
//     200 {"results": [{...recipe, "why"} | {"title", "url", "site", "why", "readable": false}], "cost_usd"}
//     Searches only the household's recipe sites, then reads each page with import-recipe.
//     422 {"error"} when it isn't a recipe; 429 {"error"} when the monthly limit is reached
//
// Only signed-in members of a household may call it. The Claude key never leaves this function.

import Anthropic from "npm:@anthropic-ai/sdk@0.122.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const API_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;            // publishable key
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // writes the usage log
const MODEL = "claude-sonnet-5-5";
// USD per million tokens [input, output], by the model that actually answered (a fallback may).
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-opus-4-8": [5, 25],
};
const MAX_TEXT = 40_000;
const MAX_IMAGE_B64 = 7_000_000; // about 5 MB per image; the app shrinks photos well below this

const anthropic = new Anthropic();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Direct calls to Supabase (supabase-js getUser fails with this project's publishable key).
const asCaller = (authorization: string) => ({ apikey: API_KEY, authorization });
const asService = () => SERVICE_KEY.startsWith("sb_") ? { apikey: SERVICE_KEY } : { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };

async function caller(authorization: string) {
  if (!authorization) return null;
  const me = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: asCaller(authorization) });
  if (!me.ok) return null;
  const user = await me.json();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/members?select=household_id,households(ai_monthly_limit,recipe_sites,foods_we_skip)&user_id=eq.${user.id}&limit=1`,
    { headers: asCaller(authorization) });
  const [m] = res.ok ? await res.json() : [];
  const hh = m?.households ?? {};
  return m
    ? { userId: user.id as string, householdId: m.household_id as string, limit: Number(hh.ai_monthly_limit ?? 10),
        sites: (hh.recipe_sites ?? []) as string[], skip: (hh.foods_we_skip ?? []) as string[] }
    : { userId: user.id, householdId: null, limit: 0, sites: [], skip: [] };
}

// Find: Claude searches the household's sites and names up to 8 well-reviewed recipe pages; each
// is then read by the import-recipe function (no AI), so results arrive with their ingredients and
// star rating. The best 5 are returned, best rated first. Cooking time isn't a factor.
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches
const CANDIDATES = 8, SHOWN = 5;

// Ranks by rating, trusting a rating more the more people gave it: 4.8 from 1,200 beats 5.0 from 3.
// Unrated recipes count as an ordinary 4 stars.
const score = (r: { rating?: number | null; rating_count?: number | null }) =>
  r.rating ? (r.rating * (r.rating_count ?? 1) + 4 * 25) / ((r.rating_count ?? 1) + 25) : 4;
type Found = { error?: string; status?: number; results?: Record<string, unknown>[]; cost?: number; model?: string; input?: number; output?: number };
async function find(authorization: string, who: { sites: string[]; skip: string[] }, query: string): Promise<Found> {
  let sites = who.sites.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!sites.length) return { error: "Add some recipe sites in Settings first.", status: 400 };
  const prompt = `Find up to ${CANDIDATES} recipes for a family's dinner that match: "${query}".
Search only the allowed recipe sites. Choose pages that are one recipe each, never roundups or collections ("40 easy dinners").
Quality matters most: prefer well-tested recipes with many good reviews or high ratings, and classic versions from trusted cooks.
Don't consider how long a recipe takes.${who.skip.length ? `\nThe family doesn't eat: ${who.skip.join(", ")}. Leave out recipes built around those.` : ""}
When done, reply with only one line per recipe, best first, in this form:
<page URL> | <why it fits, under 12 words>`;

  let msg: Anthropic.Beta.BetaMessage | null = null;
  let searches = 0, input = 0, output = 0, model = MODEL;
  for (let attempt = 0; attempt < 3 && !msg; attempt++) {
    try {
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
      for (let turn = 0; turn < 3; turn++) {
        const r = await anthropic.beta.messages.create({
          model: MODEL, max_tokens: 4000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
          output_config: { effort: "low" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, allowed_domains: sites }],
          messages,
        } as Anthropic.Beta.MessageCreateParamsNonStreaming);
        input += r.usage.input_tokens; output += r.usage.output_tokens; model = r.model;
        searches += (r.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
        if (r.stop_reason !== "pause_turn") { msg = r; break; }
        messages.push({ role: "assistant", content: r.content });    // long search: let it carry on
      }
    } catch (e) {
      // A site that blocks Anthropic's search makes the whole request fail; drop it and retry.
      const blocked = /not accessible to our user agent: \[([^\]]*)\]/.exec(String(e))?.[1];
      if (!blocked) throw e;
      const out = blocked.split(",").map((s) => s.replace(/['"\s]/g, ""));
      sites = sites.filter((s) => !out.includes(s));
      if (!sites.length) return { error: "None of your sites can be searched. Check Sites we like in Settings.", status: 400 };
    }
  }
  const [pin, pout] = PRICES[model] ?? [5, 25];
  const cost = (input * pin + output * pout) / 1e6 + searches * WEB_SEARCH_USD;
  if (!msg) return { error: "The search didn't finish. Try again.", status: 502, cost, model, input, output };
  if (msg.stop_reason === "refusal") return { error: "Claude couldn't search for that. Try other words.", status: 422, cost, model, input, output };

  // Titles from the search results, for pages the reader can't open.
  const titles = new Map<string, string>();
  for (const b of msg.content as Array<{ type: string; content?: unknown }>) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content as Array<{ url?: string; title?: string }>) if (r.url && r.title) titles.set(r.url, r.title);
    }
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const picks: { url: string; why: string }[] = [];
  for (const line of text.split("\n")) {
    const m = /(https?:\/\/[^\s|)\]>]+)[\s)\]>]*\|?\s*(.*)/.exec(line);
    if (!m) continue;
    let u: URL;
    try { u = new URL(m[1]); } catch { continue; }
    const host = u.hostname.replace(/^www\./, "");
    if (!sites.some((s) => host === s || host.endsWith("." + s))) continue;
    if (picks.some((p) => p.url === u.toString())) continue;
    picks.push({ url: u.toString(), why: m[2].replace(/^[-–—:\s]+/, "").trim() });
    if (picks.length === CANDIDATES) break;
  }

  const results: Array<Record<string, any>> = await Promise.all(picks.map(async (p) => {
    const site = new URL(p.url).hostname.replace(/^www\./, "");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
        method: "POST", headers: { ...asCaller(authorization), "content-type": "application/json" }, body: JSON.stringify({ url: p.url }),
      });
      const r = await res.json();
      if (res.ok && r.ingredients?.length) return { ...r, why: p.why, readable: true };
    } catch { /* fall through */ }
    return { title: titles.get(p.url) ?? site, url: p.url, site, why: p.why, readable: false };
  }));
  // Best rated first (a stable sort keeps Claude's order among equals); pages we couldn't read last.
  const readable = results.filter((r) => r.readable).sort((a, b) => score(b) - score(a));
  const unreadable = results.filter((r) => !r.readable);
  return { results: [...readable, ...unreadable].slice(0, SHOWN), cost, model, input, output };
}

async function spentThisMonth(authorization: string, householdId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_requests?select=cost_usd&household_id=eq.${householdId}&created_at=gte.${start.toISOString()}`,
    { headers: asCaller(authorization) });
  if (!res.ok) throw new Error(`Couldn't check this month's AI use (${res.status}).`);
  return (await res.json()).reduce((a: number, r: { cost_usd: number }) => a + Number(r.cost_usd), 0);
}

async function logUse(row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_requests`, {
    method: "POST", headers: { ...asService(), "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  if (!res.ok) console.error("ai: couldn't log usage", res.status, await res.text());
}

const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_recipe", "title", "servings", "time_min", "ingredients", "steps", "unclear"],
  properties: {
    is_recipe: { type: "boolean" },
    title: { type: "string" },
    servings: { anyOf: [{ type: "integer" }, { type: "null" }] },
    time_min: { anyOf: [{ type: "integer" }, { type: "null" }] },
    ingredients: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    unclear: { type: "array", items: { type: "string" } },
  },
};

const INSTRUCTIONS = `You are reading a recipe for a family's meal-planning app. Copy what is there; don't invent.
- title: the recipe's name, in sentence case.
- servings: how many it serves, if stated. time_min: total time in minutes, if stated.
- ingredients: one line each, with the amount and unit as written ("2 tbsp olive oil"). Use US spelling.
  If a section header like "For the sauce" appears, skip the header and keep its ingredients.
- steps: one instruction per item, in order, without step numbers. Skip tips, notes, ads, comments and nutrition.
- unclear: short notes for anything you had to guess or couldn't read, in plain words a cook would understand,
  e.g. 'The card says "1 can" of broth; read as 14 oz.' Leave empty when everything is clear.
- is_recipe: false if there is no recipe here (then leave the rest empty).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  const who = await caller(authorization);
  if (!who) return json({ error: "Sign in first." }, 401);
  if (!who.householdId) return json({ error: "Your account isn't part of a household." }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.kind === "find") {
    const query = String(body.query ?? "").trim().slice(0, 200);
    if (query.length < 3) return json({ error: "Type what sounds good first." }, 400);
    try {
      if (await spentThisMonth(authorization, who.householdId) >= who.limit) {
        return json({ error: `This month's AI limit of $${who.limit.toFixed(2)} is reached. It resets on the 1st; you can raise it in Settings.` }, 429);
      }
      const f = await find(authorization, who, query);
      if (f.cost != null) {
        await logUse({ household_id: who.householdId, user_id: who.userId, kind: "find", model: f.model,
          input_tokens: f.input, output_tokens: f.output, cost_usd: Math.round(f.cost * 10000) / 10000 });
      }
      if (f.error) return json({ error: f.error }, f.status ?? 400);
      if (!f.results?.length) return json({ error: "Nothing matched on your sites. Try different words." }, 422);
      return json({ results: f.results, cost_usd: Math.round((f.cost ?? 0) * 1000) / 1000 });
    } catch (e) {
      console.error("ai find:", e);
      return json({ error: "The search had a problem. Try again in a minute." }, 502);
    }
  }

  let content: Anthropic.Beta.BetaContentBlockParam[];
  let url: URL | null = null;
  if (body.kind === "text") {
    const text = String(body.text ?? "").trim();
    if (text.length < 20) return json({ error: "Paste the recipe text first." }, 400);
    if (body.url) { try { url = new URL(/^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`); } catch { /* ignore a bad link */ } }
    content = [{ type: "text", text: `${INSTRUCTIONS}\n\nThe recipe text, copied from a web page or document:\n<recipe>\n${text.slice(0, MAX_TEXT)}\n</recipe>` }];
  } else if (body.kind === "photo") {
    const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
    if (!images.length) return json({ error: "Choose a photo first." }, 400);
    if (images.some((i: { media_type?: string; data?: string }) => !/^image\/(jpeg|png|webp|gif)$/.test(i.media_type ?? "") || !i.data || i.data.length > MAX_IMAGE_B64)) {
      return json({ error: "That photo couldn't be used. Try a JPEG or PNG screenshot." }, 400);
    }
    content = [
      ...images.map((i: { media_type: string; data: string }) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.media_type as "image/jpeg", data: i.data } })),
      { type: "text", text: `${INSTRUCTIONS}\n\nThe recipe is in ${images.length > 1 ? "these screenshots or photos, in order" : "this screenshot or photo"} (a web page, cookbook page or handwritten card).` },
    ];
  } else {
    return json({ error: "Unknown request." }, 400);
  }

  try {
    if (await spentThisMonth(authorization, who.householdId) >= who.limit) {
      return json({ error: `This month's AI limit of $${who.limit.toFixed(2)} is reached. It resets on the 1st; you can raise it in Settings.` }, 429);
    }
    const msg = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: RECIPE_SCHEMA } },
      messages: [{ role: "user", content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    const [pin, pout] = PRICES[msg.model] ?? [5, 25];
    const cost = (msg.usage.input_tokens * pin + msg.usage.output_tokens * pout) / 1e6;
    await logUse({ household_id: who.householdId, user_id: who.userId, kind: body.kind, model: msg.model,
      input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens, cost_usd: Math.round(cost * 10000) / 10000 });

    if (msg.stop_reason === "refusal") return json({ error: "Claude couldn't read that one. Try typing it in." }, 422);
    if (msg.stop_reason === "max_tokens") return json({ error: "That recipe was too long to read in one go. Try pasting less." }, 422);
    const block = msg.content.find((b) => b.type === "text");
    const r = block && block.type === "text" ? JSON.parse(block.text) : null;
    if (!r?.is_recipe || !r.ingredients?.length) return json({ error: "We couldn't find a recipe there. Try another screenshot, or type it in." }, 422);
    return json({
      title: r.title, servings: r.servings, time_min: r.time_min, ingredients: r.ingredients,
      steps: r.steps.map((text: string) => ({ text })), unclear: r.unclear,
      site: url ? url.hostname.replace(/^www\./, "") : null, source_url: url ? url.toString() : null,
      cost_usd: Math.round(cost * 1000) / 1000,
    });
  } catch (e) {
    console.error("ai:", e);
    return json({ error: "The AI helper had a problem. Try again in a minute." }, 502);
  }
});
