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
    assert.doesNotMatch(res.body,/[\u4e00-\u9fff]/u);assert.match(res.body,/manual collection/i);assert.match(res.body,/no report cron/i);
    assert.doesNotMatch(res.body,/published once a day at 08:00/);
  }
  const spec=(await app.inject({method:'GET',url:'/openapi-v1.json'})).json();
  assert.ok(spec.paths['/api/v1/items']);assert.ok(spec.paths['/api/v1/dailies']);
  assert.ok(!Object.keys(spec.paths).some(p=>p.includes('codex-resets')));
});
