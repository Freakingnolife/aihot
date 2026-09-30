import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { translatePending } from '@aihot/backend/editorial/translate';
import { assertSupportedConfig } from '@aihot/backend/sources/config-keys';
import { enforceIdentity, fallbackTitle, compactAnswerFirstSummary } from '@aihot/backend/editorial/writing';
const read = (name: string) => JSON.parse(readFileSync(new URL(`../industry/${name}`, import.meta.url), 'utf8'));
test('all 44 pilot identities map to observed routes with supported keys and no fulltext rights', () => {
  const sources = read('sources.json').sources;
  const manifest = read('source-manifest.json');
  const validations = read('source-selector-validation.json');
  assert.equal(sources.length,44); assert.equal(new Set(sources.map((s:any)=>s.id)).size,44);
  for(const s of sources) {
    assertSupportedConfig(s.kind,s.config);
    const provenance=manifest.sources.find((m:any)=>m.id===s.id);
    assert(provenance?.route.evidence_ref);
    assert.equal(s.config.feedUrl ?? s.config.url,provenance.route.final_url);
    assert.equal(s.config._aihot.initialBackfillLimit,1);
    assert.equal(s.site_fulltext,false);assert.equal(s.syndicate_fulltext,false);
    if(s.kind==='web_list') {
      const check=validations.find((v:any)=>v.id===s.id);
      assert.equal(check.selector,s.config.itemSelector);
      assert(check.sampleMatches.length>=2);
      assert(check.sampleMatches.every((x:any)=>x.matched && provenance.route.sample_article_links.some((a:any)=>new URL(a.url).href===new URL(x.url).href)));
    }
  }
});
test('English identity fallback retains the original title and drops an invented organization',()=>{
 const input={title:'Formlabs announces a printer',text:'Formlabs describes a new printer.',sourceKind:'rss'};
 const output=enforceIdentity(input,{titleZh:'Roboze announces a printer',summaryZh:'Roboze says it is available.'});
 assert.equal(output.titleZh,input.title);assert.equal(output.summaryZh,'');assert.equal(output.identityGuard.outcome,'fallback');
 assert.equal(fallbackTitle(input.title),input.title);
 const sentence='Formlabs reports a process update with stated limitations. ';
 const compact=compactAnswerFirstSummary(sentence.repeat(25));
 assert(compact.length<=800);assert(compact.endsWith('.'));assert(!compact.includes('。'));
});

test('English pilot does not schedule automatic Chinese body or quote translation', async () => {
  assert.deepEqual(await translatePending(), {done:[],quotes:0});
});
