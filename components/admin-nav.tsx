"use client"

import {
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  MonitorPlay,
  Music,
  Settings,
  Tv,
  Video
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { LucideIcon } from "lucide-react"

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  match?: "exact"
}

type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, match: "exact" },
      { label: "Control", href: "/admin/output", icon: Tv },
      { label: "Live monitor", href: "/output/live?debug=true", icon: MonitorPlay }
    ]
  },
  {
    label: "Plan",
    items: [{ label: "Programming", href: "/admin/calendar", icon: CalendarDays }]
  },
  {
    label: "Media",
    items: [
      { label: "Library", href: "/admin/assets", icon: Video },
      { label: "Vimeo", href: "/admin/vimeo", icon: MonitorPlay },
      { label: "Graphics", href: "/admin/slides", icon: Clapperboard },
      { label: "Music", href: "/admin/music", icon: Music }
    ]
  },
  {
    label: "System",
    items: [{ label: "Integrations", href: "/admin/settings", icon: Settings }]
  }
]

export function AdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  const links = mobile ? navGroups.flatMap((group) => group.items) : null

  if (mobile) {
    return (
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Admin sections">
        {links!.map(({ label, href, icon: Icon, match }) => {
          const active = isActivePath(pathname, href, match)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
                active
                  ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                  : "border-line bg-surface text-muted"
              ].join(" ")}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="mt-8 grid gap-5" aria-label="Admin sections">
      {navGroups.map((group) => (
        <section key={group.label}>
          <p className="px-3 text-[0.68rem] font-bold uppercase text-muted">{group.label}</p>
          <div className="mt-2 grid gap-1">
            {group.items.map(({ label, href, icon: Icon, match }) => {
              const active = isActivePath(pathname, href, match)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold",
                    active
                      ? "border border-accent-positive bg-surface-selected-positive text-accent-positive"
                      : "text-muted hover:bg-panel-soft hover:text-ink"
                  ].join(" ")}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </nav>
  )
}

function isActivePath(pathname: string, href: string, match?: string) {
  const basePath = href.split("?")[0]!
  if (match === "exact") return pathname === basePath
  return pathname === basePath || pathname.startsWith(`${basePath}/`)
}
