// Reads the public weekly Globus Kaiserslautern flyer with Claude.
//
//   POST {"action": "start", "week": "202645"}   download the flyer, upload it to the Files API,
//                                                 and queue one Message Batches request (half price)
//   POST {"action": "collect", "batch_id": "...", "file_id": "..."}
//                                                 return the items once the batch has ended, then
//                                                 delete the uploaded file
//
// Every call needs the "x-job-secret" header (private.job_secrets, name "flyer_jobs"), because
// each run spends API credit. Phase 2 test: results are returned, not saved yet.

import Anthropic, { toFile } from "npm:@anthropic-ai/sdk@0.122.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const MODEL = "claude-opus-5-5";
// Batch prices are half of the standard $4 / $20 per million tokens for this model.
const USD_PER_MTOK = { input: 2, output: 10 };
const USER_AGENT = "OurTable/0.1 (private household meal planner; one download per week)";

const anthropic = new Anthropic();
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const flyerUrl = (week: string) =>
  `https://www.globus.de/faltblatt_online/${week}/kla/ressources/pdfs/Faltblatt_KW${week.slice(4)}.pdf`;

const PROMPT = `This PDF is one week's sales flyer from the Globus hypermarket in Kaiserslautern, Germany.
List every product that has a price. Keep German names exactly as printed and add a short English name.
Give prices in euros as numbers. regular_price_eur is the crossed-out or "statt" price when one is shown.
unit_price_text is the printed base price such as "1 kg = 4.99", copied as written.
conditions covers things like "ab 2 Stück", "mit Globus-App" or "nur Fr+Sa". Use null when a field isn't printed.
Mark is_food true for food and drink, false for everything else (household, clothing, electronics...).`;

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["valid_from", "valid_to", "items"],
  properties: {
    valid_from: nullable("string"),
    valid_to: nullable("string"),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "name", "name_en", "brand", "size_text", "price_eur", "regular_price_eur",
          "unit_price_text", "conditions", "category", "is_food"],
        properties: {
          page: { type: "integer" },
          name: { type: "string" },
          name_en: { type: "string" },
          brand: nullable("string"),
          size_text: nullable("string"),
          price_eur: { type: "number" },
          regular_price_eur: nullable("number"),
          unit_price_text: nullable("string"),
          conditions: nullable("string"),
          category: {
            type: "string",
            enum: ["meat_fish", "dairy_eggs", "produce", "bakery", "pantry", "frozen", "drinks",
              "snacks_sweets", "household", "other"],
          },
          is_food: { type: "boolean" },
        },
      },
    },
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

async function start(week: string) {
  if (!/^\d{6}$/.test(week)) return json({ error: "week must look like 202645" }, 400);
  const url = flyerUrl(week);
  const pdf = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!pdf.ok) return json({ error: `Globus returned ${pdf.status}`, url }, 502);

  const file = await anthropic.files.upload({
    file: await toFile(pdf, `globus-kla-${week}.pdf`, { type: "application/pdf" }),
  });

  const batch = await anthropic.messages.batches.create({
    requests: [{
      custom_id: `globus-${week}`,
      params: {
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: file.id } },
            { type: "text", text: PROMPT },
          ],
        }],
      },
    }],
  });

  return json({ url, bytes: file.size_bytes, file_id: file.id, batch_id: batch.id });
}

async function collect(batchId: string, fileId: string) {
  const batch = await anthropic.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return json({ status: batch.processing_status });

  let out: Record<string, unknown> = { status: "ended" };
  for await (const r of await anthropic.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      out = { status: r.result.type, error: r.result.type === "errored" ? r.result.error : null };
      continue;
    }
    const msg = r.result.message;
    const text = msg.content.find((b) => b.type === "text");
    const usage = msg.usage;
    const cost = (usage.input_tokens * USD_PER_MTOK.input + usage.output_tokens * USD_PER_MTOK.output) / 1e6;
    out = {
      status: "succeeded",
      stop_reason: msg.stop_reason,
      usage,
      cost_usd: Math.round(cost * 1000) / 1000,
      flyer: text && msg.stop_reason === "end_turn" ? JSON.parse(text.text) : null,
    };
  }
  if (fileId) await anthropic.files.delete(fileId).catch(() => {});
  return json(out);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { data: allowed } = await db.rpc("check_job_secret", {
    p_name: "flyer_jobs",
    p_secret: req.headers.get("x-job-secret") ?? "",
  });
  if (allowed !== true) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "start") return await start(String(body.week ?? ""));
    if (body.action === "collect") return await collect(String(body.batch_id ?? ""), String(body.file_id ?? ""));
    return json({ error: "action must be start or collect" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
