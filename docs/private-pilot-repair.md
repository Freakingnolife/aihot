# Private reader repair — 2026-09-30

The initial reader acceptance was too shallow. Marcus reported disappearing content after refresh, Chinese manuals, overlapping text and stale news. Acceptance was reopened; the following repair is verified for private reading only.

## Findings and changes

| Report | Reproduced evidence | Repair and proof |
| --- | --- | --- |
| Content disappears | `/` showed an empty Selected feed while `/all` retained six drafts. Same-URL reload loss was not reproduced. Browser logs also showed old JavaScript chunk requests returning 404 after rebuilds. | `/` now redirects without caching to Recent drafts and retains query filters. Builds retain prior client assets. Reloads, warm-tab navigation after rebuild/restart, filtered searches and local bookmarks retain content. The exact user sequence remains unconfirmed. |
| Chinese manuals | The API/MCP guide contained 346 Chinese characters; linked reader pages and shared controls also contained untranslated copy. | Reader pages, all three guide tabs, shared controls, populated Trending variants and empty/error states use English. This is reader-surface acceptance, not a claim about the entire upstream admin interface. |
| Text overlaps | RSS code overflowed on mobile. Doubled-text checks exposed mobile tab overlap, fixed-height navigation, a wordmark escaping its sidebar and toolbar/score overflow. | Wrapping, intrinsic heights and mobile clearance repaired. Four screen widths and separate doubled-text stress checks pass. Doubled text is a simulation, not actual browser zoom. |
| June launch looks fresh | Fuse X1 had no publication date; discovery in September supplied its sort position and relative age. | The original Formlabs blog confirms **9 June 2026**. Recent uses original publication dates from the last 30 days; older/unknown dates are in Archive, ordered before pagination. Calendar-only dates do not invent an hour. Discovery is explicitly separate. |

Primary date evidence: [Formlabs original announcement](https://formlabs.com/blog/announcing-fuse-x1-industrial-sls/). Formlabs collection now uses its verified dated press listing; source provenance and observed selector samples are retained.

## Verification

- 159 backend tests passed on the isolated test database; 23 frontend tests passed. Regression cases cover date boundaries, old/unknown/future dates, archive ordering before pagination, counts, cached modes, homepage redirects, English states and filter-preserving navigation.
- Final root typecheck, production build and all 30 HTTP/MCP smoke checks passed. The smoke check now explicitly verifies the approved uncached homepage redirect and its destination rather than requiring HTTP 200 from the redirect itself.
- Native T3 browser: 17 reader paths at 320, 390, 768 and 1280 pixels: **68 final checks** with no Chinese DOM text, application error or horizontal page overflow. Five page types at the same widths: **20 final doubled-text checks** with no tested label overlap or out-of-bounds layout.
- Same-URL reloads retained content on five paths. Real mobile and desktop Recent/Archive clicks retained filters and reset pagination. Search worked; bookmarks survived reload and rebuild/restart. Original browser-local bookmarks/read history were restored after testing.
- Asset regression failed before the Vite configuration change and passed afterward: a real build retained 66 existing client assets byte-for-byte, including a synthetic old-chunk marker removed after the check.
- Separate Astra Low CLI plan, implementation and asset reviews returned **APPROVED** after required corrections. Live browser acceptance belongs to the supervisor, GPT-6.1-Sol high. No advisor engine or factual records changed.

Evidence: `/Users/marcus/Developer/AdditiveOS/.local/radar-repair-20260930/`, especially `browser-evidence.json`, source snapshots, RED/GREEN logs and independent reviews. Radar logs are in `.data/repair/`; current server IDs are in `.data/private-pilot/servers.json`.

## Current limits

- **11 attributed drafts, eight with publication dates in the current 30-day window, zero model-selected.** Five additional September drafts were compared with their supplied publisher bodies. This does not establish technical truth or engineering suitability.
- Collection is manual. No worker, cron, notification or recurring paid processing is running. Five initial sources returned HTTP 403; 44 configured identities do not mean complete OEM coverage. The broader 1,059-identity inventory remains a research inventory.
- The finite repair batch used 25 additional model attempts: 55 total in the rolling day; 26 articles remain pending. Scores and selection thresholds were not changed to force acceptance.
- API/web/PostgreSQL listen on loopback only. Full-text display and syndication remain disabled; source permissions and public release remain unapproved.
- Retaining old assets uses additional disk space during private iteration. Clean the build directory only with the reader stopped or during a fresh release; deleting assets while cached readers still reference them recreates the risk. No automated retention service was added.

The next product step is reliable, bounded collection with visible source failures and freshness monitoring, followed by usefulness/relevance calibration from labeled examples. This repair does not deliver a continuously updated news service or authorize public publication.
