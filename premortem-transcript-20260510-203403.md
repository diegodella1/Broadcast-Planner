# Premortem Transcript - Broadcast Planner MVP Production Readiness

Timestamp: 2026-05-10 20:34:03 America/Argentina/Buenos_Aires

## Context Gathered

What: Broadcast Planner production-readiness plan after MVP hardening work: audit trail, output capture token, Vimeo playback readiness, CSRF, security headers, service-role guard, local/prod read-only smoke scripts, Node read-only E2E smoke, build/Cloudflare build gates.

Who: former channel broadcast operators, admins, producers, and anyone relying on `/output/live`, `/output/preview/[blockId]`, Vimeo/Reuters sync, and schedule publishing during live operations.

Success: Production MVP can go on air without silent mock output, unauthenticated mutations, blank output, unready Vimeo assets, missing auditability, or a deploy that passes CI but fails the broadcast path.

Premortem frame: It is 6 months from now. This production-readiness plan failed. Broadcast Planner was declared MVP-ready, then broke during real operation.

## Raw Failure Reasons

1. The smoke tests passed because they checked HTML and JSON shape, not real browser playback, media startup, HLS behavior, pixels, audio/autoplay, or capture-tool rendering.
2. CSRF hardening broke legitimate operator workflows because some API forms, scripts, or client fetches lacked token plumbing or recovery UX.
3. Output token protection failed operationally because tokens were put in URLs, logs, browser history, screenshots, or were left unset in production for convenience.
4. Audit trail created false confidence because it logged happy-path application mutations but not all server actions, direct Supabase writes, cron jobs, or previous/after values.
5. Vimeo playback readiness became stale or noisy because sync-time checks hit API/rate/permission limits and the app trusted outdated readiness state.
6. Schedule conflicts still reached production because validation lived mostly in app code and concurrent/direct writes bypassed the no-overlap check.
7. Emergency fallback was not actually playout-grade: no ready global fallback, unsupported fallback media, or browser autoplay/HLS behavior still produced black output.
8. OWASP hardening remained incomplete because CSP kept `unsafe-inline`/`unsafe-eval`, media/connect sources were broad, and slide HTML sanitization used regex.
9. Deployment paths diverged: Docker, Next standalone, Cloudflare OpenNext, and local tunnel behaved differently; a green build did not represent the live runtime.
10. The production smoke was read-only by design, so upload, settings, sync, manual broadcast, CSRF, and publish write paths could break undetected.

## Deep Dives

### 1. Smoke Passed, Output Failed

The team ran `smoke:prod` before air and saw green: health OK, schedule JSON valid, `/output/live` returned HTML, and the response did not contain admin DOM. Thirty minutes later, vMix showed a black frame because the active Vimeo HLS playlist failed in the browser after hydration. The smoke never waited for the client renderer, never inspected pixels, and never verified `mediaState: playing`.

The failure was subtle because server-rendered HTML looked healthy. The debug panel showed "Loading Vimeo stream", but the script treated nonblank HTML as enough. Operators trusted the gate, not the actual capture.

Underlying assumption: Nonblank output HTML means the real broadcast renderer is functioning.

Early warning signs:

- Debug output repeatedly shows `mediaState: loading`, `fallback`, or no asset transition to `playing`.
- Smoke artifacts contain emergency slate or "Loading Vimeo stream" but still pass.

### 2. CSRF Broke Operator Workflows

After CSRF landed, forms rendered through admin pages worked, but scripts and partial client flows failed. Vimeo sync from cron initially broke until token fetch was patched, and similar breakage appeared in Reuters refresh or upload paths. Operators saw generic JSON errors instead of a clear "reload and retry" state.

During a live issue, the operator tried a manual sync or upload and got blocked by `Invalid CSRF token`. Because the control was meant for recovery, the security fix turned into an availability failure.

Underlying assumption: Adding CSRF tokens to obvious forms covered every legitimate mutation path.

Early warning signs:

- 403s for same-origin admin users after long-lived admin tabs.
- Cron/script jobs start needing browser-only CSRF bootstrap logic.

### 3. Output Token Leaked Or Was Disabled

The output token protected capture routes, but it was appended to URLs and passed through client fetches. It appeared in browser history, OBS/vMix config, debug screenshots, and maybe logs. After friction, someone left `OUTPUT_CAPTURE_TOKEN` unset in production to make capture setup easier.

Six months later, output APIs were effectively public. A stale token lived in too many places to rotate cleanly, and public output endpoints exposed schedule metadata and Vimeo playback URLs.

Underlying assumption: A query token is good enough for long-running production capture.

Early warning signs:

- Capture setup docs or screenshots include `?token=`.
- Production health/runbook allows output token to be optional.

### 4. Audit Trail Was Incomplete

The new `/admin/audit` page showed useful events, but only for selected app paths. Manual database changes, cron syncs, failed operations, and some server actions had missing before/after values. Actor values were labels like `admin` and `vimeo-sync`, not real operator identity.

After a schedule unexpectedly changed before air, the team opened audit and saw nothing actionable. The table existed, but it could not answer who changed what, from what value, and by which path.

Underlying assumption: Having an audit table equals operational traceability.

Early warning signs:

- Audit events lack `previous`/`next` for broadcast-critical changes.
- Multiple mutation paths use `createServiceClient()` outside a common audited helper.

### 5. Vimeo Readiness Became Stale

Sync-time playback checks marked assets ready or failed, but Vimeo permissions and playback links changed later. A video passed readiness during import, then failed when the output route requested playback under live conditions. Rechecking every synced asset also increased API pressure and made failures noisy.

Operators learned to ignore readiness because some failures were transient and some "ready" assets still broke. The health system lost credibility.

Underlying assumption: Vimeo playback readiness is stable after sync.

Early warning signs:

- Many assets have `playback_checked_at` older than the schedule publish time.
- Sync logs show readiness failures correlated with Vimeo/API errors, not actual bad assets.

### 6. Schedule Conflicts Bypassed App Checks

The conflict helper worked in UI/server actions, but concurrent requests and direct database writes still created overlaps. A producer imported or generated blocks while another admin edited the day. Both requests validated against a stale schedule snapshot.

On air, the scheduler picked the later overlapping block because `findActiveSchedule` resolves conflicts by latest start. This looked like a random program jump to operators.

Underlying assumption: App-layer validation is enough to enforce schedule invariants.

Early warning signs:

- Audit shows two block writes within seconds on the same day.
- Health detects overlap after writes even though both actions reported success.

### 7. Fallback Was Not Truly Reliable

The renderer had fallback logic, but production did not guarantee a valid, browser-playable, ready global fallback. Some fallbacks were archived, unsupported, missing URLs, too large, or depended on the same failing remote path. In a failure, the app displayed emergency slate or black instead of branded safe content.

The plan treated fallback as a data concept, not a rehearsed broadcast procedure. Nobody regularly tested the exact fallback asset in capture.

Underlying assumption: If a fallback asset exists in the database, recovery is covered.

Early warning signs:

- Health says no ready fallback or reaches hardcoded emergency slate.
- Smoke never asserts the fallback path by forcing bad media.

### 8. OWASP Hardening Stayed Superficial

CSP existed, but it allowed `unsafe-inline`, `unsafe-eval`, broad `connect-src`, and broad `media-src`. Slide HTML was sanitized with regex, which is not a real HTML sanitizer. A trusted admin could accidentally paste unsafe markup that survived sanitization and ran in output context.

The project passed a checklist item but not a serious browser threat model. The most sensitive surface, the output renderer, still accepted rich content.

Underlying assumption: A CSP header plus regex sanitization is enough for MVP.

Early warning signs:

- CSP violations are not monitored, and policy is never tightened from report-only to enforced.
- Tests only cover obvious `<script>` removal, not malformed HTML/event/style payloads.

### 9. Deployment Paths Diverged

`next start`, Docker standalone, Cloudflare OpenNext, local tunnel, and systemd scripts all existed. The team tested one path and deployed another. Warnings about standalone and OpenNext cache/build behavior were treated as noise.

A release passed local build and smoke but failed under Cloudflare because runtime headers, cookies, or Node compatibility differed. Rollback was manual and slow.

Underlying assumption: A green Next build approximates every production runtime.

Early warning signs:

- `cf:build` warnings are accepted without owner or issue.
- Smoke is run against local Next server, not the actual deployed artifact.

### 10. Read-Only Smoke Missed Broken Writes

Production smoke was intentionally safe and read-only. That prevented accidental live data mutation, but it also meant the highest-risk admin flows were untested in production-like conditions: upload, settings save, sync, publish, manual broadcast, CSRF, and audit writes.

After deploy, operators discovered writes were broken only when they needed them. The read-only smoke gave confidence in viewing, not operating.

Underlying assumption: Local write-path tests are enough for production write-path reliability.

Early warning signs:

- Recent deploy touched auth/CSRF/forms but only read-only prod smoke ran.
- No staging environment runs the full mutation path with production-like secrets and storage.

## Synthesis

### Most Likely Failure

The most likely failure is that read-only smoke passes while real browser playout fails. The current smoke proves endpoints return responses, but not that the hydrated renderer reaches `playing`, pixels are nonblack, fallback engages, or capture tools see the same output.

### Most Dangerous Failure

The most dangerous failure is output token leakage or disablement. If output APIs and playback URLs become accessible, the app leaks operational schedule data and can expose time-sensitive media URLs. This damages both broadcast reliability and security.

### Hidden Assumption

The hidden assumption is that "MVP production ready" can be proven mostly through app-level checks and read-only endpoint probes. For a broadcast tool, readiness must be proven through the actual capture path, media playback path, fallback path, and operator recovery path.

## Red-Team Findings

P0 - Output token query-string model is operationally weak. It protects the route only if configured, but encourages token exposure in URLs, logs, capture configs, and screenshots.

P0 - Smoke does not prove playout. Nonblank HTML is not equal to active rendered video/slides. It misses hydration, media events, HLS runtime errors, autoplay behavior, black frames, and fallback transitions.

P1 - CSP is not strict enough. `unsafe-inline`, `unsafe-eval`, and broad `connect-src`/`media-src` reduce the security value of the header.

P1 - Regex HTML sanitization is not enough for slide HTML. It removes obvious payloads but should not be considered a robust XSS boundary.

P1 - Audit is not complete traceability. Actor identity is coarse, and mutation paths are not forced through a common audited write layer.

P1 - No production-like mutation smoke. Read-only production smoke is correct for live prod, but there needs to be a staging write smoke with the same auth/CSRF/storage patterns.

P2 - Deployment/runtime divergence remains. OpenNext, Docker, standalone, and local tunnel need one canonical release path and one smoke target per path.

## Revised Fix Plan

1. Add browser-based playout smoke.
    - Use Playwright or Chromium headless against a production-like URL.
    - Wait for a stable selector/debug field showing media state.
    - Capture screenshot and assert nonblack pixels.
    - Add forced bad-media scenario in local/staging to prove fallback.

2. Replace query output token for operators.
    - Add `/admin/output/session` action to mint short-lived `rpm_output_token` cookie.
    - Keep query token only as temporary bootstrap for capture setup.
    - Make `OUTPUT_CAPTURE_TOKEN` required in production health.
    - Add token rotation runbook.

3. Tighten output/API auth.
    - Keep `/api/playout/schedule` and `/api/vimeo/playback` protected by output token.
    - Require admin for Vimeo search and Reuters sync/list.
    - Add tests for unauthorized API reads.

4. Upgrade XSS defense.
    - Replace regex sanitizer with a real sanitizer or remove arbitrary slide HTML from production MVP.
    - Add tests for malformed tags, event handlers, style URLs, SVG payloads, and javascript URLs.
    - Move CSP toward nonces/hashes and remove `unsafe-eval` where Next runtime allows.

5. Make audit mandatory.
    - Add an `auditedMutation` helper.
    - Store actor, action, entity, result, previous critical fields, next critical fields, and correlation id.
    - Add static guard for broadcast-critical mutations that do not call audit helper.

6. Add DB-level schedule invariant.
    - Add exclusion/trigger constraint or serialized transaction for per-day block overlap.
    - Test concurrent writes.
    - Keep app helper only for user-friendly message and suggested slot.

7. Add staging write smoke.
    - Never write in live production smoke.
    - In staging, create future sandbox date, upload/register tiny asset, create block, publish/check output, delete or archive sandbox data.
    - Assert audit rows exist for every write.

8. Canonicalize deployment.
    - Pick Cloudflare as primary production artifact if that is the real target.
    - Run smoke against Cloudflare preview before promotion.
    - Keep Docker/local tunnel as secondary with separate smoke script.

## Pre-Launch Checklist

1. Browser playout smoke passes: output reaches `playing` or branded fallback, screenshot is nonblack, admin chrome absent.
2. `OUTPUT_CAPTURE_TOKEN` is set in production, no public docs/screenshots contain live token URLs, and rotation is rehearsed.
3. Staging write smoke passes for upload/register, schedule, publish, sync, CSRF, audit, and cleanup.
4. Every broadcast-critical mutation writes an audit row with actor, result, previous/next critical values, and correlation id.
5. CSP/XSS review has no open P0/P1 findings, and arbitrary slide HTML is either removed or sanitized by a real parser.
