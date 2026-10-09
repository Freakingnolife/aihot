// Public pool (/all) with numeric pages, and search in its two orderings.
import type { PoolResponse, TimelineFilters } from "@aihot/contracts/site";
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { sql, withCustomPlans, type Db } from "../db.ts";
import {
  categoryCondition, channelCondition, ITEM_COLUMNS, ITEM_FROM, listedCondition, tagCondition, toFeedItemSummary, topicCondition,
  type ItemRow,
} from "./items.ts";

export const POOL_PAGE_SIZE = 40;
export const POOL_MAX_PAGES = 50;

export class SearchBusyError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super("search capacity exhausted");
    this.retryAfter = retryAfter;
  }
}

// Search capacity guard: bounded concurrency with a short queue. Overflow answers 503 + Retry-After
// instead of letting machine traffic drag list browsing down.
const MAX_CONCURRENT_SEARCHES = Number(process.env.SEARCH_MAX_CONCURRENCY || 4);
const MAX_QUEUED_SEARCHES = Number(process.env.SEARCH_MAX_QUEUE || 8);
let running = 0;
const waiters: Array<() => void> = [];

export async function withSearchCapacity<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_SEARCHES) {
    if (waiters.length >= MAX_QUEUED_SEARCHES) throw new SearchBusyError(5);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.indexOf(go);
        if (i >= 0) waiters.splice(i, 1);
        reject(new SearchBusyError(5));
      }, 3000);
      const go = () => {
        clearTimeout(timer);
        resolve();
      };
      waiters.push(go);
    });
  }
  running += 1;
  try {
    return await withCustomPlans(fn);
  } finally {
    running -= 1;
    waiters.shift()?.();
  }
}

/** Search terms: whitespace separated, lower-cased, LIKE metacharacters escaped. */
export function searchTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => t.replace(/[\\%_]/g, (m) => `\\${m}`));
}

/** Default search: subject, title or summary match (search_text), newest first. */
export function directMatchCondition(terms: string[]) {
  if (terms.length === 0) return sql``;
  return terms.reduce((acc, t) => sql`${acc} AND p.search_text LIKE ${"%" + t + "%"}`, sql``);
}

/**
 * The public APIs' q (v1 and MCP): every term matches the subject, title or summary, or
 * the start of a body whose full text may be shown, as the API documents it ("title / Chinese
 * title / Chinese summary / body"). Results stay in time order.
 */
export function publicMatchCondition(terms: string[]) {
  if (terms.length === 0) return sql``;
  // Keep the body lookup correlated to the time-ordered candidates. Without OFFSET 0, PostgreSQL
  // may hash every matching body in pool_search before serving even the first 40 recent items.
  return terms.reduce(
    (acc, t) => sql`${acc} AND (p.search_text LIKE ${"%" + t + "%"} OR EXISTS (
      SELECT 1 FROM pool_search ps WHERE ps.article_id = p.article_id AND ps.body LIKE ${"%" + t + "%"} OFFSET 0))`,
    sql``,
  );
}

export interface PoolQuery extends TimelineFilters {
  mode?: "recent" | "archive";
  q?: string | null;
  tab?: "time" | "relevance";
  page?: number;
  topicTags?: string[] | null;
  now?: Date;
}

export async function loadPool(query: PoolQuery): Promise<PoolResponse> {
  const now = query.now ?? new Date();
  const page = Math.min(Math.max(query.page ?? 1, 1), POOL_MAX_PAGES);
  const q = query.q?.trim() || null;
  const tab = q && query.tab === "relevance" ? "relevance" : "time";
  const terms = q ? searchTerms(q) : [];
  const period = query.mode === "recent" ? sql`AND p.published_at >= ${new Date(now.getTime() - 30 * 86400000)} AND p.published_at <= ${now}` : sql``;
  const filters = sql`${period} ${channelCondition(query.channel)} ${categoryCondition(query.category)} ${tagCondition(query.tag)} ${topicCondition(query.topicTags)}`;
  const cap = POOL_MAX_PAGES * POOL_PAGE_SIZE;
  const like = (col: ReturnType<typeof sql>, t: string) => sql`${col} LIKE ${"%" + t + "%"}`;
  type EventRow = { id: string | null; event_at: Date | null; rel: number | null; members: number | null; source_count: number | null; reports: Array<{ source: string; title: string; originalUrl: string }> | null; total: number; today_count: number };
  const findEvents = async (db: Db): Promise<EventRow[]> => {
    let matching;
    let materialized = false;
    if (!q) matching = sql`
      SELECT p.article_id AS id,p.timeline_at,p.published_at,p.fact_id,coalesce(st.merged_into,p.story_id) AS story_root,
             p.first_party,p.body_mode,p.score,p.source_id,s.name AS source_name,p.title,p.url,0::int AS rel
      FROM publications p JOIN sources s ON s.id=p.source_id LEFT JOIN stories st ON st.id=p.story_id
      WHERE ${listedCondition(now)} AND p.eligible ${filters}`;
    else if (tab === "relevance") {
      const splitFields = terms.length === 1 && /[\p{L}\p{N}]{3}/u.test(terms[0]!)
        && (!query.channel || query.channel === "all") && !query.category && !query.tag && !query.topicTags?.length;
      const partScore = terms.reduce((acc, t) => sql`${acc} + (CASE WHEN ${like(sql`ps.direct`, t)} THEN 3 ELSE 0 END) + (CASE WHEN ${like(sql`ps.body`, t)} THEN 1 ELSE 0 END)`, sql`0`);
      const titleScore = terms.reduce((acc, t) => sql`${acc} + (CASE WHEN ${like(sql`lower(p.title)`, t)} THEN 6 ELSE 0 END)`, sql`0`);
      const anyMatch = terms.reduce((acc, t) => sql`${acc} AND (${like(sql`ps.direct`, t)} OR ${like(sql`ps.body`, t)})`, sql`TRUE`);
      const matches = splitFields ? sql`
        SELECT coalesce(d.article_id,b.article_id) AS article_id,(CASE WHEN d.article_id IS NOT NULL THEN 3 ELSE 0 END)+(CASE WHEN b.article_id IS NOT NULL THEN 1 ELSE 0 END) AS part
        FROM (SELECT article_id FROM pool_search WHERE direct LIKE ${"%" + terms[0]! + "%"}) d
        FULL JOIN (SELECT article_id FROM pool_search WHERE body LIKE ${"%" + terms[0]! + "%"}) b ON b.article_id=d.article_id`
        : sql`SELECT ps.article_id,(${partScore}) AS part FROM pool_search ps WHERE ${anyMatch}`;
      materialized = splitFields;
      matching = sql`WITH matches AS ${splitFields ? sql`MATERIALIZED` : sql`NOT MATERIALIZED`} (${matches})
        SELECT p.article_id AS id,p.timeline_at,p.published_at,p.fact_id,coalesce(st.merged_into,p.story_id) AS story_root,
               p.first_party,p.body_mode,p.score,p.source_id,s.name AS source_name,p.title,p.url,(matches.part+(${titleScore}))::int AS rel
        FROM matches JOIN publications p ON p.article_id=matches.article_id JOIN sources s ON s.id=p.source_id LEFT JOIN stories st ON st.id=p.story_id
        WHERE ${listedCondition(now)} AND p.eligible ${filters}`;
    } else matching = sql`
      SELECT p.article_id AS id,p.timeline_at,p.published_at,p.fact_id,coalesce(st.merged_into,p.story_id) AS story_root,
             p.first_party,p.body_mode,p.score,p.source_id,s.name AS source_name,p.title,p.url,0::int AS rel
      FROM publications p JOIN sources s ON s.id=p.source_id LEFT JOIN stories st ON st.id=p.story_id
      WHERE ${listedCondition(now)} AND p.eligible ${filters} ${directMatchCondition(terms)}`;

    const eventAt = query.mode ? sql`published_at` : sql`timeline_at`;
    const groupOrder = tab === "relevance" && q ? sql`rel DESC,event_at DESC NULLS LAST,id DESC` : sql`event_at DESC NULLS LAST,id DESC`;
    const todayAt = beijingMidnight(beijingDate(now));
    return db<EventRow[]>`
      WITH matching AS ${materialized ? sql`MATERIALIZED` : sql`NOT MATERIALIZED`} (${matching}), identified AS (
        SELECT m.*,coalesce('s:'||m.story_root::text,'f:'||m.fact_id::text,'a:'||m.id) AS event_key,
               ${eventAt} AS event_at
        FROM matching m
      ), grouped AS (
        SELECT event_key,
          (array_agg(id ORDER BY first_party DESC,(body_mode='full') DESC,score DESC NULLS LAST,timeline_at ASC,id ASC))[1] AS id,
          max(event_at) AS event_at,max(rel)::int AS rel,count(*)::int AS members,count(DISTINCT source_id)::int AS source_count,
          jsonb_agg(jsonb_build_object('source',source_name,'title',title,'originalUrl',url) ORDER BY event_at DESC NULLS LAST,id DESC) AS reports,
          bool_or(event_at >= ${todayAt} ${query.mode ? sql`AND event_at <= ${now}` : sql``}) AS today
        FROM identified GROUP BY event_key
      ), capped AS MATERIALIZED (
        SELECT * FROM grouped ORDER BY ${groupOrder} LIMIT ${cap}
      ), page AS (
        SELECT * FROM capped ORDER BY ${groupOrder} LIMIT ${POOL_PAGE_SIZE} OFFSET ${(page - 1) * POOL_PAGE_SIZE}
      )
      SELECT page.*, (SELECT count(*)::int FROM capped) AS total,
        (SELECT count(*)::int FROM grouped WHERE today) AS today_count
      FROM (SELECT 1) AS anchor LEFT JOIN page ON true`;
  };

  const events = q ? await withSearchCapacity(findEvents) : await findEvents(sql);
  const pageEvents = events.filter((event): event is EventRow & { id: string } => event.id !== null);
  const ids = pageEvents.map((event) => event.id);
  const rows = ids.length ? await sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE p.article_id IN ${sql(ids)}` : [];
  const rowsById = new Map(rows.map((r) => [r.id, toFeedItemSummary(r)]));
  const total = Number(events[0]?.total ?? 0);
  const todayCount = Number(events[0]?.today_count ?? 0);
  const items = pageEvents.flatMap((event) => {
    const item = rowsById.get(event.id);
    if (!item) return [];
    if ((event.members ?? 0) > 1) item.event = {
      sourceCount: event.source_count ?? 0,
      anchorAt: event.event_at?.toISOString() ?? null,
      reports: event.reports ?? [],
    };
    return [item];
  });
  const [meta] = await sql<{ updated_at: Date | null }[]>`SELECT max(updated_at) AS updated_at FROM publications WHERE eligible`;

  return {
    filters: { channel: query.channel, category: query.category, tag: query.tag, topic: query.topic ?? null, q, tab, ...(query.mode ? { mode: query.mode } : {}) },
    items,
    page,
    pageCount: Math.min(POOL_MAX_PAGES, Math.max(1, Math.ceil(total / POOL_PAGE_SIZE))),
    total,
    todayCount,
    freshness: (meta?.updated_at ?? now).toISOString(),
    generatedAt: now.toISOString(),
  };
}
