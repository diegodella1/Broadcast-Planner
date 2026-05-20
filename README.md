# RTV Planner

RTV Planner is the broadcast control room for Roxom TV. It lets an operator plan the day, prepare media, validate schedule risk, run a live checklist, and send a protected browser playout signal into OBS or vMix.

It is not a public video site. It is an internal operator console for keeping a daily TV-style stream organized, auditable and ready to recover.

## Current Status

Production is live at `rtvtime.diegodella.ar` using local standalone Next.js behind a Cloudflare tunnel. The core workflow is ready for controlled operation with an operator present.

What is already working:

- daily schedule builder with timed blocks
- media library for uploads, remote URLs, Vimeo, slides, music and fallbacks
- Supabase database/storage backend
- browser playout for OBS/vMix capture
- Vimeo, HLS, MP4, images, slides and Reuters stream snapshots
- reload recovery that resumes video near the current scheduled offset
- output control, monitor state and live overrides
- runbook for preflight, live notes, incident handling and shutdown
- admin health, schedule health and Go Live Drill
- named operators, sessions, role guards, CSRF protection and audit logging
- fresh Supabase bootstrap SQL for moving to a new backend

Main remaining gate: certify video, audio and reload behavior on the actual OBS/vMix capture machine before unattended operation.

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
npm run deploy:local
```

Production deploy for `rtvtime.diegodella.ar`:

```bash
npm run deploy:local
```

The active production path is local systemd service plus Cloudflare tunnel. Cloudflare Workers/OpenNext files remain for future or alternate deployment only.

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

## Production Gates

Before live use:

- `/api/health` has no failing checks.
- `/admin/health` Go Live Drill passes.
- current day exists and is `active`.
- active block has ready media or a ready fallback.
- `/output/live?debug=true` plays on the capture browser after `Start Output`.
- OBS/vMix browser capture receives video and audio after reload.
- operator confirms fallbacks, runbook and shutdown process.

## Roadmap

See:

- `/pending`
- `/notion`
- `docs/gantt.md`
- `docs/production-readiness.md`
