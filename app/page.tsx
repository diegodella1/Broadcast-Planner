import Link from "next/link"
import { CalendarDays, MonitorPlay, Video } from "lucide-react"
import { getTranslations } from "next-intl/server"

export default async function HomePage() {
  const t = await getTranslations("home")
  const links = [
    { key: "calendar", href: "/admin/calendar", icon: CalendarDays },
    { key: "assets", href: "/admin/assets", icon: Video },
    { key: "outputLive", href: "/output/live?debug=true", icon: MonitorPlay }
  ]
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="eyebrow text-signal">{t("eyebrow")}</p>
        <h1 className="mt-2 text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          {t("subtitle")}
        </p>
      </header>
      <nav className="grid gap-4 md:grid-cols-3">
        {links.map(({ key, href, icon: Icon }) => (
          <Link key={href} className="surface-card p-5 hover:border-line-strong hover:bg-panel-soft" href={href}>
            <span className="flex items-center gap-3 text-lg font-semibold">
              <Icon size={20} aria-hidden="true" />
              {t(`links.${key}.label` as Parameters<typeof t>[0])}
            </span>
            <span className="mt-2 block text-sm leading-6 text-muted">
              {t(`links.${key}.description` as Parameters<typeof t>[0])}
            </span>
          </Link>
        ))}
      </nav>
    </main>
  )
}
