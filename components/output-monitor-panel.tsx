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
    id?: string
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
  const [hlsUrl, setHlsUrl] = useState<string | null>(null)
  const [hlsStatus, setHlsStatus] = useState<"idle" | "loading" | "copied" | "error">("idle")

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
        if (next.asset?.id !== payload.asset?.id) {
          setHlsUrl(null)
          setHlsStatus("idle")
        }
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
  }, [payload.asset?.id])

  const copyHlsUrl = async () => {
    if (!payload.asset?.id) return
    setHlsStatus("loading")
    try {
      const response = await fetch("/api/output/hls", {
        cache: "no-store"
      })
      const next = (await response.json().catch(() => null)) as {
        hlsUrl?: string
        playlistUrl?: string
        startOffsetSeconds?: number
        error?: string
      } | null
      const copyUrl = next?.playlistUrl ?? next?.hlsUrl
      if (!response.ok || !copyUrl) {
        throw new Error(next?.error ?? `HLS returned ${response.status}`)
      }
      await navigator.clipboard.writeText(copyUrl)
      setHlsUrl(copyUrl)
      setHlsStatus("copied")
    } catch {
      setHlsStatus("error")
    }
  }

  const clockSkew = Math.abs(clientSeconds - payload.serverSeconds)
  const canCopyHls = payload.asset?.sourceType === "vimeo" && Boolean(payload.asset.id)
  return (
    <div className="grid gap-3">
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
      {canCopyHls && (
        <div className="grid gap-2 rounded border border-white/10 bg-black/20 p-2">
          <button
            type="button"
            className="btn-secondary w-full justify-center text-[11px]"
            onClick={copyHlsUrl}
            disabled={hlsStatus === "loading"}
          >
            {hlsStatus === "loading" ? "Generating VLC link..." : "Copy VLC playlist link"}
          </button>
          <p className="truncate text-[10px] text-white/35">
            {hlsStatus === "copied"
              ? "Copied. Opens at current block time."
              : hlsStatus === "error"
                ? "Could not generate VLC link."
                : hlsUrl
                  ? hlsUrl
                  : "Generates a fresh VLC playlist with current offset."}
          </p>
        </div>
      )}
    </div>
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
