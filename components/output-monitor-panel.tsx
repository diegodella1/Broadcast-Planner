"use client"

import { useEffect, useState } from "react"

import { formatTimecode } from "@/lib/time"

type MonitorPayload = {
  generatedAt: string
  timezone: string
  serverSeconds: number
  day: { airDate: string; status: string } | null
  block: { title: string; status: string; elapsedInBlock: number; durationSeconds: number } | null
  asset: {
    title: string
    sourceType: string
    status: string
    lifecycleState: string
    playbackReadinessStatus: string
    playbackError: string | null
  } | null
  fallback: { title: string } | null
  fallbackReason: string | null
  mediaError: string | null
}

export function OutputMonitorPanel({ initial }: { initial: MonitorPayload }) {
  const [payload, setPayload] = useState(initial)
  const [clientSeconds, setClientSeconds] = useState(initial.serverSeconds)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClientSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const response = await fetch("/api/output/monitor", { cache: "no-store" })
        if (!response.ok) throw new Error(`Monitor returned ${response.status}`)
        const next = (await response.json()) as MonitorPayload
        if (cancelled) return
        setPayload(next)
        setClientSeconds(next.serverSeconds)
        setError(null)
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : "Monitor refresh failed")
        }
      }
    }
    const timer = window.setInterval(refresh, 2000)
    void refresh()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const clockSkew = Math.abs(clientSeconds - payload.serverSeconds)
  return (
    <dl className="grid gap-2 text-[11px]">
      <MetricLine label="Day" value={payload.day?.airDate ?? "none"} />
      <MetricLine label="Day status" value={payload.day?.status ?? "none"} />
      <MetricLine label="Block" value={payload.block?.title ?? "none"} />
      <MetricLine
        label="Elapsed"
        value={
          payload.block
            ? `${formatTimecode(payload.block.elapsedInBlock)} / ${formatTimecode(payload.block.durationSeconds)}`
            : "n/a"
        }
      />
      <MetricLine label="Asset" value={payload.asset?.title ?? "none"} />
      <MetricLine label="Asset status" value={payload.asset?.status ?? "n/a"} />
      <MetricLine label="Lifecycle" value={payload.asset?.lifecycleState ?? "n/a"} />
      <MetricLine label="Fallback" value={payload.fallback?.title ?? "none"} />
      <MetricLine label="Fallback reason" value={payload.fallbackReason ?? "normal"} />
      <MetricLine label="Vimeo" value={payload.asset?.playbackReadinessStatus ?? "n/a"} />
      <MetricLine
        label="Media error"
        value={payload.mediaError ?? payload.asset?.playbackError ?? "none"}
      />
      <MetricLine label="Clock skew" value={`${clockSkew}s`} />
      <MetricLine
        label="Monitor"
        value={error ?? `ok ${new Date(payload.generatedAt).toLocaleTimeString()}`}
      />
    </dl>
  )
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-white/35">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-white/75">{value}</dd>
    </div>
  )
}
