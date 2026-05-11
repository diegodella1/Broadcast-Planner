"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import clsx from "clsx"
import { PlayoutTime } from "@/components/playout-time"
import { formatPlayoutTimeLabel, formatTimecode } from "@/lib/time"
import { findScheduleConflicts, scheduleConflictMessage } from "@/lib/schedule-conflicts"
import type { ScheduleIssue } from "@/lib/schedule-health"
import type { MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from "@/lib/types"

const DAY_SECONDS = 86400
const SNAP_SECONDS = 300
const HOUR_HEIGHT = 84

type Selection = {
  start: number
  end: number
}

export function ScheduleTimeline({
  blocks,
  schedule,
  date,
  nowSeconds,
  issues,
  createBlockAction
}: {
  blocks: ProgramBlock[]
  schedule: ScheduleBundle
  date: string
  nowSeconds: number | null
  issues: ScheduleIssue[]
  createBlockAction: (formData: FormData) => Promise<void>
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const issueMap = useMemo(
    () => new Map(issues.filter((issue) => issue.blockId).map((issue) => [issue.blockId, issue])),
    [issues]
  )
  const selectedRange =
    dragStart !== null && dragEnd !== null ? normalizeSelection(dragStart, dragEnd) : selection

  function secondsFromPointer(clientY: number) {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height)
    return snapSeconds((y / rect.height) * DAY_SECONDS)
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-block-card], [data-create-card]")) return
    const start = secondsFromPointer(event.clientY)
    setSelection(null)
    setDragStart(start)
    setDragEnd(Math.min(start + SNAP_SECONDS, DAY_SECONDS))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function updateDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart === null) return
    const next = secondsFromPointer(event.clientY)
    setDragEnd(next === dragStart ? Math.min(next + SNAP_SECONDS, DAY_SECONDS) : next)
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart === null || dragEnd === null) return
    const nextSelection = normalizeSelection(dragStart, dragEnd)
    setSelection(nextSelection)
    setDragStart(null)
    setDragEnd(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <>
      <div className="border-b border-line bg-panel-soft px-4 py-2 text-xs font-semibold text-muted">
        Drag empty timeline space to select a range. Existing blocks stay clickable.
      </div>
      {selection ? (
        <SelectionCreatePanel
          key={`${selection.start}-${selection.end}`}
          selection={selection}
          schedule={schedule}
          action={createBlockAction}
          onCancel={() => setSelection(null)}
        />
      ) : null}
      <div className="max-h-[760px] overflow-auto">
        <div className="relative min-w-[680px]">
          <div className="grid" style={{ gridTemplateColumns: "72px minmax(0, 1fr)" }}>
            <div>
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="border-b border-r border-line bg-panel-soft px-3 py-2 text-xs font-semibold text-muted last:border-b-0"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            <div
              ref={trackRef}
              className="relative cursor-crosshair touch-none select-none"
              style={{ height: HOUR_HEIGHT * 24 }}
              onPointerDown={startDrag}
              onPointerMove={updateDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => {
                setDragStart(null)
                setDragEnd(null)
              }}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <div
                  key={hour}
                  className="border-b border-line last:border-b-0"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <div className="h-1/2 border-b border-dashed border-line/70" />
                </div>
              ))}
              {nowSeconds !== null ? (
                <div
                  className="absolute left-0 right-0 z-20 border-t-2 border-red-500"
                  style={{ top: `${(nowSeconds / DAY_SECONDS) * 100}%` }}
                >
                  <span className="absolute -top-3 right-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    LIVE
                  </span>
                </div>
              ) : null}
              {blocks.map((block) => {
                const issue = issueMap.get(block.id)
                return (
                  <Link
                    key={block.id}
                    data-block-card
                    href={`/admin/schedule/${date}/blocks/${block.id}`}
                    className={clsx(
                      "absolute left-2 right-2 overflow-hidden rounded-md border px-3 py-2 text-xs shadow-sm transition hover:brightness-95",
                      blockTone(block, issue?.severity)
                    )}
                    style={{
                      top: `${(block.startTimeSeconds / DAY_SECONDS) * 100}%`,
                      height: `${Math.max((block.durationSeconds / DAY_SECONDS) * 100, 1.7)}%`,
                      minHeight: "34px"
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{block.title}</span>
                      <span className="shrink-0">{formatTimecode(block.durationSeconds)}</span>
                    </span>
                    <span className="mt-0.5 block truncate opacity-80">
                      <PlayoutTime airDate={date} seconds={block.startTimeSeconds} /> ·{" "}
                      {block.blockType} · {blockAssetLabel(schedule, block)}
                    </span>
                  </Link>
                )
              })}
              {selectedRange ? <SelectionHighlight selection={selectedRange} /> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SelectionHighlight({ selection }: { selection: Selection }) {
  const durationSeconds = Math.max(SNAP_SECONDS, selection.end - selection.start)
  const topPercent = (selection.start / DAY_SECONDS) * 100
  const heightPercent = Math.max((durationSeconds / DAY_SECONDS) * 100, 1.7)
  return (
    <div
      className="pointer-events-none absolute left-2 right-2 z-30 rounded-md border border-signal bg-info-soft/85"
      style={{ top: `${topPercent}%`, height: `${heightPercent}%`, minHeight: "34px" }}
    >
      <span className="absolute left-2 top-2 rounded bg-surface px-2 py-0.5 text-[10px] font-semibold text-info-strong shadow-sm">
        {formatPlayoutTimeLabel(selection.start)} to {formatPlayoutTimeLabel(selection.end)}
      </span>
    </div>
  )
}

function SelectionCreatePanel({
  selection,
  schedule,
  action,
  onCancel
}: {
  selection: Selection
  schedule: ScheduleBundle
  action: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const selectionDuration = Math.max(SNAP_SECONDS, selection.end - selection.start)
  const [assetId, setAssetId] = useState("")
  const [slideId, setSlideId] = useState("")
  const [preRollSeconds, setPreRollSeconds] = useState(0)
  const [postRollSeconds, setPostRollSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(selectionDuration)
  const selectedAsset = assetId ? schedule.mediaAssets.find((asset) => asset.id === assetId) : null
  const selectedSlide = slideId ? schedule.slideAssets.find((slide) => slide.id === slideId) : null
  const knownDuration = selectedAsset?.durationSeconds ?? selectedSlide?.defaultDurationSeconds ?? 0
  const minimumDuration = Math.max(1, knownDuration + preRollSeconds + postRollSeconds)
  const effectiveDuration = Math.max(durationSeconds, minimumDuration)
  const dayId = schedule.day?.id ?? ""
  const conflict = dayId
    ? findScheduleConflicts(schedule.blocks, {
        programDayId: dayId,
        startTimeSeconds: selection.start,
        durationSeconds: effectiveDuration
      })
    : { hasConflict: false, conflicts: [], suggestedStartSeconds: null }
  const conflictMessage = scheduleConflictMessage(conflict)

  function setAsset(value: string) {
    setAssetId(value)
    if (value) setSlideId("")
    const assetDuration =
      schedule.mediaAssets.find((asset) => asset.id === value)?.durationSeconds ?? 0
    setDurationSeconds((current) =>
      Math.max(current, assetDuration + preRollSeconds + postRollSeconds)
    )
  }

  function setSlide(value: string) {
    setSlideId(value)
    if (value) setAssetId("")
    const slideDuration =
      schedule.slideAssets.find((slide) => slide.id === value)?.defaultDurationSeconds ?? 0
    setDurationSeconds((current) =>
      Math.max(current, slideDuration + preRollSeconds + postRollSeconds)
    )
  }

  function setPadding(kind: "pre" | "post", value: number) {
    const safeValue = Math.max(0, Number(value) || 0)
    const nextPre = kind === "pre" ? safeValue : preRollSeconds
    const nextPost = kind === "post" ? safeValue : postRollSeconds
    setPreRollSeconds(nextPre)
    setPostRollSeconds(nextPost)
    setDurationSeconds((current) => Math.max(current, knownDuration + nextPre + nextPost))
  }

  return (
    <div className="border-t border-line bg-surface p-4">
      <form
        data-create-card
        action={action}
        className="grid gap-3 text-sm lg:grid-cols-[minmax(0,1.2fr)_116px_116px_130px_160px_160px_auto]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="lg:col-span-7 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Create block</p>
            <p className="mt-0.5 text-xs text-muted">
              {formatPlayoutTimeLabel(selection.start)} to {formatPlayoutTimeLabel(selection.end)}
            </p>
            {knownDuration ? (
              <p className="mt-0.5 text-xs text-muted">
                Min {formatTimecode(minimumDuration)} from selected content
              </p>
            ) : null}
            {conflictMessage ? (
              <p className="mt-1 rounded-md border border-danger-line bg-danger-soft px-2 py-1 text-xs font-semibold text-danger-strong">
                {conflictMessage}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted hover:bg-panel-soft"
          >
            Cancel
          </button>
        </div>
        <input
          name="title"
          required
          defaultValue={`Block ${formatPlayoutTimeLabel(selection.start)}`}
          placeholder="Block title"
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          name="start_time"
          required
          defaultValue={formatTimecode(conflict.suggestedStartSeconds ?? selection.start)}
          title="San Francisco time"
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          name="duration_seconds"
          required
          type="number"
          min={minimumDuration}
          value={effectiveDuration}
          onChange={(event) => setDurationSeconds(Number(event.target.value))}
          className="border border-line px-3 py-2 text-sm"
        />
        <select name="block_type" className="border border-line px-3 py-2 text-sm">
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="slide">Slide</option>
          <option value="ad">Ad</option>
          <option value="promo">Promo</option>
          <option value="fallback">Fallback</option>
        </select>
        <select
          name="asset_id"
          value={assetId}
          onChange={(event) => setAsset(event.target.value)}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="">No asset</option>
          {schedule.mediaAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.title} · {asset.status}
              {asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ""}
            </option>
          ))}
        </select>
        <select
          name="slide_id"
          value={slideId}
          onChange={(event) => setSlide(event.target.value)}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="">No slide</option>
          {schedule.slideAssets.map((slide) => (
            <option key={slide.id} value={slide.id}>
              {slide.title} · {slide.status}
            </option>
          ))}
        </select>
        <input
          name="pre_roll_seconds"
          type="number"
          min="0"
          value={preRollSeconds}
          onChange={(event) => setPadding("pre", Number(event.target.value))}
          placeholder="Before sec"
          className="border border-line px-3 py-2 text-sm"
        />
        <input
          name="post_roll_seconds"
          type="number"
          min="0"
          value={postRollSeconds}
          onChange={(event) => setPadding("post", Number(event.target.value))}
          placeholder="After sec"
          className="border border-line px-3 py-2 text-sm"
        />
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm lg:col-span-2">
          <input name="hide_overlays" type="checkbox" />
          Hide overlays
        </label>
        <button className="btn-primary lg:col-span-5">
          {conflict.hasConflict ? "Create at suggested safe time" : "Create block"}
        </button>
      </form>
    </div>
  )
}

function normalizeSelection(start: number, end: number): Selection {
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  return {
    start: Math.max(0, Math.min(min, DAY_SECONDS - SNAP_SECONDS)),
    end: Math.min(DAY_SECONDS, Math.max(max, min + SNAP_SECONDS))
  }
}

function snapSeconds(value: number) {
  return Math.max(0, Math.min(DAY_SECONDS, Math.round(value / SNAP_SECONDS) * SNAP_SECONDS))
}

function blockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock) {
  const asset = block.assetId
    ? schedule.mediaAssets.find((item) => item.id === block.assetId)
    : null
  const slide = block.slideId
    ? schedule.slideAssets.find((item) => item.id === block.slideId)
    : null
  return assetLabel(asset, slide)
}

function assetLabel(asset: MediaAsset | null | undefined, slide: SlideAsset | null | undefined) {
  if (asset) return `${asset.title} (${asset.status})`
  if (slide) return `${slide.title} (${slide.status})`
  return "No asset"
}

function blockTone(block: ProgramBlock, issueSeverity?: string) {
  if (issueSeverity === "critical") return "border-danger-line bg-danger-soft text-danger-strong"
  if (issueSeverity === "warning") return "border-warn-line bg-warn-soft text-warn-strong"
  if (block.status !== "ready" && block.status !== "active")
    return "border-line bg-panel text-muted"
  switch (block.blockType) {
    case "ad":
      return "border-info-line bg-info-soft text-info-strong"
    case "promo":
      return "border-signal/30 bg-info-soft text-info-strong"
    case "image":
    case "slide":
      return "border-success-line bg-success-soft text-success-strong"
    case "fallback":
      return "border-warn-line bg-warn-soft text-warn-strong"
    default:
      return "border-line bg-surface text-ink"
  }
}
