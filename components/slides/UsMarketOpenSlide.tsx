"use client"

import { motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"

import type { MarketIndex, MarketOpenData, MarketOpenPhase } from "@/lib/slides/types"
import { useSlidePollingData } from "./use-slide-polling-data"

export type MarketOpenSlideProps = {
  data: MarketOpenData
  endpoint: string
}

const POLL_MS = 30_000

const phaseSuffixes: Record<MarketOpenPhase, string> = {
  "pre-market": "PRE-OPEN",
  open: "LIVE",
  "after-hours": "AFTER HOURS",
  closed: "CLOSED"
}

export function MarketOpenSlide({ data, endpoint }: MarketOpenSlideProps) {
  const liveData = useSlidePollingData(data, endpoint, POLL_MS)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const remaining = Math.max(0, new Date(liveData.nextBellAt).getTime() - now)
  const marketTone = liveData.phase === "open" ? "text-emerald-300" : "text-amber-200"
  const updated = formatMarketTime(liveData.updatedAt, liveData.marketTimezone)
  const isDemo = liveData.mode === "demo"
  const isUnavailable = liveData.mode === "unavailable"

  return (
    <motion.div
      className="relative h-full w-full overflow-hidden bg-[#06070a] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.07),transparent_42%),radial-gradient(circle_at_88%_18%,rgba(255,64,64,0.16),transparent_34%)]" />
      <div className="absolute left-0 top-0 h-full w-[10px] bg-red-500" />

      <div className="relative z-10 flex h-full flex-col px-12 py-10">
        {isDemo && (
          <div className="mb-5 flex items-center justify-center border border-amber-300/45 bg-amber-300/14 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.34em] text-amber-100">
            Demo data - not live
          </div>
        )}
        {isUnavailable && (
          <div className="mb-5 flex items-center justify-center border border-red-300/45 bg-red-300/14 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.34em] text-red-100">
            Live market API unavailable
          </div>
        )}

        <header className="flex items-start justify-between gap-10">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.42em] text-white/45">
              {isDemo ? liveData.previewLabel : liveData.regionLabel}
            </p>
            <h1 className="mt-3 text-[clamp(48px,6.8vw,118px)] font-black leading-none tracking-normal">
              {liveData.marketName.toUpperCase()} {phaseSuffixes[liveData.phase]}
            </h1>
          </div>
          <div className="min-w-[360px] border-l border-white/20 pl-8 text-right">
            <p className={`text-base font-black uppercase tracking-[0.28em] ${marketTone}`}>
              {liveData.nextBellLabel}
            </p>
            <div className="mt-2 font-mono text-[clamp(38px,5vw,86px)] font-black leading-none tabular-nums">
              {formatDuration(remaining)}
            </div>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.22em] text-white/45">
              {liveData.marketTimezone}
            </p>
          </div>
        </header>

        <section className="mt-10 grid flex-1 grid-cols-4 gap-5">
          {liveData.instruments.map((instrument) => (
            <IndexCard key={instrument.id} instrument={instrument} />
          ))}
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-white/10 pt-5 text-xs font-bold uppercase tracking-[0.22em] text-white/45">
          <span>Updated {updated} local</span>
          <span>{footerStatus(liveData)}</span>
        </footer>
      </div>
    </motion.div>
  )
}

function footerStatus(data: MarketOpenData) {
  if (data.mode === "demo") return "Demo board · not live"
  if (data.mode === "unavailable") return `${data.source} · unavailable`
  return `${data.stale ? "Stale · " : "Live · "}cached ${data.cacheSeconds}s · ${data.source}`
}

function IndexCard({ instrument }: { instrument: MarketIndex }) {
  const direction = (instrument.changePercent ?? instrument.change ?? 0) >= 0 ? "up" : "down"
  const directionClass = direction === "up" ? "text-emerald-300" : "text-red-300"
  return (
    <article className="flex min-w-0 flex-col justify-between border border-white/12 bg-white/[0.055] p-6 shadow-2xl">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[clamp(26px,2.8vw,52px)] font-black leading-none">
              {instrument.label}
            </h2>
            <p className="mt-3 text-sm font-black uppercase tracking-[0.24em] text-white/40">
              {instrument.symbol}
            </p>
          </div>
          <span
            className={`shrink-0 border px-3 py-1 text-sm font-black uppercase tracking-[0.18em] ${
              direction === "up"
                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                : "border-red-300/35 bg-red-300/10 text-red-200"
            }`}
          >
            {direction === "up" ? "Up" : "Down"}
          </span>
        </div>

        <div className="mt-8">
          {instrument.price ? (
            <p className="font-mono text-[clamp(42px,5vw,82px)] font-black leading-none tabular-nums">
              {formatPrice(instrument.price)}
            </p>
          ) : (
            <p className="text-[clamp(24px,2.6vw,42px)] font-black uppercase text-white/35">
              Data unavailable
            </p>
          )}
          <p
            className={`mt-5 font-mono text-[clamp(24px,2.8vw,48px)] font-black tabular-nums ${directionClass}`}
          >
            {formatSigned(instrument.change)} · {formatPercent(instrument.changePercent)}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <Sparkline points={instrument.points} direction={direction} />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-white/35">
          {instrument.source}
        </p>
      </div>
    </article>
  )
}

function Sparkline({
  points,
  direction
}: {
  points: MarketIndex["points"]
  direction: "up" | "down"
}) {
  const path = useMemo(() => sparklinePath(points), [points])
  const stroke = direction === "up" ? "#6ee7b7" : "#fca5a5"
  return (
    <svg
      viewBox="0 0 240 72"
      className="h-20 w-full overflow-visible"
      role="img"
      aria-label="Recent movement"
    >
      <path d="M0 58 L240 58" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      {path ? (
        <path d={path} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
      ) : (
        <path d="M0 42 L240 42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
      )}
    </svg>
  )
}

function sparklinePath(points: MarketIndex["points"]) {
  if (points.length < 2) return ""
  const prices = points.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const spread = max - min || 1
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 240
      const y = 62 - ((point.price - min) / spread) * 52
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 2 : 3,
    minimumFractionDigits: value >= 100 ? 2 : 3
  }).format(value)
}

function formatSigned(value: number | null) {
  if (value === null) return "N/A"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}`
}

function formatPercent(value: number | null) {
  if (value === null) return "N/A"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function formatMarketTime(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date)
}

export type UsMarketOpenSlideProps = {
  data: MarketOpenData
}

export function UsMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
  return <MarketOpenSlide data={data} endpoint="/api/slide-data/us-market-open" />
}

export function JapanMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
  return <MarketOpenSlide data={data} endpoint="/api/slide-data/japan-market-open" />
}

export function UkMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
  return <MarketOpenSlide data={data} endpoint="/api/slide-data/uk-market-open" />
}

export function ChinaMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
  return <MarketOpenSlide data={data} endpoint="/api/slide-data/china-market-open" />
}

export function SaudiMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
  return <MarketOpenSlide data={data} endpoint="/api/slide-data/saudi-market-open" />
}
