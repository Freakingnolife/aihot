// Event jobs: serial grouping, debounced digests.
import type { PgBoss } from "pg-boss";
import { GroupRequestCapError, groupArticle } from "../events/group.ts";
import { composeStoryDigest } from "../events/digest.ts";
import { BudgetExceededError, ProviderRejectedError, ReceiptBusyError, ReceiptUnknownError, unknownReceiptFor } from "../providers/receipts.ts";
import { settleNonEditorial } from "./content.ts";
import { ensureQueue, enqueue, QUEUES } from "./queue.ts";
import { sql } from "../db.ts";

export async function registerEventJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.group);
  // Serial on purpose: two reports of the same new fact must not both create it.
  await boss.work<{ articleId: string; signalOnly?: boolean; force?: boolean }>(QUEUES.group, { localConcurrency: 1, pollingIntervalSeconds: 0.5 }, async ([job]) => {
    if (!job) return;
    return handleEventGroup(job.data);
  });
  await ensureQueue(QUEUES.digest);
  await boss.work<{ storyId: number; afterCorrection?: boolean }>(QUEUES.digest, { localConcurrency: 3, pollingIntervalSeconds: 5 }, async ([job]) => {
    if (!job) return;
    return composeStoryDigest(job.data.storyId, { afterCorrection: job.data.afterCorrection });
  });
}

export interface EventGroupJob {
  articleId: string;
  signalOnly?: boolean;
  force?: boolean;
}

/** Shared by the worker and the scheduled refresh's bounded, serial queue drain. */
export async function handleEventGroup(data: EventGroupJob, opts: { beforeModelRequest?: () => Promise<boolean>; forceLexical?: boolean; digests?: boolean } = {}) {
  // A discussion post comes here straight from collection: record it first (settleNonEditorial).
  if (data.signalOnly && !data.force && !(await settleNonEditorial(data.articleId)).group) return { verdict: "skipped" as const };
  const result = await groupArticle(data.articleId, { signalOnly: data.signalOnly, force: data.force, beforeModelRequest: opts.beforeModelRequest, forceLexical: opts.forceLexical });
  if (result.storyId && !result.verdict.startsWith("signal") && opts.digests !== false) {
    await enqueue(QUEUES.digest, { storyId: result.storyId }, { singletonKey: `story:${result.storyId}`, startAfter: 60 });
  }
  return result;
}

export interface GroupDrainOptions {
  maxJobs: number;
  canContinue: () => Promise<boolean>;
  onError?: (error: unknown, data: EventGroupJob) => void;
  shouldStop?: () => boolean;
  beforeModelRequest?: () => Promise<boolean>;
  /** Scheduled refreshes deliberately stay on free lexical recall. */
  forceLexical?: boolean;
}

/** How long a grouping job whose paid outcome is unknown waits before it is tried again (no request is sent meanwhile). */
const UNKNOWN_RECEIPT_DEFER_SECONDS = 12 * 3600;

/**
 * Recover only timed-out grouping claims. The scheduled refresh calls this under its advisory lock.
 * A timed-out claim is a crash while handling the job, so it spends one retry, as pg-boss does on expiry:
 * a job that always kills the process ends as failed instead of being re-claimed forever.
 */
export async function recoverExpiredEventGroupClaims() {
  const rows = await sql<{ id: string }[]>`UPDATE pgboss.job
    SET state = (CASE WHEN retry_count < retry_limit THEN 'retry' ELSE 'failed' END)::pgboss.job_state,
      retry_count = retry_count + 1,
      start_after = now(), started_on = NULL, heartbeat_on = NULL, singleton_on = NULL,
      completed_on = CASE WHEN retry_count < retry_limit THEN NULL ELSE now() END,
      output = CASE WHEN retry_count < retry_limit THEN output ELSE ${sql.json({ value: { message: "job expired while being processed" } })} END
    WHERE name = ${QUEUES.group} AND state = 'active'
      AND started_on + expire_seconds * interval '1 second' < now()
    RETURNING id`;
  return rows.length;
}

/** Keep old automatic work visible as standalone, but retire its queue row with an explicit outcome. */
export async function ageSkipOldAutomaticEventGroups(days = 14) {
  const rows = await sql<{ id: string }[]>`UPDATE pgboss.job j
    SET state = 'completed', completed_on = now(), started_on = NULL, heartbeat_on = NULL,
        output = ${sql.json({ outcome: "age-skip", reason: "older-than-14-days" })}
    FROM articles a
    WHERE j.name = ${QUEUES.group} AND j.state IN ('created', 'retry')
      AND j.data->>'articleId' = a.id
      AND j.data->>'force' IS DISTINCT FROM 'true' AND j.data->>'signalOnly' IS DISTINCT FROM 'true'
      AND coalesce(a.published_at, a.discovered_at) < now() - make_interval(days => ${days})
    RETURNING j.id`;
  return rows.length;
}

/** Make recent automatic report jobs win the existing pg-boss priority ordering. */
export async function prioritizeNewestAutomaticEventGroups() {
  await sql`WITH ranked AS (
    SELECT j.id, (count(*) OVER () - row_number() OVER (
      ORDER BY coalesce(a.published_at, a.discovered_at) DESC, j.created_on DESC, j.id DESC))::int AS priority
    FROM pgboss.job j JOIN articles a ON j.data->>'articleId' = a.id
    WHERE j.name = ${QUEUES.group} AND j.state IN ('created', 'retry')
      AND j.data->>'force' IS DISTINCT FROM 'true' AND j.data->>'signalOnly' IS DISTINCT FROM 'true'
  )
  UPDATE pgboss.job j SET priority = ranked.priority FROM ranked WHERE j.id = ranked.id`;
}

export async function activeEventGroupJobs() {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pgboss.job WHERE name = ${QUEUES.group} AND state = 'active'`;
  return Number(row?.n ?? 0);
}

/** Return a resource-blocked active claim to the queue without spending a processing retry. */
async function deferGroupJob(boss: PgBoss, id: string, afterSeconds: number | null = null) {
  // pg-boss increments retry_count when it reclaims a job whose started_on is still set. Clearing
  // the claim fields here preserves the failure retry budget for actual processing errors only.
  await sql`UPDATE pgboss.job SET state = 'retry', start_after = now() + make_interval(secs => coalesce(${afterSeconds}, retry_delay)),
    started_on = NULL, heartbeat_on = NULL, singleton_on = NULL, completed_on = NULL
    WHERE name = ${QUEUES.group} AND id = ${id} AND state = 'active'`;
}

/** Purposes of the grouping judgements a report's job sends; their subjects start with `article:<id>`. */
const GROUPING_RECEIPT_PURPOSES = ["group_article", "group_signal", "group_review"];

const isProviderLimit = (error: unknown) => error instanceof ProviderRejectedError && error.status === 429;

/**
 * Claim one existing grouping job at a time. Jobs not claimed remain resumable in pg-boss.
 * Resource stops (request cap, budget, provider limit, busy receipt) end the drain and spend no retry.
 * An unknown-outcome receipt blocks only its own job, which waits for the admin or the automatic release;
 * the rest of the queue still drains. Digests are not queued here: nothing on the scheduled path consumes them.
 */
export async function drainEventGroups(boss: PgBoss, options: GroupDrainOptions) {
  const out = { attempted: 0, completed: 0, deferred: 0, blocked: 0, errors: 0, stop: "finished" };
  for (let i = 0; i < options.maxJobs; i++) {
    if (options.shouldStop?.()) { out.stop = "shutdown"; break; }
    if (!(await options.canContinue())) { out.stop = "request-cap"; break; }
    const [job] = await boss.fetch<EventGroupJob>(QUEUES.group, { batchSize: 1 });
    if (!job) break;
    out.attempted += 1;
    try {
      // A judgement for this report with an open outcome: a changed candidate set would be a new key and a second
      // paid request. Park the job without a request; the catch below defers it like any unknown receipt.
      const unknown = await unknownReceiptFor([`article:${job.data.articleId}`], GROUPING_RECEIPT_PURPOSES);
      if (unknown !== null) throw new ReceiptUnknownError(unknown, `grouping receipt ${unknown} for ${job.data.articleId} has an unknown outcome`);
      const result = await handleEventGroup(job.data, { beforeModelRequest: options.beforeModelRequest, forceLexical: options.forceLexical, digests: false });
      await boss.complete(QUEUES.group, job.id, result);
      out.completed += 1;
    } catch (error) {
      const providerLimit = isProviderLimit(error);
      if (error instanceof ReceiptUnknownError) {
        await deferGroupJob(boss, job.id, UNKNOWN_RECEIPT_DEFER_SECONDS);
        out.blocked += 1;
      } else if (error instanceof GroupRequestCapError || error instanceof BudgetExceededError || error instanceof ReceiptBusyError || providerLimit) {
        await deferGroupJob(boss, job.id);
        out.deferred += 1;
      } else {
        out.errors += 1;
        await boss.fail(QUEUES.group, job.id, { error: String(error).slice(0, 500) });
      }
      options.onError?.(error, job.data);
      if (error instanceof GroupRequestCapError) { out.stop = "request-cap"; break; }
      if (error instanceof BudgetExceededError) { out.stop = "budget"; break; }
      if (error instanceof ReceiptBusyError) { out.stop = "receipt-busy"; break; }
      if (providerLimit) { out.stop = "provider-limit"; break; }
      if (out.errors >= 3) { out.stop = "errors"; break; }
    }
  }
  return out;
}
