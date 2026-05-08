"use client"

import { useMemo, memo } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import type { CalendarEvent } from "@/lib/slides/types"

export type EventSlideModernProps = {
  selectedEventIds: string[]
  events: CalendarEvent[]
  eventSlideTitle?: string | null
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00")
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
  return `${month} ${date.getDate()}`
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const start = formatDateShort(startDate)
  if (!endDate || endDate === startDate) return start
  return `${start} - ${formatDateShort(endDate)}`
}

function ModernEventCard({ event, index }: { event: CalendarEvent; index: number }) {
  const dateRange = formatDateRange(event.start_date, event.end_date)
  const borderColor = event.color || "#10B981"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.08 }}
      className="relative h-full aspect-square"
    >
      {event.image_url ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${event.image_url})` }}
          />
          <div className="absolute inset-0 bg-black/70" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${event.color}30 0%, #111 100%)` }}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: `2px solid ${borderColor}`,
          boxShadow: `5px 5px 0 0 #0d0d0d, 5px 5px 0 1px ${borderColor}, 10px 10px 0 0 #0d0d0d, 10px 10px 0 1px ${borderColor}`
        }}
      />

      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 py-6 overflow-hidden">
        <p className="text-[3.5rem] font-bold mb-2 flex-shrink-0" style={{ color: borderColor }}>
          {dateRange}
        </p>
        <h2
          className="text-[2.5rem] leading-tight font-bold text-white uppercase tracking-wide mb-4 flex-shrink-0"
          style={{
            fontFamily: event.title_font ?? "inherit",
            color: event.title_color ?? "#FFFFFF",
            textShadow: "3px 3px 12px rgba(0,0,0,0.9)"
          }}
        >
          {event.title}
        </h2>
        {event.description && (
          <p
            className="text-[1.65rem] leading-snug mb-3 flex-1 overflow-hidden"
            style={{ color: event.text_color ?? "#D1D5DB" }}
          >
            {event.description}
          </p>
        )}
        {event.location && (
          <p
            className="text-[1.6rem] uppercase tracking-wider font-medium flex-shrink-0"
            style={{ color: "#A3A3A3" }}
          >
            {event.location}
          </p>
        )}
      </div>
    </motion.div>
  )
}

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 grid-rows-2"
}

function getGridLayout(count: number): string {
  return GRID_COLS[count] ?? "grid-cols-3"
}

function EventSlideModernInner({
  selectedEventIds,
  events,
  eventSlideTitle
}: EventSlideModernProps) {
  const selectedEvents = useMemo(() => {
    if (selectedEventIds.length === 0) return []
    const map = new Map(events.map((e) => [e.id, e]))
    return selectedEventIds
      .map((id) => map.get(id))
      .filter((e): e is CalendarEvent => e !== undefined)
  }, [selectedEventIds, events])

  const monthYear = useMemo(() => {
    const src = selectedEvents[0] ?? null
    const date = src ? new Date(src.start_date + "T00:00:00") : new Date()
    return `${date.toLocaleDateString("en-US", { month: "long" })} ${date.getFullYear()}`
  }, [selectedEvents])

  const gridBg = {
    background: "#0d0d0d",
    backgroundImage:
      "linear-gradient(rgba(60,60,60,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(60,60,60,0.15) 1px, transparent 1px)",
    backgroundSize: "32px 32px"
  }

  if (selectedEvents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-full flex items-center justify-center"
        style={gridBg}
      >
        <div className="text-center">
          <div className="text-6xl mb-4">📅</div>
          <p className="text-white text-2xl">No events selected</p>
          <p className="text-zinc-400">Configure this slide in the admin panel</p>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col" style={gridBg}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between px-10 pt-8 pb-6"
      >
        <div className="flex flex-col">
          <h1
            className="text-[4.5rem] leading-none font-bold tracking-tight"
            style={{
              color: "#10B981",
              fontStyle: "italic",
              fontFamily: "system-ui, -apple-system, sans-serif"
            }}
          >
            {monthYear}
          </h1>
          <div className="flex items-center gap-4 mt-3">
            <Image
              src="/rtvwhite.png"
              alt="ROXOM.TV"
              width={180}
              height={48}
              className="h-12 w-auto"
            />
          </div>
        </div>
        {eventSlideTitle && (
          <div className="text-right">
            <h2 className="text-[3.5rem] leading-none font-bold text-white whitespace-nowrap">
              {eventSlideTitle}
            </h2>
          </div>
        )}
      </motion.div>

      <div
        className={`flex-1 grid ${getGridLayout(selectedEvents.length)} gap-5 px-10 pb-10 place-content-center`}
      >
        {selectedEvents.map((event, index) => (
          <ModernEventCard key={event.id} event={event} index={index} />
        ))}
      </div>
    </div>
  )
}

export const EventSlideModern = memo(EventSlideModernInner, (prev, next) => {
  if (prev.eventSlideTitle !== next.eventSlideTitle) return false
  if (prev.selectedEventIds.join(",") !== next.selectedEventIds.join(",")) return false
  for (const id of prev.selectedEventIds) {
    const p = prev.events.find((e) => e.id === id)
    const n = next.events.find((e) => e.id === id)
    if (!p || !n || p.updated_at !== n.updated_at) return false
  }
  return true
})
