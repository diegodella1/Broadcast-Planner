import { AlertTriangle, CalendarClock, ListChecks, Shield } from "lucide-react"
import Link from "next/link"

type Priority = "P0" | "P1" | "P2"

type PendingItem = {
  title: string
  priority: Priority
  status: "shipped" | "needed" | "planned" | "later"
  owner: string
  detail: string
}

type GanttPhase = {
  phase: string
  window: string
  duration: string
  dependency: string
  deliverables: string
  acceptance: string
  start: number
  span: number
  progress: number
  status: "done" | "active" | "planned" | "later"
}

const currentFunctions = [
  "Daily programming calendar and schedule blocks",
  "Paginated Library for uploaded media, remote URLs, Vimeo-synced videos, music, ads, promos and fallbacks",
  "Vimeo daily sync with manual Sync now",
  "Vimeo playback readiness and stale/review metadata",
  "Image, video and audio metadata detection during upload",
  "System slide library and template slides",
  "Schedule health checks for gaps, overlaps, missing assets and readiness",
  "App-level and DB-level per-day schedule overlap prevention",
  "Inline schedule conflict suggestions, resize action and archive-conflicts replacement flow",
  "Rundown drag/drop editor with keyboard reorder, resize, duplicate, archive and bulk status",
  "Operator runbook mode with persisted per-day preflight, live, incident and shutdown checks",
  "Protected output status and block preview routes",
  "Output session cookie for normal admin launches",
  "Output control panel with browser output launch, live observability and stop broadcast",
  "Single-tenant named operators, admin/operator roles and hashed operator sessions",
  "Audit actor propagation from the current named operator session",
  "Rate limiting for login, upload, settings, Vimeo, Reuters and output session/link endpoints",
  "Dynamic Reuters HLS/RTMP stream snapshots on scheduled blocks",
  "Audited Reuters live output override with return-to-schedule cleanup",
  "Stop broadcast cleanup that clears active output overrides",
  "Persisted operator music enable/volume preference",
  "Authenticated /admin/health readiness page",
  "Schedule health deep links and polling refresh",
  "Newcomer-oriented operator path UI across Dashboard, Library, Schedule and Output",
  "Public English operation manual available outside admin login",
  "Public English pending/backlog page available outside admin login",
  "Audit page and audited critical mutations",
  "CSRF protection for mutating admin forms and APIs",
  "Asset lifecycle states for synced, reviewed, rejected, stale, expired and scheduled-in-use",
  "Browser playout workflow for OBS/vMix capture with Vimeo HLS, direct HLS, public MP4, image and slide support",
  "Time-accurate reload resume for browser playout video blocks",
  "Staging write smoke cleanup for sandbox blocks and assets",
  "Backup and restore drill",
  "Production read-only smoke and output status checks",
  "Production deployment behind cloudflared at the root domain"
]

const productionStatus = [
  "Controlled production operation is usable after Supabase migrations are applied and the per-day runbook is completed.",
  "The standard operator path is Library -> Schedule -> Runbook -> Browser Output -> Shutdown.",
  "Browser playout is the active output path. Operators open /output/live from Admin Output, click Start Output once to unlock audio and capture the browser in OBS/vMix.",
  "If browser output reloads mid-show, the active video seeks to the current schedule offset before playback resumes.",
  "P0 shipped-in-code work is complete and the required Supabase readiness schema has been applied.",
  "Reuters is supported as dynamic per-block or live-override HLS/RTMP stream snapshots. Operators paste the current endpoint when scheduling or switching Reuters live.",
  "Current public docs are /manual, /pending and the new /notion operations/status guide."
]

const knownIssues = [
  "Bootstrap-token login still exists for emergency admin access. Normal operation should move to named operator handles after provisioning.",
  "Authenticated Playwright coverage exists for core admin surfaces and output session; broader named-login and mutating browser flows remain P1.",
  "Reuters HLS/RTMP URLs are dynamic snapshots. If a URL expires or rotates during a live block, the operator must refresh the block or output override endpoint.",
  "OBS/vMix browser capture must be certified separately from Playwright because browser codec and autoplay behavior differ by runtime.",
  "Read-only HTTP smoke requires production environment variables, especially OUTPUT_CAPTURE_TOKEN, to be loaded in the test process."
]

const p0Items: PendingItem[] = [
  {
    title: "Apply readiness migration in production",
    priority: "P0",
    status: "shipped",
    owner: "Platform",
    detail:
      "Single-tenant readiness migration was applied so operator sessions, rate buckets, preferences, output overrides and block metadata exist in Supabase."
  },
  {
    title: "Provision named operators",
    priority: "P0",
    status: "shipped",
    owner: "Admin",
    detail:
      "Named operator support, hashed tokens, session cookies and role guards are implemented and backed by schema. Routine bootstrap-token use should be phased out operationally."
  },
  {
    title: "Authenticated Playwright coverage",
    priority: "P0",
    status: "shipped",
    owner: "QA",
    detail:
      "Core protected admin pages, admin health and output session are covered. Broader named-login and mutating browser flows continue as P1 hardening."
  }
]

const shippedP0Items: PendingItem[] = [
  {
    title: "Single-tenant named operator sessions",
    priority: "P0",
    status: "shipped",
    owner: "Admin",
    detail:
      "Admin/operator handles, hashed operator tokens, session cookies and role guards are implemented without tenant or organization separation."
  },
  {
    title: "Named audit identity",
    priority: "P0",
    status: "shipped",
    owner: "Admin",
    detail:
      "Audit helpers now derive actor identity from the active operator session, with bootstrap retained only as emergency admin."
  },
  {
    title: "API rate limiting",
    priority: "P0",
    status: "shipped",
    owner: "Security",
    detail:
      "Mutating login, upload, settings, Vimeo, Reuters and output endpoints have operator/IP scoped rate limits and return 429 with Retry-After."
  },
  {
    title: "Dynamic Reuters HLS/RTMP streams",
    priority: "P0",
    status: "shipped",
    owner: "Integrations",
    detail:
      "Reuters playback is handled as pasted dynamic HLS/RTMP stream snapshots on blocks or output overrides, with URL masking in audit metadata."
  },
  {
    title: "Output source override mutation",
    priority: "P0",
    status: "shipped",
    owner: "Live Ops",
    detail:
      "Admin Output can set a Reuters live override, return to schedule and clear override state when broadcast is stopped."
  }
]

const p1Items: PendingItem[] = [
  {
    title: "Stop broadcast override cleanup",
    priority: "P1",
    status: "shipped",
    owner: "Live Ops",
    detail:
      "Ensure Stop broadcast clears manual override blocks and returns the active day to a predictable ready state."
  },
  {
    title: "Background music persistence and playback hooks",
    priority: "P1",
    status: "shipped",
    owner: "Audio",
    detail:
      "Persist the right-rail music toggle and volume, connect it to eligible image/slide output, and support fade policies."
  },
  {
    title: "/admin/health route",
    priority: "P1",
    status: "shipped",
    owner: "Platform",
    detail:
      "Add an authenticated operator health page for Supabase, storage, Vimeo, Reuters, output tokens, migrations and smoke status."
  },
  {
    title: "Schedule health deep links and polling",
    priority: "P1",
    status: "shipped",
    owner: "Schedule",
    detail:
      "Make each issue row link to the offending block or action, and refresh health state without a full page reload."
  },
  {
    title: "Browser output go-live drill",
    priority: "P1",
    status: "planned",
    owner: "QA",
    detail:
      "Add a product-level drill that verifies active day, browser output launch, audio unlock, Vimeo playback, slide rendering, reload resume and fallback in the actual OBS/vMix capture runtime."
  },
  {
    title: "Output drift and incident monitoring",
    priority: "P1",
    status: "planned",
    owner: "Platform",
    detail:
      "Compare browser media currentTime to expected schedule offset, surface stalled/waiting/error states, and show operator incident prompts for silence, black output, wrong block and fallback."
  },
  {
    title: "i18n and validation polish",
    priority: "P1",
    status: "planned",
    owner: "UX",
    detail:
      "Finish remaining hardcoded literals, Zod validation message localization and currency/number formatting coverage."
  }
]

const p2Items: PendingItem[] = [
  {
    title: "Recurring schedules and copy-day",
    priority: "P2",
    status: "later",
    owner: "Schedule",
    detail:
      "Add weekday templates, copy day to another date, holiday markers, multi-day grid and iCal export."
  },
  {
    title: "Asset tags and preview modal",
    priority: "P2",
    status: "later",
    owner: "Library",
    detail:
      "Add editorial tags/categories and a fast asset preview popup from the Library list or tile view."
  },
  {
    title: "Slide authoring upgrades",
    priority: "P2",
    status: "later",
    owner: "Graphics",
    detail:
      "Add WYSIWYG HTML editing, live Markdown preview, template gallery, image upload into slides and animation preview swaps."
  },
  {
    title: "Advanced broadcast composition",
    priority: "P2",
    status: "later",
    owner: "Output",
    detail:
      "Evaluate NDI/RTSP integration, local DVR recording, multiple bitrate streams, captions, subtitles and SCTE-35 markers."
  },
  {
    title: "Realtime operator updates",
    priority: "P2",
    status: "later",
    owner: "Platform",
    detail:
      "Use Supabase realtime channels or a dedicated bus to replace 5 second polling for live operator views."
  }
]

const gantt: GanttPhase[] = [
  {
    phase: "1. P0 readiness shipped and applied",
    window: "Done",
    duration: "1 day",
    dependency: "Current codebase + Supabase",
    deliverables:
      "Apply readiness migration, enable named-operator schema, verify admin health and run production smoke.",
    acceptance:
      "Health returns ok:true, required Supabase tables/columns exist and production read-only smoke passes.",
    start: 1,
    span: 1,
    progress: 100,
    status: "done"
  },
  {
    phase: "2. Reuters dynamic stream dry run",
    window: "Week 1",
    duration: "1-2 days",
    dependency: "Phase 1",
    deliverables:
      "Schedule a Reuters block with a pasted HLS/RTMP endpoint, refresh it and test the output override path.",
    acceptance:
      "Browser output receives the dynamic Reuters stream through the active output state and stop broadcast clears the override.",
    start: 2,
    span: 1,
    progress: 100,
    status: "done"
  },
  {
    phase: "3. Authenticated Playwright flows",
    window: "Week 1-2",
    duration: "3-5 days",
    dependency: "Phases 1-2",
    deliverables:
      "Named login, library, schedule, runbook, Reuters stream, output override, stop cleanup and admin health browser tests.",
    acceptance:
      "CI or local gate covers the operator path without relying only on unit and smoke tests.",
    start: 2,
    span: 2,
    progress: 100,
    status: "done"
  },
  {
    phase: "4. Health and alert polish",
    window: "Week 2",
    duration: "2-3 days",
    dependency: "Phase 3 test fixtures",
    deliverables:
      "Dashboard alert banner, output degradation notices, health check detail links and runbook incident prompts.",
    acceptance:
      "A degraded integration or missing output token is visible from the operator dashboard before air.",
    start: 4,
    span: 1,
    progress: 100,
    status: "done"
  },
  {
    phase: "5. i18n and copy polish",
    window: "Week 2",
    duration: "2 days",
    dependency: "Phase 4 surfaces",
    deliverables:
      "Move remaining hardcoded new operator strings into messages and verify English/Spanish parity.",
    acceptance:
      "i18n check passes and primary operator flows show localized validation/action text.",
    start: 5,
    span: 1,
    progress: 100,
    status: "done"
  },
  {
    phase: "6. Production readiness signoff",
    window: "Week 2-3",
    duration: "1 day",
    dependency: "Phases 1-5",
    deliverables:
      "Run migration, release gates, read-only production smoke, operator handoff and rollback notes.",
    acceptance:
      "Named operators can run the complete Library -> Schedule -> Output -> Shutdown workflow in production.",
    start: 6,
    span: 1,
    progress: 100,
    status: "done"
  }
]

const progressSegments = [
  { label: "P0 readiness", value: 100, tone: "done" },
  { label: "P1 hardening", value: 100, tone: "done" },
  { label: "P2 future", value: 0, tone: "later" }
] as const

const overallProgress = Math.round(
  progressSegments.reduce((sum, segment) => sum + segment.value, 0) / progressSegments.length
)

export default function PendingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-surface-elevated-1 text-white/90">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <header className="border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold text-accent-positive hover:underline">
            Back to home
          </Link>
          <p className="eyebrow mt-6 text-accent-positive">Production backlog</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal md:text-5xl">
            Pending Developments and Implementation Plan
          </h1>
          <p className="mt-4 max-w-3xl break-words text-base leading-7 text-white/65 [overflow-wrap:anywhere]">
            Current implementation is usable for controlled production operation. This page tracks
            the remaining work required for unattended broadcast, broader operator handoff and
            future capability expansion.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/manual">
              Operation manual
            </Link>
            <Link className="btn-secondary" href="/notion">
              Notion-style status page
            </Link>
          </div>
        </header>

        <section className="border-b border-white/10 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-accent-positive">Progress line</p>
              <h2 className="mt-2 text-2xl font-semibold">Production Readiness Progress</h2>
            </div>
            <div className="text-right">
              <p className="text-4xl font-semibold text-accent-positive">{overallProgress}%</p>
              <p className="text-xs uppercase text-white/45">weighted roadmap</p>
            </div>
          </div>
          <div className="mt-6 overflow-hidden rounded-full border border-white/10 bg-surface-elevated-2">
            <div className="flex h-4">
              {progressSegments.map((segment) => (
                <div
                  key={segment.label}
                  className={progressSegmentClass(segment.tone)}
                  style={{ width: `${100 / progressSegments.length}%` }}
                  aria-label={`${segment.label}: ${segment.value}%`}
                >
                  <div className="h-full" style={{ width: `${segment.value}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {progressSegments.map((segment) => (
              <div
                key={segment.label}
                className="rounded-lg border border-white/10 bg-surface-elevated-2 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{segment.label}</p>
                  <p className="text-sm font-bold text-white/85">{segment.value}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={miniProgressClass(segment.tone)}
                    style={{ width: `${segment.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-white/10 py-8">
          <div className="flex items-center gap-3">
            <CalendarClock size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Visual Gantt Roadmap</h2>
          </div>
          <div className="mt-6 hidden rounded-lg border border-white/10 bg-surface-elevated-2 p-5 lg:block">
            <div className="grid grid-cols-[240px_repeat(6,minmax(80px,1fr))] gap-2 text-xs font-semibold uppercase text-white/45">
              <div>Phase</div>
              {["W1", "W2", "W3", "W4", "W5", "W6"].map((week) => (
                <div key={week} className="text-center">
                  {week}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4">
              {gantt.map((phase) => (
                <div
                  key={phase.phase}
                  className="grid grid-cols-[240px_repeat(6,minmax(80px,1fr))] items-center gap-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white/90">{phase.phase}</p>
                  </div>
                  <div className="col-span-6 grid grid-cols-6 gap-2">
                    <div
                      className={ganttBarClass(phase.status)}
                      style={{
                        gridColumn: `${phase.start} / span ${phase.span}`
                      }}
                    >
                      <div
                        className="h-full rounded-full bg-white/25"
                        style={{ width: `${phase.progress}%` }}
                      />
                      <span>{phase.progress}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:hidden">
            {gantt.map((phase) => (
              <article key={phase.phase} className="surface-panel min-w-0 p-4">
                <h3 className="break-words font-semibold text-white/90">{phase.phase}</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/62">
                  <span>Window</span>
                  <span className="break-words text-white/80">{phase.window}</span>
                  <span>Duration</span>
                  <span className="break-words text-white/80">{phase.duration}</span>
                  <span>Dependency</span>
                  <span className="break-words text-white/80">{phase.dependency}</span>
                </div>
                <p className="mt-3 break-words text-sm leading-6 text-white/72 [overflow-wrap:anywhere]">
                  {phase.deliverables}
                </p>
                <p className="mt-2 break-words text-sm leading-6 text-white/62 [overflow-wrap:anywhere]">
                  Acceptance: {phase.acceptance}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-5 hidden overflow-x-auto rounded-lg border border-white/10 md:block">
            <table className="min-w-[900px] w-full border-collapse bg-surface-elevated-2 text-left text-sm">
              <thead className="bg-panel-soft text-xs uppercase text-white/50">
                <tr>
                  <th className="px-4 py-3 font-bold">Phase</th>
                  <th className="px-4 py-3 font-bold">Window</th>
                  <th className="px-4 py-3 font-bold">Duration</th>
                  <th className="px-4 py-3 font-bold">Dependency</th>
                  <th className="px-4 py-3 font-bold">Progress</th>
                  <th className="px-4 py-3 font-bold">Deliverables</th>
                  <th className="px-4 py-3 font-bold">Acceptance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {gantt.map((phase) => (
                  <tr key={phase.phase} className="align-top">
                    <td className="px-4 py-4 font-semibold text-white/90">{phase.phase}</td>
                    <td className="px-4 py-4 text-white/72">{phase.window}</td>
                    <td className="px-4 py-4 text-white/72">{phase.duration}</td>
                    <td className="px-4 py-4 text-white/62">{phase.dependency}</td>
                    <td className="px-4 py-4">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={miniProgressClass(phase.status)}
                          style={{ width: `${phase.progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-white/55">{phase.progress}%</p>
                    </td>
                    <td className="px-4 py-4 leading-6 text-white/72">{phase.deliverables}</td>
                    <td className="px-4 py-4 leading-6 text-white/72">{phase.acceptance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-b border-white/10 py-6">
          <div className="flex items-center gap-3">
            <Shield size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Current Tool Status</h2>
          </div>
          <div className="mt-5 grid min-w-0 gap-3">
            {productionStatus.map((item) => (
              <div
                key={item}
                className="surface-panel min-w-0 break-words p-4 text-sm leading-6 text-white/72 [overflow-wrap:anywhere]"
              >
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
          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {currentFunctions.map((item) => (
              <div
                key={item}
                className="surface-panel min-w-0 break-words p-4 text-sm leading-6 text-white/72 [overflow-wrap:anywhere]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <PendingGroup title="P0 Shipped and Applied" items={[...p0Items, ...shippedP0Items]} />
        <PendingGroup title="P1 Production Hardening" items={p1Items} />
        <PendingGroup title="P2 Future Capabilities" items={p2Items} />

        <section className="py-8">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-warn-strong" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Known Issues and Caveats</h2>
          </div>
          <div className="mt-5 grid min-w-0 gap-3">
            {knownIssues.map((item) => (
              <div
                key={item}
                className="surface-panel min-w-0 break-words p-4 text-sm leading-6 text-white/72 [overflow-wrap:anywhere]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function PendingGroup({ title, items }: { title: string; items: PendingItem[] }) {
  return (
    <section className="py-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5 grid min-w-0 gap-4">
        {items.map((item) => (
          <article key={item.title} className="surface-panel min-w-0 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted">
                {item.status}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
            <p className="mt-3 max-w-4xl break-words text-sm leading-6 text-white/70 [overflow-wrap:anywhere]">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function progressSegmentClass(tone: "done" | "active" | "later") {
  switch (tone) {
    case "done":
      return "bg-accent-positive [&>div]:bg-accent-positive"
    case "active":
      return "bg-white/10 [&>div]:bg-warn-strong"
    case "later":
      return "bg-white/10 [&>div]:bg-info-strong"
  }
}

function miniProgressClass(tone: "done" | "active" | "planned" | "later") {
  switch (tone) {
    case "done":
      return "h-full rounded-full bg-accent-positive"
    case "active":
      return "h-full rounded-full bg-warn-strong"
    case "planned":
      return "h-full rounded-full bg-info-strong"
    case "later":
      return "h-full rounded-full bg-white/35"
  }
}

function ganttBarClass(status: "done" | "active" | "planned" | "later") {
  const base =
    "relative h-8 overflow-hidden rounded-full border px-3 text-xs font-bold leading-8 text-surface-elevated-1"
  switch (status) {
    case "done":
      return `${base} border-accent-positive bg-accent-positive`
    case "active":
      return `${base} border-warn-line bg-warn-strong`
    case "planned":
      return `${base} border-info-line bg-info-strong`
    case "later":
      return `${base} border-white/20 bg-white/30 text-white`
  }
}
