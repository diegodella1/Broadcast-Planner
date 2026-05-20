# RTV Planner

RTV Planner is the broadcast control room for Roxom TV. It lets an operator plan the day, prepare media, validate schedule risk, run a live checklist, and send a protected browser playout signal into OBS or vMix.

It is not a public video site. It is an internal operator console for keeping a daily TV-style stream organized, auditable and ready to recover.

## Current Status

Production is live at `rtvtime.diegodella.ar` using local standalone Next.js behind a Cloudflare tunnel. The core workflow is ready for controlled operation with an operator present.

What is already working:

- daily schedule builder with timed blocks
- timeline-first schedule UI with visible newly-added block confirmation, time ranges and gap filling
- media library for uploads, remote URLs, Vimeo, slides, music and fallbacks
- Supabase database/storage backend, including local-storage media proxy for public playback
- browser playout for OBS/vMix capture
- Vimeo, HLS, MP4, images, slides and Reuters stream snapshots
- reload recovery that resumes video near the current scheduled offset
- validated web player capture in browser, vMix and OBS
- uploaded ads/promos served through `/api/media/assets/:assetId` so local Supabase storage stays playable from OBS/vMix and remote browsers
- output control, monitor state and live overrides
- runbook for preflight, live notes, incident handling and shutdown
- admin health, schedule health and Go Live Drill
- persisted smoke status from deploy/read-only smoke scripts
- named operators, sessions, role guards, CSRF protection and audit logging
- fresh Supabase bootstrap SQL for moving to a new backend

Main product gate now pending: wire the on-air plates/slides to real production inputs where mock/static content remains, then remodel the visual design of the output plates so the channel looks intentionally produced rather than just operationally correct.

Deployment note: the active production path is still local standalone Next.js behind a Cloudflare tunnel. OpenNext/Cloudflare Workers support is configured and deployable, but should be treated as an alternate path until a real Workers deploy is smoke-tested.

## Product Promise

RTV Planner replaces scattered broadcast prep with one operational flow:

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
- `/admin` - dashboard
- `/admin/calendar` - program days
- `/admin/schedule/[date]` - daily rundown
- `/admin/runbook/[date]` - preflight/live/incident/shutdown checklist
- `/admin/assets` - media library
- `/admin/vimeo` - Vimeo sync/import
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

1. Add content in `/admin/assets`, `/admin/vimeo`, `/admin/music` or `/admin/slides`.
2. Build the day in `/admin/calendar` -> `/admin/schedule/[date]`.
3. Resolve schedule health issues and assign fallback assets.
4. Complete the runbook in `/admin/runbook/[date]`.
5. Set the day `active`.
6. Open `/admin/output`, launch Live Browser Output, click `Start Output`, then capture that browser window in OBS/vMix.
7. During live, watch active block, next block, fallback reason, playback state and runbook notes.
8. Stop broadcast and complete shutdown checks.

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
NEXT_PUBLIC_APP_BASE_URL=
APP_BASE_URL=
VIMEO_ACCESS_TOKEN=
```

Production currently uses local Supabase for database/storage. Keep `NEXT_PUBLIC_SUPABASE_URL`
pointed at the local Supabase service, and set `NEXT_PUBLIC_APP_BASE_URL` or `APP_BASE_URL` to the
public app origin, for example `https://rtvtime.diegodella.ar`. Uploaded ads/promos are stored in
Supabase but played through the public app proxy at `/api/media/assets/[assetId]`.

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
bash scripts/deploy_local_tunnel.sh
npm run cf:build
npm run cf:deploy
```

Active production deploy for `rtvtime.diegodella.ar`:

```bash
bash scripts/deploy_local_tunnel.sh
```

The active production path is local systemd service plus Cloudflare tunnel.

Alternate Cloudflare Workers/OpenNext path:

```bash
npm run cf:build
npm run cf:deploy
```

Cloudflare deploys must keep dashboard vars/secrets configured for Supabase, `APP_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_TOKEN`, `OUTPUT_CAPTURE_TOKEN`, app base URLs and any provider tokens such as Vimeo or Reuters. The scripts use `--keep-vars` so dashboard variables are preserved.

## Database

Normal migrations live in:

```txt
supabase/migrations/
```

Fresh Supabase bootstrap SQL for migration/offline setup:

```txt
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
- `/admin/health` Go Live Drill passes.
- current day exists and is `active`.
- active block has ready media or a ready fallback.
- uploaded media URLs use `https://rtvtime.diegodella.ar/api/media/assets/...`, not `127.0.0.1`.
- `/output/live?debug=true` plays on the capture browser after `Start Output`.
- OBS/vMix browser capture has been validated for video/audio; recheck after deploy or capture-machine changes.
- operator confirms fallbacks, runbook and shutdown process.

## Roadmap

Near-term priorities:

- replace remaining placeholder/static plate data with real feeds or operator-configurable inputs
- remodel the visual design of on-air plates, cards and output surfaces
- improve operator alerts for drift, stalled playback, silence and media errors
- expand schedule copy/recurring-day tools after the live workflow is stable

See:

- `/pending`
- `/notion`
- `docs/gantt.md`
- `docs/production-readiness.md`
