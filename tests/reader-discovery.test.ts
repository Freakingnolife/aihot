import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildApp } from '../apps/api/src/app.ts';
import { closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
const app=await buildApp();
after(async()=>{await app.close();await stopBoss();await closeDb();});
test('reader machine guides are English and describe manual pilot operation',async()=>{
  for(const url of ['/llms.txt','/openapi-v1.json']){
    const res=await app.inject({method:'GET',url});assert.equal(res.statusCode,200);
    assert.doesNotMatch(res.body,/[\u4e00-\u9fff]/u);assert.match(res.body,/twice a day|not generated on a schedule/i);assert.doesNotMatch(res.body,/pilot|unapproved|manual collection/i);
    assert.doesNotMatch(res.body,/published once a day at 08:00/);
  }
  const spec=(await app.inject({method:'GET',url:'/openapi-v1.json'})).json();
  assert.ok(spec.paths['/api/v1/items']);assert.ok(spec.paths['/api/v1/dailies']);
  assert.ok(!Object.keys(spec.paths).some(p=>p.includes('codex-resets')));
});
test('search engines get a robots.txt that hides the image proxy and a sitemap without empty report pages',async()=>{
  const robots=(await app.inject({method:'GET',url:'/robots.txt'})).body;
  assert.match(robots,/^Disallow: \/api\/img-proxy$/m);assert.match(robots,/^Disallow: \/admin$/m);assert.match(robots,/^Disallow: \/feedback$/m);
  assert.doesNotMatch(robots,/^Disallow: \/$/m);assert.match(robots,/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
  const sitemap=await app.inject({method:'GET',url:'/sitemap.xml'});assert.equal(sitemap.statusCode,200);
  const locs=[...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]!).pathname);
  assert.ok(locs.includes('/all'));assert.ok(locs.includes('/privacy'));
  assert.ok(!locs.includes('/hot')&&!locs.includes('/'));
  for(const path of locs) assert.doesNotMatch(path,/^\/(admin|feedback|starred|more|api)/);
});
