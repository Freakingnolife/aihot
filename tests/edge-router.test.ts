// The one-hostname router (scripts/combined-preview.ts): which service answers which path.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const stub = (name: string) => createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json", "x-answered-by": name });
  res.end(JSON.stringify({ by: name, url: req.url, method: req.method, host: req.headers.host, forwarded: req.headers["x-forwarded-for"] ?? null }));
});
const listen = (s: Server) => new Promise<number>((resolve) => s.listen(0, "127.0.0.1", () => resolve((s.address() as AddressInfo).port)));

const reader = stub("reader");
const landing = stub("landing");
let router: ChildProcess;
let base: string;

before(async () => {
  const [readerPort, landingPort] = [await listen(reader), await listen(landing)];
  const free = createServer();
  const port = await listen(free);
  await new Promise((resolve) => free.close(resolve));
  router = spawn(process.execPath, [fileURLToPath(new URL("../scripts/combined-preview.ts", import.meta.url))], {
    env: { PATH: process.env.PATH, NEWS: `http://127.0.0.1:${readerPort}`, LANDING: `http://127.0.0.1:${landingPort}`, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve) => router.stdout!.once("data", () => resolve()));
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  router.kill("SIGTERM");
  reader.closeAllConnections();
  landing.closeAllConnections();
  await Promise.all([new Promise((r) => reader.close(r)), new Promise((r) => landing.close(r))]);
});

const ask = async (path: string, init?: RequestInit) => (await fetch(base + path, init)).json() as Promise<{ by: string; url: string; method: string; host: string; forwarded: string | null }>;

test("the landing page answers /advisor (as its own root), /static and the waitlist form", async () => {
  assert.deepEqual(await ask("/advisor").then((r) => [r.by, r.url]), ["landing", "/"]);
  assert.deepEqual(await ask("/advisor/").then((r) => [r.by, r.url]), ["landing", "/"]);
  assert.deepEqual(await ask("/advisor?utm=x").then((r) => [r.by, r.url]), ["landing", "/?utm=x"]);
  assert.deepEqual(await ask("/static/styles.css?v=1").then((r) => [r.by, r.url]), ["landing", "/static/styles.css?v=1"]);
  const post = await ask("/api/early-access", { method: "POST", body: "{}" });
  assert.deepEqual([post.by, post.method], ["landing", "POST"]);
});

test("the reader answers everything else, including the single privacy notice at /privacy", async () => {
  for (const path of ["/", "/all", "/privacy", "/privacy?x=1", "/items/abc", "/advisors", "/api/health", "/api/img-proxy?u=x", "/sitemap.xml", "/robots.txt", "/assets/app.js"]) {
    assert.equal((await ask(path)).by, "reader", path);
  }
});

test("the visitor address header passes through untouched and the upstream sees its own host", async () => {
  const r = await ask("/all", { headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(r.forwarded, "203.0.113.9");
  assert.match(r.host, /^127\.0\.0\.1:\d+$/);
  assert.notEqual(r.host, new URL(base).host);
});
