"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Clapperboard, MonitorPlay, Settings, Video } from "lucide-react"

const navLinks = [
  { key: "calendar", href: "/admin/calendar", icon: CalendarDays },
  { key: "assets", href: "/admin/assets", icon: Video },
  { key: "slides", href: "/admin/slides", icon: Clapperboard },
  { key: "settings", href: "/admin/settings", icon: Settings },
  { key: "output", href: "/output/live?debug=true", icon: MonitorPlay },
] as const

type NavKey = (typeof navLinks)[number]["key"]

interface AdminNavProps {
  labels: Record<NavKey, string>
}

export function AdminNav({ labels }: AdminNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col">
      {navLinks.map(({ key, href, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href.split("?")[0])
        return (
          <Link
            key={href}
            href={href}
            aria-label={labels[key]}
            title={labels[key]}
            className={[
              "flex h-11 w-full items-center justify-center",
              "border-l-2 transition-colors",
              isActive
                ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                : "border-transparent text-white/60 hover:bg-surface-elevated-2 hover:text-white/90",
            ].join(" ")}
          >
            <Icon size={20} aria-hidden="true" />
          </Link>
        )
      })}
    </nav>
  )
}
