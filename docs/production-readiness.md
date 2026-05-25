# Production Readiness Runbook

RTV Planner is live for controlled production with an operator present. Treat this runbook as the
release and go-live checklist for the Roxom TV browser-output workflow.

## Current Production Shape

- App: standalone Next.js service on the host.
- Public route: `https://rtvtime.diegodella.ar`.
- Network: Cloudflare tunnel in front of local service.
- Backend: Supabase database/storage.
- Uploaded media: local Supabase Storage served publicly through `/api/media/assets/[assetId]`.
- Playout: `/output/live` captured by OBS or vMix.
- Operational model: named operators for normal use, bootstrap token for emergency access.
- Capture status: browser output has been confirmed through web player, vMix and OBS.
- Main product gate: remodel the on-air plate design for a stronger broadcast look, then tighten
  output alerts for drift, stalls, silence and media errors.
- Real-data plate inputs: metals use Roxom API data with fallback, weather falls back to Open-Meteo
  when OpenWeather is not configured, calendar/event plates use the Supabase events table, and the
  debt plate no longer depends on a missing background asset.
- Normal video programs can opt into a `PREVIOUSLY RECORDED` output bug with four-corner placement.
  The bug is intentionally excluded from ads, promos, slides, images, fallback, Reuters streams and
  manual overrides.
- Guest lineup plates are operator-configurable in `/admin/guests`; existing Supabase backends need
  `supabase/migrations/20260522120000_guest_lineup.sql` or
  `public/manual/guest-lineup-migration.sql` plus
  `supabase/migrations/20260522172000_slide_asset_metadata.sql` applied before use.
- API rate limiting now uses the atomic Supabase function in
  `supabase/migrations/20260522153000_atomic_rate_limits.sql`; existing backends should apply the
  matching standalone file at `public/manual/atomic-rate-limits-migration.sql`.
- Public `/api/health` responses are sanitized. Full diagnostic messages are available to logged-in
  admins through the admin health surface.
- Alternate deploy path: OpenNext/Cloudflare Workers is configured and deployable, but the current
  production host remains local standalone Next.js behind Cloudflare Tunnel until a Workers deploy
  is smoke-tested.

## Required Gates

Run these before a production release:

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm run format:check
rtk npm run i18n:check
rtk npm run security:service-role
rtk npm run security:audit-trail
rtk npm audit --omit=dev --audit-level=high
rtk npm test -- --coverage --run
rtk npm run build
rtk npm run smoke:http
```

Run staging write smoke before production deploy:

```bash
export RTV_STAGING_BASE_URL="https://staging.example.com"
export ADMIN_BOOTSTRAP_TOKEN="..."
export OUTPUT_CAPTURE_TOKEN="..."
export NEXT_PUBLIC_SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export ALLOW_STAGING_WRITE_SMOKE="true"
rtk npm run smoke:staging-write
```

The staging write smoke archives its sandbox block and asset after verifying upload, schedule,
playout schedule auth and audit visibility.

Run the production read-only smoke manually before going on air:

```bash
export RTV_PROD_BASE_URL="https://example.com"
export ADMIN_BOOTSTRAP_TOKEN="..."
export OUTPUT_CAPTURE_TOKEN="..." # when configured
rtk npm run smoke:prod
```

The production smoke is intentionally read-only. It must not create days, upload media, publish a
schedule, trigger sync jobs, or mutate Supabase.

For the current `rtvtime.diegodella.ar` host, production deploy is local standalone Next.js behind
`cloudflared`:

```bash
rtk bash scripts/deploy_local_tunnel.sh
```

The deploy script records persisted smoke status for `/api/health`. To run the public read-only
smoke manually:

```bash
export RTV_PROD_BASE_URL="https://rtvtime.diegodella.ar"
export ADMIN_BOOTSTRAP_TOKEN="..."
export OUTPUT_CAPTURE_TOKEN="..."
rtk npm run smoke:prod
```

Before live operation, open `/admin/runbook/<air-date>` and complete the critical preflight checks:
schedule health, fallback readiness, output monitor and media readiness. The app warns on open
critical checks but does not block output, so the operator owns final go/no-go.

## Sales-Ready Summary

RTV Planner gives Roxom TV one place to plan, verify and operate the daily signal. The product is
ready to demonstrate as a practical broadcast operations console: content library, schedule health,
runbook, browser playout, output monitor, live overrides, fallbacks and audit trail.

What to say in a demo:

- "This is the daily control room for Roxom TV."
- "The operator can see what is live, what is next and what can fail before it goes on air."
- "The browser output is designed to be captured by OBS or vMix."
- "The web player has already been confirmed in browser, vMix and OBS."
- "If the output reloads mid-show, it asks the server where the schedule is and resumes near that offset."
- "Supabase stores the operational state, and a fresh backend can be bootstrapped from SQL."
- "Schedule editing now confirms newly-added blocks clearly, with highlighted placement and
  readable start/end ranges."

Current demo caveat:

- The output is operationally correct, but the plate visual system still needs a broadcast-quality
  remodel before it should represent the final channel identity.

`cf:build` and `cf:*` commands remain available for Cloudflare Worker/OpenNext deploys. Those
deploys must keep Cloudflare dashboard vars/secrets configured for Supabase, `APP_ENCRYPTION_KEY`,
`ADMIN_BOOTSTRAP_TOKEN`, `OUTPUT_CAPTURE_TOKEN`, app base URLs and provider tokens. They are not the
active production deploy path on this host until a real Workers deploy passes smoke.

## Output Token Rotation

1. Set a new `OUTPUT_CAPTURE_TOKEN` in the target environment.
2. Redeploy or restart the app.
3. Confirm `/api/health` is green.
4. Open output from the admin UI so `/api/output/session` refreshes the `rpm_output_token` cookie.
5. Run `rtk npm run smoke:prod`.
6. Remove the old token from any temporary capture bootstrap URLs.

## OWASP Red-Team Checklist

- Auth: admin cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in HTTPS production.
- CSRF: cross-site mutating requests are blocked by middleware; API forms use double-submit CSRF.
- XSS: arbitrary slide HTML is not inserted into the renderer; slide body text is rendered as text.
- Headers: CSP, `frame-ancestors`, `nosniff`, referrer policy, and permissions policy are present.
- Secrets: health checks and errors never include secret values; public health hides diagnostic messages.
- Service role: every mutating API route that uses privileged Supabase access calls `requireAdmin`.
- Output: protected output routes require `OUTPUT_CAPTURE_TOKEN` in production and use an `HttpOnly` output cookie for normal admin launches.
- Active block: `/api/active-block` requires either admin access or output-token access.
- Rate limiting: API rate limits are incremented through the atomic `increment_rate_limit` database function.
- Alerts: health failure webhooks are deduplicated by failed check signature and cooldown.
- Output session: `/api/output/session` must redirect to the public app origin from `APP_BASE_URL`/`NEXT_PUBLIC_APP_BASE_URL`, never `0.0.0.0`, `localhost`, or `:3450`.
- Dependencies: CI blocks high/critical production dependency advisories. Also run
  `rtk npm audit --omit=dev --audit-level=moderate` manually during release hardening; the current
  remaining moderate is the Next-bundled `postcss` advisory, and `npm audit fix --force` must not
  be used because it proposes a breaking downgrade.

MVP may ship only with no open P0 findings and explicit owner/date for any P1 follow-up.
