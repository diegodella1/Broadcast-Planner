import {
  BookOpen,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  MonitorPlay,
  Music,
  ListChecks,
  Video
} from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  const links = [
    {
      label: "Dashboard",
      href: "/admin",
      detail: "Start here: today, alerts, output and next actions.",
      icon: LayoutDashboard
    },
    {
      label: "Programming",
      href: "/admin/calendar",
      detail: "Build broadcast days and verify schedule status.",
      icon: CalendarDays
    },
    {
      label: "Library",
      href: "/admin/assets",
      detail: "Videos, Vimeo, ads, promos, stills and fallbacks.",
      icon: Video
    },
    {
      label: "Graphics",
      href: "/admin/slides",
      detail: "Slides and reusable on-air graphics.",
      icon: Clapperboard
    },
    {
      label: "Music",
      href: "/admin/music",
      detail: "Background playlist tracks used by image and slide blocks.",
      icon: Music
    },
    {
      label: "Output control",
      href: "/admin/output",
      detail: "Current block status and HLS link for VLC playback.",
      icon: MonitorPlay
    },
    {
      label: "Manual",
      href: "/manual",
      detail: "Current guide for operators, output users and public-facing routes.",
      icon: BookOpen
    },
    {
      label: "Pending",
      href: "/pending",
      detail: "Production backlog, missing features and next development work.",
      icon: ListChecks
    }
  ]
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="eyebrow text-signal">Roxom TV</p>
        <h1 className="mt-2 text-4xl font-semibold">Playout Manager</h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          Internal console for programming the day, validating the signal and keeping the broadcast
          on air.
        </p>
      </header>
      <nav className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map(({ label, href, detail, icon: Icon }) => (
          <Link
            key={href}
            className="surface-card p-5 hover:border-line-strong hover:bg-panel-soft"
            href={href}
          >
            <span className="flex items-center gap-3 text-lg font-semibold">
              <Icon size={20} aria-hidden="true" />
              {label}
            </span>
            <span className="mt-2 block text-sm leading-6 text-muted">{detail}</span>
          </Link>
        ))}
      </nav>
    </main>
  )
}
