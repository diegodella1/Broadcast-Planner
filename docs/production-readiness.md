# Production Readiness Runbook

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
export ALLOW_STAGING_WRITE_SMOKE="true"
rtk npm run smoke:staging-write
```

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

After deploy, run production browser playout smoke:

```bash
export RTV_BASE_URL="https://rtvtime.diegodella.ar"
export ADMIN_BOOTSTRAP_TOKEN="..."
export OUTPUT_CAPTURE_TOKEN="..."
rtk npm run e2e
```

`cf:build` and `cf:*` commands remain available for Cloudflare Worker/OpenNext validation, but they
are not the active production deploy path on this host.

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
- Output session: `/api/output/session` must redirect to the public app origin, never `0.0.0.0`, `localhost`, or `:3450`.
- Dependencies: run `rtk npm audit --audit-level=high` and triage high/critical findings.

MVP may ship only with no open P0 findings and explicit owner/date for any P1 follow-up.
