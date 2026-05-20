import {
  BookOpen,
  CalendarDays,
  Clapperboard,
  HeartPulse,
  Library,
  ListChecks,
  MonitorPlay,
  Shield
} from "lucide-react"
import Link from "next/link"

const workflowSteps = [
  "Add or sync videos, graphics, slides, audio, Vimeo shows and live endpoints.",
  "Create the broadcast day in Calendar.",
  "Build the rundown in Schedule and assign ready media, slides or live streams.",
  "Assign fallback media at day or block level.",
  "Resolve critical health issues before the signal goes live.",
  "Complete runbook preflight checks.",
  "Set the day active.",
  "Open Output, launch Live Browser Output, click Start Output, then capture the browser in OBS or vMix.",
  "During live, watch active block, next block, fallback reason, drift, playback state and runbook notes.",
  "Stop broadcast from Output and complete shutdown checks."
]

const sections = [
  {
    title: "Content",
    icon: Library,
    body: "Centralize uploaded media, remote URLs, music beds, fallbacks, Vimeo episodes and reusable graphics before anything reaches air.",
    href: "/admin/assets"
  },
  {
    title: "Schedule",
    icon: CalendarDays,
    body: "Build a broadcast day as a timed rundown. Blocks define what airs, when it starts, how long it runs and what fallback protects it.",
    href: "/admin/calendar"
  },
  {
    title: "Runbook",
    icon: ListChecks,
    body: "Give operators a repeatable checklist for preflight, live operation, incident response and shutdown.",
    href: "/admin/runbook"
  },
  {
    title: "Output",
    icon: MonitorPlay,
    body: "Use Live Browser Output as the playout surface. It resumes on reload, exposes monitor state and is built for OBS/vMix capture.",
    href: "/admin/output"
  },
  {
    title: "Preview",
    icon: Clapperboard,
    body: "Check Vimeo, HLS, MP4, images, audio-backed slides and fallback behavior before a block becomes part of the active day.",
    href: "/admin/calendar"
  },
  {
    title: "Health",
    icon: HeartPulse,
    body: "Confirm environment, Supabase, storage, Vimeo, Reuters, output token, schema and Go Live Drill readiness from one screen.",
    href: "/admin/health"
  }
]

const limits = [
  "Production app is live and usable with an operator present.",
  "Browser output has been confirmed through web player, vMix and OBS.",
  "Some on-air plates still need real data inputs or editable operator inputs.",
  "The final broadcast plate design still needs a visual remodel.",
  "OpenNext/Cloudflare Workers is configured as an alternate deploy path but still needs a real Workers smoke before becoming primary.",
  "Browser audio requires one operator click after load or reload.",
  "Reuters endpoints are dynamic; refresh expired URLs before or during air.",
  "Fallback assets are required for reliable unattended operation.",
  "Secrets must stay in environment variables or encrypted settings."
]

const recentUpdates = [
  "Browser output was confirmed in the web player, vMix and OBS.",
  "Schedule now highlights the block that was just created.",
  "Calendar blocks show start/end ranges and a readable duration chip.",
  "Gaps show their full time range so operators can fill the right window faster.",
  "Supabase bootstrap SQL is available for setting up a fresh backend.",
  "OpenNext/Cloudflare Workers deploy scripts are configured for alternate production validation."
]

export default function ManualPage() {
  return (
    <main className="min-h-screen bg-surface-elevated-1 text-white/90">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold text-accent-positive hover:underline">
            Back to home
          </Link>
          <p className="eyebrow mt-6 text-accent-positive">Roxom TV</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
            Operator Manual
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
            RTV Planner is the control room for Roxom TV: build the schedule, protect every block
            with fallbacks, run preflight and send a browser-based signal into OBS or vMix. This
            page is public; admin actions still require login.
          </p>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-4">
          <ManualMetric label="Status" value="Production live" />
          <ManualMetric label="Workflow" value="Plan -> Verify -> Air" />
          <ManualMetric label="Output" value="Browser playout" />
          <ManualMetric label="Backend" value="Supabase" />
        </section>

        <section className="border-b border-white/10 py-5">
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/pending">
              Pending
            </Link>
            <Link className="btn-secondary" href="/notion">
              Status
            </Link>
          </div>
        </section>

        <section className="border-b border-white/10 py-8">
          <h2 className="text-2xl font-semibold">Latest Updates</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recentUpdates.map((item) => (
              <div key={item} className="surface-panel p-4 text-sm leading-6 text-white/72">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="py-8">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Go Live Workflow</h2>
          </div>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {workflowSteps.map((step, index) => (
              <li key={step} className="surface-panel flex gap-3 p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-positive text-sm font-bold text-surface-elevated-1">
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-white/75">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="py-8">
          <h2 className="text-2xl font-semibold">Core Surfaces</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {sections.map((section) => (
              <article key={section.title} className="surface-panel p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <section.icon size={22} className="text-accent-positive" aria-hidden="true" />
                    <h3 className="text-xl font-semibold">{section.title}</h3>
                  </div>
                  <Link className="btn-secondary min-h-9 text-xs" href={section.href}>
                    Open
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/70">{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-white/10 bg-surface-elevated-2 p-5">
          <div className="flex items-center gap-3">
            <Shield size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-xl font-semibold">Current Limits</h2>
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-white/70">
            {limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

function ManualMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-elevated-2 p-4">
      <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}
