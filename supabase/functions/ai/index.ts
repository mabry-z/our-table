// The app's AI helper. Each call reads one thing with Claude, logs what it cost in ai_requests,
// and refuses once the household's monthly limit is reached.
//
//   POST {"kind": "text", "text": "...", "url": "optional link to the original"}
//   POST {"kind": "photo", "images": [{"media_type": "image/jpeg", "data": "<base64>"}, ...]}  (1-4)
//     200 {"title", "servings", "time_min", "ingredients": [...], "steps": [{"text"}], "unclear": [...],
//          "site", "source_url", "cost_usd"}
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/members?select=household_id,households(ai_monthly_limit)&user_id=eq.${user.id}&limit=1`,
    { headers: asCaller(authorization) });
  const [m] = res.ok ? await res.json() : [];
  return m ? { userId: user.id as string, householdId: m.household_id as string, limit: Number(m.households?.ai_monthly_limit ?? 10) } : { userId: user.id, householdId: null, limit: 0 };
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
