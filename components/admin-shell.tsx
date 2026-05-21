import { MonitorPlay, Tv } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AdminNav } from "@/components/admin-nav"
import { requireAdmin, revokeCurrentOperatorSession, safeAdminReturnTo } from "@/lib/auth"
import { getLiveSchedule } from "@/lib/data"
import { collectOperatorHealth } from "@/lib/health-checks"
import { findActiveSchedule } from "@/lib/scheduler"
import {
  formatPlayoutTimeLabel,
  PLAYOUT_TIMEZONE,
  secondsSinceMidnightInTimezone
} from "@/lib/time"

import type { ReactNode } from "react"

export async function AdminShell({
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
  const requestHeaders = await headers()
  const returnTo = safeAdminReturnTo(requestHeaders.get("x-rtv-current-path"))
  const showBroadcastStatus =
    returnTo === "/admin" || returnTo.startsWith("/admin/schedule") || returnTo === "/admin/output"
  const session = await requireAdmin().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      redirect(`/admin/login?return_to=${encodeURIComponent(returnTo)}`)
    }
    throw error
  })
  const status = await loadBroadcastStatus()

  async function logout() {
    "use server"
    await revokeCurrentOperatorSession()
    redirect("/admin/login?logged_out=1")
  }

  return (
    <div className="min-h-screen bg-panel text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface px-4 py-5 md:block">
        <Link
          href="/admin"
          className="flex items-center gap-3 rounded-md px-2 py-2 text-base font-semibold hover:bg-panel-soft"
        >
          <span className="grid h-9 w-9 place-items-center rounded-md bg-ink text-surface">
            <Tv size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block leading-tight">Roxom TV</span>
            <span className="block text-xs font-medium text-muted">Playout Manager</span>
          </span>
        </Link>
        <AdminNav />
        <div className="absolute bottom-5 left-4 right-4 rounded-md border border-line bg-panel-soft p-3 text-xs text-muted">
          <p className="truncate font-semibold text-ink">{session.displayName}</p>
          <p className="mt-0.5 truncate">
            {session.handle} · {session.role}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/admin/output"
              className="inline-flex min-h-8 items-center gap-2 rounded-md border border-line bg-surface px-2 font-semibold text-ink hover:bg-panel"
            >
              <MonitorPlay size={14} aria-hidden="true" />
              Open output
            </Link>
            <form action={logout}>
              <button className="inline-flex min-h-8 items-center rounded-md border border-line bg-surface px-2 font-semibold text-ink hover:bg-panel">
                Logout
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 md:pl-64">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-normal md:text-2xl">{title}</h1>
              {description ? (
                <p className="mt-0.5 max-w-3xl truncate text-sm text-muted">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          <AdminNav mobile />
        </header>
        {showBroadcastStatus ? <BroadcastStatusStrip status={status} /> : null}
        <div className="min-w-0 p-4 md:p-6 xl:p-7">{children}</div>
      </main>
    </div>
  )
}

async function loadBroadcastStatus() {
  try {
    const [bundle, health] = await Promise.all([getLiveSchedule(), collectOperatorHealth()])
    const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
    const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone)
    const active = findActiveSchedule(bundle, nowSeconds)
    const next =
      bundle.blocks
        .filter((block) => block.status === "ready" || block.status === "active")
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
        .find((block) => block.startTimeSeconds > nowSeconds) ?? null
    const fallback =
      bundle.mediaAssets.find(
        (asset) =>
          asset.status === "ready" &&
          asset.mediaKind === "video" &&
          asset.metadata?.fallback_loop === true
      ) ?? null
    return {
      ok: true,
      health: health.status,
      dayStatus: bundle.day?.status ?? "draft",
      nowSeconds,
      activeTitle: active.block?.title ?? null,
      nextTitle: next?.title ?? null,
      nextSeconds: next?.startTimeSeconds ?? null,
      fallbackTitle: fallback?.title ?? null
    }
  } catch {
    return {
      ok: false,
      health: "fail" as const,
      dayStatus: "draft",
      nowSeconds: null,
      activeTitle: null,
      nextTitle: null,
      nextSeconds: null,
      fallbackTitle: null
    }
  }
}

function BroadcastStatusStrip({
  status
}: {
  status: Awaited<ReturnType<typeof loadBroadcastStatus>>
}) {
  const healthTone =
    status.health === "ok" ? "text-success" : status.health === "fail" ? "text-danger" : "text-warn"
  return (
    <section className="border-b border-line bg-panel-soft px-4 py-1.5 md:px-6">
      <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <StatusItem
          label="Now"
          value={status.ok ? (status.activeTitle ?? "Nothing scheduled") : "Status unavailable"}
          tone={status.activeTitle ? "ok" : "warn"}
        />
        <StatusItem
          label="Next"
          value={
            status.nextTitle && status.nextSeconds !== null
              ? `${formatPlayoutTimeLabel(status.nextSeconds)} · ${status.nextTitle}`
              : "No next block"
          }
          tone={status.nextTitle ? "neutral" : "warn"}
        />
        <StatusItem
          label="Fallback"
          value={status.fallbackTitle ?? "Missing"}
          tone={status.fallbackTitle ? "ok" : "warn"}
        />
        <div className="ml-auto flex min-w-0 items-center gap-3 font-semibold uppercase text-muted">
          <span className={healthTone}>Health {status.health}</span>
          <span>Day {status.dayStatus}</span>
        </div>
      </div>
    </section>
  )
}

function StatusItem({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: "neutral" | "ok" | "warn"
}) {
  const toneClass = tone === "ok" ? "text-success" : tone === "warn" ? "text-warn" : "text-ink"
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="font-bold uppercase text-muted">{label}</p>
      <p className={`max-w-[22rem] truncate font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
