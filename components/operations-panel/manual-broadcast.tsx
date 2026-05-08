"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState, useTransition } from "react"

import { goLiveAction, scheduleAction } from "@/app/admin/output/actions"
import { formatTimecode } from "@/lib/time"

import type { VimeoVideo } from "@/lib/vimeo"

type Mode = "now" | "scheduled"

export function OperationsPanelManualBroadcast() {
  const t = useTranslations("ops.manualBroadcast")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<VimeoVideo[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUri, setSelectedUri] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("now")
  const [startAt, setStartAt] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Fetch results when debouncedQuery changes.
  // All setState calls are inside async callbacks to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const controller = new AbortController()

    async function run() {
      if (!debouncedQuery) {
        setResults([])
        setSearchError(null)
        return
      }
      setIsSearching(true)
      setSearchError(null)
      try {
        const r = await fetch(`/api/vimeo/search?q=${encodeURIComponent(debouncedQuery)}`, {
          signal: controller.signal,
          cache: "no-store"
        })
        if (!r.ok) throw new Error(`Search failed: ${r.status}`)
        const data = (await r.json()) as VimeoVideo[]
        setResults(data)
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        setSearchError(e instanceof Error ? e.message : "Search failed")
      } finally {
        setIsSearching(false)
      }
    }

    void run()
    return () => controller.abort()
  }, [debouncedQuery])

  function commit() {
    if (!selectedUri) return
    setActionError(null)
    setActionSuccess(false)
    startTransition(async () => {
      const result =
        mode === "now"
          ? await goLiveAction({ vimeoUri: selectedUri })
          : await scheduleAction({ vimeoUri: selectedUri, startAt })
      if (!result.success) {
        setActionError(result.error)
        return
      }
      setActionSuccess(true)
      setSelectedUri(null)
      setQuery("")
      setStartAt("")
    })
  }

  return (
    <div className="space-y-2">
      {/* Search input */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        disabled={isPending}
        className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30 disabled:opacity-50"
        aria-label={t("title")}
      />

      {/* Search status / errors */}
      {isSearching && <p className="text-[10px] text-white/40">{t("searching")}</p>}
      {searchError && <p className="text-[10px] text-negative-red">{searchError}</p>}

      {/* Result rows */}
      <ul role="listbox" aria-label="Vimeo results" className="space-y-1 max-h-40 overflow-y-auto">
        {results.map((v) => (
          <li key={v.uri} role="none">
            <button
              type="button"
              role="option"
              aria-selected={selectedUri === v.uri}
              onClick={() => setSelectedUri(v.uri)}
              disabled={isPending}
              className={`w-full text-left flex items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                selectedUri === v.uri
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
        {debouncedQuery && !isSearching && results.length === 0 && !searchError && (
          <li className="text-xs text-white/40 px-2 py-1">{t("empty")}</li>
        )}
      </ul>

      {/* Mode toggle */}
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

      {/* Time picker (scheduled mode) */}
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

      {/* Errors / success */}
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

      {/* Commit button */}
      <button
        type="button"
        disabled={!selectedUri || isPending || (mode === "scheduled" && !startAt)}
        onClick={commit}
        className="w-full rounded-sm bg-accent-positive text-surface-elevated-1 text-xs font-semibold px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-positive-hover transition-colors"
      >
        {mode === "now" ? t("goLive") : t("schedule")}
      </button>
    </div>
  )
}
