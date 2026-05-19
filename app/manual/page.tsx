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
  "Add or sync content in Library, Vimeo, or Slides.",
  "Create/open the program day in Calendar.",
  "Add blocks in the daily Schedule and assign ready media or slides.",
  "Assign a fallback asset for the day or block.",
  "Resolve critical schedule health issues.",
  "Complete the runbook preflight checks.",
  "Set the day active.",
  "Open Output, launch Live Browser Output, click Start Output, then capture the browser in OBS/vMix.",
  "During live, watch active block, next block, fallback reason, clock skew, drift, and runbook notes.",
  "Stop broadcast from Output and complete shutdown checks."
]

const sections = [
  {
    title: "Content",
    icon: Library,
    body: "Use Library for uploads, remote URLs and fallback assets. Use Vimeo sync for show episodes. Use Slides for graphics.",
    href: "/admin/assets"
  },
  {
    title: "Schedule",
    icon: CalendarDays,
    body: "Build the day from Calendar. Blocks drive what airs. Ready/active blocks can play; draft/failed content should not be used.",
    href: "/admin/calendar"
  },
  {
    title: "Runbook",
    icon: ListChecks,
    body: "Use the runbook for preflight, live checks, incidents and shutdown. It is the handoff surface for operators.",
    href: "/admin/runbook"
  },
  {
    title: "Output",
    icon: MonitorPlay,
    body: "Live Browser Output is the primary playback path. Open it from Admin Output, click Start Output once for audio, then capture in OBS/vMix.",
    href: "/admin/output"
  },
  {
    title: "Preview",
    icon: Clapperboard,
    body: "Use block preview to test Vimeo, direct video, images and slides before the day goes active.",
    href: "/admin/calendar"
  },
  {
    title: "Health",
    icon: HeartPulse,
    body: "Admin Health checks environment, database, storage, Vimeo, output token and the Go Live Drill.",
    href: "/admin/health"
  }
]

const limits = [
  "OBS/vMix must still be certified on the actual capture machine.",
  "Browser audio requires one operator click after load or reload.",
  "Reuters endpoints are dynamic; refresh expired URLs before or during air.",
  "Fallback assets are required for reliable unattended operation.",
  "Secrets must stay in environment variables or encrypted settings."
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
            Current live workflow for programming the day and running browser output through
            OBS/vMix. This page is public; admin actions still require login.
          </p>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-4">
          <ManualMetric label="Workflow" value="Library -> Schedule -> Output" />
          <ManualMetric label="Playback" value="Browser" />
          <ManualMetric label="Capture" value="OBS/vMix" />
          <ManualMetric label="State" value="Supabase" />
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
