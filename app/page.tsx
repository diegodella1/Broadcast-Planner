import Link from "next/link"
import { CalendarDays, MonitorPlay, Video } from "lucide-react"

export default function HomePage() {
  const links = [
    { label: "Calendario", href: "/admin/calendar", detail: "Crear dias y revisar estado operativo.", icon: CalendarDays },
    { label: "Assets", href: "/admin/assets", detail: "Videos, imagenes, ads, promos y fallbacks.", icon: Video },
    { label: "Output live", href: "/output/live?debug=true", detail: "Salida para vMix/OBS con debug.", icon: MonitorPlay }
  ]
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="eyebrow text-signal">Roxom TV</p>
        <h1 className="mt-2 text-4xl font-semibold">Playout Manager</h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          Consola interna para programar el dia, verificar la senal y mantener la salida al aire.
        </p>
      </header>
      <nav className="grid gap-4 md:grid-cols-3">
        {links.map(({ label, href, detail, icon: Icon }) => (
          <Link key={href} className="surface-card p-5 hover:border-line-strong hover:bg-panel-soft" href={href}>
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
