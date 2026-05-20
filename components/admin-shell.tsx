import { MonitorPlay, Tv } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AdminNav } from "@/components/admin-nav"
import { OperatorPath } from "@/components/operator-path"
import { requireAdmin, revokeCurrentOperatorSession, safeAdminReturnTo } from "@/lib/auth"

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
  const session = await requireAdmin().catch((error) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      redirect(`/admin/login?return_to=${encodeURIComponent(returnTo)}`)
    }
    throw error
  })

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
          <p className="mt-3 font-semibold text-ink">Browser output</p>
          <p className="mt-1">Open the output page for OBS/vMix capture.</p>
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
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-normal md:text-[1.7rem]">{title}</h1>
              {description ? (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          <AdminNav mobile />
        </header>
        <OperatorPath />
        <div className="min-w-0 p-4 md:p-6 xl:p-7">{children}</div>
      </main>
    </div>
  )
}
