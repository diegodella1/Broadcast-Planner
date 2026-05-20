# Production Readiness Runbook

RTV Planner is live for controlled production with an operator present. Treat this runbook as the
release and go-live checklist for the Roxom TV browser-output workflow.

## Current Production Shape

- App: standalone Next.js service on the host.
- Public route: `https://rtvtime.diegodella.ar`.
- Network: Cloudflare tunnel in front of local service.
- Backend: Supabase database/storage.
- Playout: `/output/live` captured by OBS or vMix.
- Operational model: named operators for normal use, bootstrap token for emergency access.
- Capture status: browser output has been confirmed through web player, vMix and OBS.
- Main product gate: replace remaining placeholder/static plate inputs with real data feeds or
  operator-configurable inputs, then remodel the on-air plate design for a stronger broadcast look.
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
rtk npm run deploy:local
```

After deploy, run production output status smoke:

```bash
export RTV_BASE_URL="https://rtvtime.diegodella.ar"
export ADMIN_BOOTSTRAP_TOKEN="..."
export OUTPUT_CAPTURE_TOKEN="..."
rtk npm run e2e
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

- Some plates still need real production inputs and a visual remodel before they should represent
  the final channel identity.

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
- Secrets: health checks and errors never include secret values.
- Service role: every mutating API route that uses privileged Supabase access calls `requireAdmin`.
- Output: protected output routes require `OUTPUT_CAPTURE_TOKEN` in production and use an `HttpOnly` output cookie for normal admin launches.
- Output session: `/api/output/session` must redirect to the public app origin from `APP_BASE_URL`/`NEXT_PUBLIC_APP_BASE_URL`, never `0.0.0.0`, `localhost`, or `:3450`.
- Dependencies: run `rtk npm audit --audit-level=high` and triage high/critical findings.

MVP may ship only with no open P0 findings and explicit owner/date for any P1 follow-up.
