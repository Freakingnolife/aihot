// Reproduce supported-key and observed article-link checks. --live refreshes only the 11 web listings.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertSupportedConfig } from '@aihot/backend/sources/config-keys';
import { fromHtml } from '@aihot/backend/sources/web-list';
import { guardedFetch } from '@aihot/backend/lib/http-fetch';
import type { SourceRow } from '@aihot/backend/sources/types';
const { sources } = JSON.parse(readFileSync('industry/sources.json','utf8'));
const manifest = JSON.parse(readFileSync('industry/source-manifest.json','utf8'));
const prior = JSON.parse(readFileSync('industry/source-selector-validation.json','utf8'));
assert.equal(sources.length,44);
mkdirSync('.data/private-pilot/listings',{recursive:true});
const results=[];
for(const source of sources as SourceRow[]) {
  assertSupportedConfig(source.kind,source.config);
  const provenance=manifest.sources.find((s: {id:string})=>s.id===source.id);
  assert.equal(source.config.feedUrl ?? source.config.url,provenance.route.final_url);
  if(source.kind!=='web_list')continue;
  const file=`.data/private-pilot/listings/${source.id}.html`;
  if(process.argv.includes('--live')) {
    const response=await guardedFetch(source.config.url,{timeoutMs:25_000});
    assert.equal(response.status,200,source.id);writeFileSync(file,response.text());
  }
  const html=readFileSync(file,'utf8');
  const candidates=fromHtml(html,source.config.url,source);
  const sampleMatches=provenance.route.sample_article_links.map((sample:{url:string})=>({url:sample.url,matched:candidates.some(c=>new URL(c.url).href===new URL(sample.url).href)}));
  assert(sampleMatches.length>=2 && sampleMatches.every((s:{matched:boolean})=>s.matched),`${source.id}: observed article URLs must match`);
  results.push({id:source.id,checkedAt:new Date().toISOString(),selector:source.config.itemSelector,sampleMatches,candidateCount:candidates.length,first:candidates[0],snapshotSha256:createHash('sha256').update(html).digest('hex'),limitation:prior.find((s:{id:string})=>s.id===source.id)?.limitation??null});
}
writeFileSync('industry/source-selector-validation.json',JSON.stringify(results,null,2)+'\n');
console.log(`44 supported source configs; ${results.length} web listings match ${results.reduce((n,r)=>n+r.sampleMatches.length,0)} observed sample URLs.`);
