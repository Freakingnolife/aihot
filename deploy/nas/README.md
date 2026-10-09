# AdditiveOS Radar on the NAS

Runs the news site for https://additiveos.com on the NAS (x86_64 Linux, Docker Compose v2.26), beside the
existing landing container. Nothing here has been run on the NAS or in Docker yet (see "Checks": what was
and was not verified).

## What runs

| Service | What it is | Reachable from |
|---|---|---|
| `db` | PostgreSQL 17, named volume `db` | compose network only |
| `migrate` | applies pending migrations, then exits (no seed) | - |
| `api` | the Radar API (image from the repo `Dockerfile`) | compose network only |
| `web` | the reader | host loopback `127.0.0.1:38091` (for the router) |
| `scheduler` | `scripts/scheduled-refresh.ts`: 07:00 and 19:00 Singapore time | - |
| `codex-shim` | `scripts/codex-shim.ts` + Codex CLI, max 4 runs at once, `gpt-6.1-sol`, medium | compose network only |
| `router` | `scripts/combined-preview.ts` in the host network | host `127.0.0.1:38090` (Cloudflare Tunnel) |

Router table: `/advisor` (also `/advisor/`) goes to the landing page as `/`; `/static/*` and
`/api/early-access` go to the landing page; everything else, including `/privacy`, goes to the reader.

Why the router is in the host network: the landing container publishes only `127.0.0.1:38088`. A container
on a bridge network cannot reach another service's loopback-only port (`host-gateway` arrives on the bridge
address, not on loopback), so the router uses `network_mode: host` and talks to the landing page on
`127.0.0.1:38088` and to the reader on `127.0.0.1:38091`. That is why `web` also publishes a loopback port.
Both are invisible from the network. The worker app (`apps/worker`) is not part of this stack.

## 1. Get the code onto the NAS

From the Mac, after the launch branch is committed (`launch/public`):

```bash
rsync -a --delete --exclude node_modules --exclude .git --exclude .data --exclude .env \
  --exclude 'apps/web/build' --exclude .local \
  /Users/marcus/Developer/AdditiveOS-Radar/ <nas-user>@<nas-host>:/volume1/additiveos/radar/src/
```

(Or `git clone -b launch/public https://github.com/Freakingnolife/aihot.git` on the NAS once the branch is pushed.)

## 2. Settings and the Codex sign-in

On the NAS, in `/volume1/additiveos/radar/src/deploy/nas`:

```bash
cp .env.example .env && chmod 600 .env
# Fill in POSTGRES_PASSWORD, ADMIN_PASSWORD (12+ characters), SESSION_SECRET, IMG_PROXY_SIGN_SECRET:
#   openssl rand -hex 32     (one value per variable)
nano .env
```

The empty secrets are deliberate: the services refuse to start until they are set. Everything else in
`.env.example` has the launch defaults (collection and model calls on; Feishu and IndexNow off;
`SITE_URL=https://additiveos.com`).

Codex sign-in. The connector needs the owner's `auth.json`, in the folder `CODEX_AUTH_DIR` names (default
`/volume1/additiveos/radar/codex-auth`), which is mounted read-write at `/home/node/.codex` (Codex refreshes
the token there, so it must be writable by uid 1000):

```bash
mkdir -p /volume1/additiveos/radar/codex-auth
# on the Mac:  scp ~/.codex/auth.json <nas-user>@<nas-host>:/volume1/additiveos/radar/codex-auth/auth.json
sudo chown -R 1000:1000 /volume1/additiveos/radar/codex-auth && sudo chmod 700 /volume1/additiveos/radar/codex-auth
```

This is the owner's personal sign-in: treat `auth.json` like a password, never put it in the repo, and
signing in again on the Mac does not renew the copy on the NAS (copy the file again if the connector
reports an authentication error).

## 3. Copy the database

On the Mac (local cluster 127.0.0.1:55432, database `additiveos_radar`; the password is read from `.env`
without printing it):

```bash
cd /Users/marcus/Developer/AdditiveOS-Radar
DB_USER=$(sed -nE 's#^DATABASE_URL=postgres(ql)?://([^:@/]+).*#\2#p' .env)
export PGPASSWORD=$(sed -nE 's#^DATABASE_URL=postgres(ql)?://[^:@/]+:([^@]*)@.*#\2#p' .env)
/opt/homebrew/opt/postgresql@17/bin/pg_dump -Fc --no-owner --no-acl -h 127.0.0.1 -p 55432 \
  -U "$DB_USER" -d additiveos_radar -f /tmp/additiveos_radar.dump
unset PGPASSWORD
scp /tmp/additiveos_radar.dump <nas-user>@<nas-host>:/volume1/additiveos/radar/
```

The dump must be the whole database: it includes the `pgboss` schema that the scheduler needs (it adds
jobs and never installs or maintains that schema). Then on the NAS, with the empty database running:

```bash
cd /volume1/additiveos/radar/src/deploy/nas
docker compose build                       # first build takes several minutes
docker compose up -d db
docker compose exec -T db pg_restore -U radar -d additiveos_radar --no-owner --no-acl --exit-on-error \
  < /volume1/additiveos/radar/additiveos_radar.dump
```

The restored database keeps the local sources, articles, summaries and publications. Image caches rebuild
on demand. Delete the dump file from the NAS and the Mac when the site is confirmed good.

## 4. First start

```bash
docker compose up -d
docker compose ps          # db, api, web, codex-shim, router "healthy"; migrate "exited (0)"
```

The scheduler starts waiting for the next 07:00 or 19:00 Singapore time; it does not run at start. Then
point the Cloudflare Tunnel route for `additiveos.com` at `http://localhost:38090` (it points at
`http://localhost:38088` today). Keep `/admin` behind Cloudflare Access or at least a strong
`ADMIN_PASSWORD`: the admin is reachable on the public hostname.

## Checks (after the first start and after every change)

```bash
docker compose config -q                                        # in deploy/nas: the file and .env are valid
curl -s  http://127.0.0.1:38090/api/health                      # reader -> api
curl -sI http://127.0.0.1:38090/privacy | head -1               # 200, the reader's privacy notice
curl -s  http://127.0.0.1:38090/advisor | grep -c "Join the waitlist"   # the landing page
curl -s  http://127.0.0.1:38090/robots.txt                      # Sitemap: https://additiveos.com/sitemap.xml
curl -s  http://127.0.0.1:38090/sitemap.xml | head -5           # <loc> addresses start with https://additiveos.com
curl -s  http://127.0.0.1:38090/all | grep -o '<link rel="canonical"[^>]*>'
curl -s  http://127.0.0.1:38090/feedback | grep -o 'name="robots"[^>]*'        # noindex
# An image from a story page, e.g. copy a /api/img-proxy?... address from the page source:
curl -sI "http://127.0.0.1:38090/api/img-proxy?<copied query>" | grep -i x-robots-tag   # noindex, noimageindex
# The Codex connector answers (this is one real Codex request):
docker compose exec codex-shim node -e "fetch('http://127.0.0.1:4340/v1/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'Reply with the single word ok'}]})}).then(r=>r.text()).then(console.log)"
```

Not verified when this was written: the Docker build, `docker compose config` (Docker was not installed
on the Mac), and the `codex` CLI inside the container (the Linux sandbox of `codex exec -s read-only` may
behave differently in a container than on the Mac; the last command is the test).

## The scheduled refresh

`scripts/scheduled-refresh.ts` runs at 07:00 and 19:00 Asia/Singapore. Each run: collect every enabled
source (collection only), fetch missing article pages without the Jina fallback, then process the articles
discovered in the last 48 hours that are waiting (`processing_state = 'new'`) one at a time. Analysis has
first use of the 60-request target and checks it before each article; because one article can use several
requests, analysis may cross 60 slightly. After analysis, the runner claims up to 12 existing
`events.group` jobs, one at a time, while the same cap has room. The normal grouping handler runs, so
receipts, budget checks and manual decisions still apply. If the cap or daily/hourly/minute budget is reached,
the claimed job is deferred without spending a processing retry, and remaining grouping jobs stay queued for a later refresh. The backlog drains over
multiple slots; pending grouping is logged separately from article analysis.

Under the refresh advisory lock, expired `events.group` claims are returned to the queue; no unrelated
queue is supervised. Automatic grouping jobs are ordered newest-first by original publication time
(discovery time when publication time is missing). Jobs older than 14 days are completed with the
distinct `age-skip` outcome; their reports remain visible as standalone items in the site and Archive.
Explicit manual regroup jobs are exempt. Cap, budget and busy-receipt stops return a claimed job to the
queue without consuming its bounded failure retries. An unknown-outcome paid request blocks only its own
job: while its outcome is open, that job and any changed version of its judgement are never re-sent. The job
is parked for 12 hours, then claimed again; the rest of the queue still runs, and the run reports it as `blocked`.
Only the admin's release (Runs page) lets the next claim send it once: the 30-minute automatic release runs in the
worker, which this deployment does not run. A placeholder left by a process that stopped mid-request (pending for
over 10 minutes) is marked unknown at the start of each grouping pass, so its job waits for the admin like any other.
If consolidation hits an unknown receipt on a report's first pass, that consolidation is not retried automatically
(accepted behaviour).
Actual processing failures keep the normal retry limit, and a claim that expires because the process died
spends one retry, so a job that keeps crashing the runner ends as failed. A run whose job errored reports
status `errors`. The run log reports completed, age-skipped, deferred, blocked, active/stalled and pending
grouping counts.

The runner opens pg-boss in passive mode only to claim and complete grouping jobs. It does not register
workers, start other queues or enable schedules/migrations, and does not process translations,
image-preparation jobs or story digests. Grouping from this runner does not queue digests (nothing here
consumes them), so a new story has no digest until a worker later handles a report for it. There is no always-on worker. The llm budget (30/minute, 240/hour, 240/day; set in
the admin) is never changed; embedding and DashScope remain disabled at their existing zero budgets.

`COLLECT_ENABLED=false` skips collection and page fetching; `MODEL_CALLS_ENABLED=false` skips processing.
Change them in `.env`, then `docker compose up -d scheduler`.

Run once now (safe next to the daemon: a database lock allows one run at a time):

```bash
docker compose run --rm scheduler node scripts/scheduled-refresh.ts --once
```

Each run writes one JSON line. `process` records analysis progress and `grouping` separately records
`attempted`, `completed`, `ageSkipped`, `deferred`, `errors`, `requests`, `stalled`, `active`,
`pendingBefore`, `pending`, and its stop reason. Jobs not yet claimed remain queued.
An `unknown-receipt` needs the admin's normal recovery (Runs page) before that article is retried.

## Logs

```bash
docker compose logs -f --tail 100 scheduler        # one line per run
docker compose logs -f --tail 100 api web router codex-shim
```

## Update

```bash
# new code in place (step 1), then
docker compose build && docker compose up -d       # migrations run automatically; containers restart if changed
```

## Backup

```bash
docker compose exec -T db pg_dump -U radar -Fc --no-owner additiveos_radar > /volume1/additiveos/radar/backup-$(date +%F).dump
```

## Rollback

- Site back to the old landing page: point the `additiveos.com` tunnel route back at
  `http://localhost:38088` (the landing container was never touched, and the waitlist database is separate).
- Stop the stack, keep the data: `docker compose down` (volumes `db` and `data` stay). Start again with `up -d`.
- Bad release: put the previous code in place, `docker compose build && docker compose up -d`. Migrations
  are backward-compatible additions, so the older code runs on the newer database.
- Throw everything away (only if intended): `docker compose down -v` deletes the database volume.
