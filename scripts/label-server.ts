// Relevance-calibration labelling page (docs/selection.md step 1). Marcus marks each collected article
// "Feature it" / "Skip" / "Either"; every choice is saved on the server as he clicks. Labels live in
// .data/gold-labels.json; `--export` writes them as .data/gold.jsonl for scripts/eval-selection.ts.
//   node --env-file=.env scripts/label-server.ts            → http://127.0.0.1:4330
//   node --env-file=.env scripts/label-server.ts --export
//   LABEL_QUEUE=.data/review-ids.json node --env-file=.env scripts/label-server.ts   → only the listed articles
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { closeDb, sql } from "@aihot/backend/db";

const ROOT = path.resolve(import.meta.dirname, "..");
const LABELS = path.join(ROOT, ".data/gold-labels.json");
const GOLD = path.join(ROOT, ".data/gold.jsonl");
const FONTS = path.join(ROOT, "apps/web/public/fonts");
const PORT = Number(process.env.LABEL_PORT ?? 4330);
const QUEUE = process.env.LABEL_QUEUE ? new Set<string>(JSON.parse(readFileSync(path.resolve(ROOT, process.env.LABEL_QUEUE), "utf8"))) : null;
const DECISIONS = ["select", "reject", "either"] as const;

type Label = { decision: (typeof DECISIONS)[number] | null; comment: string; rev: number; at: string };
type Labels = Record<string, Label>;

const readLabels = (): Labels => (existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : {});
function writeLabels(labels: Labels) {
  writeFileSync(`${LABELS}.tmp`, JSON.stringify(labels, null, 2) + "\n");
  renameSync(`${LABELS}.tmp`, LABELS);
}

interface Row {
  id: string; title: string; url: string; body_text: string | null; published_at: Date | null; language: string | null;
  source_name: string; source_kind: string; tier: string | null; first_party: boolean;
}
async function articles(): Promise<Row[]> {
  return sql<Row[]>`
    SELECT a.id, a.title, a.url, a.body_text, a.published_at, a.language,
           s.name AS source_name, s.kind AS source_kind, s.tier, s.first_party
    FROM articles a JOIN sources s ON s.id = a.source_id
    ORDER BY a.published_at DESC NULLS LAST, a.id`;
}

/** Newest from each source in turn, so any stopping point is a fair mix of publishers. */
function interleave(rows: Row[]): Row[] {
  const bySource = new Map<string, Row[]>();
  for (const r of rows) bySource.set(r.source_name, [...(bySource.get(r.source_name) ?? []), r]);
  const queues = [...bySource.values()];
  const out: Row[] = [];
  for (let i = 0; out.length < rows.length; i++) for (const q of queues) if (q[i]) out.push(q[i]!);
  return out;
}

/** A quarter of the cases, chosen by id, are held out so the rubric is not tuned to the whole set. */
const split = (id: string) => (parseInt(createHash("sha256").update(id).digest("hex").slice(0, 2), 16) % 4 === 0 ? "holdout" : "development");

async function exportGold() {
  const labels = readLabels();
  const rows = (await articles()).filter((r) => labels[r.id]?.decision);
  const lines = rows.map((r) => JSON.stringify({
    caseId: r.id,
    material: { title: r.title, originalTitle: null, publishedAt: r.published_at?.toISOString() ?? null, sourceName: r.source_name, bodyZh: null, bodyOriginal: r.body_text ?? "" },
    sourceFacts: { sourceKind: r.source_kind, sourceTier: r.tier ?? "T2", firstParty: r.first_party, language: r.language ?? "en" },
    samplingContext: { benchmarkSplit: split(r.id), samplingStratum: r.source_name },
    gold: { decision: labels[r.id]!.decision },
  }));
  writeFileSync(GOLD, lines.join("\n") + "\n");
  console.log(`${lines.length} labelled cases written to ${GOLD}`);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function serve() {
  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(PAGE);
      }
      if (req.method === "GET" && /^\/fonts\/Manrope-(Regular|SemiBold|Bold)\.woff2$/.test(url.pathname)) {
        res.writeHead(200, { "content-type": "font/woff2" });
        return res.end(readFileSync(path.join(FONTS, path.basename(url.pathname))));
      }
      if (req.method === "GET" && url.pathname === "/api/items") {
        const labels = readLabels();
        const items = interleave((await articles()).filter((r) => !QUEUE || QUEUE.has(r.id))).map((r) => ({
          id: r.id, title: r.title, url: r.url, source: r.source_name, tier: r.tier,
          publishedAt: r.published_at?.toISOString() ?? null,
          excerpt: (r.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 420),
          label: labels[r.id] ?? { decision: null, comment: "", rev: 0, at: null },
        }));
        return json(res, 200, { items });
      }
      const m = url.pathname.match(/^\/api\/labels\/([A-Za-z0-9_-]{1,80})$/);
      if (req.method === "PUT" && m) {
        let raw = "";
        for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return json(res, 413, { error: "too large" }); }
        const body = JSON.parse(raw) as { decision: Label["decision"]; comment: string; baseRev: number };
        if (body.decision !== null && !DECISIONS.includes(body.decision)) return json(res, 400, { error: "bad decision" });
        const labels = readLabels();
        const current = labels[m[1]!] ?? { decision: null, comment: "", rev: 0, at: "" };
        // Another tab saved newer feedback: refuse instead of overwriting it.
        if (body.baseRev !== current.rev) return json(res, 409, { label: current });
        const next: Label = { decision: body.decision, comment: String(body.comment ?? "").slice(0, 2000), rev: current.rev + 1, at: new Date().toISOString() };
        labels[m[1]!] = next;
        writeLabels(labels);
        return json(res, 200, { label: next });
      }
      json(res, 404, { error: "not found" });
    } catch (error) {
      json(res, 500, { error: String(error).slice(0, 200) });
    }
  }).listen(PORT, "127.0.0.1", () => console.log(`labelling page on http://127.0.0.1:${PORT}`));
}

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mark articles · AdditiveOS News</title>
<style>
@font-face{font-family:Manrope;src:url(/fonts/Manrope-Regular.woff2) format('woff2');font-weight:400}
@font-face{font-family:Manrope;src:url(/fonts/Manrope-SemiBold.woff2) format('woff2');font-weight:600}
@font-face{font-family:Manrope;src:url(/fonts/Manrope-Bold.woff2) format('woff2');font-weight:700}
:root{--paper:#F5F1E6;--cream:#FFFDF7;--navy:#192B3F;--accent:#B83C22;--accent-hover:#9F301B;--rule:#D7D0BF;--muted:#606C75;--border:#7E827E;--selected:#F9EBE3;--ok:#286447;--err:#A1223C}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--navy);font:16px/1.5 Manrope,system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--rule);padding:16px 4.5%}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;max-width:1100px;margin:0 auto}
.brand{font-size:22px;font-weight:700;letter-spacing:-1px}.brand span{color:var(--accent)}
.progress{font-size:14px;color:var(--muted)}.progress b{color:var(--navy)}
label.toggle{font-size:14px;display:flex;gap:8px;align-items:center;min-height:44px;cursor:pointer}
main{max-width:1100px;margin:0 auto;padding:24px 4.5% 80px}
h1{font-size:clamp(32px,4vw,44px);line-height:1.15;font-weight:400;letter-spacing:-.035em;margin:8px 0 8px}
.intro{max-width:66ch;color:var(--muted);margin:0 0 24px}.intro b{color:var(--navy)}
article{background:var(--cream);border:1px solid var(--rule);border-radius:14px;padding:20px;margin:0 0 16px}
article.done{border-color:var(--rule);opacity:.85}
.meta{font-size:12px;line-height:1.35;color:var(--muted);display:flex;flex-wrap:wrap;gap:12px}
h2{font-size:19px;line-height:1.35;font-weight:600;margin:6px 0 8px}h2 a{color:inherit;text-decoration:none}h2 a:hover{text-decoration:underline}
.excerpt{margin:0 0 14px;color:#3d4a55;font-size:15px;max-width:75ch}
.choices{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.choice{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--border);background:var(--cream);color:var(--navy);font:600 14px Manrope,system-ui;cursor:pointer}
.choice:hover{background:var(--selected)}.choice[aria-pressed=true]{background:var(--selected);border-color:var(--accent);color:var(--accent-hover)}
.choice[data-d=select][aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
textarea{width:100%;max-width:75ch;margin-top:12px;min-height:44px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--cream);color:var(--navy);font:15px/1.5 Manrope,system-ui;resize:vertical}
.status{font-size:12px;margin-left:6px;color:var(--muted)}.status.ok{color:var(--ok)}.status.err{color:var(--err)}
.retry{font:600 12px Manrope;color:var(--err);background:none;border:0;text-decoration:underline;cursor:pointer;min-height:44px}
:focus-visible{outline:2px solid var(--navy);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body>
<header><div class="bar"><div class="brand">Additive<span>OS</span></div>
<div class="progress" aria-live="polite"><b id="done">0</b> of <b id="total">0</b> marked</div>
<label class="toggle"><input type="checkbox" id="unmarked"> Show unmarked only</label></div></header>
<main><h1>Should this be featured?</h1>
<p class="intro">For each article, pick what a professional who uses or evaluates 3D printing would want on the front page. <b>Feature it</b>: worth their attention. <b>Skip</b>: noise, marketing or not relevant. <b>Either</b>: could go both ways. A note on why helps most on the borderline ones. Articles alternate between publishers; about 150 marks is enough, so stop whenever you like. Everything saves as you go.</p>
<div id="list"></div></main>
<script>
const LABELS={select:'Feature it',reject:'Skip',either:'Either'};
const state=new Map(); // id -> {label (server), want (latest intent), dirty, inflight, timer}
const fmt=d=>d?new Date(d).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'Date unknown';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function counts(){let d=0;for(const s of state.values())if(s.want.decision)d++;document.getElementById('done').textContent=d;document.getElementById('total').textContent=state.size}
function setStatus(id,text,cls,retry){const el=document.querySelector('[data-status="'+id+'"]');if(!el)return;el.className='status '+(cls||'');el.innerHTML=esc(text)+(retry?' <button class="retry" type="button" data-retry="'+id+'">Retry</button>':'')}
function paint(id){const s=state.get(id),card=document.getElementById('c-'+id);if(!card)return;
 card.querySelectorAll('.choice').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.d===s.want.decision)));card.classList.toggle('done',!!s.want.decision);counts();filter()}
// One write per item at a time; every write carries the latest choice and note together.
async function flush(id){const s=state.get(id);if(s.inflight||!s.dirty)return;clearTimeout(s.timer);s.dirty=false;s.inflight=true;setStatus(id,'Saving…');
 const body={decision:s.want.decision,comment:s.want.comment,baseRev:s.label.rev};
 try{const r=await fetch('/api/labels/'+id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();
  s.inflight=false;
  if(r.status===409){s.label=j.label;s.want={decision:s.label.decision,comment:s.label.comment};s.dirty=false;document.getElementById('c-'+id).querySelector('textarea').value=s.label.comment;paint(id);setStatus(id,'Changed in another tab; showing the newer choice','err');return}
  if(!r.ok)throw new Error(j.error||r.status);s.label=j.label;
  if(s.dirty)return flush(id);setStatus(id,'Saved','ok')}
 catch(e){s.inflight=false;s.dirty=true;setStatus(id,'Could not save','err',true)}}
function change(id,patch,delay){const s=state.get(id);s.want={...s.want,...patch};s.dirty=true;paint(id);
 clearTimeout(s.timer);if(delay){setStatus(id,'Typing…');s.timer=setTimeout(()=>flush(id),delay)}else flush(id)}
function filter(){const only=document.getElementById('unmarked').checked;for(const [id,s] of state){const c=document.getElementById('c-'+id);const marked=!!s.want.decision;c.hidden=only&&marked&&document.activeElement?.closest('article')!==c}}
async function load(){const {items}=await (await fetch('/api/items')).json();const list=document.getElementById('list');
 list.innerHTML=items.map(it=>'<article id="c-'+it.id+'"><div class="meta"><span>'+esc(it.source)+'</span><span>'+fmt(it.publishedAt)+'</span></div>'+
 '<h2><a href="'+esc(it.url)+'" target="_blank" rel="noopener noreferrer">'+esc(it.title)+'</a></h2><p class="excerpt">'+esc(it.excerpt||'No text was captured for this article. Open the original to judge it.')+(it.excerpt.length>=420?'…':'')+'</p>'+
 '<div class="choices" role="group" aria-label="Decision for '+esc(it.title)+'">'+Object.entries(LABELS).map(([d,l])=>'<button type="button" class="choice" data-d="'+d+'" data-id="'+it.id+'" aria-pressed="false">'+l+'</button>').join('')+
 '<span class="status" data-status="'+it.id+'" role="status"></span></div><textarea data-id="'+it.id+'" aria-label="Note on '+esc(it.title)+'" placeholder="Optional note: why?">'+esc(it.label.comment)+'</textarea></article>').join('');
 for(const it of items){state.set(it.id,{label:it.label,want:{decision:it.label.decision,comment:it.label.comment},dirty:false,inflight:false,timer:null});paint(it.id)}}
document.addEventListener('click',e=>{const b=e.target.closest('.choice');if(b){const s=state.get(b.dataset.id);change(b.dataset.id,{decision:s.want.decision===b.dataset.d?null:b.dataset.d},0)}
 const r=e.target.closest('[data-retry]');if(r)flush(r.dataset.retry)});
document.addEventListener('input',e=>{if(e.target.matches('textarea'))change(e.target.dataset.id,{comment:e.target.value},800)});
document.getElementById('unmarked').addEventListener('change',filter);
addEventListener('beforeunload',e=>{for(const s of state.values())if(s.dirty||s.inflight){e.preventDefault();e.returnValue='';return}});
load();
</script></body></html>`;

if (process.argv.includes("--export")) {
  await exportGold();
  await closeDb();
} else {
  await serve();
}
