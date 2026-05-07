import Link from "next/link"
import type { ReactNode } from "react"
import { CalendarDays, Clapperboard, MonitorPlay, Settings, Tv, Video } from "lucide-react"

const nav = [
  { label: "Calendario", href: "/admin/calendar", icon: CalendarDays },
  { label: "Assets", href: "/admin/assets", icon: Video },
  { label: "Slides", href: "/admin/slides", icon: Clapperboard },
  { label: "Settings", href: "/admin/settings", icon: Settings },
  { label: "Output", href: "/output/live?debug=true", icon: MonitorPlay }
]

export function AdminShell({
  title,
  description,
  actions,
  children
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-panel text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface px-4 py-5 md:block">
        <Link href="/" className="flex items-center gap-3 rounded-md px-2 py-2 text-base font-semibold hover:bg-panel-soft">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-ink text-surface">
            <Tv size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block leading-tight">Roxom TV</span>
            <span className="block text-xs font-medium text-muted">Playout manager</span>
          </span>
        </Link>
        <nav className="mt-8 grid gap-1">
          {nav.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted hover:bg-panel-soft hover:text-ink">
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4 rounded-md border border-line bg-panel-soft p-3 text-xs text-muted">
          <p className="font-semibold text-ink">Salida broadcast</p>
          <p className="mt-1 break-all font-mono">/rtvtime/output/live</p>
          <Link href="/output/live?debug=true" className="mt-3 inline-flex min-h-8 items-center rounded-md border border-line bg-surface px-2 font-semibold text-ink hover:bg-panel">
            Abrir debug
          </Link>
        </div>
      </aside>
      <main className="md:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal md:text-[1.7rem]">{title}</h1>
              {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {nav.map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-muted">
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="p-4 md:p-6 xl:p-7">{children}</div>
      </main>
    </div>
  )
}
