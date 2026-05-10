import {
  Activity,
  BookOpen,
  CalendarDays,
  Clapperboard,
  Eye,
  Library,
  MonitorPlay,
  Music,
  RadioTower,
  Settings,
  Shield,
  StepForward,
  Video
} from "lucide-react"
import Link from "next/link"

const operatorSections = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Activity,
    body: [
      "The dashboard is the operator starting point. It summarizes today's programming day, current block, next block, schedule health, ready assets, music, graphics and upcoming items.",
      "Use it before a broadcast to identify missing media, timing gaps, warnings, and the fastest next action: edit today's timeline, review assets, check music, or open the output monitor."
    ],
    links: [{ label: "Open dashboard", href: "/admin" }]
  },
  {
    id: "calendar",
    title: "Programming calendar",
    icon: CalendarDays,
    body: [
      "The calendar lists programming days by air date and status. Operators create days, open an existing schedule, and move between draft, ready, active and archived operating states.",
      "Each day owns its blocks, fallback asset, timezone and status. The broadcast output reads the active day and active block from this schedule."
    ],
    links: [{ label: "Open calendar", href: "/admin/calendar" }]
  },
  {
    id: "schedule",
    title: "Daily schedule and rundown",
    icon: RadioTower,
    body: [
      "The schedule page is the main rundown. Blocks appear in time order with category badges, status, duration, current/next indicators and a live now-line on today's date.",
      "To add a show to the timeline, upload directly with Add show to timeline or choose Schedule existing asset / show, select the media asset or system slide, set start time, duration and block type, then save."
    ],
    details: [
      "Hierarchy: media asset or system slide -> scheduled block/show -> optional overlays -> output.",
      "Block categories: mercados, earthcam, clima, calendario, trending, deuda, reuters and broadcast.",
      "Schedule health detects overlaps, gaps, missing assets, unready assets, ad duration problems and missing fallback coverage.",
      "The day readiness strip shows blockers before the day is marked active."
    ],
    links: [{ label: "Open today's schedule", href: "/admin/calendar" }]
  },
  {
    id: "block-editor",
    title: "Block detail editor",
    icon: Clapperboard,
    body: [
      "A block detail page edits one scheduled block. Operators manage title, start time, duration, block type, category, status, primary asset, slide, fallback asset, notes and overlay behavior.",
      "The page also manages scheduled layers such as lower thirds, logo bugs, sidebars and slide/image overlays. Each layer has timing, duration, z-index, position and enabled state."
    ],
    details: [
      "Clean preview opens the block output without debug overlays.",
      "Debug preview opens the same block with clock, active state and renderer diagnostics.",
      "Assigned assets can be edited directly from the block page for fast corrections."
    ]
  },
  {
    id: "assets",
    title: "Media asset library",
    icon: Library,
    body: [
      "The asset library stores videos, Vimeo programs, Reuters channels, still images, HLS/MP4 links, ads, promos, fallbacks and music assets.",
      "Operators upload files, filter by source/status/type/search, inspect thumbnails, duration and file metadata, and edit asset metadata used by the renderer."
    ],
    details: [
      "Library order is intentional: upload media or sync Vimeo first, review readiness, then schedule it as a show/block on a programming day.",
      "Images default to 25 seconds unless overridden. Video/audio use detected metadata duration unless overridden.",
      "Ready assets are eligible for playout. Draft, syncing, failed and archived assets need review before they should be scheduled.",
      "Fallback assets protect the output when primary media is missing or playback fails.",
      "Vertical video metadata can use a blurred background presentation in the output renderer."
    ],
    links: [{ label: "Open assets", href: "/admin/assets" }]
  },
  {
    id: "vimeo-import",
    title: "Vimeo sync",
    icon: StepForward,
    body: [
      "The Vimeo sync page mirrors account shows and uploaded episodes into the Library as playable Vimeo assets.",
      "Use filters for episode title, show name, month, year and status. Schedule from the synced Library asset, not from raw Vimeo API results."
    ],
    details: [
      "Daily sync should run from the production host; Sync now handles urgent uploads.",
      "Synced Vimeo episodes include duration, thumbnail, show name, created date, privacy and status metadata.",
      "If Vimeo removes an item, sync marks the Library asset stale/archived instead of deleting it."
    ],
    links: [{ label: "Open Vimeo sync", href: "/admin/vimeo" }]
  },
  {
    id: "music",
    title: "Background music",
    icon: Music,
    body: [
      "The music page manages MP3 tracks used by image, slide and graphic blocks when no primary video audio should lead.",
      "Operators upload tracks, set order, duration and readiness. Ready tracks rotate automatically; one ready track loops."
    ],
    details: [
      "Video blocks suppress the background playlist because video audio should lead.",
      "Music assets are stored as media assets with asset type music."
    ],
    links: [{ label: "Open music", href: "/admin/music" }]
  },
  {
    id: "slides",
    title: "Slides and graphics",
    icon: Clapperboard,
    body: [
      "The slide library manages static, HTML, markdown and template-based graphics for on-air use.",
      "Operators can create and edit slides, preview templates, and assign slides as primary block content or scheduled overlays."
    ],
    details: [
      "Current templates include market, calendar, debt, event, FX, metals, news, oil, SATA, show and video-oriented slides.",
      "Reduced-motion preferences are respected for animated slide states."
    ],
    links: [{ label: "Open slides", href: "/admin/slides" }]
  },
  {
    id: "manual-broadcast",
    title: "Manual broadcast",
    icon: Video,
    body: [
      "Manual broadcast lets operators quickly put a Vimeo video or Reuters channel on air now, or schedule it at a specific time.",
      "Vimeo search uses the stored access token server-side. Selected Vimeo media is cached into the asset library before creating a broadcast block."
    ],
    details: [
      "Vimeo output now uses direct HLS playback through the app, not a Vimeo iframe.",
      "Reuters channels can be synced into media assets; real provider behavior depends on Reuters provider configuration.",
      "If a browser blocks unmuted autoplay or playback fails, the output renderer moves to fallback instead of staying blank."
    ]
  },
  {
    id: "settings",
    title: "Settings and integrations",
    icon: Settings,
    body: [
      "Settings configure Vimeo integration, optional folder/project URI and operating timezone.",
      "A Vimeo token can come from infrastructure environment variables or encrypted database settings. Environment variables take priority."
    ],
    details: [
      "The Vimeo sync area reports the last sync, updated count and stale count.",
      "The health check reports whether required environment, Supabase, storage and Vimeo token checks pass."
    ],
    links: [
      { label: "Open settings", href: "/admin/settings" },
      { label: "Open health check", href: "/api/health" }
    ]
  },
  {
    id: "output-control",
    title: "Output control panel",
    icon: MonitorPlay,
    body: [
      "The admin output page is an operator control surface, not the clean capture output. It summarizes current broadcast status, active source, lower-third controls and stop-broadcast action.",
      "Stopping broadcast moves the current day back to ready, which prevents the ON AIR state from continuing."
    ],
    links: [{ label: "Open output controls", href: "/admin/output" }]
  }
]

const publicSections = [
  {
    id: "home",
    title: "Public landing page",
    icon: Eye,
    body: [
      "The root page is a simple internal navigation hub. It links to dashboard, programming, library, graphics, music, live output and this manual.",
      "It is not a public video website or consumer catalog. The product is an internal broadcast operations tool."
    ],
    links: [{ label: "Open home", href: "/" }]
  },
  {
    id: "live-output",
    title: "Live output surface",
    icon: MonitorPlay,
    body: [
      "The live output route is the clean fullscreen surface intended for vMix, OBS or browser capture on the broadcast machine.",
      "It renders the active schedule block, primary media or slide, scheduled overlays, fallback assets and background music where applicable."
    ],
    details: [
      "Vimeo videos are resolved through a server playback endpoint and rendered as HLS video.",
      "Remote MP4, HLS, Reuters and image sources use source-specific renderer paths.",
      "Use debug mode only for staging and troubleshooting."
    ],
    links: [
      { label: "Open clean output", href: "/output/live" },
      { label: "Open debug output", href: "/output/live?debug=true" }
    ]
  },
  {
    id: "preview-output",
    title: "Preview output",
    icon: Clapperboard,
    body: [
      "Preview routes render a specific block independently from the current clock. They are used to test a scheduled item before it goes live.",
      "Clean preview is useful for visual review. Debug preview adds state and timing diagnostics for operators and engineers."
    ]
  },
  {
    id: "access",
    title: "Access model",
    icon: Shield,
    body: [
      "Admin routes require the configured bootstrap token. Output routes are designed for capture and monitoring, so treat their URLs as operational endpoints.",
      "Secrets such as Supabase service role keys, Vimeo tokens and encryption keys must remain in environment variables or encrypted settings, never in public documentation."
    ]
  }
]

const workflowSteps = [
  "Upload media in Library or sync Vimeo from the Vimeo sync page.",
  "Confirm duration, thumbnail, metadata and ready/review state in Library.",
  "Create or open the programming day.",
  "Use Add show to timeline for a new upload or Schedule existing asset / show for existing media.",
  "Set show title, start time, duration, block type and asset/slide.",
  "Assign fallback assets and overlays when needed.",
  "Review schedule health until critical items are clear.",
  "Mark the day ready, then active when it should drive output.",
  "Open /output/live on the capture machine and confirm audio/video.",
  "Use debug output or block preview for troubleshooting.",
  "Stop broadcast from the output control panel when the day is done."
]

export default function ManualPage() {
  return (
    <main className="min-h-screen bg-surface-elevated-1 text-white/90">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-white/10 pb-8">
          <Link href="/" className="text-sm font-semibold text-accent-positive hover:underline">
            Back to home
          </Link>
          <p className="eyebrow mt-6 text-accent-positive">Roxom TV</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
            RTV TL Manager Manual
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
            Current feature guide for operators, producers, engineers and public output viewers. The
            app programs the broadcast day, validates the signal and renders clean playout surfaces
            for capture tools.
          </p>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-4">
          <ManualMetric label="Base path" value="/" />
          <ManualMetric label="Admin access" value="Token" />
          <ManualMetric label="Output" value="Fullscreen" />
          <ManualMetric label="Data store" value="Supabase" />
        </section>

        <section className="py-8">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="text-accent-positive" aria-hidden="true" />
            <h2 className="text-2xl font-semibold">Standard Operator Workflow</h2>
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

        <ManualGroup title="Operator Features" sections={operatorSections} />
        <ManualGroup title="General Public and Output Features" sections={publicSections} />

        <section className="mt-10 rounded-lg border border-white/10 bg-surface-elevated-2 p-5">
          <h2 className="text-xl font-semibold">Current Limits and Operating Notes</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-white/70">
            <li>Admin authentication is a bootstrap-token flow, not a multi-user role system.</li>
            <li>Unmuted autoplay requires the capture browser to allow audio autoplay.</li>
            <li>
              Lower-third and music controls in some panels are local control surfaces unless saved
              as block layers or assets.
            </li>
            <li>
              Import-order lint warnings exist in older files and do not block current builds.
            </li>
            <li>Rotate any secret that was pasted into chat, logs or documentation.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}

function ManualGroup({
  title,
  sections
}: {
  title: string
  sections: Array<{
    id: string
    title: string
    icon: typeof Activity
    body: string[]
    details?: string[]
    links?: Array<{ label: string; href: string }>
  }>
}) {
  return (
    <section className="py-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5 grid gap-4">
        {sections.map((section) => (
          <article key={section.id} id={section.id} className="surface-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <section.icon size={22} className="text-accent-positive" aria-hidden="true" />
                <h3 className="text-xl font-semibold">{section.title}</h3>
              </div>
              {section.links?.length ? (
                <div className="flex flex-wrap gap-2">
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      className="btn-secondary min-h-9 text-xs"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-white/72">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.details?.length ? (
              <ul className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-sm leading-6 text-white/62">
                {section.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
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
