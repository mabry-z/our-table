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
//   POST {"kind": "ask", "ctx": "plan" | "recipes" | "recipe", "q": "...", "context": {...}, "prev": {last answer},
//         "asks": ["earlier asks"], "photo"?: {"media_type", "data"}}
//     200 one result card: {"kind": "week" | "found" | "recipe" | "changes" | "ideas" | "seen" | "none", "msg", ..., "cost_usd"}
//     The Ask bar (see ask() below).
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
- title: the recipe's name, in title case.
- servings: how many it serves, if stated. time_min: total time in minutes, if stated.
- ingredients: one line each, with the amount and unit as written ("2 tbsp olive oil"). Use US spelling.
  If a section header like "For the sauce" appears, skip the header and keep its ingredients.
- steps: one instruction per item, in order, without step numbers. Skip tips, notes, ads, comments and nutrition.
- unclear: short notes for anything you had to guess or couldn't read, in plain words a cook would understand,
  e.g. 'The card says "1 can" of broth; read as 14 oz.' Leave empty when everything is clear.
- is_recipe: false if there is no recipe here (then leave the rest empty).`;

// The Ask bar ---------------------------------------------------------------------------------
// One ask from the results sheet: the words, the screen it came from (with what's on it), the last
// answer and the earlier asks, so "milder" or "make Friday fish" builds on what's shown. The
// answer is always one card type. Opus plans, creates and changes; a search is handed to Find
// (Sonnet); a fridge photo is read by Sonnet.
const ASK_MODEL = "claude-opus-5-5";
const MAX_CONTEXT = 60_000; // characters of JSON for the screen's context and the last answer

const ASK_RECIPE = {
  type: "object", additionalProperties: false,
  required: ["title", "servings", "time_min", "ingredients", "steps", "luke_note"],
  properties: {
    title: { type: "string" },
    servings: { anyOf: [{ type: "integer" }, { type: "null" }] },
    time_min: { anyOf: [{ type: "integer" }, { type: "null" }] },
    ingredients: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
    luke_note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
};
const ASK_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "msg", "find_query", "find_day", "week", "changed_days", "recipes", "changes", "ideas", "items"],
  properties: {
    kind: { type: "string", enum: ["week", "find", "recipe", "changes", "ideas", "seen", "none"] },
    msg: { type: "string" },
    find_query: { anyOf: [{ type: "string" }, { type: "null" }] },
    find_day: { anyOf: [{ type: "integer" }, { type: "null" }] },
    week: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["day", "kind", "recipe_id", "title"],
      properties: {
        day: { type: "integer" },
        kind: { type: "string", enum: ["keep", "box", "new", "leftovers", "open"] },
        recipe_id: { anyOf: [{ type: "string" }, { type: "null" }] },
        title: { type: "string" },
      } } },
    changed_days: { type: "array", items: { type: "integer" } },
    recipes: { type: "array", items: ASK_RECIPE },
    changes: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["from", "to"],
      properties: { from: { anyOf: [{ type: "string" }, { type: "null" }] }, to: { anyOf: [{ type: "string" }, { type: "null" }] } } } },
    ideas: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["title", "uses", "need", "luke"],
      properties: { title: { type: "string" }, uses: { type: "integer" }, need: { type: "string" }, luke: { type: "boolean" } } } },
    items: { type: "array", items: { type: "string" } },
  },
};

const ASK_RULES = `You are the AI helper in a family's meal-planning app. You answer one ask at a time with one result card, never a chat reply.
The family: two adults and two kids. Adeline (10) eats what the adults eat. Luke (8) is a picky eater; his usual foods are listed in the context. A dinner is "Luke-friendly" when he can share it, e.g. fried chicken, or pasta with a plain portion set aside; say how in luke_note ("Plain pasta for Luke"), else null.
Each dinner makes the household's portions (in the context) so there are leftovers. Never use the foods the family skips.
Write everything in plain, warm, short sentences. Sentence case. No emoji. US units and spelling.
msg: one or two sentences saying what you did ("Three from your box and one new idea. Tuesday and Friday share the peppers."). If you couldn't do something, say so plainly and why.

Recipes you write (recipes[]): real, well-balanced home cooking that works the first time. title in title case. ingredients: one line each with amount and unit ("1 1/2 lb chicken thighs", "2 tbsp olive oil"), nothing for salt, pepper and water unless amounts matter. steps: one instruction each, in order, no numbers. If Luke needs his portion set aside, say so in the step where it happens. time_min: total time.

Leave every field that doesn't apply empty ([] or null).`;

const ASK_SCREENS: Record<string, string> = {
  plan: `The ask comes from the Plan screen. The context has the week's seven nights (1 = Monday) with what's on each, and the recipe box.
- To plan or re-plan the week, or change nights ("plan next week, light on pasta", "make Friday fish", "Thursday leftovers", "swap Tuesday"): kind "week". week[] has all seven nights:
  "keep" = leave the night as it is now (always for locked nights, and for nights the ask doesn't touch when changing an earlier proposal or a planned week),
  "box" = a recipe from the box (recipe_id from the box, title its title), "new" = a new idea you write (full recipe in recipes[], same title),
  "leftovers" = leftovers night, "open" = nothing.
  Fill open nights. Keep the same number of leftovers nights unless asked. Prefer recipes from the box, rated ones first, and vary proteins and cuisines; add at most two new ideas unless asked for more. Weeknight dinners (Mon-Thu) should fit the time limit. Sharing ingredients between nights is good; say so in msg.
  When the last answer was a week, start from it: change only what the new ask is about. changed_days lists the nights you changed this time.
- To find real recipes online ("find me a lemon caper fish dish for Thursday"), or when the ask is clearly a search: kind "find", find_query = a short search for the dish with the asked details ("lemon caper fish, under 30 minutes"), find_day = the night if named, else null.`,
  recipes: `The ask comes from the Recipes screen. The context lists the titles already in the recipe box.
- To make up a new recipe ("make something with pork, apples and potatoes", "a sheet-pan dinner with chicken and rice"): kind "recipe", one recipe in recipes[].
  When the last answer was a recipe and the ask adjusts it ("milder", "double it", "slow cooker"), return the whole revised recipe and list what changed in changes[] (from: the old line or null, to: the new line or null, or a short sentence like "Moved to the slow cooker, 6 hours on low").
- To find real recipes online ("find a crockpot chili Luke might eat", then "no dairy"): kind "find", find_query = a short search combining the earlier search with the new detail.
- When the last answer was the items seen in a fridge photo and the ask adds or removes items: kind "seen", items[] = the updated list.
- When asked for ideas from what's on hand (the context lists the items): kind "ideas", three ideas[] (uses = how many of the items it uses, need = what else to buy or "Nothing else to buy", luke = Luke-friendly).
- When asked to make one of those ideas: kind "recipe" with that recipe, built around the items on hand.`,
  recipe: `The ask comes from a recipe's page. The context has the recipe.
- To change it ("make it dairy-free", "no cilantro", "double it", "use ground turkey", "make it milder for Luke"): kind "changes". changes[] lists every change against the recipe in the context, including earlier asks in this sheet: from = the original ingredient or step (null for something added), to = what it becomes (null if it's left out). recipes[] = the whole revised recipe, with steps updated to match.
  When the last answer was changes, keep those and add the new ones.`,
};

const SEEN_SCHEMA = { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "string" } } } };

type Who = { userId: string; householdId: string; limit: number; sites: string[]; skip: string[] };
async function ask(authorization: string, who: Who, body: Record<string, any>) {
  const ctx = String(body.ctx ?? "");
  if (!ASK_SCREENS[ctx]) return json({ error: "Unknown screen." }, 400);
  const q = String(body.q ?? "").trim().slice(0, 500);
  const context = JSON.stringify(body.context ?? {});
  const prev = body.prev ? JSON.stringify(body.prev) : "";
  if (context.length + prev.length > MAX_CONTEXT) return json({ error: "That's too much to send in one ask. Start fresh and try again." }, 400);
  const asks = (Array.isArray(body.asks) ? body.asks : []).slice(-6).map((a: unknown) => String(a).slice(0, 300));
  const photo = body.photo as { media_type?: string; data?: string } | undefined;
  if (!q && !photo) return json({ error: "Type what you'd like first." }, 400);

  if (await spentThisMonth(authorization, who.householdId) >= who.limit) {
    return json({ error: `This month's AI limit of $${who.limit.toFixed(2)} is reached. It resets on the 1st; you can raise it in Settings.` }, 429);
  }
  const log = (kind: string, m: { model: string; usage: { input_tokens: number; output_tokens: number } }) => {
    const [pin, pout] = PRICES[m.model] ?? [5, 25];
    const cost = (m.usage.input_tokens * pin + m.usage.output_tokens * pout) / 1e6;
    return logUse({ household_id: who.householdId, user_id: who.userId, kind, model: m.model,
      input_tokens: m.usage.input_tokens, output_tokens: m.usage.output_tokens, cost_usd: Math.round(cost * 10000) / 10000 }).then(() => cost);
  };
  const create = (model: string, effort: string, schema: unknown, system: string | undefined, content: Anthropic.Beta.BetaContentBlockParam[], max = 16000) =>
    anthropic.beta.messages.create({
      model, max_tokens: max, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema } },
      ...(system ? { system } : {}), messages: [{ role: "user", content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
  const parsed = (m: Anthropic.Beta.BetaMessage) => {
    const b = m.content.find((x) => x.type === "text");
    return b && b.type === "text" ? JSON.parse(b.text) : null;
  };

  // A fridge or pantry photo: list what's in it. The photo isn't kept.
  if (photo) {
    if (!/^image\/(jpeg|png|webp)$/.test(photo.media_type ?? "") || !photo.data || photo.data.length > MAX_IMAGE_B64) {
      return json({ error: "That photo couldn't be used. Try another." }, 400);
    }
    const m = await create(MODEL, "low", SEEN_SCHEMA, undefined, [
      { type: "image", source: { type: "base64", media_type: photo.media_type as "image/jpeg", data: photo.data } },
      { type: "text", text: `List the foods you can see in this fridge, pantry or counter photo that could go into a dinner: one short name each, with a count or amount in parentheses when it's clear ("Bell peppers (3)", "Half an onion"). Leave out condiments and drinks unless they're a main ingredient. Sentence case.${q ? `\nThe family adds: "${q}"` : ""}` },
    ], 2000);
    const cost = await log("fridge", m);
    const r = parsed(m);
    if (m.stop_reason === "refusal" || !r?.items?.length) return json({ error: "We couldn't make out any food in that photo. Try another, or type what you have." }, 422);
    return json({ kind: "seen", msg: "Here's what I can see. Tap anything that's wrong or used up, or tell me what I missed.", items: r.items, cost_usd: Math.round(cost * 1000) / 1000 });
  }

  const skip = who.skip.length ? who.skip.join(", ") : "none";
  const text = `${ASK_SCREENS[ctx]}

Foods the family skips: ${skip}.
The screen's context:
<context>${context}</context>
${prev ? `The answer showing now (the last ask's result):\n<last_answer>${prev}</last_answer>\n` : ""}${asks.length ? `Earlier asks in this sheet, oldest first:\n${asks.map((a: string) => `- ${a}`).join("\n")}\n` : ""}
The ask: "${q}"`;
  const kindOf = (k: string) => (ctx === "plan" ? "plan" : ctx === "recipe" ? "tweak" : k === "ideas" ? "ideas" : "create");
  const m = await create(ASK_MODEL, "medium", ASK_SCHEMA, ASK_RULES, [{ type: "text", text }]);
  const r = parsed(m);
  let cost = await log(kindOf(r?.kind ?? ""), m);
  if (m.stop_reason === "refusal") return json({ error: "Claude couldn't help with that one. Try other words." }, 422);
  if (m.stop_reason === "max_tokens" || !r) return json({ error: "That answer ran too long. Try asking for less at once." }, 422);

  if (r.kind === "find") {
    const f = await find(authorization, who, String(r.find_query || q).slice(0, 200));
    if (f.cost != null) {
      await logUse({ household_id: who.householdId, user_id: who.userId, kind: "find", model: f.model,
        input_tokens: f.input, output_tokens: f.output, cost_usd: Math.round(f.cost * 10000) / 10000 });
      cost += f.cost;
    }
    if (f.error) return json({ error: f.error }, f.status ?? 400);
    if (!f.results?.length) return json({ error: "Nothing matched on your sites. Try different words." }, 422);
    return json({ kind: "found", msg: r.msg, query: r.find_query, day: r.find_day, results: f.results, cost_usd: Math.round(cost * 1000) / 1000 });
  }
  return json({ ...r, cost_usd: Math.round(cost * 1000) / 1000 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  const who = await caller(authorization);
  if (!who) return json({ error: "Sign in first." }, 401);
  if (!who.householdId) return json({ error: "Your account isn't part of a household." }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.kind === "ask") {
    try { return await ask(authorization, who as Who, body); } catch (e) {
      console.error("ai ask:", e);
      return json({ error: "The AI helper had a problem. Try again in a minute." }, 502);
    }
  }

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
