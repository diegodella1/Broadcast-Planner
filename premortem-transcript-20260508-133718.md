# Premortem Transcript: RTV TL Manager

Generated: 2026-05-08 13:37:18 America/Argentina/Buenos_Aires

## Context Gathered

Project: RTV TL Manager / Roxom Playout Manager, an internal broadcast operations app for programming Roxom TV output.

Core promise: Program the day, verify the signal, keep the screen on air.

Primary users:

- Content administrators build schedules, assets, slides, promos, ads, and fallback loops.
- Technical operators monitor live output, preview blocks, and recover from broken media.
- Producers approve continuity, ad/promo placement, and editorial rhythm.
- Viewers never interact; they should only see stable fullscreen output.

Success means operators can build and run daily programming without engineering help, see schedule health before air, recover quickly during live operation, and keep browser output stable for vMix/OBS capture.

Observed implementation:

- Next.js 15 App Router, React 19, TypeScript, Tailwind, Supabase, Vimeo.
- Main routes for admin calendar, schedule, assets, slides, settings, live output, block preview, and block detail.
- Supabase schema for media assets, slide assets, program days, program blocks, scheduled layers, integration settings, audit log.
- Schedule health detects gaps, overlaps, missing/unready assets, unsupported assets, ad duration, fallback, layer timing, hidden overlays.
- Unit tests pass: 12 tests across scheduler, schedule builder, schedule health.
- Production build passes.

Important code observations:

- `app/api/assets/upload/route.ts` uses service role operations without an explicit `requireAdmin()` guard in the route.
- `lib/data.ts` catches Supabase failures and returns `mockSchedule`, including playback paths.
- `components/output-renderer.tsx` renders video with basic autoplay/mute but does not appear to monitor media errors, stalls, ended events, or automatic fallback transitions.
- Admin mutation paths validate overlap and ad duration at app layer, but database does not enforce no-overlap.
- Block detail editor exists at `app/admin/schedule/[date]/blocks/[id]/page.tsx`, contrary to older product docs that called it missing.
- No Playwright e2e tests were found for admin publish flow, output route, upload security, or vMix/OBS-style long playback.

## Premortem Frame

It is 6 months from now. RTV TL Manager failed as a broadcast operations product. It compiled and had useful screens, but the team stopped trusting it for real playout. We are looking back to understand what went wrong.

## Raw Failure Reasons

1. A database or Supabase configuration failure silently fell back to mock schedule data, so operators saw a believable schedule that was not the real on-air plan.
2. Upload and integration routes used service-role access without consistent admin enforcement, creating a high-impact security and data integrity risk.
3. The output renderer did not behave like broadcast playout: media errors, stalled video, ended video, blocked autoplay, or failed iframes were not detected and recovered from automatically.
4. Schedule confidence was mostly advisory. Health checks existed, but critical guarantees like no-overlap, day readiness, fallback coverage, and asset playability were not enforced deeply enough across database, API, and output.
5. Operator correction stayed too slow for live incidents. The block editor helped, but there was no focused live control surface for force fallback, disable unsafe overlay, force next, hold block, or mark output unsafe.
6. The product accumulated CMS features before proving output reliability under realistic long-running broadcast conditions.
7. Deployment and environment configuration were fragile: secrets, base path, Supabase buckets, service keys, and public output behavior could drift without a clear smoke test catching it before air.

## Deep Dives

### 1. Silent Mock Fallback

Failure story: On a live programming day, Supabase queries began failing because of an expired key, RLS change, or network issue. Admin screens and output routes still rendered because `lib/data.ts` caught the error and returned `mockSchedule`. Operators saw a valid-looking day and assumed the system was healthy.

The output route then played demo or stale fallback content instead of the actual scheduled Roxom programming. Because the UI looked alive, the failure was detected late by watching the broadcast output, not by the app itself.

Underlying assumption: A working render means real data was loaded.

Early warning signs:

- Health route passes while Supabase fetches are failing.
- Output route shows blocks/assets not present in current production database.

### 2. Service-Role API Exposure

Failure story: The upload endpoint accepted multipart data and wrote to Supabase storage/database through the service-role client. Without an explicit admin guard in the route, any missing middleware or path exception turned into public write access to internal broadcast assets.

An attacker or accidental internal script uploaded large or unsafe files, polluted the asset library, or created storage cost and operational confusion. Operators lost trust because they could no longer assume every asset in the system was curated.

Underlying assumption: Route-level environment secrecy is enough protection for privileged mutations.

Early warning signs:

- API routes using `createServiceClient()` without `requireAdmin()`.
- Storage objects appearing with no matching audit trail from an authenticated admin session.

### 3. Output Renderer Is Not Yet Playout-Grade

Failure story: A long MP4 stalled, a Vimeo iframe failed to autoplay, or an HLS URL returned an error. The renderer kept showing a black frame, browser error, or frozen video because media failure events were not wired into fallback logic.

vMix/OBS kept capturing the browser route, so the broken state went directly to air. Operators could manually switch if they noticed fast enough, but the system did not protect the signal.

Underlying assumption: Browser playback succeeds once the URL and status look ready.

Early warning signs:

- No automated tests for `onError`, `onStalled`, `onEnded`, autoplay failures, or iframe load failures.
- Output preview passes for screenshots but not for 30-120 minute playback.

### 4. Health Checks Are Useful But Not Binding

Failure story: The schedule page showed warnings and critical issues, but not every unsafe state was impossible to publish or impossible to write. Some constraints lived in TypeScript only, while the database allowed timing states that could become invalid through direct writes, bugs, imports, or future endpoints.

Over time, operators learned that "ready" meant "probably okay" rather than "safe to air." The readiness label stopped carrying operational force.

Underlying assumption: UI health checks are enough to protect broadcast state.

Early warning signs:

- Active days can be created or mutated outside guarded server actions.
- Database has duration checks but no exclusion constraint preventing block overlap.

### 5. Live Recovery UX Is Missing

Failure story: During a live issue, the operator needed to leave the output monitor, navigate schedule rows, open a block, edit an asset or overlay, save, then verify output. That is acceptable during planning, but too slow under live pressure.

The product became a schedule CMS rather than an operations console. Operators kept vMix/OBS workarounds because the app did not offer one-click force fallback, disable overlay, force next, or hold current block.

Underlying assumption: Editing workflows are fast enough for live recovery.

Early warning signs:

- Live incident actions require more than one page transition.
- No audit log event type for operator override actions.

### 6. CMS Breadth Outruns Reliability

Failure story: Slides, Vimeo, uploads, lower thirds, schedule generation, settings, and assets all improved, but the core proof never became "this can run unattended for 12 hours." Bugs appeared in edge cases: vertical video sizing, iframe behavior, missing metadata, fallback selection, and layer timing.

The team had many ways to create content but no strong evidence that output stayed stable over real broadcast windows. Confidence lagged behind feature count.

Underlying assumption: Passing unit tests and build is enough signal for playout reliability.

Early warning signs:

- Tests focus on schedule logic but not browser output behavior.
- No continuous local smoke that opens `/output/live` and checks active pixels/media state.

### 7. Environment Drift Breaks Production

Failure story: A deployment used the wrong base URL, missing encryption key, missing Supabase bucket, bad Vimeo token, or wrong public app URL. The app built successfully, but runtime features failed in production.

Because there was no single operational readiness check for environment, storage, Supabase, auth, output, and settings, discovery happened while trying to use the system.

Underlying assumption: Successful `next build` means production is ready.

Early warning signs:

- Health route checks app process only, not critical dependencies.
- `.env` requirements are documented but not validated as startup/readiness gates.

## Synthesis

### Most Likely Failure

The most likely failure is output reliability lagging behind CMS functionality. The app has strong scheduling direction and useful admin screens, but the renderer and end-to-end playout path are not yet tested or instrumented like a broadcast system.

### Most Dangerous Failure

The most dangerous failure is silent wrong output: database failure returning mock schedule, or playback failure rendering stale/frozen/incorrect content while the route still looks technically alive. This creates false confidence during live broadcast.

### Hidden Assumption

The hidden assumption is that "the app renders" equals "the signal is safe." For broadcast operations, a rendered page is not enough; the system must prove real data, playable media, valid schedule, and recoverable fallback.

## Revised Plan

1. Make real-data integrity non-negotiable.
    - Remove mock fallback from production data paths.
    - Return explicit error state when Supabase fails.
    - Add a visible "data source: real/mock/error" signal in non-output admin screens.
    - Keep mock schedule only for local demo mode behind an explicit flag.

2. Lock privileged mutations.
    - Add `requireAdmin()` to every mutating API route and server action path that writes through service role.
    - Add tests or static checks for `createServiceClient()` in API routes without auth guard.
    - Log actor/action/entity for uploads, imports, settings changes, block edits, and overrides.

3. Build playout-grade fallback behavior.
    - Add output renderer state machine: loading, playing, stalled, errored, ended, fallback.
    - Wire `video` events: `onCanPlay`, `onPlaying`, `onWaiting`, `onStalled`, `onError`, `onEnded`.
    - Add timeout-based fallback if media does not start within N seconds.
    - Add debug overlay fields for media state, selected fallback, and last error.

4. Turn readiness into enforcement.
    - Add database-level overlap protection for program blocks, likely with range/exclusion constraint or guarded RPC.
    - Expand publish gate: no critical health issues, fallback ready, active day has coverage for required window, active assets playable.
    - Add a day readiness checklist component with pass/fail items, not only counts.

5. Create a live operations panel.
    - Add route or panel for current output: now, next, active media state, warnings, and one-click actions.
    - Actions: force fallback, disable overlay, force next block, hold current block, clear override.
    - Store overrides and audit them.

6. Add end-to-end broadcast smoke tests.
    - Playwright: admin login, create block, set ready/active, open output route.
    - Browser output: verify no admin UI leaks, no visible debug by default, nonblank pixels, media element exists for video blocks.
    - Failure test: bad media URL triggers fallback.
    - Production smoke script: health + Supabase + storage bucket + output route + basePath.

7. Narrow roadmap around reliability before more CMS features.
    - Freeze new content types until output error handling, auth hardening, publish gates, and live controls are done.
    - After reliability proof, add templates, clone day, scene library, and richer producer workflow.

## Pre-Launch Checklist

- Production data paths never return `mockSchedule` unless `ALLOW_DEMO_DATA=true`.
- Every service-role write route has explicit admin auth and audit log.
- `/output/live` survives bad media URL by switching to fallback automatically.
- Active day cannot publish with overlap, missing asset, unsupported asset, or missing ready fallback.
- Playwright smoke proves login, schedule creation, publish, live output, preview output, and fallback behavior.

## Verification Run

- `npm test`: passed, 12 tests.
- `npm run build`: passed, Next.js production build completed.
