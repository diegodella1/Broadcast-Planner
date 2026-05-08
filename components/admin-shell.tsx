import Link from "next/link"
import type { ReactNode } from "react"
import { Activity, AlertOctagon, CalendarDays, Clapperboard, MonitorPlay, Settings, Tv, Video } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { AdminNav } from "@/components/admin-nav"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { getLiveScheduleSafe } from "@/lib/data"
import { findActiveSchedule } from "@/lib/scheduler"
import { secondsSinceLocalMidnight } from "@/lib/time"

const mobileNavLinks = [
  { key: "calendar", href: "/admin/calendar", icon: CalendarDays },
  { key: "assets", href: "/admin/assets", icon: Video },
  { key: "slides", href: "/admin/slides", icon: Clapperboard },
  { key: "settings", href: "/admin/settings", icon: Settings },
  { key: "output", href: "/output/live?debug=true", icon: MonitorPlay },
] as const

type NavKey = (typeof mobileNavLinks)[number]["key"]

export async function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const [t, liveResult] = await Promise.all([
    getTranslations(),
    getLiveScheduleSafe(),
  ])

  const outage = liveResult.outage
  const liveBundle = liveResult.data
  const nowSeconds = secondsSinceLocalMidnight(new Date())
  const activeSchedule = liveBundle ? findActiveSchedule(liveBundle, nowSeconds) : null
  const isLive =
    liveBundle?.day?.status === "active" && activeSchedule?.block != null

  const navLabels: Record<NavKey, string> = {
    calendar: t("nav.calendar"),
    assets: t("nav.assets"),
    slides: t("nav.slides"),
    settings: t("nav.settings"),
    output: t("nav.output"),
  }

  return (
    <div className="flex min-h-screen bg-panel text-ink">
      {/* ── Sidebar (P4.1) ───────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 hidden w-14 flex-col border-r border-white/10 bg-surface-elevated-1 md:flex">
        <Link
          href="/"
          aria-label={t("chrome.brand")}
          title={t("chrome.brand")}
          className="flex h-14 w-full items-center justify-center text-accent-positive hover:bg-surface-elevated-2 transition-colors"
        >
          <Tv size={20} aria-hidden="true" />
        </Link>

        <div className="h-px bg-white/10" />

        <AdminNav labels={navLabels} />

        <div className="mt-auto">
          <div className="h-px bg-white/10" />
          <Link
            href="/output/live?debug=true"
            aria-label={t("chrome.broadcastOutput")}
            title={t("chrome.broadcastOutput")}
            className="flex h-11 w-full items-center justify-center text-white/60 hover:bg-surface-elevated-2 hover:text-white/90 transition-colors"
          >
            <MonitorPlay size={20} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <main className="flex-1 md:pl-14">
        {/* ── Outage banner (P7.1) ─────────────────────────────────── */}
        {outage ? (
          <div
            role="alert"
            data-testid="outage-banner"
            className="flex items-center gap-2 border-b border-negative-red/30 bg-negative-red/10 px-4 py-2 text-xs text-negative-red"
          >
            <AlertOctagon size={14} aria-hidden="true" />
            <span>
              {t("chrome.outage")}: <span className="text-white/70">{t("chrome.outageMessage")}</span>
            </span>
          </div>
        ) : null}

        {/* ── Topbar (P4.2) ────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-white/10 bg-surface-elevated-1 px-4">
          {/* Left slot: brand mark + page title / subtitle */}
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40 hidden sm:inline">
            {t("chrome.brand")}
          </span>
          <span className="text-white/20 hidden sm:inline" aria-hidden="true">/</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-white/90 leading-none">{title}</h1>
            {description ? (
              <p className="mt-0.5 truncate text-xs text-white/40 leading-none">{description}</p>
            ) : null}
          </div>

          {/* Right slot (right-to-left: actions, ON AIR, LocaleSwitcher, Output, Health) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Primary action (page-specific, optional) */}
            {actions ? <>{actions}</> : null}

            {/* ON AIR pill — active when day.status==="active" AND an active block exists */}
            <div
              data-onair-pill
              data-testid="onair-pill"
              aria-live="polite"
              className={
                isLive
                  ? "inline-flex items-center gap-1.5 rounded-full bg-accent-live px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-live-text"
                  : "inline-flex items-center gap-1.5 rounded-full bg-surface-elevated-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/40"
              }
            >
              <span
                className={
                  isLive
                    ? "h-1.5 w-1.5 rounded-full bg-accent-live-text animate-pulse"
                    : "h-1.5 w-1.5 rounded-full bg-white/20"
                }
                aria-hidden="true"
              />
              {t("chrome.onAir")}
            </div>

            {/* LocaleSwitcher */}
            <LocaleSwitcher />

            {/* Output button — links to /output/live (no dedicated /admin/output route yet) */}
            <Link
              href="/output/live?debug=true"
              aria-label={t("chrome.output")}
              title={t("chrome.output")}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated-2 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-surface-elevated-2/80 hover:text-white/90"
            >
              <MonitorPlay size={13} aria-hidden="true" />
              <span className="hidden sm:inline">{t("chrome.output")}</span>
            </Link>

            {/* Health button — links to /output/live until /admin/health is created */}
            <Link
              href="/output/live"
              aria-label={t("chrome.health")}
              title={t("chrome.health")}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-elevated-2 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-surface-elevated-2/80 hover:text-white/90"
            >
              <Activity size={13} aria-hidden="true" />
              <span className="hidden sm:inline">{t("chrome.health")}</span>
            </Link>
          </div>
        </header>

        {/* Mobile nav strip */}
        <nav className="flex gap-2 overflow-x-auto border-b border-white/10 bg-surface-elevated-1 px-4 pb-2 pt-2 md:hidden">
          {mobileNavLinks.map(({ key, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-muted"
            >
              <Icon size={16} aria-hidden="true" />
              {t(`nav.${key}` as Parameters<typeof t>[0])}
            </Link>
          ))}
        </nav>

        <div className="p-4 md:p-6 xl:p-7">{children}</div>
      </main>
    </div>
  )
}
