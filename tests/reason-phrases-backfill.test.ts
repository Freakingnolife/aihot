// Key phrases of "Why it matters": the understanding step returns them and only valid ones are stored and
// published; the backfill adds them to stories featured before that, through the receipts, without changing
// anything else about the story. The provider is a local stub.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { applyPhrases, phraseCandidates, requestPhrases } from "@aihot/backend/editorial/reason-phrase-backfill";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { fetchItemsByIds, toFeedItemSummary } from "@aihot/backend/publication/items";
import { publishArticle } from "@aihot/backend/publication/publish";

for (const name of Object.keys(process.env)) if (/_MODEL$/.test(name) && name !== "LLM_MODEL" && name !== "EMBEDDING_MODEL") delete process.env[name];

const T = tag();
const SOURCE = `test-reason-phrases-${T}`;
const REASON = "The agreement illustrates a powder lifecycle model in which a manufacturer buys new powder and sends used material back to the same producer.";
let understandPhrases: unknown = ["powder lifecycle model", "made up words", "used material", "same producer"];
let backfillPhrases: unknown = ["same producer", "a paraphrased idea"];
let backfillHits = 0;
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> };
  const system = body.messages[0]!.role === "system" ? String(body.messages[0]!.content) : "";
  const user = String(body.messages.at(-1)!.content);
  const content =
    system.includes("You filter material for") ? { label: "PASS", reason: "test" }
    : system.includes("You score the attention value") ? { attentionScore: 80 }
    : system.includes("English AM editor") ? { itemType: "product_launch", authorRole: "principal", tags: ["Product update"], editorialJudgment: REASON, ...(understandPhrases === undefined ? {} : { keyPhrases: understandPhrases }), titleZh: "A headline", summaryZh: "A summary. Second sentence." }
    : system.includes("Extract structure from an AM article") ? { category: "applications", tags: ["Product update"], subjects: [], fact: null }
    : system.includes("You mark the key phrases") ? (backfillHits += 1, { keyPhrases: backfillPhrases })
    : user.includes("title_zh") ? "title_zh: Title\nsummary_zh: Summary."
    : null;
  if (content === null) throw new Error("unexpected request");
  return { id: `stub-${Math.random()}`, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { LLM_BASE_URL: `${provider.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", MODEL_CALLS_ENABLED: "true" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Test reason phrases', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

async function featured(label: string): Promise<string> {
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}/${label}`, title: `A product launch ${label} ${T}`, bodyText: `A company launched a product with pricing and availability. ${label} ${T} `.repeat(6),
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  } as never);
  const res = await analyzeArticle(articleId);
  assert.equal(res!.output!.selected, true);
  await publishArticle(articleId);
  return articleId;
}
const publication = async (id: string) =>
  (await sql<{ revision: number; reason: string; reason_phrases: string[]; title: string; summary: string; score: string; selected: boolean }[]>`
    SELECT revision, reason, reason_phrases, title, summary, score, selected FROM publications WHERE article_id = ${id}`)[0]!;

test("the understanding step's phrases are stored and published only when they are words of the sentence, at most two", async () => {
  const id = await featured("live");
  const p = await publication(id);
  assert.equal(p.reason, REASON);
  assert.deepEqual(p.reason_phrases, ["powder lifecycle model", "used material"]);
  const [analysis] = await sql<{ output: { reasonPhrases: string[] } }[]>`SELECT output FROM analyses WHERE article_id = ${id}`;
  assert.deepEqual(analysis!.output.reasonPhrases, ["powder lifecycle model", "used material"]);
  const item = toFeedItemSummary((await fetchItemsByIds([id])).get(id)!);
  assert.equal(item.reason, REASON);
  assert.deepEqual(item.reasonPhrases, ["powder lifecycle model", "used material"]);
});

test("an editor's rewrite of the sentence drops the model's phrases at publishing", async () => {
  const id = await featured("override");
  assert.deepEqual((await publication(id)).reason_phrases, ["powder lifecycle model", "used material"]);
  await sql`INSERT INTO editorial_overrides (article_id, fields) VALUES (${id}, ${sql.json({ reason: "An editor rewrote this sentence." } as never)})`;
  await publishArticle(id);
  const p = await publication(id);
  assert.equal(p.reason, "An editor rewrote this sentence.");
  assert.deepEqual(p.reason_phrases, []);
});

test("a story without phrases gets them from the backfill: a new revision, nothing else changed, repeats free", async () => {
  understandPhrases = undefined;
  const id = await featured("old");
  understandPhrases = ["powder lifecycle model", "used material"];
  const before = await publication(id);
  assert.deepEqual(before.reason_phrases, []);

  const candidate = (await phraseCandidates(7, 100)).find((c) => c.articleId === id);
  assert.ok(candidate, "listed as a candidate");
  assert.equal(candidate.reason, REASON);

  const { phrases, receiptId } = await requestPhrases(candidate);
  assert.deepEqual(phrases, ["same producer"], "the paraphrase is dropped");
  assert.equal((await applyPhrases(candidate, phrases, receiptId)).changed, true);

  const after = await publication(id);
  assert.deepEqual(after.reason_phrases, ["same producer"]);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual([after.reason, after.title, after.summary, after.score, after.selected], [before.reason, before.title, before.summary, before.score, before.selected]);
  assert.ok(!(await phraseCandidates(7, 100)).some((c) => c.articleId === id), "no longer a candidate");
  const [receipt] = await sql<{ status: string; purpose: string }[]>`SELECT status, purpose FROM receipts WHERE id = ${receiptId}`;
  assert.deepEqual(receipt, { status: "completed", purpose: "reason_phrases" });
});

test("answers with no valid phrase change nothing and a repeat request is answered from the receipt", async () => {
  understandPhrases = undefined;
  const id = await featured("none");
  understandPhrases = ["powder lifecycle model", "used material"];
  backfillPhrases = ["not in the sentence", "powder"];
  // Identical sentences share one receipt, so this story gets a sentence of its own.
  await sql`INSERT INTO editorial_overrides (article_id, fields) VALUES (${id}, ${sql.json({ reason: `Unique sentence ${T} about powder reuse loops.` } as never)})`;
  await publishArticle(id);
  const before = await publication(id);
  const candidate = (await phraseCandidates(7, 100)).find((c) => c.articleId === id)!;
  const hits = backfillHits;
  const first = await requestPhrases(candidate);
  assert.deepEqual(first.phrases, []);
  assert.equal((await applyPhrases(candidate, first.phrases, first.receiptId)).changed, false);
  assert.equal((await publication(id)).revision, before.revision);
  await requestPhrases(candidate);
  assert.equal(backfillHits, hits + 1, "the second request is not sent again");
});

test("listing candidates sends no request, and a story outside the last 7 days is not a candidate", async () => {
  understandPhrases = undefined;
  const id = await featured("stale");
  await sql`UPDATE publications SET timeline_at = now() - interval '9 days' WHERE article_id = ${id}`;
  const hits = backfillHits;
  assert.ok(!(await phraseCandidates(7, 100)).some((c) => c.articleId === id));
  assert.equal(backfillHits, hits);
});
