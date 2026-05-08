"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState, useTransition } from "react"

import {
  goLiveAction,
  goLiveReutersAction,
  scheduleAction,
  scheduleReutersAction
} from "@/app/admin/output/actions"
import { formatTimecode } from "@/lib/time"

import type { VimeoVideo } from "@/lib/vimeo"

type Mode = "now" | "scheduled"
type Source = "vimeo" | "reuters"

type ReutersChannelRow = {
  id: string
  name: string
  description?: string
  category?: string | null
  hlsUrl: string
  assetId: string | null
}

export function OperationsPanelManualBroadcast() {
  const t = useTranslations("ops.manualBroadcast")

  // Source toggle (vimeo|reuters)
  const [source, setSource] = useState<Source>("vimeo")

  // Vimeo state
  const [vimeoQuery, setVimeoQuery] = useState("")
  const [vimeoDebounced, setVimeoDebounced] = useState("")
  const [vimeoResults, setVimeoResults] = useState<VimeoVideo[]>([])
  const [vimeoSearchError, setVimeoSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedVimeoUri, setSelectedVimeoUri] = useState<string | null>(null)

  // Reuters state
  const [reutersChannels, setReutersChannels] = useState<ReutersChannelRow[]>([])
  const [reutersQuery, setReutersQuery] = useState("")
  const [reutersError, setReutersError] = useState<string | null>(null)
  const [isLoadingReuters, setIsLoadingReuters] = useState(false)
  const [isSyncingReuters, setIsSyncingReuters] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)

  // Shared
  const [mode, setMode] = useState<Mode>("now")
  const [startAt, setStartAt] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const timer = setTimeout(() => setVimeoDebounced(vimeoQuery), 300)
    return () => clearTimeout(timer)
  }, [vimeoQuery])

  useEffect(() => {
    if (source !== "vimeo") return
    const controller = new AbortController()

    async function run() {
      if (!vimeoDebounced) {
        setVimeoResults([])
        setVimeoSearchError(null)
        return
      }
      setIsSearching(true)
      setVimeoSearchError(null)
      try {
        const r = await fetch(`/api/vimeo/search?q=${encodeURIComponent(vimeoDebounced)}`, {
          signal: controller.signal,
          cache: "no-store"
        })
        if (!r.ok) throw new Error(`Search failed: ${r.status}`)
        const data = (await r.json()) as VimeoVideo[]
        setVimeoResults(data)
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        setVimeoSearchError(e instanceof Error ? e.message : "Search failed")
      } finally {
        setIsSearching(false)
      }
    }

    void run()
    return () => controller.abort()
  }, [vimeoDebounced, source])

  useEffect(() => {
    if (source !== "reuters") return
    const controller = new AbortController()

    async function run() {
      setIsLoadingReuters(true)
      setReutersError(null)
      try {
        const r = await fetch("/api/reuters/sync", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store"
        })
        if (!r.ok) throw new Error(`Reuters channels failed: ${r.status}`)
        const data = (await r.json()) as { channels: ReutersChannelRow[] }
        setReutersChannels(data.channels ?? [])
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        setReutersError(e instanceof Error ? e.message : "Reuters channels failed")
      } finally {
        setIsLoadingReuters(false)
      }
    }

    void run()
    return () => controller.abort()
  }, [source])

  const filteredReuters = reutersChannels.filter((c) => {
    if (!reutersQuery) return true
    const q = reutersQuery.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q) ||
      (c.category ?? "").toLowerCase().includes(q)
    )
  })

  function syncReuters() {
    setIsSyncingReuters(true)
    setReutersError(null)
    void (async () => {
      try {
        const r = await fetch("/api/reuters/sync", { method: "POST", cache: "no-store" })
        if (!r.ok) throw new Error(`Reuters sync failed: ${r.status}`)
        const data = (await r.json()) as { channels: ReutersChannelRow[] }
        setReutersChannels(data.channels ?? [])
      } catch (e: unknown) {
        setReutersError(e instanceof Error ? e.message : "Reuters sync failed")
      } finally {
        setIsSyncingReuters(false)
      }
    })()
  }

  function commit() {
    setActionError(null)
    setActionSuccess(false)
    if (source === "vimeo") {
      if (!selectedVimeoUri) return
      startTransition(async () => {
        const result =
          mode === "now"
            ? await goLiveAction({ vimeoUri: selectedVimeoUri })
            : await scheduleAction({ vimeoUri: selectedVimeoUri, startAt })
        if (!result.success) {
          setActionError(result.error)
          return
        }
        setActionSuccess(true)
        setSelectedVimeoUri(null)
        setVimeoQuery("")
        setStartAt("")
      })
      return
    }
    // reuters
    if (!selectedAssetId) return
    startTransition(async () => {
      const result =
        mode === "now"
          ? await goLiveReutersAction({ assetId: selectedAssetId })
          : await scheduleReutersAction({ assetId: selectedAssetId, startAt })
      if (!result.success) {
        setActionError(result.error)
        return
      }
      setActionSuccess(true)
      setSelectedAssetId(null)
      setStartAt("")
    })
  }

  const commitDisabled =
    isPending ||
    (mode === "scheduled" && !startAt) ||
    (source === "vimeo" ? !selectedVimeoUri : !selectedAssetId)

  return (
    <div className="space-y-2">
      {/* Source toggle */}
      <div role="radiogroup" aria-label={t("sourceLabel")} className="flex gap-1 text-[10px]">
        <label className="flex-1">
          <input
            type="radio"
            name="manual-broadcast-source"
            value="vimeo"
            checked={source === "vimeo"}
            onChange={() => setSource("vimeo")}
            className="sr-only peer"
          />
          <span className="block w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-center py-1 text-white/60 cursor-pointer peer-checked:bg-surface-selected-positive peer-checked:text-accent-positive peer-checked:border-accent-positive">
            {t("sourceVimeo")}
          </span>
        </label>
        <label className="flex-1">
          <input
            type="radio"
            name="manual-broadcast-source"
            value="reuters"
            checked={source === "reuters"}
            onChange={() => setSource("reuters")}
            className="sr-only peer"
          />
          <span className="block w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-center py-1 text-white/60 cursor-pointer peer-checked:bg-surface-selected-positive peer-checked:text-accent-positive peer-checked:border-accent-positive">
            {t("sourceReuters")}
          </span>
        </label>
      </div>

      {source === "vimeo" ? (
        <>
          <input
            type="search"
            value={vimeoQuery}
            onChange={(e) => setVimeoQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            disabled={isPending}
            className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30 disabled:opacity-50"
            aria-label={t("title")}
          />

          {isSearching && <p className="text-[10px] text-white/40">{t("searching")}</p>}
          {vimeoSearchError && <p className="text-[10px] text-negative-red">{vimeoSearchError}</p>}

          <ul
            role="listbox"
            aria-label="Vimeo results"
            className="space-y-1 max-h-40 overflow-y-auto"
          >
            {vimeoResults.map((v) => (
              <li key={v.uri} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedVimeoUri === v.uri}
                  onClick={() => setSelectedVimeoUri(v.uri)}
                  disabled={isPending}
                  className={`w-full text-left flex items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                    selectedVimeoUri === v.uri
                      ? "bg-surface-selected-positive text-accent-positive"
                      : "text-white/70 hover:bg-surface-elevated-2"
                  } disabled:opacity-50`}
                >
                  <span className="flex-1 truncate">{v.name}</span>
                  <span className="shrink-0 text-[10px] opacity-60 tabular-nums">
                    {formatTimecode(v.duration)}
                  </span>
                </button>
              </li>
            ))}
            {vimeoDebounced && !isSearching && vimeoResults.length === 0 && !vimeoSearchError && (
              <li className="text-xs text-white/40 px-2 py-1">{t("empty")}</li>
            )}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <input
              type="search"
              value={reutersQuery}
              onChange={(e) => setReutersQuery(e.target.value)}
              placeholder={t("reutersChannels")}
              disabled={isPending}
              className="flex-1 rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30 disabled:opacity-50"
              aria-label={t("reutersChannels")}
            />
            <button
              type="button"
              onClick={syncReuters}
              disabled={isPending || isSyncingReuters}
              className="rounded-sm bg-surface-elevated-2 border border-white/10 text-[10px] text-white/70 px-2 py-1 disabled:opacity-30"
            >
              {isSyncingReuters ? t("searching") : t("syncChannels")}
            </button>
          </div>

          {isLoadingReuters && <p className="text-[10px] text-white/40">{t("searching")}</p>}
          {reutersError && <p className="text-[10px] text-negative-red">{reutersError}</p>}

          <ul
            role="listbox"
            aria-label="Reuters channels"
            className="space-y-1 max-h-40 overflow-y-auto"
          >
            {filteredReuters.map((c) => {
              const disabled = !c.assetId
              return (
                <li key={c.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedAssetId === c.assetId}
                    onClick={() => c.assetId && setSelectedAssetId(c.assetId)}
                    disabled={isPending || disabled}
                    className={`w-full text-left flex items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                      selectedAssetId && c.assetId === selectedAssetId
                        ? "bg-surface-selected-positive text-accent-positive"
                        : "text-white/70 hover:bg-surface-elevated-2"
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-[10px] opacity-60 uppercase">
                      {c.category ?? ""}
                    </span>
                  </button>
                </li>
              )
            })}
            {!isLoadingReuters && filteredReuters.length === 0 && !reutersError && (
              <li className="text-xs text-white/40 px-2 py-1">{t("noReutersConfigured")}</li>
            )}
          </ul>
        </>
      )}

      <div role="radiogroup" aria-label={t("modeLabel")} className="flex gap-1 text-[10px]">
        <label className="flex-1">
          <input
            type="radio"
            name="manual-broadcast-mode"
            value="now"
            checked={mode === "now"}
            onChange={() => setMode("now")}
            className="sr-only peer"
          />
          <span className="block w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-center py-1 text-white/60 cursor-pointer peer-checked:bg-surface-selected-positive peer-checked:text-accent-positive peer-checked:border-accent-positive">
            {t("modeNow")}
          </span>
        </label>
        <label className="flex-1">
          <input
            type="radio"
            name="manual-broadcast-mode"
            value="scheduled"
            checked={mode === "scheduled"}
            onChange={() => setMode("scheduled")}
            className="sr-only peer"
          />
          <span className="block w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-center py-1 text-white/60 cursor-pointer peer-checked:bg-surface-selected-positive peer-checked:text-accent-positive peer-checked:border-accent-positive">
            {t("modeScheduled")}
          </span>
        </label>
      </div>

      {mode === "scheduled" && (
        <input
          type="time"
          step={60}
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          aria-label={t("startAt")}
          className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1"
        />
      )}

      {actionError && (
        <p role="alert" className="text-[10px] text-negative-red">
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p role="status" className="text-[10px] text-accent-positive">
          {t("success")}
        </p>
      )}

      <button
        type="button"
        disabled={commitDisabled}
        onClick={commit}
        className="w-full rounded-sm bg-accent-positive text-surface-elevated-1 text-xs font-semibold px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-positive-hover transition-colors"
      >
        {mode === "now" ? t("goLive") : t("schedule")}
      </button>
    </div>
  )
}
