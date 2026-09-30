import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fromHtml } from '@aihot/backend/sources/web-list';
import type { SourceRow } from '@aihot/backend/sources/types';

test('Formlabs collector reads a changing dated press list, not a featured blog import', () => {
 const config = JSON.parse(readFileSync(new URL('../industry/sources.json', import.meta.url),'utf8')).sources.find((s:SourceRow)=>s.id==='formlabs');
 const html = '<ul class="Press_press_list__sample"><li><a href="/company/press/new-announcement/"><span class="Press_date__sample">2026-09-30</span>New announcement</a></li><li><a href="/company/press/formlabs-board-changes-dan-riccio/"><span class="Press_date__sample">2026-08-12</span>Board changes</a></li><li><a href="/company/press/formlabs-unveils-fuse-x1-large-format-sls-3d-printing/"><span class="Press_date__sample">2026-06-09</span>Fuse X1</a></li></ul><a href="/blog/announcing-fuse-x1-industrial-sls/">Featured blog</a>';
 const rows=fromHtml(html,config.config.url,config);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.publishedAt?.toISOString().slice(0,10)),['2026-09-30','2026-08-12','2026-06-09']);
 assert.equal(new URL(rows[0]!.url).pathname,'/company/press/new-announcement/');
 assert(rows.every(r=>!r.url.includes('/blog/')));
});
