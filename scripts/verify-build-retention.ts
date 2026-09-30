// Offline integration gate: rebuild without deleting client chunks held by open reader tabs.
// Run with Node24; this invokes a real web build, so do not run beside another build.
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import { existsSync,readdirSync,readFileSync,writeFileSync,unlinkSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const assets=join(root,'apps/web/build/client/assets');
assert(existsSync(assets),'Build the private reader once before running the retention gate.');
const marker=join(assets,'retention-regression-'+randomUUID()+'.js');
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(marker,'// Synthetic old client chunk for rebuild regression only.\n');
const before=new Map(readdirSync(assets).filter(n=>/\.(js|css|woff2|png|svg)$/.test(n)).map(n=>[n,digest(join(assets,n))]));
try {
 const result=spawnSync('npm',['run','build','-w','@aihot/web'],{cwd:root,encoding:'utf8',timeout:120_000,maxBuffer:8*1024*1024});
 mkdirSync(join(root,'.data/repair'),{recursive:true});
 writeFileSync(join(root,'.data/repair/asset-build.log'),result.stdout+'\n'+result.stderr);
 assert.equal(result.status,0,'Production build failed; see .data/repair/asset-build.log.');
 const missing=[...before.keys()].filter(n=>!existsSync(join(assets,n)));
 const changed=[...before].filter(([n,h])=>existsSync(join(assets,n))&&digest(join(assets,n))!==h).map(([n])=>n);
 assert.deepEqual(missing,[],'Rebuild removed client chunks that an open tab can still reference.');
 assert.deepEqual(changed,[],'Rebuild changed bytes at an existing immutable client-asset URL.');
 console.log('PASS: '+before.size+' existing client assets retained byte-for-byte through a real production rebuild.');
} finally {
 if(existsSync(marker))unlinkSync(marker);
}
