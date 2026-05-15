import { AlertTriangle, BadgeCheck, Clock, ListChecks, Shield, WandSparkles } from "lucide-react"
import Link from "next/link"

type PendingItem = {
  title: string
  priority: "P0" | "P1" | "P2"
  status: "needed" | "planned" | "later"
  owner: string
  detail: string
}

const mvpNeeded: PendingItem[] = [
  {
    title: "Multi-user roles",
    priority: "P0",
    status: "needed",
    owner: "Admin",
    detail:
      "Replace single bootstrap token with named users, operator/admin roles, sessions, revoke, and audit identity."
  }
]

const productionHardening: PendingItem[] = []

const futureCapabilities: PendingItem[] = [
  {
    title: "System slides data providers",
    priority: "P2",
    status: "later",
    owner: "Graphics",
    detail:
      "Define market, FX, prices, charts, events, and financial data provider contracts for generated slides."
  }
]

const currentFunctions = [
  "Daily programming calendar and schedule blocks",
  "Paginated Library for uploaded media, remote URLs, Vimeo-synced videos, music, ads, promos and fallbacks",
  "Vimeo daily sync with manual Sync now",
  "Vimeo playback readiness and stale/review metadata",
  "Image/video/audio metadata detection during upload",
  "System slide library and template slides",
  "Schedule health checks for gaps, overlaps, missing assets and readiness",
  "App-level and DB-level per-day schedule overlap prevention",
  "Inline schedule conflict suggestions, resize action and archive-conflicts replacement flow",
  "Rundown drag/drop editor with keyboard reorder, resize, duplicate, archive and bulk status",
  "Operator runbook mode with persisted per-day preflight, live, incident and shutdown checks",
  "Protected output status and block preview routes",
  "Output session cookie for normal admin launches",
  "Output control panel with status, HLS copy, live observability and stop broadcast",
  "Audit page and audited critical mutations",
  "CSRF protection for mutating admin forms and APIs",
  "Asset lifecycle states for synced, reviewed, rejected, stale, expired and scheduled-in-use",
  "HLS-first output workflow for VLC playback",
  "Staging write smoke cleanup for sandbox blocks and assets",
  "Backup and restore drill",
  "Production read-only smoke and output status checks",
  "Production deployment behind cloudflared at the root domain"
]

const operatorReadyNotes = [
  "Controlled production operation is ready after applying Supabase migrations and completing the per-day runbook.",
  "Unattended operation still waits on the P0 multi-user roles item because bootstrap-token access has no named operator identity.",
  "Rundown drag/drop editor and operator runbook are shipped, so they are no longer future backlog items."
]

export default function PendingPage() {
  return (
    <main className="min-h-screen bg-surface-elevated-1 text-white/90">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold text-accent-positive hover:underline">
            Back to home
          </Link>
          <p className="eyebrow mt-6 text-accent-positive">Production backlog</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
            Pending Developments and Functionality
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
            Current implementation is deployed and usable for controlled production operation. The
            items below are remaining work for unattended operation, broader operator handoff and
            future capability expansion.
          </p>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-4">
          <Metric label="Current" value={String(currentFunctions.length)} icon={BadgeCheck} />
          <Metric label="P0 Needed" value={String(mvpNeeded.length)} icon={AlertTriangle} />
          <Metric label="P1 Planned" value={String(productionHardening.length)} icon={Clock} />
          <Metric label="P2 Later" value={String(futureCapabilities.length)} icon={WandSparkles} />
        </section>

        <section className="border-b border-white/10 py-6">
          <div className="flex items-center gap-3">
            <Shield size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Production Status</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {operatorReadyNotes.map((item) => (
              <div key={item} className="surface-panel p-4 text-sm leading-6 text-white/72">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="py-8">
          <div className="flex items-center gap-3">
            <ListChecks size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Current Functionality</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {currentFunctions.map((item) => (
              <div key={item} className="surface-panel p-4 text-sm leading-6 text-white/72">
                {item}
              </div>
            ))}
          </div>
        </section>

        <PendingGroup title="Needed For Production MVP" items={mvpNeeded} />
        <PendingGroup title="Production Hardening" items={productionHardening} />
        <PendingGroup title="Future Capabilities" items={futureCapabilities} />

        <section className="mt-8 rounded-lg border border-warn-line bg-warn-soft p-5">
          <h2 className="text-xl font-semibold text-warn-strong">Operating Rule</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
            Treat P0 items as required before unattended broadcast operation. P1 items harden the
            deployment, QA and handoff path. P2 items should wait until the core workflow is stable.
          </p>
        </section>
      </div>
    </main>
  )
}

function PendingGroup({ title, items }: { title: string; items: PendingItem[] }) {
  return (
    <section className="py-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5 grid gap-4">
        {items.length === 0 ? (
          <div className="surface-panel p-5 text-sm leading-6 text-white/70">
            No open items in this group.
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.title} className="surface-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={priorityClass(item.priority)}>{item.priority}</span>
                  <span className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted">
                    {item.owner}
                  </span>
                  <span className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted">
                    {item.status}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
              </div>
            </div>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  icon: Icon
}: {
  label: string
  value: string
  icon: typeof Shield
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-elevated-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
        <Icon size={18} className="text-accent-positive" aria-hidden="true" />
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function priorityClass(priority: PendingItem["priority"]) {
  switch (priority) {
    case "P0":
      return "rounded-md border border-danger-line bg-danger-soft px-2 py-1 text-xs font-bold text-danger-strong"
    case "P1":
      return "rounded-md border border-warn-line bg-warn-soft px-2 py-1 text-xs font-bold text-warn-strong"
    case "P2":
      return "rounded-md border border-info-line bg-info-soft px-2 py-1 text-xs font-bold text-info-strong"
  }
}
