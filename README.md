# Broadcast Planner

Broadcast Planner is a broadcast control room for planning the day, preparing media, validating schedule risk, running a live checklist, and sending a protected browser playout signal into OBS or vMix.

It is not a public video site. It is an internal operator console for keeping a daily TV-style stream organized, auditable and ready to recover.

## Current Status

Production is live at `broadcast-planner.diegodella.ar` using local standalone Next.js behind a Cloudflare tunnel. The core workflow is ready for controlled operation with an operator present.

What is already working:

- unified operator flow with `/admin/prepare`, `/admin/program` and `/admin/operate`
- daily schedule builder with timed blocks
- timeline-first schedule UI with visible newly-added block confirmation, time ranges and gap filling
- media library for uploads, remote URLs, Vimeo, slides, music and fallbacks
- guest library with per-plate lineups, uploaded/remote guest photos and short muted guest videos
- city-specific weather plates and a Loop Builder that can create scheduled slide loops, fallback
  carousels, or both
- Supabase database/storage backend, including local-storage media proxy for public playback
- browser playout for OBS/vMix capture
- Vimeo, HLS, MP4, images, slides and Reuters stream snapshots
- real-data slide feeds for metals, weather, market/open boards, debt, guests and calendar events,
  with graceful fallbacks when providers are unavailable
- reload recovery that resumes video near the current scheduled offset
- validated web player capture in browser, vMix and OBS
- uploaded ads/promos served through `/api/media/assets/:assetId` so local Supabase storage stays playable from OBS/vMix and remote browsers
- per-program `PREVIOUSLY RECORDED` on-screen bug with four-corner placement, limited to normal
  video program blocks
- output control, monitor state and live overrides
- runbook for preflight, live notes, incident handling and shutdown
- admin health, schedule health and Go Live Drill
- persisted smoke status from deploy/read-only smoke scripts
- named operators, sessions, role guards, CSRF protection and audit logging
- protected active-block/health operational endpoints, atomic API rate limiting and alert cooldowns
- fresh Supabase bootstrap SQL for moving to a new backend

Main product gate now pending: remodel the visual design of the output plates so the channel looks intentionally produced rather than just operationally correct, then tighten operator alerts for drift, stalls, silence and media errors.

Deployment note: the active production path is still local standalone Next.js behind a Cloudflare tunnel. OpenNext/Cloudflare Workers support is configured and deployable, but should be treated as an alternate path until a real Workers deploy is smoke-tested.

## Product Promise

Broadcast Planner replaces scattered broadcast prep with one operational flow:

1. Load or sync content.
2. Build the broadcast day.
3. Catch gaps, overlaps and missing fallbacks before air.
4. Complete preflight.
5. Launch browser output.
6. Monitor the current signal.
7. Stop cleanly with an audit trail.

The value is not just playing media. The value is reducing live mistakes: wrong block, missing fallback, expired live URL, unreviewed media, silent output, or unclear operator handoff.

## Main Routes

- `/admin/login` - operator login
- `/admin` - cockpit dashboard
- `/admin/prepare` - unified intake for assets, Vimeo, music, guests and plates
- `/admin/program` - daily programming hub for calendar, schedule, loop builder, fallback and health
- `/admin/operate` - live control-room hub for output, health, runbook and audit
- `/admin/calendar` - program days
- `/admin/schedule/[date]` - daily rundown
- `/admin/runbook/[date]` - preflight/live/incident/shutdown checklist
- `/admin/assets` - media library
- `/admin/vimeo` - Vimeo sync/import
- `/admin/guests` - guest records and individualized guest lineup plates
- `/admin/slides` - slide library
- `/admin/music` - background music assets
- `/admin/output` - live output control and overrides
- `/admin/health` - production readiness and Go Live Drill
- `/admin/audit` - operational audit trail
- `/manual` - public operator manual
- `/notion` - status and operating guide
- `/pending` - current roadmap and backlog
- `/output/live` - fullscreen browser playout
- `/output/preview/[blockId]` - fullscreen block preview
- `/api/health` - machine health check
- `/api/media/assets/[assetId]` - public media proxy for uploaded assets stored in local Supabase Storage

## Production Workflow

1. Open `/admin/prepare` and add or sync content: assets, Vimeo shows, music, guest plates, weather
   city plates and data plates.
2. Open `/admin/program` and build the day: calendar, schedule, Loop Builder, fallback policy and
   schedule health.
3. Use Loop Builder when the day needs a silent slide loop. Choose one clear intent: create
   scheduled blocks, set the visual fallback carousel, or do both. Background music plays under
   slide loops and visual fallback.
4. For normal video programs that are not live/Reuters/ads/promos, enable the optional
   `PREVIOUSLY RECORDED` bug from the block editor when editorial needs that disclosure.
5. Resolve schedule health issues and confirm fallback before activating the day.
6. Open `/admin/operate`, complete the runbook, open Output, launch Live Browser Output and click
   `Start Output` once to unlock audio.
7. Capture the live browser window in OBS/vMix.
8. During live, watch active block, next block, fallback reason, playlist/audio state, playback
   state and runbook notes from Operate/Output.
9. Stop broadcast and complete shutdown checks.

If the output page reloads mid-show, it asks the server for the active block and resumes video at the current scheduled offset. Browser audio still requires one operator click after load or reload.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase database/storage
- Vimeo API
- Reuters stream snapshots
- `hls.js`
- Vitest
- Playwright

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Default local URL:

```txt
http://localhost:3450
```

Required `.env` values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENCRYPTION_KEY=
ADMIN_BOOTSTRAP_TOKEN=
OUTPUT_CAPTURE_TOKEN=
ALERT_WEBHOOK_URL=
ALERT_WEBHOOK_COOLDOWN_MS=600000
NEXT_PUBLIC_APP_BASE_URL=
APP_BASE_URL=
VIMEO_ACCESS_TOKEN=
```

Optional external data inputs:

```bash
OPENWEATHER_API_KEY= # optional; weather falls back to Open-Meteo when unset
DATA_PROVIDER_API_URL= # optional external data provider
```

Production runs the standalone Node service behind Cloudflare Tunnel. D1, R2 and KV bindings use
persisted local Wrangler state under `~/.local/share/broadcast-planner/wrangler-state`. Set
`NEXT_PUBLIC_APP_BASE_URL` or `APP_BASE_URL` to the public app origin, for example
`https://broadcast-planner.diegodella.ar`.

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Useful Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm test -- --run
npm run build
npm run smoke:http
npm run smoke:prod
bash scripts/deploy_local_tunnel.sh deploy
npm run cf:build
npm run cf:deploy
```

Active production deploy for `broadcast-planner.diegodella.ar`:

```bash
bash scripts/install_release_units.sh # first install or unit-template change
bash scripts/deploy_local_tunnel.sh deploy
```

Deploys build immutable releases under `~/.local/share/broadcast-planner/releases`, atomically switch
`current`, run local and public read-only smoke checks, and restore the prior release on failure.
Manual rollback: `bash scripts/deploy_local_tunnel.sh rollback`.

The active production path is local systemd service plus Cloudflare Tunnel. Production never executes
build output directly from the Git worktree.

Cloudflare Workers/OpenNext build path (not currently provisioned as production):

```bash
npm run cf:build
npm run cf:deploy
```

Do not use this path for production until Worker, D1 and R2 resources exist in the target account and a
preview passes the full read-only smoke suite.

Local/systemd and container deployments require `ffprobe` from the `ffmpeg` package. Upload and public-media routes run in the Node.js runtime; they are not supported by the alternate Cloudflare Workers path.

## Database

Normal migrations live in:

```txt
supabase/migrations/
```

Fresh Supabase bootstrap SQL for migration/offline setup:

```txt
public/manual/supabase-bootstrap.sql
```

Standalone guest lineup migration for existing backends:

```txt
supabase/migrations/20260522120000_guest_lineup.sql
supabase/migrations/20260522172000_slide_asset_metadata.sql
public/manual/guest-lineup-migration.sql
public/manual/slide-asset-metadata-migration.sql
```

Standalone rate-limit hardening migration for existing backends:

```txt
supabase/migrations/20260522153000_atomic_rate_limits.sql
public/manual/atomic-rate-limits-migration.sql
```

Events/calendar slide migration:

```txt
supabase/migrations/20260525181000_events_calendar.sql
public/manual/supabase-bootstrap.sql
```

Seed data:

```txt
supabase/seed.sql
```

Regenerate Supabase types:

```bash
npm run supabase:types
```

Backfill uploaded assets that were saved with local `127.0.0.1` storage URLs:

```bash
node scripts/backfill_public_storage_urls.mjs
node scripts/backfill_public_storage_urls.mjs --apply
```

The dry run prints candidate rows. `--apply` rewrites rows with `storage_bucket` and `storage_path`
to the public app proxy URL.

## Production Gates

Before live use:

- `/api/health` has no failing checks.
- the latest Supabase migrations are applied, including guest lineup and atomic rate limits.
- `/admin/health` Go Live Drill passes.
- current day exists and is `active`.
- active block has ready media or a ready fallback.
- uploaded media URLs use `https://broadcast-planner.diegodella.ar/api/media/assets/...`, not `127.0.0.1`.
- `/output/live?debug=true` plays on the capture browser after `Start Output`.
- OBS/vMix browser capture has been validated for video/audio; recheck after deploy or capture-machine changes.
- operator confirms fallbacks, runbook and shutdown process.

## Roadmap

Near-term priorities:

- remodel the visual design of on-air plates, cards and output surfaces
- improve operator alerts for drift, stalled playback, silence and media errors
- replace public health detail with admin-only diagnostics in any external status dashboard
- expand schedule copy/recurring-day tools after the live workflow is stable

See:

- `/pending`
- `/notion`
- `docs/gantt.md`
- `docs/production-readiness.md`
