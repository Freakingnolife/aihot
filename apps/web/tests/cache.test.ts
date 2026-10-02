// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { releaseBoundCache } from "../app/lib/api.server.ts";

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
let populatedHot = false;
const apiCookies: Array<string | undefined> = [];
const imported = new Date().toISOString();
const unknownDraft = {id:"unknown-draft",revision:1,title:"Unknown original date",originalTitle:null,summary:"Publisher describes a component.",reason:null,source:{id:"fixture",name:"Fixture publisher",kind:"rss",firstParty:true},links:{original:"https://example.invalid/original",aihot:"/items/unknown-draft"},publishedAt:null,discoveredAt:imported,timelineAt:imported,backfill:true,category:"products",tags:[],score:49,selected:false,channel:"news",story:null,x:null,readingMode:"summary-only",author:null,language:"en",body:null,outline:[],relatedStories:[],hasTranslation:false,bodyLanguage:"original",markdownAvailable:false,indexable:false,media:[]};
const datedDraft={...unknownDraft,id:"dated-draft",title:"Dated draft",publishedAt:"2026-06-09T00:00:00Z",timelineAt:"2026-06-09T00:00:00Z"};
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") {
    const respond = () => res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
    return metaDelayMs ? setTimeout(respond, metaDelayMs) : respond();
  }
  if (url.pathname === "/api/site/timeline") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: null, topic: null };
    res.setHeader("X-Accel-Expires", `@${deadline}`);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.end(JSON.stringify({ filters, cards: [], nextCursor: null, refreshAt, dayCounts: [], hot: null, generatedAt: "2026-09-28T00:00:00Z" }));
  }
  if (url.pathname === "/api/health") return res.end(JSON.stringify({ok:true}));
  if (url.pathname === "/api/site/pool") {
    const mode=url.searchParams.get("mode");
    const filters={channel:url.searchParams.get("channel")??"all",category:url.searchParams.get("category"),tag:url.searchParams.get("tag"),q:url.searchParams.get("q"),tab:url.searchParams.get("tab")??"time",mode};
    return res.end(JSON.stringify({filters,items:filters.tag==="dates" ? [datedDraft,unknownDraft] : [],total:45,page:Number(url.searchParams.get("page")??1),pageCount:2,todayCount:0,freshness:"2026-09-30T00:00:00Z",generatedAt:"2026-09-30T00:00:00Z"}));
  }
  if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ windowHours:48, computedAt:null, entries: populatedHot ? ["unknown","new","flat","up","down"].map((trend,i)=>({rank:i+1,story:{publicId:`story-${i}`,title:`Manufacturing story ${i}`},heat:10,trend,trendPct:trend==="new"?null:10,badges:[],participantCount:1,sourceCount:1,signalCount:0,reportCount:1,sourceNames:["Fixture publisher"],latestAt:imported,firstReportAt:imported,representative:null,participants:[{kind:"editorial",name:"Fixture publisher",iconUrl:null}],spark:[1,2,3],summary:"Attributed report",latest:null,cover:null})) : [] }));
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (url.pathname === "/api/site/items/dated-draft") return res.end(JSON.stringify(datedDraft));
  if (url.pathname === "/api/site/items/unknown-draft") return res.end(JSON.stringify(unknownDraft));
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (url.pathname === "/api/site/contact") return res.end(JSON.stringify({ wechatQr: "/qr.png", feishuQr: "/qr.png" }));
  if (url.pathname === "/api/site/stories/merged") {
    res.statusCode = 308;
    return res.end(JSON.stringify({ mergedInto: "surviving-story" }));
  }
  res.statusCode = url.pathname.startsWith("/api/admin/") ? 401 : 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  deadline = Math.floor(Date.now() / 1000) + 20;
  refreshAt = new Date((deadline + 5) * 1000).toISOString();
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

test("pool route subsets share navigation data and preserve period/category filters", async () => {
  const answers=await Promise.all(["", "?_routes=root", "?_routes=routes%2Fall", "?_routes=unknown"].map(async query=>{
    const res=await fetch(`${origin}/all.data${query}`);assert.equal(res.status,200);assert.match(res.headers.get("Cache-Control")!,/^public,/);
    const body=await res.text();assert.ok(body.includes("root")&&body.includes("routes/all"));return body;
  }));
  assert.ok(answers.every(body=>body===answers[0]));
  const res=await fetch(`${origin}/all.data?mode=archive&category=products&_routes=root`);
  const body=await res.text();assert.ok(body.includes("archive")&&body.includes("products"));assert.notEqual(body,answers[0]);
});

test("HTML and navigation share freshness; cookies do not personalize public results", async () => {
  const html = await fetch(`${origin}/all`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get("Cache-Control")!, /^public,/);
  assert.match(await html.text(), /Latest news/);
  const plain = await fetch(`${origin}/about.data`);
  const signedIn = await fetch(`${origin}/about.data?_routes=root`, { headers: { cookie: "admin_session=private; aihot_vid=reader" } });
  assert.match(plain.headers.get("Cache-Control")!, /^public,/);
  assert.match(plain.headers.get("X-Accel-Expires")!, /^@\d+$/);
  assert.equal(plain.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  assert.equal(Date.parse(plain.headers.get("Date")!) / 1000 + 300, Number(plain.headers.get("X-Accel-Expires")!.slice(1)));
  assert.equal(signedIn.headers.get("Set-Cookie"), null);
  assert.equal(await signedIn.text(), await plain.text());
  assert.ok(apiCookies.every((cookie) => !cookie));
});

test("missing routes cannot be hidden by a root-only request; errors and redirects stay uncached", async () => {
  for (const pathname of ["/items/missing.data?_routes=root", "/does-not-exist.data?_routes=root", "/items/missing"]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 404, pathname);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.equal(res.headers.get("X-Accel-Expires"), "0");
    await res.text();
  }
  for (const [pathname, target] of [["/story/merged.data?_routes=root", "/story/surviving-story"], ["/_.data?q=search&_routes=root", "/all?q=search"]]) {
    const res = await fetch(origin + pathname);
    assert.equal(res.status, 202);
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(await res.text(), new RegExp(target.replace("?", "\\?")));
  }
});

test("admin data and actions never become public cache entries", async () => {
  const admin = await fetch(`${origin}/admin/sources.data?_routes=admin-layout`);
  assert.equal(admin.status, 202);
  assert.equal(admin.headers.get("Cache-Control"), "private, no-store");
  assert.equal(admin.headers.get("X-Accel-Expires"), "0");
  assert.match(await admin.text(), /admin\/login/);
  const action = await fetch(`${origin}/hot.data`, { method: "POST" });
  assert.equal(action.status, 405);
  assert.equal(action.headers.get("Cache-Control"), "private, no-store");
  assert.equal(action.headers.get("X-Accel-Expires"), "0");
  await action.text();
});

test("an elapsed release deadline cannot be extended by a fresh page/data response", async () => {
  const elapsed=releaseBoundCache(new Date(Date.now()-1000).toISOString(),60);
  assert.equal(elapsed["Cache-Control"],"no-cache");
  assert.equal(elapsed["X-Accel-Expires"],"0");
  const now = Date.parse("2026-09-28T00:00:00Z");
  const upstream = new Headers({ "X-Accel-Expires": `@${now / 1000 + 7}` });
  const headers = releaseBoundCache(new Date(now + 20_000).toISOString(), 30, now + 2_000, upstream);
  assert.equal(headers["Cache-Control"], "public, max-age=0, s-maxage=5");
  assert.equal(headers["X-Accel-Expires"], upstream.get("X-Accel-Expires"));
});

test("root redirect stays uncached even with a slow sibling metadata loader", async () => {
  metaDelayMs=100;
  try {
    for(const path of ["/", "/_.data?_routes=routes%2Fhome"]) {
      const res=await fetch(origin+path,{redirect:"manual"});
      assert.ok([302,202].includes(res.status));assert.equal(res.headers.get("Cache-Control"),"private, no-store");assert.equal(res.headers.get("X-Accel-Expires"),"0");
      await res.text();
    }
  } finally {metaDelayMs=0;}
});

test("the edge may keep a page longer than browsers, which a withdrawal purge cannot reach", async () => {
  const res = await fetch(`${origin}/items/long-lived.data`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=300, s-maxage=600, must-revalidate");
  await res.text();
});

test("browser caching preserves noindex and private sign-in responses", async () => {
  const feedback = await fetch(origin + "/feedback");
  assert.equal(feedback.status, 200);
  assert.match(await feedback.text(), /name="robots" content="noindex/);
  assert.equal(feedback.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300, must-revalidate");
  const login = await fetch(origin + "/admin/login");
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("Cache-Control"), "private, no-store");
  assert.equal(login.headers.get("X-Robots-Tag"), "noindex, nofollow");
  await login.text();
});

test("a visitor cannot name its own address to the api without a trusted proxy in front", async () => {
  const res = await fetch(`${origin}/api/site/echo-client`, { headers: { "X-Forwarded-For": "6.6.6.6", "X-Real-IP": "6.6.6.6" } });
  assert.deepEqual(await res.json(), { forwarded: "127.0.0.1", real: "127.0.0.1" });
});

test('root redirects to the draft pool with filters and never caches the redirect', async () => {
  const res = await fetch(`${origin}/?category=products&tag=metal&mode=archive&page=2`, {redirect:'manual'});
  assert.equal(res.status,302);
  assert.equal(res.headers.get('location'),'/all?category=products&tag=metal&mode=archive&page=2');
  assert.equal(res.headers.get('cache-control'),'private, no-store');
});

test('reader manuals, notices and shared controls render in English', async () => {
  for(const path of ['/agent','/agent?tab=rss','/agent?tab=api','/feedback','/terms','/privacy']) {
    const response=await fetch(origin+path);assert.equal(response.status,200,path);
    const html=await response.text();
    const reader=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    assert.doesNotMatch(reader,/[\u4e00-\u9fff]/u,path);
    if(path.startsWith('/agent')) {assert.match(reader,/manual collection/i);assert.doesNotMatch(reader,/08:00/);}
    if(path==='/terms'||path==='/privacy') assert.match(reader,/unapproved/i);
  }
});

test('pool forms and pagination preserve archive, category, tag and search ordering', async () => {
  const res=await fetch(origin+'/all?mode=archive&category=products&tag=metal&q=part&tab=relevance');
  const html=await res.text();assert.equal(res.status,200);
  for(const [name,value] of [['mode','archive'],['tag','metal'],['category','products'],['tab','relevance']]) assert.match(html,new RegExp(`name="${name}" value="${value}"`));
  assert.match(html,/mode=archive&amp;category=products&amp;tag=metal&amp;q=part&amp;tab=relevance&amp;page=2/);
  assert.match(html,/aria-current="page"[^>]*>.*?Archive/s);
  assert.doesNotMatch(html,/>Selected<|Imported today/);
});

test('archive unknown-date group and detail never turn discovery time into publication age', async () => {
  const archive=await fetch(origin+'/all?mode=archive&tag=dates');const html=await archive.text();assert.equal(archive.status,200);
  assert.match(html,/Unknown publication date/);assert.ok(html.indexOf('data-item-id="dated-draft"')<html.indexOf('Unknown publication date'));
  assert.doesNotMatch(html,/Discovered today/);
  const detail=await fetch(origin+'/items/unknown-draft');const text=await detail.text();assert.equal(detail.status,200);
  assert.match(text,/Original date unknown/);assert.doesNotMatch(text,/Historical import|Relevance score/);assert.match(text,/discovered/);
  assert.doesNotMatch(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),/Just now|\d+ min ago|\d+ hours ago/);
});

test('calendar-only publication metadata does not invent an original publication hour', async()=>{
  for(const path of ['/all?mode=archive&tag=dates','/items/dated-draft']) {
    const res=await fetch(origin+path);assert.equal(res.status,200);
    const html=(await res.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    assert.match(html,/2026-06-09/);assert.doesNotMatch(html,/2026-06-09 08:00|>08:00</);
  }
});

test('desktop and mobile period navigation keep pool filters and reset pagination',async()=>{
  for(const mode of ['recent','archive']) {
    const res=await fetch(origin+`/all?mode=${mode}&q=part&category=products&tag=metal&channel=firstParty&tab=relevance&page=2`);
    const html=await res.text();assert.equal(res.status,200);
    for(const label of ['News sections','Mobile navigation']) {
      const nav=html.match(new RegExp(`<nav\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`))![1]!;
      for(const target of ['recent','archive']) {
        const hrefs=[...nav.matchAll(/href="([^"]+)"/g)].map(x=>x[1]!.replaceAll('&amp;','&'));
        const href=hrefs.find(x=>x.startsWith('/all') && (new URL(x,'http://fixture').searchParams.get('mode')??'recent')===target)!;
        assert.ok(href,`${label} ${target}`);const query=new URL(href,'http://fixture').searchParams;
        for(const [key,value] of Object.entries({q:'part',category:'products',tag:'metal',channel:'firstParty',tab:'relevance'})) assert.equal(query.get(key),value,`${label} ${target} ${key}`);
        assert.equal(query.get('page'),null);
      }
    }
  }
});

test('populated Trending and search-error reader states are English',async()=>{
  populatedHot=true;
  try {
    for(const path of ['/hot','/all/search-busy','/about']) {
      const res=await fetch(origin+path);assert.equal(res.status,200,path);
      const html=(await res.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      assert.doesNotMatch(html,/[\u4e00-\u9fff]/u,path);
      if(path==='/hot') {assert.match(html,/No comparison/);assert.match(html,/Unchanged/);assert.match(html,/Compared with six hours ago/);}
      if(path.includes('search-busy')) assert.match(html,/<title>Search is busy/);
    }
  } finally {populatedHot=false;}
});
