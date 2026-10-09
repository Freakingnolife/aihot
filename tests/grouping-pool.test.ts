import './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { loadPool } from '@aihot/backend/publication/pool';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { tag } from './setup.ts';

const T = tag();
const SOURCE = `pool-group-${T}`;
const now = new Date('2026-10-10T00:00:00Z');
after(async () => { await stopBoss(); await closeDb(); });

async function article(suffix: string, publishedAt: Date) {
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.invalid/${SOURCE}/${suffix}`,
    title: `Fixture event ${T} ${suffix}`, bodyText: `Fixture event text ${T} ${suffix}. `.repeat(30), bodyStatus: 'ok', via: 'fetch', publishedAt });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','products',${sql.array([SOURCE])},${`Fixture event ${T} ${suffix}`},'Fixture summary',30,false)`;
  await publishArticle(articleId, { releasedAt: new Date(now.getTime() - 60_000) });
  return articleId;
}

test('pool folds a confirmed event across the raw article page boundary before counts and pagination', async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES
    (${SOURCE},'Publisher A','rss','T1','editorial','2100-01-01'),(${`${SOURCE}-b`},'Publisher B','rss','T2','editorial','2100-01-01')`;
  const standalone = [] as string[];
  for (let i = 0; i < 39; i++) standalone.push(await article(`standalone-${i}`, new Date(now.getTime() - (i + 1) * 60_000)));
  const first = await article('same-event-a', new Date(now.getTime() - 40 * 60_000));
  const second = await article('same-event-b', new Date(now.getTime() - 41 * 60_000));
  await sql`UPDATE articles SET source_id = ${`${SOURCE}-b`} WHERE id = ${second}`;
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},'Confirmed fixture event',${now},${now}) RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${`fact-${T}`},${story!.id},'Confirmed fixture event') RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${first},'report'),(${fact!.id},${second},'report')`;
  await publishArticle(first);
  await publishArticle(second);

  const base = { channel: 'all' as const, category: null, tag: SOURCE, mode: 'archive' as const, now };
  const page1 = await loadPool(base);
  const page2 = await loadPool({ ...base, page: 2 });
  assert.equal(page1.total, 40, '41 eligible articles become 40 browse cards');
  assert.equal(page1.pageCount, 1, 'counts and page count use folded events');
  assert.equal(page2.items.length, 0, 'the event pair cannot split across pages');
  assert.ok(page1.items.every((item) => !item.selected), 'unselected but relevant stories remain browseable');
  const event = page1.items.find((item) => item.event);
  assert.equal(event?.event?.sourceCount, 2);
  assert.deepEqual(new Set(event?.event?.reports.map((report) => report.originalUrl)), new Set([
    `https://example.invalid/${SOURCE}/same-event-a`, `https://example.invalid/${SOURCE}/same-event-b`,
  ]));
  assert.equal(new Set([...standalone, first, second]).size, 41);
});

test('2,001 eligible articles fold to 2,000 events before the browse ceiling and page 50', async () => {
  const source = `${SOURCE}-ceiling`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source},'Ceiling publisher','rss','T2','editorial','2100-01-01')`;
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,first_report_at,latest_at) VALUES (${randomUUID()},'Ceiling pair',${now},${now}) RETURNING id`;
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,published_at,discovered_at,timeline_at)
    SELECT ${source}||'-'||n,${source},${source}||'-'||n,'https://example.invalid/'||n,'Ceiling fixture '||n,
      ${now}::timestamptz-n*interval '1 second',${now},${now}::timestamptz-n*interval '1 second'
    FROM generate_series(1,2001) n`;
  await sql`INSERT INTO publications (article_id,title,summary,eligible,source_id,channel,url,published_at,discovered_at,timeline_at,sort_at,tags,story_id,search_text)
    SELECT id,title,'Ceiling fixture summary',true,source_id,'news',url,published_at,discovered_at,timeline_at,timeline_at,ARRAY[${source}],
      CASE WHEN id IN (${source+'-1'},${source+'-2'}) THEN ${story!.id}::bigint END,lower(title)
    FROM articles WHERE source_id=${source}`;
  await sql`INSERT INTO pool_search (article_id,direct,body) SELECT article_id,search_text,'' FROM publications WHERE source_id=${source}`;

  for (const mode of ['recent', 'archive'] as const) for (const search of [
    {}, { q: 'ceiling', tab: 'time' as const }, { q: 'ceiling', tab: 'relevance' as const },
  ]) {
    const result = await loadPool({ channel: 'all', category: null, tag: source, mode, now, page: 50, ...search });
    assert.equal(result.total, 2000, `${mode}/${search.tab ?? 'browse'} total counts folded events`);
    assert.equal(result.pageCount, 50);
    assert.equal(result.items.length, 40, `${mode}/${search.tab ?? 'browse'} page 50 remains full`);
    const oldestEvent = result.items.find((item) => item.id === `${source}-2001`);
    assert.ok(oldestEvent, `${mode}/${search.tab ?? 'browse'} retains the oldest standalone event`);
    const firstPage = await loadPool({ channel: 'all', category: null, tag: source, mode, now, page: 1, ...search });
    const pair = firstPage.items.find((item) => item.event);
    assert.equal(pair?.event?.sourceCount, 1);
    assert.equal(pair?.event?.reports.length, 2, 'both reports remain attached to the one event');
  }
});
