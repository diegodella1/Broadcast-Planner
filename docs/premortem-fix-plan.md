# Premortem Findings Fix Plan

Goal: close the P0/P1 failure modes from `premortem-report-20260510-203403.html` before calling the RTV Planner MVP production-ready.

## Gate 1: Prove Real Playout, Not Just HTTP

Status: implemented for the release gate. Production browser smoke passes against the public tunnel.
Forced-bad-media fallback fixture remains follow-up.

- Add `@playwright/test` and replace the Node-only `npm run e2e` with Playwright smoke.
- Test `/output/live` with a real browser against local production build and the public
  `cloudflared` tunnel.
- Wait for one of these explicit outcomes:
  - media state reaches `playing`
  - branded fallback slate renders intentionally
  - schedule unavailable emergency slate renders with explicit reason
- Capture screenshot and assert nonblack/nonblank pixels.
- Add a local/staging forced-bad-media fixture that proves fallback engages.
- Keep Node smoke as `npm run smoke:http` for fast endpoint checks.

Acceptance:

- `npm run e2e` fails if output is stuck on "Loading Vimeo stream".
- `npm run e2e` fails on black frame.
- CI runs HTTP smoke; release checklist runs browser smoke against preview.

## Gate 2: Replace Query Token With Output Session

Status: implemented. Admin links mint an output cookie; query tokens remain for scripts/bootstrap.

- Add admin-only action to mint `rpm_output_token` cookie for capture routes.
- Cookie settings: `HttpOnly`, `Secure` in HTTPS, `SameSite=Lax`, short TTL, path `/output`.
- Keep `?token=` support temporarily for initial capture setup and scripts.
- Update `/admin/output` to open output through session-cookie flow.
- Make `OUTPUT_CAPTURE_TOKEN` required when `NODE_ENV=production`; health fails if missing.
- Add token rotation runbook to `docs/production-readiness.md`.

Acceptance:

- Production health is `fail` when output token is unset.
- `/output/live` works with output cookie and no query token.
- No production docs require storing `?token=` in vMix/OBS long-term.

## Gate 3: Close XSS/CSP P1s

Status: implemented by removing arbitrary HTML insertion from the output renderer.

- Preferred MVP path: remove arbitrary slide HTML from production output and render it as plain text or trusted templates only.
- If HTML must remain, add a real parser-based sanitizer dependency and allowlist tags/attrs.
- Add tests for:
  - event handlers
  - malformed script tags
  - `javascript:` URLs
  - SVG payloads
  - style URL payloads
- Tighten CSP:
  - remove broad `connect-src`/`media-src` where possible
  - document why `unsafe-inline` or `unsafe-eval` remain if Next requires them
  - add report-only CSP endpoint later if needed

Acceptance:

- No arbitrary unsanitized HTML reaches `dangerouslySetInnerHTML`.
- XSS payload tests pass.
- CSP is documented with explicit allowed origins.

## Gate 4: Make Audit Operationally Useful

Status: implemented for critical app mutation paths with a static guard.

- Add `auditedMutation()` helper.
- For broadcast-critical writes, store:
  - actor
  - action
  - entity type/id
  - result
  - previous critical values
  - next critical values
  - correlation id
- Route these through helper:
  - program day status changes
  - block create/update/delete
  - layer create/toggle/delete
  - asset create/update/upload/import
  - Vimeo/Reuters sync
  - manual broadcast actions
  - settings changes
- Add static check that flags critical mutation files missing `auditedMutation`.

Acceptance:

- Every broadcast-critical mutation has an audit row on success and failure.
- Audit page can answer "who changed what, from what, to what, when".

## Gate 5: Enforce Schedule Invariants Below App Layer

Status: implemented with a Supabase trigger migration.

- Add Supabase migration for per-day no-overlap enforcement.
- Use either:
  - PostgreSQL exclusion constraint with range type, if extension support is available
  - trigger function that rejects overlapping `program_blocks`
- Keep app-level `findScheduleConflicts()` for friendly UX and suggested safe time.
- Add tests for same-day overlap, cross-day non-overlap, update self, and concurrent write simulation.

Acceptance:

- Database rejects overlapping blocks regardless of API path.
- App still shows readable conflict message before submit.

## Gate 6: Add Staging Write Smoke

Status: implemented as a guarded staging-only smoke script.

- Create `npm run smoke:staging-write`.
- Required env:
  - `RTV_STAGING_BASE_URL`
  - `ADMIN_BOOTSTRAP_TOKEN`
  - `OUTPUT_CAPTURE_TOKEN`
- Use a reserved future sandbox date.
- Test:
  - get CSRF
  - create/register tiny media or URL asset
  - create block
  - set day ready when health permits
  - open preview/output
  - verify audit rows
  - archive/delete sandbox data
- Never run this against live production.

Acceptance:

- Auth, CSRF, writes, audit, and preview are tested in staging.
- Production smoke remains read-only.

## Gate 7: Canonicalize Release Runtime

Status: release docs now require local tunnel deploy plus HTTP/browser/staging/prod smokes.

- Treat `deploy:local` behind `cloudflared` as the current primary production path.
- Release order:
  1. local type/lint/test/build
  2. production deploy with `deploy:local`
  3. production read-only smoke
  4. production browser playout smoke
  5. staging write smoke when a staging host exists
- Keep Cloudflare Worker/OpenNext build as optional validation for future deploy strategy.

Acceptance:

- No production deploy without local build and post-deploy smoke.
- OpenNext warnings are triaged or documented with owner.

## Priority Order

1. Browser playout smoke and forced fallback test.
2. Output session cookie + production token-required health.
3. Remove or properly sanitize arbitrary slide HTML.
4. Staging write smoke.
5. Audit helper with before/after values.
6. DB-level no-overlap enforcement.
7. Runtime/release path cleanup.

## Done Criteria

MVP production-ready only when:

- No open P0/P1 from premortem.
- Browser playout smoke passes against production tunnel.
- Production read-only smoke passes pre-air.
- Staging write smoke passes.
- Output token is required and not stored long-term in capture URLs.
- Audit proves critical writes with before/after values.
