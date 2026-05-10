# RTV TL Manager

RTV TL Manager is Roxom TV's internal playout management app. It is used to program the broadcast day, organize media and slides, validate scheduling problems, and expose clean fullscreen output routes for tools like vMix, OBS, or a browser capture.

Core idea:

```txt
Program day -> Blocks -> Scheduled layers -> Broadcast output
```

This is not a public website or a video library. It is an operations console for building and monitoring what goes on air.

## What It Does

- Builds daily programming by date.
- Organizes media assets, uploaded videos, remote media, fallback assets, and Vimeo imports.
- Manages slides and graphic content used by the output renderer.
- Generates long schedule grids for broadcast programming.
- Checks schedule health: gaps, overlaps, missing assets, unready assets, and missing fallback.
- Renders clean output routes for live playout and block previews.
- Stores data in Supabase.
- Provides tests for scheduling logic and schedule health rules.

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
- `/admin/assets` - media asset library
- `/admin/slides` - slide library
- `/admin/settings` - integrations and app settings
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
NEXT_PUBLIC_APP_BASE_URL=http://roxomtv.local
SUPABASE_FETCH_TIMEOUT_MS=4000
```

Optional Vimeo import:

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
npm run e2e      # Run Playwright tests
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
- Output screens should stay clean, fullscreen, and safe for browser capture.
- `.env` contains secrets and must not be committed.
- `ADMIN_BOOTSTRAP_TOKEN` is used for protected admin access.
- `APP_ENCRYPTION_KEY` must be a strong 32-byte base64 key.
- Fallback assets matter: schedules should not depend on a single fragile media URL.
- Schedule health warnings should be treated as broadcast risks, not cosmetic errors.

## Current State

Implemented:

- Admin shell
- Calendar
- Daily schedule
- Asset library
- Slide library
- Settings
- Live output route
- Timeline output route
- Block preview route
- Supabase schema and seed data
- Vimeo import endpoint
- Schedule generation and health checks

Known next priority:

- Dedicated block detail editor for editing scheduled layers, previewing a block, and making fast live corrections.

## Repository

Private GitHub repository:

```txt
roxom-tv/RTV-TL-MANAGER
```

## Cloudflare Deployment

The app deploys to Cloudflare Workers via the `@opennextjs/cloudflare` adapter. Static assets are served via the Workers Assets binding. The `nodejs_compat` compatibility flag enables Node.js built-ins (Buffer, crypto, streams) required by `@supabase/ssr` and `next-intl`.

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

### Build and deploy commands

```bash
npm run cf:build    # Build for Cloudflare Workers (outputs to .open-next/)
npm run cf:dev      # Build then start local emulator via wrangler dev
npm run cf:deploy   # Build then deploy to production
npm run cf:preview  # Build then upload as a version preview (no traffic shift)
```

### Incremental static regeneration (ISR) with R2

By default the adapter uses an in-memory cache (no persistence between Worker invocations). To enable durable ISR caching backed by Cloudflare R2, see the upgrade path documented in `open-next.config.ts`.
