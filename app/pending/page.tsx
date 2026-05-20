import { AlertTriangle, CheckCircle2, Clock3, ListChecks, Sparkles } from "lucide-react"
import Link from "next/link"

type Item = {
  title: string
  detail: string
  status: "Done" | "Next" | "Later"
}

const liveNow: Item[] = [
  {
    title: "Production playout path",
    detail:
      "Browser output supports Vimeo, HLS, MP4, images, slides, audio-backed blocks, fallback, audio unlock and reload resume.",
    status: "Done"
  },
  {
    title: "End-to-end operator workflow",
    detail:
      "Content library, daily rundown, health checks, runbook, output control, monitor state and clean shutdown are live.",
    status: "Done"
  },
  {
    title: "Production guardrails",
    detail:
      "Admin Health, schedule health, output monitor, audit, CSRF, rate limiting, output token protection and Supabase readiness are in place.",
    status: "Done"
  },
  {
    title: "Schedule creation feedback",
    detail:
      "Newly-created blocks are highlighted, announced and shown with readable start/end ranges so operators can immediately see what changed.",
    status: "Done"
  },
  {
    title: "OBS/vMix capture validation",
    detail:
      "Browser output has been confirmed through the web player, vMix and OBS with the current capture flow.",
    status: "Done"
  },
  {
    title: "Migration kit",
    detail:
      "The downloadable production bundle includes environment values and a Supabase bootstrap SQL for a fresh backend.",
    status: "Done"
  },
  {
    title: "Public upload playback",
    detail:
      "Uploaded ads/promos stored in local Supabase now play through the public app media proxy instead of 127.0.0.1 storage URLs.",
    status: "Done"
  },
  {
    title: "Media URL backfill",
    detail:
      "Older uploaded assets that pointed at 127.0.0.1 were rewritten to public app media proxy URLs.",
    status: "Done"
  },
  {
    title: "Persisted smoke status",
    detail:
      "Deploy and read-only smoke scripts now write the latest smoke result for `/api/health`.",
    status: "Done"
  },
  {
    title: "OpenNext/Cloudflare deploy path",
    detail:
      "Cloudflare Workers config and deploy scripts are present with dashboard vars preserved; smoke it before making it primary.",
    status: "Done"
  }
]

const nextWork: Item[] = [
  {
    title: "Real plate inputs",
    detail:
      "Connect remaining plates/cards to real feeds or editable operator inputs instead of placeholder/static data.",
    status: "Next"
  },
  {
    title: "On-air plate redesign",
    detail:
      "Remodel the visual language of cards, plates and output surfaces so the channel feels broadcast-ready.",
    status: "Next"
  },
  {
    title: "Output alerts",
    detail:
      "Turn drift, stalled, waiting, silence and media error states into clear operator alerts.",
    status: "Next"
  },
  {
    title: "Named operator rollout",
    detail: "Use named handles for normal work and keep bootstrap login only for emergency access.",
    status: "Next"
  }
]

const later: Item[] = [
  {
    title: "Schedule tools",
    detail: "Copy day, recurring blocks, weekday templates and blackout dates.",
    status: "Later"
  },
  {
    title: "Library polish",
    detail: "Asset preview modal, tags, editorial categories and faster review.",
    status: "Later"
  },
  {
    title: "Design system sweep",
    detail: "Bring admin, manual and output surfaces into a tighter shared visual system.",
    status: "Later"
  },
  {
    title: "Broadcast upgrades",
    detail: "Captions, recording, failover, multiple bitrates and direct OBS/vMix automation.",
    status: "Later"
  }
]

const risks = [
  "Browser audio needs one operator click after load or reload.",
  "Reuters URLs can expire and must be refreshed before or during air.",
  "Remaining placeholder plate data must be replaced before final programming handoff.",
  "The current output is operational; final plate design still needs a broadcast-quality remodel.",
  "Cloudflare Workers/OpenNext should be smoke-tested before becoming the primary production path.",
  "Fallback assets must stay ready for unattended operation."
]

export default function PendingPage() {
  return (
    <main className="min-h-screen bg-surface-elevated-1 text-white/90">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold text-accent-positive hover:underline">
            Back to home
          </Link>
          <p className="eyebrow mt-6 text-accent-positive">Backlog</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
            What Is Done, What Is Next
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
            Current shipping status for RTV Planner. The core product is live; the remaining work is
            real plate inputs, output design polish, smoke visibility and broadcast automation.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/manual">
              Manual
            </Link>
            <Link className="btn-secondary" href="/admin/health">
              Admin Health
            </Link>
            <Link className="btn-secondary" href="/admin/output">
              Output
            </Link>
          </div>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-3">
          <Metric label="Current state" value="Production live" />
          <Metric label="Main gate" value="Real plates" />
          <Metric label="Next value" value="Broadcast polish" />
        </section>

        <ItemGroup
          title="Live Now"
          icon={CheckCircle2}
          intro="Core workflow is available in production."
          items={liveNow}
        />
        <ItemGroup
          title="Next"
          icon={Clock3}
          intro="Small list that matters before broader handoff."
          items={nextWork}
        />
        <ItemGroup
          title="Later"
          icon={Sparkles}
          intro="Useful capabilities after the live workflow is stable."
          items={later}
        />

        <section className="py-8">
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-warn-strong" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Watchouts</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {risks.map((risk) => (
              <div key={risk} className="surface-panel p-4 text-sm leading-6 text-white/72">
                {risk}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-surface-elevated-2 p-5">
          <div className="flex items-center gap-3">
            <ListChecks size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-xl font-semibold">Definition of Workable</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/70">
            A non-technical operator can create a broadcast day, schedule ready content, run
            preflight, launch browser output, recover from reload, confirm audio/video in OBS or
            vMix, and stop cleanly with an audit trail.
          </p>
        </section>
      </div>
    </main>
  )
}

function ItemGroup({
  title,
  intro,
  icon: Icon,
  items
}: {
  title: string
  intro: string
  icon: typeof CheckCircle2
  items: Item[]
}) {
  return (
    <section className="border-b border-white/10 py-8 last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon size={22} className="text-accent-positive" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-white/55">{intro}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.title} className="surface-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <span className={statusClass(item.status)}>{item.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-elevated-2 p-4">
      <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  )
}

function statusClass(status: Item["status"]) {
  const base = "rounded-md border px-2 py-1 text-xs font-semibold"
  if (status === "Done") return `${base} border-accent-positive/50 text-accent-positive`
  if (status === "Next") return `${base} border-warn-line text-warn-strong`
  return `${base} border-white/15 text-white/55`
}
