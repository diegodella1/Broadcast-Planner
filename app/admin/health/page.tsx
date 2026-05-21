import Link from "next/link"

import { AdminShell } from "@/components/admin-shell"
import {
  ActionHint,
  ClearStateBadge,
  MetricTile,
  Notice,
  PrimaryActionPanel
} from "@/components/ui"
import { collectOperatorHealth, type OperatorHealthCheck } from "@/lib/health-checks"

export const dynamic = "force-dynamic"

export default async function AdminHealthPage() {
  const report = await collectOperatorHealth()
  const checks = Object.values(report.checks)
  const failed = checks.filter((check) => check.status === "fail").length
  const degraded = checks.filter((check) => check.status === "degraded").length

  return (
    <AdminShell
      title="Admin Health"
      description="Operator-visible readiness checks for production playout."
    >
      {failed ? (
        <Notice tone="danger" title="Production blockers">
          {failed} checks are failing. Resolve them before unattended operation.
        </Notice>
      ) : degraded ? (
        <Notice tone="warn" title="Degraded readiness">
          {degraded} checks need attention before handoff.
        </Notice>
      ) : (
        <Notice tone="ok" title="Health checks passing">
          Core runtime, integrations and output checks are ready.
        </Notice>
      )}

      <PrimaryActionPanel
        eyebrow="Readiness"
        title={
          failed
            ? "Broadcast is blocked"
            : degraded
              ? "Broadcast needs attention"
              : "Ready for broadcast"
        }
        detail={
          failed
            ? "Fix failing checks before unattended operation."
            : degraded
              ? "You can keep working, but resolve warnings before handoff."
              : "Runtime, storage, output and integrations are reporting healthy."
        }
        action={
          <a className="btn-primary" href="/admin/output">
            Open Output
          </a>
        }
        secondary={
          <a className="btn-secondary" href="/admin/calendar">
            Open Schedule
          </a>
        }
      />

      <section className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricTile
          label="Failing"
          value={String(failed)}
          detail="Must fix"
          tone={failed ? "danger" : "ok"}
        />
        <MetricTile
          label="Degraded"
          value={String(degraded)}
          detail="Needs attention"
          tone={degraded ? "warn" : "ok"}
        />
        <MetricTile label="Checks" value={String(checks.length)} detail="Total" tone="info" />
        <MetricTile
          label="Uptime"
          value={`${report.uptime}s`}
          detail="Current process"
          tone="info"
        />
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-line bg-panel-soft px-4 py-3">
          <h2 className="font-semibold">What needs action</h2>
          <p className="mt-1 text-sm text-muted">
            Green checks are fine. Yellow checks should be reviewed. Red checks block production.
          </p>
        </div>
        {checks.map((check) => (
          <HealthRow key={check.id} check={check} />
        ))}
      </section>

      <section className="surface-panel mt-5 p-5">
        <p className="eyebrow text-accent-positive">Go Live Drill</p>
        <h2 className="mt-2 text-2xl font-semibold">Browser output certification</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Run this on the actual OBS/vMix capture machine before trusting the browser output path. A
          normal Chrome test is useful, but it does not certify the capture runtime.
        </p>
        <ol className="mt-4 grid gap-2 text-sm text-muted md:grid-cols-2">
          {[
            "Today has an active program day and a block covering the current playout time.",
            "Open Browser Output from Admin Output on the capture machine.",
            "Click Start Output and confirm video plus audio in OBS/vMix.",
            "Reload mid-video, click Start Output again if shown, and confirm the video resumes near the expected time.",
            "Open a slide block or preview and confirm it renders in the capture runtime.",
            "Force or simulate bad media and confirm approved fallback appears.",
            "Confirm debug output shows low drift: currentTime within 2 seconds of expectedOffset."
          ].map((item) => (
            <li key={item} className="rounded-md border border-line bg-panel-soft p-3">
              {item}
            </li>
          ))}
        </ol>
      </section>
    </AdminShell>
  )
}

function HealthRow({ check }: { check: OperatorHealthCheck }) {
  const content = (
    <>
      <p className="font-semibold">{check.label}</p>
      <ClearStateBadge
        tone={check.status === "ok" ? "ok" : check.status === "degraded" ? "warn" : "danger"}
      >
        {statusLabel(check.status)}
      </ClearStateBadge>
      <div>
        <p className="text-sm leading-6 text-muted">{check.message}</p>
        {check.status !== "ok" ? (
          <div className="mt-2">
            <ActionHint label="Action" tone={check.status === "fail" ? "danger" : "warn"}>
              {healthAction(check)}
            </ActionHint>
          </div>
        ) : null}
      </div>
    </>
  )
  const className =
    "grid gap-2 border-b border-line p-4 last:border-b-0 md:grid-cols-[180px_120px_minmax(0,1fr)]"
  return check.href ? (
    <Link href={check.href} className={`${className} hover:bg-panel-soft`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}

function statusLabel(status: OperatorHealthCheck["status"]) {
  if (status === "ok") return "OK"
  if (status === "degraded") return "Needs attention"
  return "Blocked"
}

function healthAction(check: OperatorHealthCheck) {
  if (check.href) return "Open the linked admin page and fix this before handoff."
  if (check.id === "smoke")
    return "Run the deploy or read-only smoke script so this status is fresh."
  if (check.id === "storage") return "Create or verify the required Supabase storage buckets."
  if (check.id === "env") return "Fix the production environment variables and restart the app."
  return "Review this check before broadcast operation."
}
