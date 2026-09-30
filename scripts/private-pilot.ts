// Finite local pilot: reuse collectors and editorial/publication functions; never start job handlers.
// Run with Node --env-file=.env and invocation-only COLLECT_ENABLED/MODEL_CALLS_ENABLED=true.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { sql, closeDb } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
import { collectSource } from '@aihot/backend/sources/collect';
import { assertSupportedConfig } from '@aihot/backend/sources/config-keys';
import { extractArticleBody } from '@aihot/backend/content/extract';
import { processArticle } from '@aihot/backend/jobs/content';
import { stopBoss, shutdownSignal } from '@aihot/backend/jobs/queue';
import { modelFor } from '@aihot/backend/editorial/models';

const dir = '.data/private-pilot';
mkdirSync(dir, { recursive: true });
const syncOnly = process.argv.includes('--sync-only');
const reportPath = `${dir}/collection-report.json`;
assert(syncOnly || !existsSync(reportPath), 'Initial batch already recorded; do not silently recollect or reset its budget.');
assert.equal(new URL(config.databaseUrl).hostname, '127.0.0.1');
assert.equal(new URL(config.databaseUrl).pathname, '/additiveos_radar');
assert(!config.feishuContentPushEnabled && !config.indexNowSubmitEnabled);
const { sources } = JSON.parse(readFileSync('industry/sources.json', 'utf8'));
assert.equal(sources.length, 44);
for (const s of sources) {
  assertSupportedConfig(s.kind, s.config);
  assert.equal(s.config._aihot.initialBackfillLimit, 1);
  assert(!s.site_fulltext && !s.syndicate_fulltext);
  // Reproducible config correction path: unlike seed, update these pilot-owned IDs in place.
  await sql`INSERT INTO sources (id,name,kind,config,tier,first_party,participation_mode,site_fulltext,syndicate_fulltext,enabled)
    VALUES (${s.id},${s.name},${s.kind},${sql.json(s.config)},${s.tier},${s.first_party},'editorial',false,false,true)
    ON CONFLICT (id) DO UPDATE SET name=excluded.name,kind=excluded.kind,config=excluded.config,tier=excluded.tier,
      first_party=excluded.first_party,participation_mode='editorial',site_fulltext=false,syndicate_fulltext=false`;
}
if (syncOnly) { await closeDb(); console.log('44 source configurations synchronized; no collection/model calls'); process.exit(0); }
assert.equal(process.env.COLLECT_ENABLED, 'true');
assert.equal(process.env.MODEL_CALLS_ENABLED, 'true');
const budgets = await sql`SELECT service,per_minute,per_hour,per_day FROM budgets`;
const llm = budgets.find(b => b.service === 'llm');
assert(llm && llm.per_minute === 30 && llm.per_hour === 120 && llm.per_day === 120);
assert(budgets.every(b => b.service === 'llm' || b.per_day === 0));
for (const step of ['prefilter','score','understand','summarize','structure'] as const) assert.equal(await modelFor(step), 'default');
const started = Date.now();
const deadline = started + 25 * 60_000;
const report: any = { startedAt: new Date(started).toISOString(), pid: process.pid, deadline: new Date(deadline).toISOString(), limits: { articles:18, paidRequests:120, explicitRetriesPerArticle:1 }, collection:[], processing:[], status:'running' };
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2)+'\n');
save();
// Stop between model stages before the wall deadline; a hard stop prevents an indefinitely running batch.
const stop = setTimeout(() => shutdownSignal.abort(), 22 * 60_000);
const hardStop = setTimeout(() => { report.status='deadline'; save(); process.exit(2); }, 25 * 60_000);
try {
  // Sequential sources retain the normal per-collector timeout and leave each attempt visible.
  for (const s of sources) {
    if (shutdownSignal.signal.aborted) break;
    const result = await collectSource(s.id);
    report.collection.push({ ...result, outcome: result.status==='failed'?'failed':result.created?'extracted':'empty', at:new Date().toISOString() }); save();
    console.log(`collect ${s.id}: ${result.status}, ${result.created} created`);
  }
  const priority = ['tct','voxelmatters','3d-printing-industry','3d-systems','formlabs','cobod','carbon','lithoz','stratasys','tpm3d','roboze','bambu-lab','liqcreate','sprintray','america-makes','basf-forward-am','anycubic','eos'];
  const rows = await sql`SELECT id,source_id,title FROM articles WHERE source_id IN ${sql(sources.map((s:any)=>s.id))} ORDER BY discovered_at`;
  rows.sort((a,b)=>(priority.indexOf(a.source_id)<0?999:priority.indexOf(a.source_id))-(priority.indexOf(b.source_id)<0?999:priority.indexOf(b.source_id)));
  let processed = 0;
  for (const a of rows) {
    if (processed >= 18 || shutdownSignal.signal.aborted || Date.now() > deadline - 180_000) break;
    const entry: any = { articleId:a.id,sourceId:a.source_id,title:a.title,attempts:[] };
    report.processing.push(entry);save();
    try {
      entry.extraction = await extractArticleBody(a.id, false);
      const [body] = await sql`SELECT body_text,excerpt FROM articles WHERE id=${a.id}`;
      if ((body?.body_text ?? body?.excerpt ?? '').length < 500) {entry.state='pending-insufficient-material';save();continue;}
      processed++;
      for(let attempt=0;attempt<2;attempt++) {
        const [counts]=await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE service='llm' AND origin='live' AND started_at > now()-interval '1 day'`;
        if(counts!.n>=120 || shutdownSignal.signal.aborted) {entry.state='pending-budget-or-deadline';break;}
        try { const result=await processArticle(a.id,attempt?{attemptTag:'private-pilot-retry-1'}:{});entry.attempts.push({attempt,result});entry.state=result.state;break; }
        catch(error) { const message=String(error).slice(0,500);entry.attempts.push({attempt,error:message});entry.state='pending-error';save();if(/Budget|ReceiptUnknown|shutting down/.test(message))break; }
      }
    } catch(error) {entry.state='pending-error';entry.error=String(error).slice(0,500);}
    save();console.log(`process ${a.source_id}: ${entry.state}`);
  }
  report.status = shutdownSignal.signal.aborted ? 'deadline' : 'finished';
} finally {
  clearTimeout(stop);clearTimeout(hardStop);
  report.finishedAt=new Date().toISOString();
  report.receipts=await sql`SELECT r.id,r.service,r.model,r.purpose,r.subject,r.status,r.usage FROM receipts r WHERE r.created_at >= ${new Date(started)}`;
  report.paidAttempts=await sql`SELECT service,count(*)::int AS requests FROM receipt_attempts WHERE origin='live' AND started_at >= ${new Date(started)} GROUP BY service`;
  report.pending=await sql`SELECT source_id,id,processing_state,processing_error FROM articles WHERE processing_state NOT IN ('analyzed','blocked')`;
  save();await stopBoss();await closeDb();console.log('Batch terminated; no job handlers or cron started.');
}
