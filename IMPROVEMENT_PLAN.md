# RTV TL Manager Improvement Plan

Goal: prevent the premortem failures and make RTV TL Manager reliable enough for real broadcast operations.

## Success Criteria

- Output route never silently shows demo/mock data in production.
- Mutating API routes require admin auth and leave audit logs.
- Bad media automatically falls back without operator intervention.
- Active day cannot publish with critical schedule or asset problems.
- Operator can recover live output in seconds.
- CI/local smoke proves the critical broadcast path works before deploy.

## Phase 1: Stop Silent Wrong Output

Priority: highest.

### 1. Remove production mock fallback

Problem: `lib/data.ts` catches Supabase errors and returns `mockSchedule`, including playback paths. This can hide real data failure.

Actions:

- Add explicit demo mode flag: `ALLOW_DEMO_DATA=true`.
- In production or when flag is absent, throw/return explicit data error instead of `mockSchedule`.
- Add admin-visible data source indicator: `real`, `demo`, or `error`.
- Keep output route conservative: if real data cannot load, show safe fallback/error screen, not fake schedule.

Acceptance:

- Supabase outage cannot render mock blocks on `/output/live`.
- Unit test covers data failure behavior.

### 2. Expand health endpoint

Problem: build can pass while Supabase, storage, env, or output dependencies are broken.

Actions:

- Extend `/api/health` with checks for required env vars, Supabase read, storage buckets, and encryption key presence.
- Return degraded state for optional integrations like Vimeo.
- Keep response safe: no secret values.

Acceptance:

- Missing required env var returns unhealthy.
- Missing video bucket returns unhealthy or degraded with clear key.

## Phase 2: Harden Auth And Data Integrity

Priority: highest.

### 3. Guard service-role writes

Problem: API routes can use privileged Supabase service role. Every write path needs explicit admin auth.

Actions:

- Add `requireAdmin()` to:
    - `app/api/assets/upload/route.ts`
    - `app/api/settings/route.ts`
    - `app/api/vimeo/import/route.ts`
- Review server actions using `createServiceClient()` and ensure admin pages are protected by middleware or route guards.
- Add regression test or static script that fails when an API route uses `createServiceClient()` without `requireAdmin()`.

Acceptance:

- Unauthenticated POST to upload/import/settings returns unauthorized.
- Authenticated admin still works.

### 4. Strengthen audit log

Problem: operators need traceability for broadcast-critical changes.

Actions:

- Audit all writes: uploads, imports, settings, asset edits, block edits, layer toggles, publish changes.
- Include actor, entity, date/block id, previous critical values where practical.
- Add future operator override events.

Acceptance:

- Every broadcast-affecting mutation creates an `audit_log` row.

### 5. Enforce schedule invariants deeper

Problem: app-layer overlap checks can be bypassed by direct writes or future endpoints.

Actions:

- Add database-level no-overlap enforcement for `program_blocks` per `program_day_id`.
- Keep TypeScript validation for user-friendly errors.
- Add migration tests or SQL verification.

Acceptance:

- Database rejects overlapping blocks even outside app server actions.

## Phase 3: Make Output Playout-Grade

Priority: high.

### 6. Add renderer media state machine

Problem: current renderer does not visibly manage playback failure states.

Actions:

- Track media state: `idle`, `loading`, `playing`, `waiting`, `stalled`, `errored`, `ended`, `fallback`.
- Wire `<video>` events: `onCanPlay`, `onPlaying`, `onWaiting`, `onStalled`, `onError`, `onEnded`.
- Add startup timeout: if media does not play within configured seconds, switch to fallback.
- Add debug panel fields: media state, active asset id, fallback asset id, last media error.

Acceptance:

- Bad MP4 URL switches to fallback automatically.
- Ended video does not freeze on last frame beyond policy.
- Debug mode explains why fallback engaged.

### 7. Add fallback selection policy

Problem: fallback exists but needs deterministic priority.

Actions:

- Resolve fallback in this order:
    1. Block fallback
    2. Day fallback
    3. Global ready fallback asset
    4. Hardcoded Roxom emergency slate
- Add health warning when output would reach level 4.

Acceptance:

- Every active block has predictable fallback behavior.

## Phase 4: Turn Readiness Into A Publish Gate

Priority: high.

### 8. Build day readiness checklist

Problem: counts are useful, but operators need pass/fail readiness.

Actions:

- Add checklist to schedule page:
    - No overlaps
    - No missing base assets
    - No unsupported base assets
    - Ready fallback available
    - Required coverage window filled
    - Layers fit inside blocks
    - Active output preview opens cleanly
- Block `ready`/`active` status when critical items fail.

Acceptance:

- Operator can explain why day cannot publish from one panel.

### 9. Add asset readiness rules

Problem: `ready` must mean ready to air, not only manually selected.

Actions:

- Validate URL exists for remote assets.
- Validate Vimeo id/embed status for Vimeo assets.
- Validate duration for scheduled long-form/ad content where possible.
- Add "waived duration" metadata only if intentional.

Acceptance:

- Asset cannot be considered air-ready with missing required playback fields.

## Phase 5: Add Live Operations Controls

Priority: medium-high.

### 10. Create live operations panel

Problem: editing a block is too slow during live failure.

Actions:

- Add `/admin/live` or panel on schedule page.
- Show now, next, active media state, fallback state, current layers, warnings.
- Add actions:
    - Force fallback
    - Disable overlay
    - Force next block
    - Hold current block
    - Clear override
- Persist overrides with expiry and audit log.

Acceptance:

- Operator can recover from unsafe overlay or failed media with one click.

## Phase 6: Add Broadcast Smoke Tests

Priority: high before production use.

### 11. Add Playwright critical path

Actions:

- Login as admin.
- Create or seed day.
- Create media/slide/block.
- Publish day.
- Open `/output/live`.
- Verify no admin UI leaks.
- Verify output is nonblank.
- Verify preview route works.
- Verify bad media triggers fallback.

Acceptance:

- `npm run e2e` catches broken critical path.

### 12. Add local deploy smoke

Actions:

- Create `npm run local:smoke`.
- Check health endpoint.
- Check Supabase connection.
- Check storage buckets.
- Check basePath routing.
- Open output route with seeded schedule.

Acceptance:

- One command proves local runtime readiness after build/deploy.

## Phase 7: Roadmap Discipline

Priority: ongoing.

### 13. Freeze new content types until reliability baseline

Do not add maps, widgets, more templates, permissions, or automation until phases 1-6 are complete.

Allowed work:

- Reliability
- Security
- Fallbacks
- Publish gates
- Operator recovery
- Tests
- Small UX changes supporting those goals

## Suggested Implementation Order

1. Remove production mock fallback.
2. Guard service-role API routes.
3. Add health dependency checks.
4. Add output media state machine and fallback timeout.
5. Add fallback selection policy.
6. Add publish readiness checklist.
7. Add Playwright bad-media fallback test.
8. Add live operations panel.
9. Add database overlap enforcement.
10. Add local deploy smoke.

## First Sprint Scope

Target: 3-5 days.

- [x] Production mock fallback removal.
- [x] Admin auth on mutating API routes.
- [x] Health dependency checks.
- [x] Output media error fallback for `<video>`.
- [ ] One Playwright smoke for live output and fallback.

Definition of done:

- [x] `npm test` passes.
- [x] `npm run build` passes.
- [ ] New smoke test proves bad media does not show broken output.
- [x] Unauthenticated upload/import/settings POST fails by route guard and regression test.

## Implementation Log

2026-05-08:

- Added explicit `ALLOW_DEMO_DATA=true` gate for mock data fallback.
- Changed production data failures to throw instead of silently rendering mock schedule.
- Kept no-day schedules real and empty instead of fake.
- Added emergency output slate when playback schedule cannot load.
- Added admin auth to upload, settings, and Vimeo import API mutations.
- Expanded `/api/health` to check required env, Supabase query, storage buckets, and Vimeo config.
- Added output media state tracking and video failure fallback timeout.
- Added debug media state fields to output renderer.
- Marked data-backed admin pages dynamic so build does not require database access.
- Added regression tests for data fallback policy and API auth guards.
