# Private pilot operations — 2026-09-30

Private English AM reader: http://127.0.0.1:4310/all. API: http://127.0.0.1:4311. PostgreSQL: 127.0.0.1:55432. These are loopback services, not a public deployment. The homepage opens **Recent drafts**, dated by original publication within the last 30 days. Use **Archive** for older or unknown-date imports. Collection is manual; this is not a continuously updated feed. See [the verified repair and current limits](private-pilot-repair.md).

## Current repair state

The repair supersedes the initial counts below: 11 drafts, eight recent, zero model-selected; 26 articles pending; 55 model attempts in the rolling day, including 25 additional repair attempts. The June Formlabs announcement now has its confirmed calendar date, 2026-06-09. Formlabs uses its verified dated press listing. Reader repairs passed 159 backend/23 frontend tests, typecheck/build, 30 HTTP smoke checks, 68 browser layout checks and 20 doubled-text checks. Collection/model/notification switches remain false; no worker or cron is running.

Builds now retain prior client assets so open tabs and cached HTML can still load them. This uses additional disk space; clean only with the reader stopped or during a fresh release. `node scripts/verify-build-retention.ts` runs the real build regression; do not run it concurrently with another build or frontend test. Current review and browser evidence are in the AdditiveOS checkout at `.local/radar-repair-20260930/`.

## Initial batch result and limits (historical)

- All 44 configured identities were attempted: 37 created one historical article each, two returned no entries (BASF Forward AM, Cellink), five returned HTTP 403 (DWS, Henkel Loctite, Polymaker, Rapid Shape, VoxelMatters).
- Six English attributed publication drafts completed. Five substantive stories appear in the manual briefing; the sixth is an event invitation. All six remain historical imports, none model-selected. The initial Formlabs date was unknown; it was corrected in the repair above using the original announcement. Discovery time is not publication time.
- Thirty completed `llm` request receipts record 69,588 total provider tokens using the configured default `deepseek-flash` route. Currency cost is not established. The minute budget stopped further processing; 31 articles remain pending, including 12 attempted IDs stopped by the budget. No further paid calls were made to force a result.
- The finite runner used existing collection, extraction, editorial scoring and publication functions. Limits: 25 minutes, 18 article IDs, one explicit retry per article, 120 paid requests/day. Existing per-minute 30 and per-hour/day 120 caps remain. Other paid-service caps remain zero.
- No worker or cron is running. Backend `.env` collection/model/Feishu/IndexNow switches remain false; the collection invocation alone enabled collection and models. English mode skips automatic Chinese translation. Source full-text permission is disabled for all 44 sources.
- Source configuration/provenance: `industry/source-manifest.json`; listing selector proof: `industry/source-selector-validation.json` (11 web routes, 22 observed sample URLs). Carbon and UnionTech are limited to pinned observed samples; general discovery is unresolved. Collection success is not an OEM factual-validation claim or proof of complete coverage.
- Supervisor's separate readiness expansion examined 12 unresolved identities with 29 requests and found zero newly verified collector configurations. See AdditiveOS `docs/research/2026-09-30-radar-source-expansion.{md,json}`. Do not combine these counts with the 44-route pilot or broad inventory.

## Evidence

Local artifacts are under `.data/private-pilot/` and are intentionally untracked:

| Artifact | Contents |
| --- | --- |
| `collection-report.json`, `batch.log` | Every source outcome, bounded processing outcome and receipts |
| `operations.json` | Safety flags, budgets, receipts, pending IDs and publication counts |
| `draft-review.json` | Six drafts and stored publisher bodies for independent attribution review |
| `reader-checks.json` | Nine rendered reader routes: English, private labels, no Chinese body text or theme controls |
| `backend-tests.log` | 156/156 passing tests on separately reset/migrated test database |
| `frontend-tests.log`, `build.log`, `typecheck.log`, `smoke.log` | 16/16 frontend tests; production build/typecheck/loopback smoke passed |
| `preservation-check.json` | All 40 pre-existing AdditiveOS baseline files unchanged by SHA-256 |
| `servers.json`, `listeners.txt`, `api.log`, `web.log` | Current process IDs, loopback listeners and service logs |

Supervisor reviewed the six drafts against stored source bodies. Carbon's field-trial maturity and cleaning-protocol grammar were corrected through audited content overrides without altering scoring or selection. Supervisor desktop/mobile browser and factual checks passed. The independent final diff re-review approved the private pilot after corrections; its direct HTTP verification was sandbox-blocked, so browser acceptance rests on the supervisor’s separate evidence.

## Start and stop

Run from `/Users/marcus/Developer/AdditiveOS-Radar` with `/opt/homebrew/opt/node@24/bin` first in `PATH`. The current API PID is 41906 and web PID is 41907; consult `servers.json` after any restart.

To restart the existing built services, run `python3 .data/private-pilot/restart-servers.py`. This local helper verifies recorded commands before stopping old processes, starts API with the backend `.env` and explicit false safety switches, and starts web without loading backend secrets. It never starts the worker. Logs append to `api.log` and `web.log`.

To stop this run, verify `ps -p 41906,41907 -o pid,command` shows the Radar API and web commands, then run `kill 41906 41907`. Do not stop the separate PostgreSQL service or unrelated processes. If services were restarted, use the new PIDs from `servers.json` instead.

To verify the reader after restart, run `node scripts/smoke.ts --base http://127.0.0.1:4310`. Production build command is `npm run build -w @aihot/web`. Do not start `apps/worker` or rerun paid collection as part of a reader restart. The initial runner refuses to overwrite its existing report; additional collection requires a separately bounded operator decision.

## Validation and remaining boundaries

Current repair: typecheck, 159 backend tests, 23 frontend tests, production build, source config validation and 30 loopback smoke checks passed. Initial-run evidence counts in the table above remain historical. Backend tests ran with the separate `additiveos_radar_test` database and all invocation safety switches false. Local model fixtures explicitly enable their isolated stub; plain fetch rejects external hosts and automatic redirects. Production SSRF enforcement remains unchanged.

This is a private draft research pilot: publisher claims retain attribution, historical dates are preserved, no engineering/material suitability endorsement is implied, no paid/public launch or source redistribution permission is claimed. Existing score dimensions/weights and thresholds are unchanged and need future user-labeled calibration before any broader editorial claim. No commit, push, PR or public deployment was performed.

The isolated PostgreSQL data directory is `/Users/marcus/Developer/AdditiveOS-Radar/.data/postgres-private`. To stop this cluster after stopping API/web, run `/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/marcus/Developer/AdditiveOS-Radar/.data/postgres-private stop -m fast`. To start it, run `/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /Users/marcus/Developer/AdditiveOS-Radar/.data/postgres-private -l /Users/marcus/Developer/AdditiveOS-Radar/.data/private-pilot/postgres.log -o '-h 127.0.0.1 -p 55432' start`, then restart the reader services as above. These commands target only this isolated cluster. `.local/` and `.data/` are ignored runtime artifacts; `.env` remains ignored and must never be printed or committed.

The test boundary also wraps Undici Agent/ProxyAgent dispatch, including explicit agents used by `guardedFetch`. Regression checks refuse external initial destinations and a local fixture's redirect to an external destination before a socket is opened; production networking code is unchanged.
