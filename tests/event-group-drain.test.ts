import './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { activeEventGroupJobs, ageSkipOldAutomaticEventGroups, drainEventGroups, handleEventGroup, prioritizeNewestAutomaticEventGroups, recoverExpiredEventGroupClaims, type EventGroupJob } from '@aihot/backend/jobs/events';
import { groupArticle } from '@aihot/backend/events/group';
import { rerun } from '@aihot/backend/admin/content';
import { releaseReceipt } from '@aihot/backend/admin/runs';
import { BULK_GROUP_PRIORITY, ensureQueue, getBoss, MANUAL_GROUP_PRIORITY, QUEUES, stopBoss } from '@aihot/backend/jobs/queue';
import { publishArticle } from '@aihot/backend/publication/publish';
import { stub, tag } from './setup.ts';

const T = tag();
const SOURCE = `group-drain-${T}`;
const provider = await stub(() => ({
  id: 'stub',
  choices: [{ message: { content: JSON.stringify({ query: '', decisions: [] }) } }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
}));
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = 'test-key';
// Failure modes for the judge: a dropped connection (outcome unknown), a provider rate limit, the Codex
// shim's 502 answers (its usage limit with the CLI's wording, and an ordinary failure), and a 200 answer whose
// text is not JSON but quotes a limit phrase (a ModelOutputError, which must not be read as a limit).
let mode: 'ok' | 'reset' | 'limit' | 'text429' | 'codex-limit' | 'bad-gateway' | 'junk-output' = 'ok';
let flakyHits = 0;
const flaky = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    flakyHits += 1;
    if (mode === 'reset') return req.socket.destroy();
    if (mode === 'limit') { res.writeHead(429, { 'content-type': 'application/json' }); return res.end('{"error":"rate limited"}'); }
    if (mode === 'text429') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"upstream failure, trace 429"}'); }
    if (mode === 'codex-limit') { res.writeHead(502, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Error: codex exited 1: ERROR: Usage limit reached. You\'ve reached your usage limit. Increase your limits to continue using codex."}}'); }
    if (mode === 'bad-gateway') { res.writeHead(502, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Error: codex exited 1: ERROR: model returned invalid JSON"}}'); }
    if (mode === 'junk-output') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { content: '{"x": rate limit}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ query: '', decisions: [] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
});
await new Promise<void>((resolve) => flaky.listen(0, '127.0.0.1', () => resolve()));
const flakyUrl = `http://127.0.0.1:${(flaky.address() as { port: number }).port}/v1`;
after(async () => { await provider.close(); await new Promise<void>((resolve) => flaky.close(() => resolve())); await stopBoss(); await closeDb(); });

async function analyzed(suffix: string, text: string = randomUUID(), publishedAt = new Date()) {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${SOURCE},'Grouping drain fixture','rss','T2','editorial','2100-01-01') ON CONFLICT (id) DO NOTHING`;
  const unique = text;
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.invalid/${SOURCE}/${suffix}`,
    title: unique, bodyText: `${unique}. `.repeat(30), bodyStatus: 'ok', via: 'fetch', publishedAt });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','products',${sql.array([SOURCE])},${unique},${unique},40,false)`;
  await publishArticle(articleId);
  return articleId;
}

test('bounded drain claims analyzed unselected backlog serially and leaves capped work queued', async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${SOURCE},'Grouping drain fixture','rss','T2','editorial','2100-01-01')`;
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await ensureQueue(QUEUES.analyze);
  // Earlier queue tests leave signal jobs in this shared throwaway database; keep this fixture's
  // claim order deterministic and avoid processing someone else's test job.
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const ids = [await analyzed('one'), await analyzed('two'), await analyzed('three')];
  const jobs = await Promise.all(ids.map((articleId) => boss.send(QUEUES.group, { articleId }, { singletonKey: `test:${articleId}` })));
  assert.ok(jobs.every(Boolean));

  let canContinue = true;
  let fetchCount = 0;
  const completedIds = new Set<string>();
  const claimedArticles: string[] = [];
  const serialBoss = {
    fetch: async (name: string, options: { batchSize: number }) => {
      assert.equal(name, QUEUES.group);
      assert.equal(options.batchSize, 1, 'claims exactly one job per iteration');
      if (fetchCount > 0) assert.equal(completedIds.size, fetchCount, 'does not claim the next job before completing the previous one');
      const [job] = await boss.fetch<EventGroupJob>(name, options);
      if (job) { fetchCount += 1; claimedArticles.push(job.data.articleId); }
      return job ? [job] : [];
    },
    complete: async (name: string, id: string, result: object) => {
      const done = await boss.complete(name, id, result);
      completedIds.add(id);
      return done;
    },
    fail: (name: string, id: string, result: object) => boss.fail(name, id, result),
  };
  const errors: string[] = [];
  const first = await drainEventGroups(serialBoss as never, { maxJobs: 2, canContinue: async () => canContinue, onError: (error) => errors.push(String(error)) });
  assert.deepEqual(errors, []);
  assert.deepEqual({ attempted: first.attempted, completed: first.completed, errors: first.errors }, { attempted: 2, completed: 2, errors: 0 });
  assert.equal(first.stop, 'finished');

  canContinue = false;
  const capped = await drainEventGroups(boss, { maxJobs: 12, canContinue: async () => canContinue });
  assert.deepEqual({ attempted: capped.attempted, completed: capped.completed, stop: capped.stop }, { attempted: 0, completed: 0, stop: 'request-cap' });
  const resumableId = ids.find((id) => !claimedArticles.includes(id))!;
  const [queued] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE name = ${QUEUES.group} AND data->>'articleId' = ${resumableId}`;
  assert.equal(queued!.state, 'created', 'the unclaimed job remains available for a later refresh');
  const [unselected] = await sql<{ selected: boolean; fact_id: number | null }[]>`SELECT selected,fact_id FROM publications WHERE article_id = ${ids[0]}`;
  assert.equal(unselected!.selected, false);

  const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true });
  assert.deepEqual({ attempted: resumed.attempted, completed: resumed.completed }, { attempted: 1, completed: 1 });
  const [completed] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE name = ${QUEUES.group} AND data->>'articleId' = ${resumableId}`;
  assert.equal(completed!.state, 'completed');
});

test('more than four cap deferrals preserve retry budget and later complete', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `confirmed event ${randomUUID()} new experimental machine launches in Singapore`;
  const first = await analyzed('cap-first', shared);
  await groupArticle(first);
  const second = await analyzed('cap-second', shared);
  const id = await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `cap:${second}` });
  assert.ok(id);
  const jobId = String(id);

  for (let i = 0; i < 5; i++) {
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${jobId}`;
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, beforeModelRequest: async () => false });
    assert.equal(result.deferred, 1, `deferral ${i + 1}`);
    const rows = await sql<{ state: string; retry_count: number }[]>`SELECT state,retry_count FROM pgboss.job WHERE id = ${jobId}`;
    const job = rows[0];
    assert.equal(job!.state, 'retry');
    assert.equal(job!.retry_count, 0, 'resource stops do not spend pg-boss processing retries');
  }
  await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${jobId}`;
  const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, beforeModelRequest: async () => true });
  assert.equal(resumed.completed, 1);
  const doneRows = await sql<{ state: string; retry_count: number }[]>`SELECT state,retry_count FROM pgboss.job WHERE id = ${jobId}`;
  const done = doneRows[0];
  assert.equal(done!.state, 'completed');
  assert.equal(done!.retry_count, 0);
});

test('scheduled queue drain forces lexical recall when embedding credentials exist and budget is zero', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `lexical scheduled recall ${randomUUID()} new product launch`;
  const first = await analyzed('lexical-first', shared);
  await groupArticle(first, { forceLexical: true });
  const second = await analyzed('lexical-second', shared);
  await boss.send(QUEUES.group, { articleId: second });
  const oldKey = process.env.DASHSCOPE_API_KEY;
  const oldEnabled = process.env.EMBEDDINGS_ENABLED;
  process.env.DASHSCOPE_API_KEY = 'test-key';
  process.env.EMBEDDINGS_ENABLED = 'true';
  await sql`UPDATE budgets SET per_minute=0,per_hour=0,per_day=0 WHERE service='dashscope'`;
  try {
    const [before] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE service IN ('embedding','dashscope')`;
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(result.completed, 1, 'lexical recall reaches the normal grouping judge without an embedding budget error');
    const [attempts] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE service IN ('embedding','dashscope')`;
    assert.equal(attempts!.n, before!.n, 'the scheduled path makes no embedding or DashScope requests');
  } finally {
    if (oldKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.EMBEDDINGS_ENABLED; else process.env.EMBEDDINGS_ENABLED = oldEnabled;
  }
});

test('expired grouping claims recover after restart, only for events.group', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await ensureQueue(QUEUES.analyze);
  await sql`DELETE FROM pgboss.job WHERE name IN (${QUEUES.group}, 'content.analyze') AND state IN ('created', 'retry')`;
  const articleId = await analyzed('crash-restart');
  const groupId = await boss.send(QUEUES.group, { articleId }, { singletonKey: `crash:${articleId}` });
  const unrelatedId = await boss.send('content.analyze', { articleId }, { singletonKey: `unrelated:${articleId}` });
  await boss.fetch(QUEUES.group, { batchSize: 1 });
  await sql`UPDATE pgboss.job SET started_on = now() - interval '20 minutes', heartbeat_on = now() - interval '20 minutes' WHERE id = ${groupId}`;
  await stopBoss();
  const restarted = await getBoss();
  assert.equal(await recoverExpiredEventGroupClaims(), 1);
  const [recovered] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE id = ${groupId}`;
  const [untouched] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE id = ${unrelatedId}`;
  assert.equal(recovered!.state, 'retry');
  assert.equal(untouched!.state, 'created', 'recovery does not start or modify unrelated workers');
  assert.equal(await activeEventGroupJobs(), 0);
  await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${groupId}`;
  const result = await drainEventGroups(restarted, { maxJobs: 1, canContinue: async () => true });
  assert.equal(result.completed, 1, 'the recovered claim completes through the normal receipt-safe handler');
});

test('automatic backlog skips articles older than 14 days and prioritizes newest eligible jobs', async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${SOURCE},'Grouping drain fixture','rss','T2','editorial','2100-01-01') ON CONFLICT (id) DO NOTHING`;
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const oldArticle = await analyzed('old', 'old automatic grouping', new Date(Date.now() - 15 * 86400000));
  const oldManualArticle = await analyzed('old-manual', 'manual regroup stays', new Date(Date.now() - 15 * 86400000));
  const newer = await analyzed('newer', 'newer automatic grouping', new Date(Date.now() - 1 * 86400000));
  const oldest = await analyzed('older', 'older automatic grouping', new Date(Date.now() - 2 * 86400000));
  const oldJob = await boss.send(QUEUES.group, { articleId: oldArticle }, { singletonKey: `age-old:${oldArticle}` });
  const manualJob = await boss.send(QUEUES.group, { articleId: oldManualArticle, force: true }, { singletonKey: `age-manual:${oldManualArticle}`, priority: -2 });
  const newerJob = await boss.send(QUEUES.group, { articleId: newer }, { singletonKey: `age-new:${newer}` });
  const olderJob = await boss.send(QUEUES.group, { articleId: oldest }, { singletonKey: `age-older:${oldest}` });
  assert.ok(newerJob && olderJob && manualJob);
  await prioritizeNewestAutomaticEventGroups();
  const priorities = await sql<{ id: string; priority: number }[]>`SELECT id,priority FROM pgboss.job WHERE id::text = ANY(${sql.array([newerJob!, olderJob!, manualJob!])})`;
  assert.equal(priorities.length, 3, `all pending rows are found; IDs: ${[newerJob, olderJob, manualJob].join(',')}`);
  assert.ok(priorities.find((row) => row.id === newerJob)!.priority > priorities.find((row) => row.id === olderJob)!.priority);
  assert.equal(priorities.find((row) => row.id === manualJob)!.priority, -2, 'explicit regroup priority remains intact');
  assert.equal(await ageSkipOldAutomaticEventGroups(), 1);
  const [skipped] = await sql<{ state: string; output: { outcome: string } }[]>`SELECT state,output FROM pgboss.job WHERE id = ${oldJob}`;
  const [manual] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE id = ${manualJob}`;
  const [visible] = await sql<{ eligible: boolean; fact_id: number | null }[]>`SELECT eligible,fact_id FROM publications WHERE article_id = ${oldArticle}`;
  assert.equal(skipped!.state, 'completed');
  assert.equal(skipped!.output.outcome, 'age-skip');
  assert.equal(manual!.state, 'created');
  assert.deepEqual(visible, { eligible: true, fact_id: null }, 'age-skipped articles remain standalone and visible');
});

test('an unknown-outcome receipt blocks only its own job; the next job still completes and nothing is re-sent', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `unknown outcome ${randomUUID()} new chip launch`;
  await groupArticle(await analyzed('unknown-first', shared));
  const blocked = await analyzed('unknown-second', shared);
  // Historical backfill is decided without recall or a model call, so this job cannot reach the judge.
  const clear = await analyzed('unknown-clear');
  await sql`UPDATE articles SET backfill = true, published_at = now() - interval '400 days' WHERE id = ${clear}`;
  await boss.send(QUEUES.group, { articleId: blocked }, { singletonKey: `unknown:${blocked}`, priority: 2 });
  await boss.send(QUEUES.group, { articleId: clear }, { singletonKey: `unknown:${clear}`, priority: 1 });
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'reset';
    // Refresh 1: the judge request is sent, the connection drops, the receipt is left unknown.
    const first = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(first.errors, 1);
    assert.equal(flakyHits, 1);
    const [unknown] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE status = 'unknown' ORDER BY id DESC LIMIT 1`;
    assert.equal(unknown?.status, 'unknown');

    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE name = ${QUEUES.group} AND data->>'articleId' = ${blocked}`;
    // Refresh 2: the blocked job is skipped without a request, and the job behind it still completes.
    const secondErrors: string[] = [];
    const second = await drainEventGroups(boss, { maxJobs: 2, canContinue: async () => true, forceLexical: true, onError: (e) => secondErrors.push(String(e)) });
    assert.equal(secondErrors.length, 1, 'the blocked job is reported once');
    assert.match(secondErrors[0]!, /unknown outcome/);
    assert.deepEqual({ attempted: second.attempted, completed: second.completed, blocked: second.blocked, errors: second.errors, stop: second.stop },
      { attempted: 2, completed: 1, blocked: 1, errors: 0, stop: 'finished' });
    assert.equal(flakyHits, 1, 'an unknown receipt is never re-sent');
    const [held] = await sql<{ state: string; retry_count: number; waits: boolean }[]>`SELECT state, retry_count, start_after > now() + interval '10 hours' AS waits
      FROM pgboss.job WHERE name = ${QUEUES.group} AND data->>'articleId' = ${blocked}`;
    assert.deepEqual(held, { state: 'retry', retry_count: 1, waits: true }, 'only the first failed attempt spent a retry; the blocked job waits for release');
    const [done] = await sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE name = ${QUEUES.group} AND data->>'articleId' = ${clear}`;
    assert.equal(done!.state, 'completed');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('provider rate limits defer grouping without spending retries, however many refreshes they last', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `rate limited ${randomUUID()} new satellite launch`;
  await groupArticle(await analyzed('limit-first', shared));
  const second = await analyzed('limit-second', shared);
  const id = String(await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `limit:${second}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'limit';
    for (let i = 0; i < 5; i++) {
      await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
      const result = await drainEventGroups(boss, { maxJobs: 3, canContinue: async () => true, forceLexical: true });
      assert.deepEqual({ deferred: result.deferred, stop: result.stop, errors: result.errors }, { deferred: 1, stop: 'provider-limit', errors: 0 }, `refresh ${i + 1}`);
      const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
      assert.deepEqual(row, { state: 'retry', retry_count: 0 }, `refresh ${i + 1} keeps the retry budget`);
    }
    mode = 'ok';
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(resumed.completed, 1, 'the job completes once the provider accepts requests again');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a Codex usage limit that arrives as HTTP 502 defers grouping without spending a retry', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `codex limit ${randomUUID()} new drone launch`;
  await groupArticle(await analyzed('codex-limit-first', shared));
  const second = await analyzed('codex-limit-second', shared);
  const id = String(await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `codex-limit:${second}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'codex-limit';
    for (let i = 0; i < 3; i++) {
      await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
      const result = await drainEventGroups(boss, { maxJobs: 3, canContinue: async () => true, forceLexical: true });
      assert.deepEqual({ deferred: result.deferred, stop: result.stop, errors: result.errors }, { deferred: 1, stop: 'provider-limit', errors: 0 }, `refresh ${i + 1}`);
      const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
      assert.deepEqual(row, { state: 'retry', retry_count: 0 }, `refresh ${i + 1} keeps the retry budget`);
    }
    mode = 'ok';
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(resumed.completed, 1, 'the job completes once Codex accepts requests again');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a plain HTTP 502 from the provider is a true failure that spends a retry', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `plain bad gateway ${randomUUID()} new sensor launch`;
  await groupArticle(await analyzed('bad-gateway-first', shared));
  const second = await analyzed('bad-gateway-second', shared);
  const id = String(await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `bad-gateway:${second}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'bad-gateway';
    const errors: string[] = [];
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: (e) => errors.push(String(e)) });
    assert.deepEqual({ deferred: result.deferred, errors: result.errors, stop: result.stop }, { deferred: 0, errors: 1, stop: 'finished' });
    assert.match(errors[0]!, /HTTP 502/);
    const [failed] = await sql<{ state: string; error: string }[]>`SELECT state, output->>'error' AS error FROM pgboss.job WHERE id = ${id}`;
    assert.equal(failed!.state, 'retry');
    assert.match(failed!.error, /HTTP 502/, 'the failure is recorded on the job, not deferred');
    // pg-boss counts the spent retry when the job is claimed again.
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: () => {} });
    const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
    assert.deepEqual(row, { state: 'retry', retry_count: 1 }, 'the next claim spends one processing retry');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a model answer that is not JSON but quotes a limit phrase is a failure that spends a retry, not a deferral', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `quoted limit ${randomUUID()} new battery launch`;
  await groupArticle(await analyzed('junk-first', shared));
  const second = await analyzed('junk-second', shared);
  const id = String(await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `junk:${second}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'junk-output';
    const errors: string[] = [];
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: (e) => errors.push(String(e)) });
    assert.deepEqual({ deferred: result.deferred, errors: result.errors, stop: result.stop }, { deferred: 0, errors: 1, stop: 'finished' });
    assert.match(errors[0]!, /unusable output/);
    const [failed] = await sql<{ state: string; error: string }[]>`SELECT state, output->>'error' AS error FROM pgboss.job WHERE id = ${id}`;
    assert.equal(failed!.state, 'retry');
    assert.match(failed!.error, /unusable output/, 'the failure is recorded on the job, not deferred');
    // pg-boss counts the spent retry when the job is claimed again.
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: () => {} });
    const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
    assert.deepEqual(row, { state: 'retry', retry_count: 1 }, 'the next claim spends one processing retry');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a grouping job that keeps dying while claimed fails after its retry limit instead of looping', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const articleId = await analyzed('crash-loop');
  const jobId = String(await boss.send(QUEUES.group, { articleId }, { singletonKey: `crash-loop:${articleId}` }));
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${jobId}`;
    const [claimed] = await boss.fetch<EventGroupJob>(QUEUES.group, { batchSize: 1 });
    if (!claimed) break;
    // The process dies while holding the claim; the next refresh recovers it.
    await sql`UPDATE pgboss.job SET started_on = now() - interval '20 minutes', heartbeat_on = now() - interval '20 minutes' WHERE id = ${jobId}`;
    assert.equal(await recoverExpiredEventGroupClaims(), 1);
    const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${jobId}`;
    seen.push(`${row!.state}:${row!.retry_count}`);
    if (row!.state === 'failed') break;
  }
  assert.deepEqual(seen, ['retry:1', 'retry:2', 'retry:3', 'retry:4', 'failed:5']);
});

test('an explicit regroup is claimed before the automatic backlog that was queued earlier', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const automatic = [await analyzed('prio-a1'), await analyzed('prio-a2'), await analyzed('prio-a3')];
  for (const articleId of automatic) await boss.send(QUEUES.group, { articleId }, { singletonKey: `prio-auto:${articleId}` });
  await prioritizeNewestAutomaticEventGroups();
  const correction = await analyzed('prio-correction');
  await boss.send(QUEUES.group, { articleId: correction }, { singletonKey: `prio-late-auto:${correction}` });
  await prioritizeNewestAutomaticEventGroups();
  assert.ok(await rerun(correction, 'group', `prio-${randomUUID()}`, 'test'));
  const [first] = await boss.fetch<EventGroupJob>(QUEUES.group, { batchSize: 1 });
  assert.deepEqual({ articleId: first?.data.articleId, force: first?.data.force }, { articleId: correction, force: true });
  await boss.complete(QUEUES.group, first!.id, {});
  const [priority] = await sql<{ priority: number }[]>`SELECT priority FROM pgboss.job WHERE name = ${QUEUES.group} AND data->>'articleId' = ${correction} AND data->>'force' = 'true'`;
  assert.equal(priority!.priority, MANUAL_GROUP_PRIORITY);
});

test('the scheduled drain queues no story digests, while the worker path still does', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await ensureQueue(QUEUES.digest);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const [{ t }] = await sql<{ t: Date }[]>`SELECT now() AS t`;
  const scheduled = await analyzed('digest-scheduled');
  await boss.send(QUEUES.group, { articleId: scheduled }, { singletonKey: `digest-s:${scheduled}` });
  const drained = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
  assert.equal(drained.completed, 1);
  const digestsAfterDrain = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pgboss.job WHERE name = ${QUEUES.digest} AND created_on >= ${t}`)[0]!.n;
  assert.equal(await digestsAfterDrain(), 0, 'nothing on the scheduled path consumes digests, so none are queued');

  const worker = await analyzed('digest-worker');
  const result = await handleEventGroup({ articleId: worker });
  assert.ok(result.storyId, 'the worker path still founds a story');
  assert.equal(await digestsAfterDrain(), 1, 'the worker path still queues the digest');
});

test('a scheduled grouping makes no embedding request even with a positive embedding budget', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const embeddings = await stub(() => ({ data: [] }));
  const oldKey = process.env.DASHSCOPE_API_KEY;
  const oldEnabled = process.env.EMBEDDINGS_ENABLED;
  const oldBase = process.env.DASHSCOPE_BASE_URL;
  const [saved] = await sql<{ per_minute: number; per_hour: number; per_day: number }[]>`SELECT per_minute, per_hour, per_day FROM budgets WHERE service = 'dashscope'`;
  process.env.DASHSCOPE_API_KEY = 'test-key';
  process.env.EMBEDDINGS_ENABLED = 'true';
  process.env.DASHSCOPE_BASE_URL = `${embeddings.url}/v1`;
  await sql`UPDATE budgets SET per_minute = 1000, per_hour = 1000, per_day = 1000 WHERE service = 'dashscope'`;
  try {
    const shared = `embedding budget ${randomUUID()} new product launch`;
    const before = await embeddings.hits();
    const [attemptsBefore] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE service IN ('embedding','dashscope')`;
    const fresh = await analyzed('embed-budget', shared);
    await boss.send(QUEUES.group, { articleId: fresh }, { singletonKey: `embed-budget:${fresh}` });
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(result.completed, 1);
    assert.equal(embeddings.hits() - before, 0, 'no embedding HTTP request on the scheduled path');
    const [attemptsAfter] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE service IN ('embedding','dashscope')`;
    assert.equal(attemptsAfter!.n, attemptsBefore!.n, 'and no embedding receipt attempt');
  } finally {
    await embeddings.close();
    if (saved) await sql`UPDATE budgets SET per_minute = ${saved.per_minute}, per_hour = ${saved.per_hour}, per_day = ${saved.per_day} WHERE service = 'dashscope'`;
    if (oldKey === undefined) delete process.env.DASHSCOPE_API_KEY; else process.env.DASHSCOPE_API_KEY = oldKey;
    if (oldEnabled === undefined) delete process.env.EMBEDDINGS_ENABLED; else process.env.EMBEDDINGS_ENABLED = oldEnabled;
    if (oldBase === undefined) delete process.env.DASHSCOPE_BASE_URL; else process.env.DASHSCOPE_BASE_URL = oldBase;
  }
});

test('a changed candidate set does not resend a judgement whose outcome is unknown; releasing the receipt lets it run once', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `candidate change ${randomUUID()} new chip launch`;
  await groupArticle(await analyzed('b1-first', shared));
  const blocked = await analyzed('b1-blocked', shared);
  const jobId = String(await boss.send(QUEUES.group, { articleId: blocked }, { singletonKey: `b1:${blocked}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'reset';
    const first = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: () => {} });
    assert.equal(first.errors, 1);
    const [unknown] = await sql<{ id: number }[]>`SELECT id FROM receipts WHERE status = 'unknown' AND subject = ${`article:${blocked}`}`;
    assert.ok(unknown, 'the blocked report\'s judgement has an unknown outcome');

    // A similar report becomes a second fact before the blocked job resumes, so its candidate set now differs.
    mode = 'ok';
    await groupArticle(await analyzed('b1-second', shared + ' follow-up'), { forceLexical: true });
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${jobId}`;
    const before = flakyHits;
    const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: () => {} });
    assert.deepEqual({ attempted: resumed.attempted, blocked: resumed.blocked, completed: resumed.completed, errors: resumed.errors },
      { attempted: 1, blocked: 1, completed: 0, errors: 0 });
    assert.equal(flakyHits - before, 0, 'no new paid request while the earlier outcome is unknown');
    const [held] = await sql<{ waits: boolean }[]>`SELECT start_after > now() + interval '10 hours' AS waits FROM pgboss.job WHERE id = ${jobId}`;
    assert.equal(held!.waits, true, 'the job waits for the release');

    // The admin (or the automatic release) clears the unknown receipt; the next claim sends the request once.
    await releaseReceipt(Number(unknown!.id), { billed: false, note: 'test: provider console checked' }, 'test');
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${jobId}`;
    const released = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(released.completed, 1, 'after release the job completes');
    assert.equal(flakyHits - before, 1, 'and the request is sent once, after release');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a placeholder left by a stopped process blocks its job even after the candidates changed, and the refresh marks it', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `stale placeholder ${randomUUID()} new chip launch`;
  await groupArticle(await analyzed('stale-first', shared));
  const blocked = await analyzed('stale-blocked', shared);
  const jobId = String(await boss.send(QUEUES.group, { articleId: blocked }, { singletonKey: `stale:${blocked}` }));
  // The process that sent this report's judgement died mid-request: its placeholder is still pending, long past the stale threshold.
  await sql`INSERT INTO receipts (logical_key, service, model, purpose, subject, status, attempts, updated_at)
    VALUES (${`test-stale-pending-${T}`}, 'deepseek', 'deepseek-flash', 'group_article', ${`article:${blocked}`}, 'pending', 1, now() - interval '1 hour')`;
  // Importing the runner sets PGBOSS_PASSIVE for new pg-boss instances; this file's instance already exists, so restore the variable.
  const passive = process.env.PGBOSS_PASSIVE;
  const { prepareEventGroups } = await import('../scripts/scheduled-refresh.ts');
  if (passive === undefined) delete process.env.PGBOSS_PASSIVE; else process.env.PGBOSS_PASSIVE = passive;
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  mode = 'ok';
  try {
    // The changed candidate set would be a new key, so only the refresh's preparation can stop it.
    await prepareEventGroups();
    const before = flakyHits;
    const result = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true, onError: () => {} });
    assert.deepEqual({ attempted: result.attempted, blocked: result.blocked, completed: result.completed, errors: result.errors },
      { attempted: 1, blocked: 1, completed: 0, errors: 0 });
    assert.equal(flakyHits - before, 0, 'no new paid request for the report while the stopped process\'s outcome is unknown');
    const [held] = await sql<{ waits: boolean }[]>`SELECT start_after > now() + interval '10 hours' AS waits FROM pgboss.job WHERE id = ${jobId}`;
    assert.equal(held!.waits, true, 'the job waits for the admin release');
  } finally {
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('a provider failure that merely mentions 429 is a real failure that spends a retry, not a rate-limit deferral', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const shared = `text 429 ${randomUUID()} new satellite launch`;
  await groupArticle(await analyzed('text429-first', shared));
  const second = await analyzed('text429-second', shared);
  const id = String(await boss.send(QUEUES.group, { articleId: second }, { singletonKey: `text429:${second}` }));
  const oldBase = process.env.DEEPSEEK_BASE_URL;
  process.env.DEEPSEEK_BASE_URL = flakyUrl;
  try {
    mode = 'text429';
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    const errors: string[] = [];
    const result = await drainEventGroups(boss, { maxJobs: 3, canContinue: async () => true, forceLexical: true, onError: (e) => errors.push(String(e)) });
    assert.deepEqual({ deferred: result.deferred, errors: result.errors }, { deferred: 0, errors: 1 });
    assert.match(errors[0]!, /429/);
    const [row] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
    assert.deepEqual(row, { state: 'retry', retry_count: 0 }, 'recorded as a failed attempt awaiting retry');

    // The next claim is the retry that pg-boss charges for a processing failure.
    mode = 'ok';
    await sql`UPDATE pgboss.job SET start_after = now() - interval '1 second' WHERE id = ${id}`;
    const resumed = await drainEventGroups(boss, { maxJobs: 1, canContinue: async () => true, forceLexical: true });
    assert.equal(resumed.completed, 1);
    const [done] = await sql<{ state: string; retry_count: number }[]>`SELECT state, retry_count FROM pgboss.job WHERE id = ${id}`;
    assert.deepEqual(done, { state: 'completed', retry_count: 1 }, 'the retry is spent on the next claim');
  } finally {
    mode = 'ok';
    process.env.DEEPSEEK_BASE_URL = oldBase;
  }
});

test('single manual regroups claim first, live automatic work next, and bulk regroups last', async () => {
  const boss = await getBoss();
  await ensureQueue(QUEUES.group);
  await sql`DELETE FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  const bulk = await analyzed('band-bulk');
  const live = await analyzed('band-live');
  const manual = await analyzed('band-manual');
  await boss.send(QUEUES.group, { articleId: bulk, force: true }, { singletonKey: `band-bulk:${bulk}`, priority: BULK_GROUP_PRIORITY });
  await boss.send(QUEUES.group, { articleId: live }, { singletonKey: `band-live:${live}` });
  await prioritizeNewestAutomaticEventGroups();
  assert.ok(await rerun(manual, 'group', `band-${randomUUID()}`, 'test'));
  const order: string[] = [];
  for (;;) {
    const [job] = await boss.fetch<EventGroupJob>(QUEUES.group, { batchSize: 1 });
    if (!job) break;
    order.push(job.data.articleId);
    await boss.complete(QUEUES.group, job.id, {});
  }
  assert.deepEqual(order, [manual, live, bulk]);
});
