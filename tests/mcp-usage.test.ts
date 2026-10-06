// Aggregate counting of MCP tool calls: one event naming the tool and nothing else, never delaying or failing
// the tool's answer. The collector is a local stub; nothing leaves the machine.
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

const WEBSITE = "f1758942-c878-47b6-957c-82abe7e37791";
type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
let mode: "ok" | "hang" | "reset" = "ok";
const seen: Seen[] = [];
const sockets = new Set<import("node:net").Socket>();
const collector = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    seen.push({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() });
    if (mode === "hang") return;
    if (mode === "reset") return req.socket.destroy();
    res.end(JSON.stringify({ ok: true }));
  });
});
collector.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(collector.address() as AddressInfo).port}/api/send`;

// The server reads its counting settings when it loads.
process.env.ANALYTICS_MCP_WEBSITE_ID = WEBSITE;
process.env.ANALYTICS_URL = url;
const { createUsageCounter } = await import("../apps/api/src/usage.ts");
const { closeDb } = await import("@aihot/backend/db");
const { MCP_TOOL_NAMES: TOOL } = await import("@aihot/contracts/mcp");
const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
const Fastify = (await import("fastify")).default;
const { registerMcp } = await import("../apps/api/src/routes/mcp.ts");

const settle = () => new Promise((r) => setTimeout(r, 150));
const app = Fastify();
registerMcp(app);
let client: InstanceType<typeof Client>;
before(async () => {
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  client = new Client({ name: "usage-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`)));
});
after(async () => {
  await client.close().catch(() => {});
  await app.close();
  for (const s of sockets) s.destroy();
  collector.close();
  await closeDb();
});

test("a tool call sends one event with only the website, a fixed host, the tool path and the tool name", async () => {
  seen.length = 0;
  mode = "ok";
  await client.callTool({ name: TOOL.hot, arguments: { limit: 1 } });
  await settle();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.method, "POST");
  assert.deepEqual(JSON.parse(seen[0]!.body), { type: "event", payload: { website: WEBSITE, hostname: "mcp.additiveos.com", url: `/mcp/${TOOL.hot}`, name: TOOL.hot } });
  const names = Object.keys(seen[0]!.headers);
  for (const forbidden of ["x-forwarded-for", "x-real-ip", "forwarded", "cookie", "authorization", "origin", "referer", "mcp-session-id"]) assert.ok(!names.includes(forbidden), forbidden);
  assert.match(String(seen[0]!.headers["user-agent"]), /^Mozilla\/5\.0 \(X11; Linux x86_64\) AdditiveOS-MCP\/\d/);
});

test("the arguments of a call, search text included, never reach the collector", async () => {
  seen.length = 0;
  await client.callTool({ name: TOOL.search, arguments: { q: "very secret query text" } });
  await settle();
  assert.equal(seen.length, 1);
  assert.ok(!seen[0]!.body.includes("secret") && !JSON.stringify(seen[0]!.headers).includes("secret"));
  assert.deepEqual(Object.keys(JSON.parse(seen[0]!.body).payload).sort(), ["hostname", "name", "url", "website"]);
});

test("a collector that never answers does not delay the tool's answer", async () => {
  mode = "hang";
  seen.length = 0;
  const started = Date.now();
  const r = await client.callTool({ name: TOOL.hot, arguments: { limit: 1 } });
  assert.ok(!r.isError);
  assert.ok(Date.now() - started < 1500, `answered in ${Date.now() - started} ms`);
  await settle();
  assert.equal(seen.length, 1, "the event was still sent");
});

test("a collector that drops the connection does not fail the tool's answer", async () => {
  mode = "reset";
  const r = await client.callTool({ name: TOOL.hot, arguments: { limit: 1 } });
  assert.ok(!r.isError);
  assert.match((r.content as Array<{ text: string }>)[0]!.text, /trending now/);
});

test("the counter gives up after its timeout, swallows every failure and is silent when switched off", async () => {
  mode = "hang";
  await settle();
  seen.length = 0;
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  createUsageCounter({ websiteId: WEBSITE, url, timeoutMs: 100 })("t");
  createUsageCounter({ websiteId: WEBSITE, url: "http://127.0.0.1:1/closed", timeoutMs: 100 })("t");
  createUsageCounter({ websiteId: WEBSITE, url, fetch: (() => { throw new Error("boom"); }) as unknown as typeof fetch })("t");
  createUsageCounter({ websiteId: null, url })("t");
  await new Promise((r) => setTimeout(r, 400));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(seen.length, 1, "only the first reached the stub; a switched-off counter sends nothing");
  assert.deepEqual(unhandled, []);
});
