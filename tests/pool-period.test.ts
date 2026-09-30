import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { loadPool } from '@aihot/backend/publication/pool';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { tag } from './setup.ts';
const source = `period-${tag()}`;
const now = new Date('2026-09-30T12:00:00Z');
after(async () => { await stopBoss(); await closeDb(); });
test('recent and archive apply original dates before pagination, search, counts and hydration', async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source},'Period fixture','rss','T1','editorial')`;
  const records: Array<{id:string; date:Date|null}> = [];
  // 45 recent, 4 stale, 4 unknown, 2 future; all imported now and unselected.
  for (let i=0;i<55;i++) {
    const date = i<45 ? new Date(now.getTime() - (i%20+1)*86400000) : i<49 ? new Date('2026-01-01') : i<53 ? null : new Date('2026-10-01');
    const {articleId:id}=await upsertMaterial({sourceId:source,url:`https://example.invalid/${source}/${i}`,title:`Periodneedle ${i}`,bodyText:'A substantive fixture body. '.repeat(30),bodyStatus:'ok',via:'fetch',publishedAt:date});
    await sql`UPDATE articles SET discovered_at=${now}, published_at=${date}, timeline_at=${date ?? now}, backfill=true WHERE id=${id}`;
    await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected) VALUES (${id},1,'rule','pass','products',${sql.array([source])},${i===49?'Periodneedle priority':'Periodneedle'},${i===0?'Periodneedle priority attributed draft':'Periodneedle attributed draft'},49,false)`;
    await publishArticle(id,{releasedAt:new Date(now.getTime()-60000)});
    records.push({id,date});
  }
  const base={channel:'all' as const,category:null,tag:source,now};
  const recent = await loadPool({...base,mode:'recent'});
  assert.equal(recent.total,45,'recent excludes unknown, old and future despite import time');
  assert.equal(recent.pageCount,2); assert.equal(recent.items.length,40); assert.equal(recent.todayCount,0);
  assert.ok(recent.items.every(x=>!x.selected && x.publishedAt));
  const expected=records.filter(x=>x.date && x.date<=now && x.date.getTime()>=now.getTime()-30*86400000).sort((a,b)=>b.date!.getTime()-a.date!.getTime() || b.id.localeCompare(a.id)).map(x=>x.id);
  const second=await loadPool({...base,mode:'recent',page:2});
  assert.equal(second.total,45);assert.deepEqual([...recent.items,...second.items].map(x=>x.id),expected);
  const archive=await loadPool({...base,mode:'archive'});const archive2=await loadPool({...base,mode:'archive',page:2});
  const ordered=records.sort((a,b)=>(b.date?.getTime()??-Infinity)-(a.date?.getTime()??-Infinity) || b.id.localeCompare(a.id)).map(x=>x.id);
  assert.equal(archive.total,55);assert.equal(archive2.total,55);assert.deepEqual([...archive.items,...archive2.items].map(x=>x.id),ordered);
  assert.ok(archive2.items.slice(-4).every(x=>x.publishedAt===null));
  for(const mode of ['recent','archive'] as const) for(const tab of ['time','relevance'] as const){
    const a=await loadPool({...base,mode,tab,q:'Periodneedle'});const b=await loadPool({...base,mode,tab,q:'Periodneedle',page:2});
    assert.equal(a.total,mode==='recent'?45:55);assert.equal(b.total,a.total);assert.deepEqual([...a.items,...b.items].map(x=>x.id),mode==='recent'?expected:ordered);
  }
  const relevant=await loadPool({...base,mode:'archive',tab:'relevance',q:'priority'});
  assert.equal(relevant.total,2);
  assert.equal(relevant.items[0]!.publishedAt,null,'relevance remains primary even for an unknown-date match');
  const relevantRecent=await loadPool({...base,mode:'recent',tab:'relevance',q:'priority'});
  assert.equal(relevantRecent.total,1);assert.ok(relevantRecent.items[0]!.publishedAt);
  // Live-clock calls share count cache only within the same mode.
  const live={...base,now:undefined};
  const recentLive=await loadPool({...live,mode:'recent'});const archiveLive=await loadPool({...live,mode:'archive'});
  assert.notEqual(recentLive.total,archiveLive.total);
  const legacy=await loadPool(base);assert.equal(legacy.total,55,'omitted mode preserves existing clients');
});
