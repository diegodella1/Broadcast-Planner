"use client"

import { motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"

import type { GuestLineupData, GuestLineupGuest } from "@/lib/slides/types"
import { useSlidePollingData } from "./use-slide-polling-data"

export type GuestLineupSlideProps = {
  data: GuestLineupData
}

const POLL_MS = 30_000

export function GuestLineupSlide({ data }: GuestLineupSlideProps) {
  const liveData = useSlidePollingData(data, data.endpoint ?? "/api/slide-data/guests", POLL_MS)
  const guests = liveData.guests.length ? liveData.guests : data.guests
  const [activeIndex, setActiveIndex] = useState(0)
  const rotationMs = Math.max(3, liveData.rotationSeconds || 9) * 1000

  useEffect(() => {
    if (guests.length < 2) return
    const timer = setInterval(() => {
      setActiveIndex((index) => (index + 1) % guests.length)
    }, rotationMs)
    return () => clearInterval(timer)
  }, [guests.length, rotationMs])

  const normalizedIndex = guests.length ? activeIndex % guests.length : 0
  const activeGuest = guests[normalizedIndex] ?? guests[0]
  if (!activeGuest) return <EmptyGuestLineup />

  const accent = safeColor(activeGuest.color)
  const nextGuests = guests.filter((_, index) => index !== normalizedIndex).slice(0, 4)
  const updatedAt = formatTime(liveData.updatedAt)

  return (
    <motion.div
      className="relative h-full w-full overflow-hidden bg-[#070707] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08),transparent_44%),radial-gradient(circle_at_88%_14%,rgba(247,147,26,0.22),transparent_34%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[#111]" />
      <div className="absolute left-0 top-0 h-full w-[12px]" style={{ backgroundColor: accent }} />

      <div className="relative z-10 flex h-full flex-col px-14 py-12">
        {liveData.mode !== "live" ? (
          <div className="mb-5 w-fit border border-amber-300/45 bg-amber-300/14 px-4 py-2 text-sm font-black uppercase tracking-[0.3em] text-amber-100">
            {liveData.mode === "demo" ? "Demo guests" : "Guests unavailable"}
          </div>
        ) : null}

        <section className="grid min-h-0 flex-1 grid-cols-[1.05fr_0.95fr] gap-12">
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-sm font-black uppercase tracking-[0.44em] text-white/45">
              Guest lineup
            </p>
            <h1 className="mt-5 max-w-[980px] text-[clamp(72px,8.8vw,152px)] font-black leading-[0.88] tracking-normal">
              {activeGuest.name}
            </h1>
            <div className="mt-8 h-2 w-44" style={{ backgroundColor: accent }} />
            <p className="mt-8 text-[clamp(30px,3.8vw,62px)] font-bold leading-tight text-white/88">
              {joinDetails(activeGuest.role, activeGuest.company)}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <InfoChip label="Category" value={activeGuest.category} accent={accent} />
              <InfoChip label="Host" value={activeGuest.host ?? "RTV"} accent={accent} />
              <InfoChip
                label="Program"
                value={activeGuest.program ?? "Live desk"}
                accent={accent}
              />
              <InfoChip
                label="Time"
                value={formatAppearance(activeGuest.appearanceAt)}
                accent={accent}
              />
            </div>
          </div>

          <div className="relative min-h-0 overflow-hidden border border-white/12 bg-white/[0.05] shadow-2xl">
            <GuestMedia key={activeGuest.id} guest={activeGuest} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/32 to-transparent p-8">
              <p className="text-xs font-black uppercase tracking-[0.34em] text-white/55">
                On deck
              </p>
              <p className="mt-2 text-3xl font-black">{activeGuest.program ?? "RTV Time"}</p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid h-[230px] grid-cols-4 gap-4">
          {nextGuests.map((guest) => (
            <GuestQueueCard key={guest.id} guest={guest} />
          ))}
        </section>

        <footer className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-bold uppercase tracking-[0.22em] text-white/45">
          <span>
            {liveData.source} · cache {liveData.cacheSeconds}s
          </span>
          <span>Updated {updatedAt}</span>
        </footer>
      </div>
    </motion.div>
  )
}

function GuestMedia({ guest }: { guest: GuestLineupGuest }) {
  const initials = useMemo(() => initialsFor(guest.name), [guest.name])
  const [failedVideo, setFailedVideo] = useState(false)
  const [failedImage, setFailedImage] = useState(false)

  if (guest.videoUrl && !failedVideo) {
    return (
      <video
        src={guest.videoUrl}
        className="h-full w-full object-cover"
        muted
        autoPlay
        loop
        playsInline
        onError={() => setFailedVideo(true)}
      />
    )
  }

  if (guest.photoUrl && !failedImage) {
    return (
      <img
        src={guest.photoUrl}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailedImage(true)}
      />
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-white/[0.04] text-[clamp(90px,11vw,180px)] font-black text-white/24">
      {initials}
    </div>
  )
}

function GuestQueueCard({ guest }: { guest: GuestLineupGuest }) {
  const accent = safeColor(guest.color)
  return (
    <article className="min-w-0 border border-white/12 bg-white/[0.055] p-5">
      <div className="h-1 w-16" style={{ backgroundColor: accent }} />
      <p className="mt-5 truncate text-[clamp(24px,2.2vw,40px)] font-black leading-none">
        {guest.name}
      </p>
      <p className="mt-3 line-clamp-2 text-xl font-semibold leading-tight text-white/72">
        {joinDetails(guest.role, guest.company)}
      </p>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-white/38">
        {guest.category} · {formatAppearance(guest.appearanceAt)}
      </p>
    </article>
  )
}

function InfoChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="border bg-black/24 px-5 py-3" style={{ borderColor: `${accent}88` }}>
      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/36">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  )
}

function EmptyGuestLineup() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#070707] text-white">
      <p className="text-3xl font-black uppercase tracking-[0.24em] text-white/40">
        No guests ready
      </p>
    </div>
  )
}

function joinDetails(role?: string | null, company?: string | null) {
  return [role, company].filter(Boolean).join(" · ") || "Guest"
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function formatAppearance(value: string | null) {
  if (!value) return "TBD"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "TBD"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date)
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date)
}

function safeColor(value: string | null | undefined) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#f7931a"
}
