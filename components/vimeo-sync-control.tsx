"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { CSRF_FIELD } from "@/lib/csrf-constants"

type SyncState = "idle" | "syncing" | "complete" | "error"

export function VimeoSyncControl({
  csrfToken,
  disabled,
  lastSyncCount,
  showsCount
}: {
  csrfToken: string
  disabled: boolean
  lastSyncCount: number
  showsCount: number
}) {
  const router = useRouter()
  const [state, setState] = useState<SyncState>("idle")
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [message, setMessage] = useState("Ready to sync Vimeo catalog.")
  const [result, setResult] = useState<{ syncedCount: number; staleCount: number } | null>(null)
  const estimateSeconds = useMemo(
    () => estimateSyncSeconds(lastSyncCount, showsCount),
    [lastSyncCount, showsCount]
  )
  const progress =
    state === "complete"
      ? 100
      : state === "syncing"
        ? Math.min(95, Math.max(8, Math.round((elapsedSeconds / estimateSeconds) * 100)))
        : 0
  const remainingSeconds =
    state === "syncing" ? Math.max(0, estimateSeconds - elapsedSeconds) : estimateSeconds

  useEffect(() => {
    if (state !== "syncing" || !startedAt) return undefined
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, state])

  async function syncNow() {
    setState("syncing")
    setStartedAt(Date.now())
    setElapsedSeconds(0)
    setResult(null)
    setMessage("Syncing Vimeo shows and episodes. Keep this tab open.")
    try {
      const form = new FormData()
      form.set(CSRF_FIELD, csrfToken)
      const response = await fetch("/api/vimeo/sync", {
        method: "POST",
        body: form,
        cache: "no-store"
      })
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean
        syncedCount?: number
        staleCount?: number
        error?: string
      } | null
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `Vimeo sync failed with ${response.status}`)
      }
      const syncedCount = Number(payload.syncedCount ?? 0)
      const staleCount = Number(payload.staleCount ?? 0)
      setResult({ syncedCount, staleCount })
      setState("complete")
      setMessage(`Sync complete. ${syncedCount} assets updated, ${staleCount} stale.`)
      router.replace(`/admin/vimeo?synced=1&count=${syncedCount}`)
      router.refresh()
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : "Vimeo sync failed.")
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn-primary"
        disabled={disabled || state === "syncing"}
        onClick={syncNow}
      >
        {state === "syncing" ? "Syncing Vimeo…" : "Sync now"}
      </button>
      <div className="rounded-md border border-line bg-panel-soft p-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
          <span>{syncLabel(state)}</span>
          <span className="tabular-nums">
            {state === "syncing"
              ? `${elapsedSeconds}s elapsed · ~${remainingSeconds}s left`
              : `ETA ~${estimateSeconds}s`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
          <div
            className={[
              "h-full rounded-full transition-all duration-500",
              state === "error" ? "bg-danger" : "bg-accent-positive"
            ].join(" ")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          className={[
            "mt-2 text-xs leading-5",
            state === "error" ? "text-danger-strong" : "text-muted"
          ].join(" ")}
        >
          {message}
        </p>
        {result ? (
          <p className="mt-1 text-xs text-success-strong">
            Updated {result.syncedCount} · Stale {result.staleCount}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function estimateSyncSeconds(lastSyncCount: number, showsCount: number) {
  const itemEstimate = Math.max(lastSyncCount, 25) * 0.45
  const showEstimate = Math.max(showsCount, 1) * 2
  return Math.min(180, Math.max(20, Math.round(itemEstimate + showEstimate)))
}

function syncLabel(state: SyncState) {
  switch (state) {
    case "syncing":
      return "Sync in progress"
    case "complete":
      return "Sync complete"
    case "error":
      return "Sync failed"
    default:
      return "Sync ready"
  }
}
