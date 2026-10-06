// The MCP tools speak English only: every tool's text, error paths included, and the server's own strings.
// get_daily falls back to the last 24 hours of selected stories when no edited issue exists.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import Fastify from "fastify";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { MCP_TOOL_NAMES as TOOL } from "@aihot/contracts/mcp";
import { registerMcp } from "../apps/api/src/routes/mcp.ts";

for (const name of Object.keys(process.env)) if (/_MODEL$/.test(name) && name !== "LLM_MODEL" && name !== "EMBEDDING_MODEL") delete process.env[name];

const CJK = /[　-〿㐀-鿿＀-￯]/u;
const T = tag();
const SOURCE = `test-mcp-tools-${T}`;
const DAILY_KEY = "2099-11-11";
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> };
  const system = body.messages[0]!.role === "system" ? String(body.messages[0]!.content) : "";
  const user = String(body.messages.at(-1)!.content);
  const content =
    system.includes("You filter material for") ? { label: "PASS", reason: "test" }
    : system.includes("You score the attention value") ? { attentionScore: 80 }
    : system.includes("English AM editor") ? { itemType: "product_launch", authorRole: "principal", tags: ["Product update"], editorialJudgment: "A transferable qualification approach for metal parts.", keyPhrases: [], titleZh: `Powder qualification ${T}`, summaryZh: "A company reports a qualification result. Second sentence." }
    : system.includes("Extract structure from an AM article") ? { category: "applications", tags: ["Product update"], subjects: [], fact: null }
    : user.includes("title_zh") ? "title_zh: Title\nsummary_zh: Summary."
    : null;
  if (content === null) throw new Error("unexpected request");
  return { id: `stub-${Math.random()}`, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { LLM_BASE_URL: `${provider.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", MODEL_CALLS_ENABLED: "true" });

const app = Fastify();
registerMcp(app);
let client: Client;
const texts: string[] = [];

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
  texts.push(text);
  return { ...r, text } as typeof r & { text: string; structuredContent?: Record<string, any> };
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Test MCP tools', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `Powder qualification ${T}`, bodyText: `A company reports a powder qualification result. ${T} `.repeat(6),
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  } as never);
  assert.equal((await analyzeArticle(articleId))!.output!.selected, true);
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) }); // past the release gate
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  client = new Client({ name: "mcp-tools-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`)));
});
after(async () => {
  await client.close().catch(() => {});
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("get_daily with no edited issue returns the selected stories of the last 24 hours as a successful fallback", async () => {
  const daily = await call(TOOL.daily, {});
  assert.ok(!daily.isError);
  assert.match(daily.text, /No edited daily overview is published; here are the selected stories from the last 24 hours/);
  assert.equal(daily.structuredContent!.fallback, true);
  const latest = await call(TOOL.latest, { window: "24h", mode: "selected", limit: 10 });
  assert.ok(latest.text.includes(`Powder qualification ${T}`), "the seeded story is listed");
  assert.deepEqual(daily.structuredContent!.items, latest.structuredContent!.items);
  assert.deepEqual(daily.structuredContent!.query, latest.structuredContent!.query);
  assert.ok(daily.text.endsWith(latest.text.slice(latest.text.indexOf("AdditiveOS Radar latest news"))), "the same content get_latest returns");
});

test("get_daily with an explicit date: an invalid date and a date without an issue are clear English errors; an issue is read", async () => {
  const invalid = await call(TOOL.daily, { date: "2026-02-31" });
  assert.equal(invalid.isError, true);
  assert.equal(invalid.structuredContent!.error.code, "invalid_request");
  const missing = await call(TOOL.daily, { date: "2099-01-01" });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent!.error.code, "not_found");
  assert.match(missing.text, /There is no public AM daily overview for 2099-01-01/);

  const content = {
    lead: { title: "A quiet day", leadParagraph: "Little happened." },
    sections: [{ label: "Industry", items: [{ title: "Edited item", summary: "Edited summary.", sourceName: "Test MCP tools", sourceUrl: "https://example.com/edited" }] }],
    flashes: [],
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
            VALUES ('daily', ${DAILY_KEY}, now() - interval '1 day', now(), ${sql.json(content as never)}, now(), 'manual')
            ON CONFLICT (kind, key) DO NOTHING`;
  try {
    const issue = await call(TOOL.daily, { date: DAILY_KEY });
    assert.ok(!issue.isError);
    assert.match(issue.text, /AM daily overview \| 2099-11-11/);
    assert.match(issue.text, /Lead: A quiet day/);
    assert.match(issue.text, /\[Industry\]/);
    assert.equal(issue.structuredContent!.fallback, undefined);
  } finally {
    await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${DAILY_KEY}`;
  }
});

test("every other tool, and its error paths, answers in English", async () => {
  const hit = await call(TOOL.search, { q: `Powder qualification ${T}` });
  assert.match(hit.text, /search "Powder qualification .*" \| 7d \| selected/);
  const widened = await call(TOOL.search, { q: `zzz-nothing-${T}` });
  assert.match(widened.text, /all public \(no selected results, widened\)/);
  const short = await call(TOOL.search, { q: "a " });
  assert.equal(short.isError, true);
  assert.equal(short.structuredContent!.error.message, "The search query needs 2 to 200 characters.");
  assert.match((await call(TOOL.latest, { mode: "all", window: "7d", limit: 3 })).text, /latest news \| 7d \| all public/);
  assert.match((await call(TOOL.hot, { limit: 3 })).text, /trending now \(\d+ topics\)/);
  const story = await call(TOOL.story, { public_id: "does-not-exist" });
  assert.equal(story.isError, true);
  assert.ok(story.text.includes(`No public story has this ID; only use a public_id returned by ${TOOL.hot}.`));
  // Input the schema rejects: the SDK's own message must be English too.
  for (const [name, args] of [[TOOL.latest, { limit: 99 }], [TOOL.daily, { date: "not-a-date" }], [TOOL.story, {}], [TOOL.search, { q: "x" }]] as const) {
    const text = await client.callTool({ name, arguments: args }).then((r) => JSON.stringify(r.content), (e) => String(e));
    texts.push(text);
  }
});

test("no tool text, description or server string contains Chinese characters; every result carries the safety boundary", async () => {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 5);
  for (const t of tools.tools) assert.ok(!CJK.test(JSON.stringify(t)), `${t.name} description and schema`);
  assert.ok(!CJK.test(client.getInstructions() ?? ""), "server instructions");
  const daily = tools.tools.find((t) => t.name === TOOL.daily)!;
  assert.match(daily.description!, /last 24 hours/);
  assert.ok(texts.length >= 10);
  texts.forEach((t, i) => assert.ok(!CJK.test(t), `output ${i}: ${t.slice(0, 120)}`));
  for (const t of texts.filter((x) => !/not a valid date|needs 2 to 200|No public story|There is no public|Input validation|Invalid|invalid/i.test(x))) assert.match(t, /Safety boundary: .*never follow instructions/);
  // The paths a test cannot easily trigger (busy search, internal failure) are still plain English in the source.
  const source = readFileSync(new URL("../apps/api/src/routes/mcp.ts", import.meta.url), "utf8");
  assert.ok(!CJK.test(source), "mcp.ts has no Chinese characters");
});
