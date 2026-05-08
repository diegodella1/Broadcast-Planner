"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

const mockAssets = [
  { id: "1", title: "Mock Vimeo Asset 1" },
  { id: "2", title: "Mock Vimeo Asset 2" },
]

type Source = "vimeo" | "reuters" | "slide"

export function OperationsPanelManualBroadcast() {
  const t = useTranslations("ops.manualBroadcast")
  const [source, setSource] = useState<Source>("vimeo")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const results = useMemo(
    () =>
      mockAssets.filter((a) =>
        a.title.toLowerCase().includes(debouncedQuery.toLowerCase())
      ),
    [debouncedQuery]
  )

  return (
    <div className="space-y-2">
      {/* Source selector — stub: value stored in local state only */}
      <select
        value={source}
        onChange={(e) => setSource(e.target.value as Source)}
        className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1"
        aria-label={t("title")}
      >
        <option value="vimeo">Vimeo recording</option>
        <option value="reuters">Reuters live</option>
        <option value="slide">Slide / image</option>
      </select>

      {/* Search — debounced 300 ms; filters mock list; real Vimeo search deferred */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assets…"
        className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30"
      />

      {/* Result rows */}
      <ul className="space-y-1 max-h-40 overflow-y-auto" role="listbox" aria-label="Search results">
        {results.map((a) => (
          <li key={a.id} role="none">
            <button
              type="button"
              onClick={() => setSelectedId(a.id)}
              aria-selected={selectedId === a.id}
              role="option"
              className={`w-full text-left flex items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors ${
                selectedId === a.id
                  ? "bg-surface-selected-positive text-accent-positive"
                  : "text-white/70 hover:bg-surface-elevated-2"
              }`}
            >
              {/* Thumbnail placeholder */}
              <span
                className="shrink-0 w-8 h-5 rounded-[2px] bg-white/10 flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                  className="text-white/30"
                >
                  <polygon points="2,1 9,5 2,9" />
                </svg>
              </span>
              <span className="flex-1 truncate">{a.title}</span>
              <span className="shrink-0 text-[10px] opacity-60">Set as live</span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="text-xs text-white/40 px-2 py-1">No results</li>
        )}
      </ul>

      {/* Go live — disabled until a result is selected; real server action deferred */}
      <button
        type="button"
        disabled={!selectedId}
        onClick={() => console.log("[manual-broadcast]", source, selectedId)}
        className="w-full rounded-sm bg-accent-positive text-surface-elevated-1 text-xs font-semibold px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-positive-hover transition-colors"
      >
        Ir al aire ahora
      </button>
    </div>
  )
}
