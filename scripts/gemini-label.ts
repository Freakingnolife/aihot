// Second-opinion labels from Gemini for relevance calibration. Gemini judges each collected article the way
// the labelling page asks Marcus to; its labels go to .data/gemini-labels.json, never to gold-labels.json.
// `--queue` then writes .data/review-ids.json: articles where Gemini and the live pipeline disagree on
// featuring, plus a random sample of agreements, for Marcus to label blind (LABEL_QUEUE on the label page).
//   node --env-file=.env scripts/gemini-label.ts --probe   one request: confirms the model id and JSON mode
//   node --env-file=.env scripts/gemini-label.ts           labels every unlabelled article (resumable)
//   node --env-file=.env scripts/gemini-label.ts --queue
// Needs GEMINI_API_KEY (Google AI Studio, paid tier) in .env. Never print it.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, sql } from "@aihot/backend/db";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".data/gemini-labels.json");
const QUEUE = path.join(ROOT, ".data/review-ids.json");
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
// LABEL_ENDPOINT + LABEL_API_KEY switch to any OpenAI-compatible server, e.g. local oMLX Gemma.
const ENDPOINT = process.env.LABEL_ENDPOINT ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CONCURRENCY = Number(process.env.LABEL_CONCURRENCY ?? 4);
const AGREEMENT_SAMPLE = 20;

const SYSTEM = `You help calibrate the front page of an additive manufacturing (3D printing) news site.
Readers are professionals who use, buy or evaluate additive manufacturing at work: engineers, designers, service bureaus and buyers. Hobby and consumer-printer news matters only when it carries a professional consequence.
For the article given, decide what such a reader would want on the front page:
- "select": feature it; worth their attention.
- "reject": skip it; noise, marketing, or not relevant. Sales and discounts, consumer marketing, hobby entertainment without a professional lesson, non-AM products and navigation pages are always "reject". Professional AM events (conferences, trade shows, workshops, training) may be listed but are rarely worth featuring.
- "either": could reasonably go both ways.
Judge relevance only, not whether claims are true. Reply with a JSON object: {"decision": "select" | "reject" | "either", "reason": "<one short sentence>"}.`;

type Row = { id: string; title: string; source_name: string; published_at: Date | null; body_text: string | null };
type GLabel = { decision: "select" | "reject" | "either"; reason: string; model: string; usage: unknown; at: string };

const read = (): Record<string, GLabel> => (existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {});
function write(labels: Record<string, GLabel>) {
  writeFileSync(`${OUT}.tmp`, JSON.stringify(labels, null, 2) + "\n");
  renameSync(`${OUT}.tmp`, OUT);
}

async function ask(row: Row): Promise<GLabel> {
  const key = process.env.LABEL_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY (or LABEL_API_KEY) is not set in .env");
  const user = `Publisher: ${row.source_name}\nPublished: ${row.published_at?.toISOString().slice(0, 10) ?? "unknown"}\nTitle: ${row.title}\n\n${(row.body_text ?? "(no text captured)").replace(/\s+/g, " ").slice(0, 6000)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(90_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await new Promise((r) => setTimeout(r, attempt * 10_000)); continue; }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json() as { choices: { message: { content: string } }[]; usage?: unknown };
    const parsed = JSON.parse(body.choices[0]!.message.content.replace(/^```(json)?|```$/g, "").trim()) as { decision: string; reason: string };
    if (!["select", "reject", "either"].includes(parsed.decision)) throw new Error(`unexpected decision ${parsed.decision}`);
    return { decision: parsed.decision as GLabel["decision"], reason: String(parsed.reason ?? "").slice(0, 400), model: MODEL, usage: body.usage ?? null, at: new Date().toISOString() };
  }
}

const articles = () => sql<Row[]>`
  SELECT a.id, a.title, s.name AS source_name, a.published_at, a.body_text
  FROM articles a JOIN sources s ON s.id = a.source_id ORDER BY a.published_at DESC NULLS LAST, a.id`;

async function labelAll() {
  const labels = read();
  const todo = (await articles()).filter((r) => !labels[r.id]);
  console.log(`${todo.length} articles to label with ${MODEL}`);
  let next = 0, done = 0, failed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const row = todo[next++]!;
      try { labels[row.id] = await ask(row); write(labels); done++; }
      catch (e) { failed++; console.error(`${row.id}: ${String(e).slice(0, 300)}`); if (failed >= 5) throw new Error("five failures; stopping"); }
      if ((done + failed) % 25 === 0) console.log(`${done} labelled, ${failed} failed`);
    }
  }));
  console.log(`finished: ${done} labelled, ${failed} failed`);
}

/** Disagreements on featuring (pipeline featured vs Gemini select), plus a sample of agreements as a check. */
async function queue() {
  const labels = read();
  const pipeline = new Map((await sql<{ id: string; featured: boolean }[]>`
    SELECT a.id, coalesce(p.selected, false) AS featured FROM articles a LEFT JOIN publications p ON p.article_id = a.id`)
    .map((r) => [r.id, r.featured]));
  const disagree: string[] = [], agree: string[] = [];
  for (const [id, g] of Object.entries(labels)) {
    if (!pipeline.has(id) || g.decision === "either") continue;
    ((g.decision === "select") === pipeline.get(id) ? agree : disagree).push(id);
  }
  const sample = agree.sort(() => Math.random() - 0.5).slice(0, AGREEMENT_SAMPLE);
  writeFileSync(QUEUE, JSON.stringify([...disagree, ...sample], null, 2) + "\n");
  console.log(`${disagree.length} disagreements + ${sample.length} sampled agreements written to ${QUEUE} (${agree.length} agreed, ${Object.values(labels).filter((g) => g.decision === "either").length} either)`);
}

try {
  if (process.argv.includes("--probe")) {
    const [row] = await articles();
    console.log(JSON.stringify(await ask(row!), null, 2));
  } else if (process.argv.includes("--queue")) await queue();
  else await labelAll();
} finally {
  await closeDb();
}
