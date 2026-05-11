# RTV TL Manager

RTV TL Manager is Roxom TV's internal playout management app. It is used to program the broadcast day, organize media and slides, validate scheduling problems, and expose clean fullscreen output routes for tools like vMix, OBS, or a browser capture.

Core idea:

```txt
Program day -> Blocks -> Scheduled layers -> Broadcast output
```

This is not a public website or a video library. It is an operations console for building and monitoring what goes on air.

## What It Does

- Builds daily programming by date.
- Organizes media assets, uploaded videos, remote media, fallback assets, and Vimeo sync.
- Syncs Vimeo shows and episodes into the Library for scheduling and playback.
- Manages slides and graphic content used by the output renderer.
- Generates long schedule grids for broadcast programming.
- Checks schedule health: gaps, overlaps, missing assets, unready assets, and missing fallback.
- Renders protected clean output routes for live playout and block previews.
- Keeps audit records for broadcast-critical mutations.
- Stores data in Supabase.
- Provides unit, HTTP smoke, and Playwright browser smoke tests.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase database and storage
- Vimeo integration
- Vitest for unit tests
- Playwright available for end-to-end tests
- Docker support for production deployment

## Main Routes

- `/admin/login` - admin login
- `/admin/calendar` - programming calendar
- `/admin/schedule/[date]` - daily schedule view
- `/admin/runbook/[date]` - operator preflight, live, incident and shutdown runbook
- `/admin/assets` - media asset library
- `/admin/audit` - broadcast-critical audit trail
- `/admin/vimeo` - Vimeo sync monitor and synced episode catalog
- `/admin/slides` - slide library
- `/admin/output` - operator output control panel
- `/admin/settings` - integrations and app settings
- `/manual` - operator and public output manual
- `/pending` - pending developments, needed functionality and production backlog
- `/output/live` - live fullscreen output
- `/output/[timelineId]` - timeline output
- `/output/preview/[blockId]` - block preview output
- `/api/health` - app health check

The app is configured for the domain root. Old `/rtvtime/...` links redirect to root paths.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment:

```bash
cp .env.example .env
```

Fill the required values in `.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
APP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
ADMIN_BOOTSTRAP_TOKEN=change-me
OUTPUT_CAPTURE_TOKEN=optional-output-capture-token
NEXT_PUBLIC_APP_BASE_URL=http://roxomtv.local
SUPABASE_FETCH_TIMEOUT_MS=4000
```

Optional Vimeo sync:

```bash
VIMEO_ACCESS_TOKEN=replace-with-vimeo-token
```

Run development server:

```bash
npm run dev
```

Default local URL:

```txt
http://localhost:3450
```

## Supabase

Database schema lives in:

```txt
supabase/migrations/
```

Seed data lives in:

```txt
supabase/seed.sql
```

Generated database types live in:

```txt
lib/supabase/database.types.ts
```

Regenerate local types:

```bash
npm run supabase:types
```

## Scripts

```bash
npm run dev      # Start Next.js dev server on port 3450
npm run build    # Build production app
npm run start    # Start production server
npm run lint     # Run Next lint
npm test         # Run Vitest unit tests
npm run e2e      # Run Playwright browser playout smoke
npm run smoke:http # Run Node read-only HTTP smoke
npm run smoke:local # Read-only runtime smoke against local app
npm run smoke:prod  # Read-only pre-air smoke against production
```

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The container exposes the app on:

```txt
http://localhost:3450
```

Production container health check:

```txt
/api/health
```

## Operational Notes

- Admin screens are for operators, producers, and content administrators.
- Normal show workflow is: Library -> Programming day -> Timeline block -> Output control.
- To schedule a show, first upload media or sync Vimeo, then open `/admin/calendar`, pick the day, and use “Schedule existing asset / show” or “Add show to timeline”.
- Use the Rundown editor on `/admin/schedule/[date]` for drag reorder, keyboard moves, 5-minute resize, duplicate, archive and bulk status. These edits are audited and still go through server conflict checks plus the database overlap trigger.
- Before going live, open `/admin/runbook/[date]` and complete critical preflight checks. Runbook checks and notes persist per program day in Supabase and are written to audit.
- Vimeo sync is the source for Vimeo playback assets. Use `/admin/vimeo` to sync and filter by episode title, show name, month, year and status.
- Output screens should stay clean, fullscreen, and safe for browser capture.
- `.env` contains secrets and must not be committed.
- `ADMIN_BOOTSTRAP_TOKEN` is used for protected admin access.
- `OUTPUT_CAPTURE_TOKEN` is required in production and protects `/output/live`, preview, schedule and playback routes. Admin output links mint an `HttpOnly` `rpm_output_token` cookie through `/api/output/session`; query tokens are only for scripts/bootstrap.
- `APP_ENCRYPTION_KEY` must be a strong 32-byte base64 key.
- Mutating admin forms and APIs use CSRF protection. If server actions return 403 behind a tunnel, confirm `NEXT_PUBLIC_APP_BASE_URL` matches the public domain.
- Fallback assets matter: schedules should not depend on a single fragile media URL.
- Schedule health warnings should be treated as broadcast risks, not cosmetic errors.
- Track production gaps in `/pending` and treat P0 items as required before unattended operation.

## Current State

Implemented:

- Admin shell
- Calendar
- Daily schedule
- Asset library
- Vimeo sync monitor and synced catalog
- Slide library
- Settings
- Live output route
- Timeline output route
- Block preview route
- Supabase schema and seed data
- Operator runbook persistence migration
- Vimeo sync endpoint and synced Library catalog
- Schedule generation and health checks
- Pending developments page
- Audit page and audited mutation helper
- CSRF and output token protection
- Assets pagination
- Vimeo playback readiness fields
- Database trigger for per-day schedule overlap prevention
- Rich schedule conflict UX with suggested starts, safe resize and archive-conflicts replacement
- Rundown drag/drop editor with keyboard reorder, resize controls, duplicate, archive and bulk status
- Operator runbook mode with persisted per-day preflight/live/incident/shutdown checks
- Asset lifecycle states and scheduled-in-use delete protection
- Output observability monitor
- Forced bad-media fallback fixture
- Staging write smoke cleanup
- Backup and restore drill
- Production read-only smoke and browser playout smoke

Known next priority:

- P0 backlog in `/pending`: multi-user roles and role-aware audit identity.

## Repository

Private GitHub repository:

```txt
roxom-tv/RTV-TL-MANAGER
```

## Production Deployment

Current production for `rtvtime.diegodella.ar` runs on the local host through `rtvplanner.service`, with public traffic proxied by `cloudflared`. The deployment command builds the standalone Next.js app, copies static assets, restarts the service, and smokes health/manual/output/CSS.

```bash
npm run deploy:local
```

The public tunnel service is managed outside the repo by `cloudflared.service`. The app service reads `/home/diego/Documents/RTVplanner/.env`.

### Clone-ready environment checklist

Set these values in `.env` on any new host:

| Variable                        | Source                                                                |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project API settings                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project API anon key                                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase project API service role key                                 |
| `APP_ENCRYPTION_KEY`            | Generate base64 32-byte secret                                        |
| `ADMIN_BOOTSTRAP_TOKEN`         | Generate/rotate admin login token                                     |
| `OUTPUT_CAPTURE_TOKEN`          | Generate/rotate output capture token                                  |
| `APP_BASE_URL`                  | Server-side public URL override, e.g. `https://rtvtime.diegodella.ar` |
| `NEXT_PUBLIC_APP_BASE_URL`      | Public URL, e.g. `https://rtvtime.diegodella.ar`                      |
| `VIMEO_ACCESS_TOKEN`            | Vimeo developer/access token, optional only if DB settings are used   |
| Reuters variables               | Reuters provider account, only when `REUTERS_PROVIDER=real`           |

Generate a local encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Optional Cloudflare Workers/OpenNext path

The repo still includes Cloudflare Workers tooling via `@opennextjs/cloudflare`. This is available for preview or future Worker deployment, but it is not the active production path for the current host.

Static assets are served via the Workers Assets binding when this path is used. The `nodejs_compat` compatibility flag enables Node.js built-ins (Buffer, crypto, streams) required by `@supabase/ssr` and `next-intl`.

> **Note on `output: "standalone"`**: `next.config.mjs` keeps `output: "standalone"` for Docker builds. The OpenNext adapter runs its own bundler and ignores that option — both deployment paths coexist without conflict.

### One-time setup

Authenticate with Cloudflare:

```bash
wrangler login
```

Set all required secrets (do this once per environment; values are never stored in code):

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put APP_ENCRYPTION_KEY
wrangler secret put ADMIN_BOOTSTRAP_TOKEN
wrangler secret put OUTPUT_CAPTURE_TOKEN         # optional; protects capture output routes
wrangler secret put VIMEO_ACCESS_TOKEN          # optional; falls back to encrypted DB value
wrangler secret put REUTERS_CLIENT_ID            # only when REUTERS_PROVIDER=real
wrangler secret put REUTERS_CLIENT_SECRET        # only when REUTERS_PROVIDER=real
wrangler secret put REUTERS_REFRESH_TOKEN        # only when REUTERS_PROVIDER=real
```

### Per-environment dashboard configuration

These are not secrets but differ between staging and production. Set them in the Cloudflare dashboard under **Workers & Pages > roxom-playout-manager > Settings > Variables**:

| Variable                        | Example                     |
| ------------------------------- | --------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project anon key   |
| `NEXT_PUBLIC_APP_BASE_URL`      | `https://roxomtv.com`       |

### Cloudflare Worker build and deploy commands

```bash
npm run cf:build    # Build for Cloudflare Workers (outputs to .open-next/)
npm run cf:dev      # Build then start local emulator via wrangler dev
npm run cf:deploy   # Build then deploy to a Cloudflare Worker environment
npm run cf:preview  # Build then upload as a version preview (no traffic shift)
```

### Daily Vimeo sync

The sync endpoint mirrors Vimeo videos into `media_assets`; operators schedule from Library, not raw Vimeo API results. Run manually:

```bash
bash scripts/sync_vimeo.sh
```

For daily production sync, run that script from a systemd timer or cron on the host that has `.env` and can reach the local app service.
Systemd unit templates are in `deploy/systemd/rtvplanner-vimeo-sync.*`.

## Production Readiness

Production release gates and the OWASP red-team checklist live in:

```txt
docs/production-readiness.md
```

Production smoke is read-only by design. It checks health, admin auth, playout schedule, output,
preview when available, and audit page access without mutating Supabase.

### Incremental static regeneration (ISR) with R2

By default the adapter uses an in-memory cache (no persistence between Worker invocations). To enable durable ISR caching backed by Cloudflare R2, see the upgrade path documented in `open-next.config.ts`.
