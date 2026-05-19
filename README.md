# RTV TL Manager

Internal Roxom TV playout manager. It builds the broadcast day, keeps media and slides ready, checks schedule risk, and opens a protected browser output for OBS/vMix capture.

This is not a public video site. It is an operator console.

## Current Production Workflow

1. Add content in `/admin/assets`, `/admin/vimeo`, or `/admin/slides`.
2. Build the day in `/admin/calendar` -> `/admin/schedule/[date]`.
3. Resolve schedule health issues and assign fallback assets.
4. Complete the runbook in `/admin/runbook/[date]`.
5. Set the day `active`.
6. Open `/admin/output`, launch Live Browser Output, click `Start Output`, then capture that browser window in OBS/vMix.

If the output page reloads mid-show, it asks the server for the active block and resumes video at the current scheduled offset.

## Main Routes

- `/admin/login` - operator login
- `/admin` - dashboard
- `/admin/calendar` - program days
- `/admin/schedule/[date]` - daily rundown
- `/admin/runbook/[date]` - preflight/live/incident/shutdown checklist
- `/admin/assets` - media library
- `/admin/vimeo` - Vimeo sync/import
- `/admin/slides` - slide library
- `/admin/output` - live output control
- `/admin/health` - production readiness and Go Live Drill
- `/manual` - public operator manual
- `/pending` - current backlog
- `/output/live` - fullscreen browser playout
- `/output/preview/[blockId]` - fullscreen block preview
- `/api/health` - machine health check

## Output Capabilities

Browser output currently supports:

- Vimeo playback through browser HLS
- direct HLS URLs
- public MP4 URLs
- still images
- rendered slides
- fallback asset state
- audio unlock by operator click
- drift/stall/debug attributes for monitoring

OBS/vMix certification still must happen on the actual capture machine because browser codec and autoplay behavior can differ by runtime.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase database/storage
- Vimeo API
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

The current production path is local systemd service plus Cloudflare tunnel. Cloudflare Workers/OpenNext files remain for future/alternate deployment only.

## Database

Migrations:

```txt
supabase/migrations/
```

Seed:

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

## Backlog

See:

- `/pending`
- `docs/gantt.md`
- `docs/production-readiness.md`
