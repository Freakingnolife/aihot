// Scheduled refresh for the public site: twice a day (07:00 and 19:00 Singapore time) it collects
// sources, fetches missing pages (no Jina), then analyzes new articles serially. Analysis has priority
// over a bounded serial drain of existing events.group jobs, which uses only remaining room under
// the shared 60-request target. Analysis checks that threshold before each article, so one article
// can cross it slightly; grouping checks before every individual request. pg-boss runs passive: no
// worker, unrelated queue or schedule starts. Budgets are never changed. One JSON line per run goes to stdout.
//   node scripts/scheduled-refresh.ts          run forever, at 07:00 and 19:00 Asia/Singapore
//   node scripts/scheduled-refresh.ts --once   one run now, then exit
// COLLECT_ENABLED=false skips collection and page fetching; MODEL_CALLS_ENABLED=false skips analysis and grouping.
import { closeDb, sql } from "@aihot/backend/db";
import { extractArticleBody } from "@aihot/backend/content/extract";
import { afterFailure, processArticle } from "@aihot/backend/jobs/content";
import { activeEventGroupJobs, ageSkipOldAutomaticEventGroups, drainEventGroups, prioritizeNewestAutomaticEventGroups, recoverExpiredEventGroupClaims } from "@aihot/backend/jobs/events";
import { getBoss, QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { BudgetExceededError, markStalePendingReceipts, ReceiptUnknownError } from "@aihot/backend/providers/receipts";
import { collectSource } from "@aihot/backend/sources/collect";

// Only ever enqueues (never maintains, schedules or migrates) in this process; see jobs/queue.ts.
process.env.PGBOSS_PASSIVE = "true";

const SLOT_HOURS_SGT = [7, 19];
const SGT_OFFSET_MS = 8 * 3_600_000; // Singapore has no daylight saving time
const WINDOW = "48 hours";
const MAX_REQUESTS = 60;
const MAX_GROUP_JOBS = 12;
const MAX_CONSECUTIVE_ERRORS = 3;
const LOCK_KEY = 7_204_001; // pg advisory lock: one run at a time, daemon or --once

const collecting = () => process.env.COLLECT_ENABLED !== "false";
const modelling = () => process.env.MODEL_CALLS_ENABLED !== "false";

let stopping = false;
let wake: (() => void) | null = null;

/** The next 07:00 or 19:00 Singapore time after `now`. */
export function nextSlot(now: number): number {
  const sgtMidnight = Math.floor((now + SGT_OFFSET_MS) / 86_400_000) * 86_400_000 - SGT_OFFSET_MS;
  for (let day = 0; day < 2; day++) {
    for (const hour of SLOT_HOURS_SGT) {
      const at = sgtMidnight + day * 86_400_000 + hour * 3_600_000;
      if (at > now) return at;
    }
  }
  throw new Error("unreachable");
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length && !stopping) await fn(items[next++]!);
  }));
}

const tally = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

async function collectAll() {
  const ids = (await sql<{ id: string }[]>`SELECT id FROM sources WHERE enabled ORDER BY id`).map((r) => r.id);
  const out = { sources: ids.length, ok: 0, failed: 0, skipped: 0, created: 0, revised: 0 };
  await pool(ids, 3, async (id) => {
    try {
      const r = await collectSource(id);
      out[r.status] += 1;
      out.created += r.created;
      out.revised += r.revised;
    } catch {
      out.failed += 1;
    }
  });
  return out;
}

async function fetchBodies() {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM articles WHERE body_status = 'pending' AND discovered_at > now() - ${WINDOW}::interval ORDER BY published_at DESC NULLS LAST`;
  const out: Record<string, number> = { attempted: rows.length };
  await pool(rows, 4, async ({ id }) => {
    let result: string;
    try { result = await extractArticleBody(id, false); } catch { result = "error"; }
    tally(out, result);
  });
  return out;
}

async function processNew(started: Date) {
  const out = { candidates: 0, processed: 0, states: {} as Record<string, number>, errors: 0, requests: 0, stop: "finished" };
  const ids = (await sql<{ id: string }[]>`
    SELECT id FROM articles
    WHERE processing_state = 'new' AND discovered_at > now() - ${WINDOW}::interval
      AND (processing_retry_at IS NULL OR processing_retry_at <= now())
    ORDER BY backfill, published_at DESC NULLS LAST`).map((r) => r.id);
  out.candidates = ids.length;
  const requests = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipt_attempts WHERE started_at >= ${started}`)[0]!.n;
  let consecutiveErrors = 0;
  for (const id of ids) {
    if (stopping) { out.stop = "shutdown"; break; }
    if ((out.requests = await requests()) >= MAX_REQUESTS) { out.stop = "request-cap"; break; }
    try {
      const { state } = await processArticle(id);
      tally(out.states, state);
      out.processed += 1;
      if (state === "unknown-receipt") { out.stop = "unknown-receipt"; break; }
      await sql`UPDATE articles SET processing_attempts = 0, processing_retry_at = NULL, processing_queued_at = NULL WHERE id = ${id}`;
      consecutiveErrors = 0;
    } catch (error) {
      out.errors += 1;
      if (error instanceof ReceiptUnknownError) { out.stop = "unknown-receipt"; break; }
      // The same bookkeeping as the worker: retry later with backoff, or mark failed for good.
      await afterFailure(id, error).catch(() => {});
      if (error instanceof BudgetExceededError) { out.stop = "budget"; break; }
      if (/usage limit|429|rate.?limit/i.test(String(error))) { out.stop = "provider-limit"; break; }
      if (++consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { out.stop = "errors"; break; }
    }
  }
  out.requests = await requests();
  return out;
}

async function pendingGroups() {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pgboss.job WHERE name = ${QUEUES.group} AND state IN ('created', 'retry')`;
  return Number(row?.n ?? 0);
}

export async function prepareEventGroups() {
  // Placeholders of a process that stopped mid-request become unknown before any job is claimed. Nothing else
  // releases them here (no worker runs), and a changed candidate set would otherwise send a new paid request.
  await markStalePendingReceipts();
  const stalled = await recoverExpiredEventGroupClaims();
  const ageSkipped = await ageSkipOldAutomaticEventGroups();
  await prioritizeNewestAutomaticEventGroups();
  return { stalled, ageSkipped };
}

async function processGroups(started: Date, prepared: { stalled: number; ageSkipped: number }) {
  const pendingBefore = await pendingGroups();
  const boss = await getBoss();
  const hasRequestRoom = async () => (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM receipt_attempts WHERE started_at >= ${started}`)[0]!.n < MAX_REQUESTS;
  const result = await drainEventGroups(boss, {
    maxJobs: MAX_GROUP_JOBS,
    canContinue: hasRequestRoom,
    beforeModelRequest: hasRequestRoom,
    forceLexical: true,
    shouldStop: () => stopping,
    onError: (error, job) => {
      if (error instanceof ReceiptUnknownError) console.error(`[refresh grouping] receipt outcome unknown for ${job.articleId}`);
      else console.error(`[refresh grouping] ${job.articleId}: ${String(error).slice(0, 300)}`);
    },
  });
  return { ...result, ...prepared, active: await activeEventGroupJobs(), requests: (await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM receipt_attempts WHERE started_at >= ${started}`)[0]!.n, pendingBefore, pending: await pendingGroups() };
}

async function run(): Promise<Record<string, unknown>> {
  const summary: Record<string, unknown> = { collect: "off", bodies: "off", process: "off" };
  // Nothing to do: no database connection is opened either.
  if (!collecting() && !modelling()) return { ...summary, status: "disabled" };
  const lock = await sql.reserve();
  try {
    const [{ locked }] = await lock<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
    if (!locked) return { ...summary, status: "another-run-in-progress" };
    let status = "finished";
    try {
      if (collecting()) {
        summary.collect = await collectAll();
        summary.bodies = await fetchBodies();
      }
      if (modelling()) {
        const groupingPrep = await prepareEventGroups();
        const started = new Date();
        const processed = await processNew(started);
        summary.process = processed;
        // A job that errored is not a clean run, whatever stopped the loop.
        status = processed.stop === "finished" && processed.errors > 0 ? "errors" : processed.stop;
        // Analysis always gets first use of the shared request target. Grouping drains only whatever
        // room remains and claims jobs serially, so the rest stay queued for a later refresh.
        if (processed.stop === "finished") {
          const grouping = await processGroups(started, groupingPrep);
          summary.grouping = grouping;
          if (grouping.stop !== "finished") status = grouping.stop;
          else if (grouping.errors > 0) status = "errors";
        } else {
          const pending = await pendingGroups();
          summary.grouping = { attempted: 0, completed: 0, ageSkipped: groupingPrep.ageSkipped, deferred: 0, blocked: 0, errors: 0,
            stalled: groupingPrep.stalled, active: await activeEventGroupJobs(), requests: processed.requests, pendingBefore: pending, pending, stop: processed.stop };
        }
      }
    } catch (error) {
      status = "error";
      summary.error = String(error instanceof Error ? error.message : error).slice(0, 300);
    }
    return { ...summary, status };
  } finally {
    await lock`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    lock.release();
  }
}

async function runLogged() {
  const startedAt = Date.now();
  // A failed run (database down, say) is logged; the schedule goes on.
  const summary = await run().catch((error: unknown) => ({ status: "error", error: String(error instanceof Error ? error.message : error).slice(0, 300) }));
  console.log(JSON.stringify({ event: "refresh", startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), ...summary }));
}

async function main() {
  const once = process.argv.includes("--once");
  const stop = () => { stopping = true; wake?.(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  if (once) {
    await runLogged();
  } else {
    console.log(JSON.stringify({ event: "scheduler-started", slotsSgt: SLOT_HOURS_SGT, collect: collecting(), modelCalls: modelling(), next: new Date(nextSlot(Date.now())).toISOString() }));
    while (!stopping) {
      const wait = nextSlot(Date.now()) - Date.now();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait);
        wake = () => { clearTimeout(timer); resolve(); };
      });
      wake = null;
      if (stopping) break;
      await runLogged();
    }
  }
}

// Importable for tests (nextSlot) without starting anything.
if (import.meta.main) {
  try {
    await main();
  } finally {
    await stopBoss().catch(() => {});
    await closeDb();
  }
}
