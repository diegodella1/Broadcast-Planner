"use client"

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react"
import Link from "next/link"
import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"

import { PlayoutTime } from "@/components/playout-time"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import {
  findSameDayGaps,
  findScheduleConflicts,
  scheduleConflictMessage
} from "@/lib/schedule-conflicts"
import { getScheduleLiveState } from "@/lib/schedule-live-state"
import { analyzeSchedule, type ScheduleIssue } from "@/lib/schedule-health"
import { slidePreviewHref } from "@/lib/slide-preview"
import { formatPlayoutTimeLabel, formatTimecode } from "@/lib/time"

import type {
  BlockType,
  MediaAsset,
  ProgramBlock,
  ProgramStatus,
  ScheduleBundle,
  SlideAsset
} from "@/lib/types"

type ContentOption = {
  value: string
  title: string
  kind: "asset" | "slide"
  blockType: BlockType
  durationSeconds: number | null
  meta: string
  searchText: string
  mediaKind?: MediaAsset["mediaKind"] | undefined
  assetType?: MediaAsset["assetType"] | undefined
  showName?: string | undefined
  assetId?: string
  slideId?: string
}

type DrawerMode = "add" | "edit"

type InitialContentFilters = {
  query?: string | undefined
  kind?: string | undefined
  showName?: string | undefined
}

const DEFAULT_MANUAL_DURATION = 30
const DAY_SECONDS = 86400
const CALENDAR_SNAP_SECONDS = 300

export function ScheduleWorkspace({
  date,
  schedule,
  blocks,
  createAction,
  updateAction,
  reorderAction,
  resizeAction,
  duplicateAction,
  archiveAction,
  bulkCreateAction,
  initialContentValue,
  initialFilters,
  createdBlockId,
  initialMessage
}: {
  date: string
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  createAction: (formData: FormData) => Promise<void>
  updateAction: (formData: FormData) => Promise<void>
  reorderAction: (input: { orderedBlockIds: string[] }) => Promise<void>
  resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>
  duplicateAction: (input: { blockId: string }) => Promise<void>
  archiveAction: (input: { blockId: string }) => Promise<void>
  bulkCreateAction: (formData: FormData) => Promise<void>
  initialContentValue?: string | undefined
  initialFilters?: InitialContentFilters | undefined
  createdBlockId?: string | undefined
  initialMessage?: string | undefined
}) {
  const activeBlocks = useMemo(
    () => blocks.filter((block) => block.status !== "archived"),
    [blocks]
  )
  const activeIds = useMemo(() => activeBlocks.map((block) => block.id), [activeBlocks])
  const options = useMemo(() => buildContentOptions(schedule), [schedule])
  const initialOption = options.find((option) => option.value === initialContentValue) ?? null
  const createdBlock = activeBlocks.find((block) => block.id === createdBlockId) ?? null
  const [orderedIds, setOrderedIds] = useState(activeIds)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(
    initialOption || (!createdBlock && activeBlocks.length === 0) ? "add" : "edit"
  )
  const [selectedBlockId, setSelectedBlockId] = useState(
    createdBlock?.id ?? activeBlocks[0]?.id ?? ""
  )
  const [drawerOpen, setDrawerOpen] = useState(
    Boolean(initialOption) || (!createdBlock && activeBlocks.length === 0)
  )
  const [message, setMessage] = useState<string | null>(initialMessage ?? null)
  const [pendingStartTime, setPendingStartTime] = useState<string | null>(null)
  const [pendingDurationSeconds, setPendingDurationSeconds] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const blockById = useMemo(
    () => new Map(activeBlocks.map((block) => [block.id, block])),
    [activeBlocks]
  )
  const displayOrderedIds = useMemo(
    () => [
      ...orderedIds.filter((id) => blockById.has(id)),
      ...activeIds.filter((id) => !orderedIds.includes(id))
    ],
    [activeIds, blockById, orderedIds]
  )
  const orderedBlocks = displayOrderedIds
    .map((id) => blockById.get(id))
    .filter(Boolean) as ProgramBlock[]
  const selectedBlock = blockById.get(selectedBlockId) ?? orderedBlocks[0] ?? null
  const health = useMemo(() => analyzeSchedule(schedule, orderedBlocks), [orderedBlocks, schedule])

  const openAdd = useCallback((startSeconds?: number, durationSeconds?: number) => {
    setDrawerMode("add")
    setSelectedBlockId("")
    setPendingStartTime(typeof startSeconds === "number" ? formatTimecode(startSeconds) : null)
    setPendingDurationSeconds(typeof durationSeconds === "number" ? durationSeconds : null)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback((blockId: string) => {
    setDrawerMode("edit")
    setSelectedBlockId(blockId)
    setPendingStartTime(null)
    setPendingDurationSeconds(null)
    setDrawerOpen(true)
  }, [])

  useEffect(() => {
    function openFromHash() {
      if (window.location.hash === "#add-block") openAdd()
    }

    openFromHash()
    window.addEventListener("hashchange", openFromHash)
    return () => window.removeEventListener("hashchange", openFromHash)
  }, [openAdd])

  useEffect(() => {
    if (!createdBlock) return
    const element = document.getElementById(`block-${createdBlock.id}`)
    if (!element) return
    element.scrollIntoView({ block: "center", behavior: "smooth" })
    window.setTimeout(() => element.focus({ preventScroll: true }), 250)
  }, [createdBlock])

  function run(action: () => Promise<void>, optimistic?: () => void) {
    setMessage(null)
    startTransition(async () => {
      try {
        optimistic?.()
        await action()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
        setOrderedIds(activeIds)
      }
    })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayOrderedIds.indexOf(String(active.id))
    const newIndex = displayOrderedIds.indexOf(String(over.id))
    const nextIds = arrayMove(displayOrderedIds, oldIndex, newIndex)
    run(
      () => reorderAction({ orderedBlockIds: nextIds }),
      () => setOrderedIds(nextIds)
    )
  }

  function moveByButton(id: string, delta: number) {
    const oldIndex = displayOrderedIds.indexOf(id)
    const newIndex = oldIndex + delta
    if (newIndex < 0 || newIndex >= displayOrderedIds.length) return
    const nextIds = arrayMove(displayOrderedIds, oldIndex, newIndex)
    run(
      () => reorderAction({ orderedBlockIds: nextIds }),
      () => setOrderedIds(nextIds)
    )
  }

  return (
    <section
      id="add-block"
      className="mb-5 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]"
    >
      <div className="surface-panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="eyebrow">Day Planner</p>
            <h2 className="mt-1 text-xl font-semibold">Timeline</h2>
            <p className="mt-1 text-sm text-muted">
              {formatScheduleDate(date, schedule.day?.timezone)} ·{" "}
              {schedule.day?.timezone ?? "Schedule timezone"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" type="button" onClick={() => openAdd()}>
              <Plus size={16} aria-hidden="true" />
              Add Block
            </button>
          </div>
        </div>
        {message ? (
          <div className="border-b border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-strong">
            {message}
          </div>
        ) : null}
        {createdBlock ? (
          <CreatedBlockNotice date={date} schedule={schedule} block={createdBlock} />
        ) : null}
        <TimelineSummary schedule={schedule} blocks={orderedBlocks} health={health} />
        <CalendarScheduleView
          date={date}
          schedule={schedule}
          blocks={orderedBlocks}
          issues={health.issues}
          selectedBlockId={drawerOpen && drawerMode === "edit" ? selectedBlockId : ""}
          createdBlockId={createdBlock?.id ?? ""}
          onSelect={openEdit}
          onAdd={openAdd}
        />
        <BulkCardLoopPanel schedule={schedule} action={bulkCreateAction} />
      </div>

      <aside className="min-w-0">
        {drawerOpen ? (
          <BlockDrawer
            key={`${drawerMode}-${selectedBlock?.id ?? "new"}-${initialContentValue ?? ""}-${pendingStartTime ?? ""}-${pendingDurationSeconds ?? ""}`}
            mode={drawerMode}
            date={date}
            schedule={schedule}
            blocks={activeBlocks}
            block={drawerMode === "edit" ? selectedBlock : null}
            options={options}
            createAction={createAction}
            updateAction={updateAction}
            resizeAction={resizeAction}
            archiveAction={archiveAction}
            initialContentValue={drawerMode === "add" ? initialContentValue : undefined}
            initialFilters={drawerMode === "add" ? initialFilters : undefined}
            initialStartTime={drawerMode === "add" ? pendingStartTime : null}
            initialDurationSeconds={drawerMode === "add" ? pendingDurationSeconds : null}
            onClose={() => setDrawerOpen(false)}
          />
        ) : (
          <section className="surface-panel p-4">
            <p className="eyebrow">Editor</p>
            <h2 className="mt-1 text-lg font-semibold">Select a block</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Click a rundown row to edit content, time, duration and status. Use Add Block for new
              content.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={() => openAdd()}>
              Add Block
            </button>
          </section>
        )}
        <RundownControls
          date={date}
          schedule={schedule}
          blocks={orderedBlocks}
          selectedBlockId={drawerOpen && drawerMode === "edit" ? selectedBlockId : ""}
          disabled={isPending}
          sensors={sensors}
          displayOrderedIds={displayOrderedIds}
          onDragEnd={onDragEnd}
          onSelect={openEdit}
          onMoveByButton={moveByButton}
          onDuplicate={(blockId) => run(() => duplicateAction({ blockId }))}
          onArchive={(blockId) => run(() => archiveAction({ blockId }))}
        />
      </aside>
    </section>
  )
}

function TimelineSummary({
  schedule,
  blocks,
  health
}: {
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  health: ReturnType<typeof analyzeSchedule>
}) {
  const programmedSeconds = blocks.reduce((total, block) => total + block.durationSeconds, 0)
  const readyBlocks = blocks.filter(
    (block) => block.status === "ready" || block.status === "active"
  )
  const gaps = schedule.day ? findSameDayGaps(blocks, schedule.day.id) : []
  const nextGap = gaps.find((gap) => gap.durationSeconds >= CALENDAR_SNAP_SECONDS)
  const hasReadyFallback = schedule.mediaAssets.some(
    (asset) => asset.assetType === "fallback" && asset.status === "ready"
  )

  return (
    <div className="grid gap-2 border-b border-line bg-panel-soft p-3 md:grid-cols-5">
      <PlannerStat label="Programmed" value={formatTimecode(programmedSeconds)} />
      <PlannerStat label="Ready" value={`${readyBlocks.length}/${blocks.length}`} />
      <PlannerStat
        label="Next Gap"
        value={nextGap ? `${formatPlayoutTimeLabel(nextGap.startTimeSeconds)}` : "None"}
        tone={nextGap ? "warn" : "ok"}
      />
      <PlannerStat
        label="Issues"
        value={`${health.criticalCount}C / ${health.warnCount}W`}
        tone={health.criticalCount ? "danger" : health.warnCount ? "warn" : "ok"}
      />
      <PlannerStat
        label="Fallback"
        value={hasReadyFallback ? "Ready" : "Missing"}
        tone={hasReadyFallback ? "ok" : "warn"}
      />
    </div>
  )
}

function CreatedBlockNotice({
  date,
  schedule,
  block
}: {
  date: string
  schedule: ScheduleBundle
  block: ProgramBlock
}) {
  return (
    <div
      aria-live="polite"
      className="border-b border-accent-positive bg-surface-selected-positive px-4 py-3 text-sm text-accent-positive"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase">Block Added</p>
          <p className="mt-1 truncate font-semibold text-ink">{block.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {formatBlockRange(block)} · {formatDurationLabel(block.durationSeconds)} ·{" "}
            {blockAssetLabel(schedule, block)}
          </p>
        </div>
        <a
          className="btn-secondary min-h-8 px-2"
          href={`/admin/schedule/${date}/blocks/${block.id}`}
        >
          Advanced Settings
        </a>
      </div>
    </div>
  )
}

function PlannerStat({
  label,
  value,
  tone = "neutral"
}: {
  label: string
  value: string
  tone?: "neutral" | "ok" | "warn" | "danger"
}) {
  const toneClass =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-ink"
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <p className="text-[10px] font-bold uppercase text-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}

function BulkCardLoopPanel({
  schedule,
  action
}: {
  schedule: ScheduleBundle
  action: (formData: FormData) => Promise<void>
}) {
  const readySlides = useMemo(
    () =>
      schedule.slideAssets
        .filter((slide) => slide.status === "ready")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [schedule.slideAssets]
  )
  const [rows, setRows] = useState(() => {
    const first = readySlides[0]
    return [
      {
        key: "row-1",
        slideId: first?.id ?? "",
        durationSeconds: first?.defaultDurationSeconds ?? DEFAULT_MANUAL_DURATION
      }
    ]
  })

  function addRow() {
    const first = readySlides[0]
    setRows((current) => [
      ...current,
      {
        key: `row-${Date.now()}-${current.length}`,
        slideId: first?.id ?? "",
        durationSeconds: first?.defaultDurationSeconds ?? DEFAULT_MANUAL_DURATION
      }
    ])
  }

  function updateRow(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    )
  }

  function moveRow(index: number, delta: number) {
    setRows((current) => {
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= current.length) return current
      return arrayMove(current, index, nextIndex)
    })
  }

  function removeRow(index: number) {
    setRows((current) =>
      current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current
    )
  }

  function chooseSlide(index: number, slideId: string) {
    const slide = readySlides.find((item) => item.id === slideId)
    updateRow(index, {
      slideId,
      durationSeconds:
        slide?.defaultDurationSeconds ?? rows[index]?.durationSeconds ?? DEFAULT_MANUAL_DURATION
    })
  }

  return (
    <details className="border-t border-line bg-panel-soft">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Bulk Cards</summary>
      <form action={action} className="grid gap-4 px-4 pb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Start
            <input
              name="start_time"
              required
              defaultValue="00:00:00"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            End
            <input
              name="end_time"
              required
              defaultValue="01:00:00"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-md border border-line bg-surface px-3 text-sm font-medium">
            <input name="replace_window" type="checkbox" />
            Replace window
          </label>
        </div>

        <div className="grid gap-2">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-md border border-line bg-surface p-2 md:grid-cols-[72px_minmax(0,1fr)_110px_40px]"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md border border-line"
                  onClick={() => moveRow(index, -1)}
                  disabled={index === 0}
                  aria-label="Move card up"
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-md border border-line"
                  onClick={() => moveRow(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label="Move card down"
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>
              <label className="grid gap-1 text-xs font-semibold text-muted">
                Card
                <select
                  name="slide_ids"
                  required
                  value={row.slideId}
                  onChange={(event) => chooseSlide(index, event.target.value)}
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                  {readySlides.map((slide) => (
                    <option key={slide.id} value={slide.id}>
                      {slide.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted">
                Seconds
                <input
                  name="durations"
                  required
                  type="number"
                  min="1"
                  value={row.durationSeconds}
                  onChange={(event) =>
                    updateRow(index, { durationSeconds: Number(event.target.value) || 1 })
                  }
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </label>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center self-end rounded-md border border-line bg-surface"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1}
                aria-label="Remove card"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {!readySlides.length ? (
          <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
            No ready cards. Create ready slides first.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={addRow}
            disabled={!readySlides.length}
          >
            <Plus size={15} aria-hidden="true" />
            Add card
          </button>
          <button className="btn-primary" disabled={!readySlides.length}>
            Create loop
          </button>
        </div>
      </form>
    </details>
  )
}

function BlockDrawer({
  mode,
  date,
  schedule,
  blocks,
  block,
  options,
  createAction,
  updateAction,
  resizeAction,
  archiveAction,
  initialContentValue,
  initialFilters,
  initialStartTime,
  initialDurationSeconds,
  onClose
}: {
  mode: DrawerMode
  date: string
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  block: ProgramBlock | null
  options: ContentOption[]
  createAction: (formData: FormData) => Promise<void>
  updateAction: (formData: FormData) => Promise<void>
  resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>
  archiveAction: (input: { blockId: string }) => Promise<void>
  initialContentValue?: string | undefined
  initialFilters?: InitialContentFilters | undefined
  initialStartTime?: string | null | undefined
  initialDurationSeconds?: number | null | undefined
  onClose: () => void
}) {
  const selectedFromBlock = block ? contentValueForBlock(block) : ""
  const requestedContentValue = initialContentValue || selectedFromBlock
  const initialOption =
    options.find((option) => option.value === requestedContentValue) ??
    (mode === "add" ? (options[0] ?? null) : null)
  const [kind, setKind] = useState<BlockType>(
    (initialFilters?.kind as BlockType | undefined) ??
      (contentKind(initialOption) as BlockType | undefined) ??
      block?.blockType ??
      "video"
  )
  const [query, setQuery] = useState(initialFilters?.query ?? "")
  const [showName, setShowName] = useState(
    initialFilters?.showName ?? initialOption?.showName ?? ""
  )
  const [contentValue, setContentValue] = useState(initialOption?.value ?? "")
  const [title, setTitle] = useState(block?.title ?? initialOption?.title ?? "")
  const [startTime, setStartTime] = useState(
    block?.startTime ?? initialStartTime ?? nextSuggestedStart(blocks)
  )
  const [duration, setDuration] = useState(
    String(
      block?.durationSeconds ??
        initialDurationSeconds ??
        initialOption?.durationSeconds ??
        DEFAULT_MANUAL_DURATION
    )
  )
  const [reutersStreamUrl, setReutersStreamUrl] = useState(
    metadataTextFromBlock(block, "reuters_stream_url")
  )
  const [reutersStreamLabel, setReutersStreamLabel] = useState(
    metadataTextFromBlock(block, "reuters_stream_label") || "Reuters live"
  )
  const [reutersStreamExpiresAt, setReutersStreamExpiresAt] = useState(
    metadataTextFromBlock(block, "reuters_stream_expires_at")
  )
  const [status, setStatus] = useState<ProgramStatus>(block?.status ?? "ready")
  const [conflictResolution, setConflictResolution] = useState<"none" | "archive_conflicts">("none")
  const [isPending, startTransition] = useTransition()
  const availableShows = useMemo(
    () => uniqueSorted(options.map((option) => option.showName)),
    [options]
  )
  const filteredOptions = useMemo(
    () =>
      options.filter((option) => {
        if (contentKind(option) !== kind) return false
        if (query && !option.searchText.includes(query.toLowerCase())) return false
        if (showName && option.showName !== showName) return false
        return true
      }),
    [kind, options, query, showName]
  )
  const selected = options.find((option) => option.value === contentValue) ?? null
  const hiddenBlockType = selected?.blockType ?? block?.blockType ?? kind
  const hiddenAssetId = selected?.assetId ?? (mode === "edit" ? (block?.assetId ?? "") : "")
  const hiddenSlideId = selected?.slideId ?? (mode === "edit" ? (block?.slideId ?? "") : "")
  const hasReutersStream = Boolean(reutersStreamUrl.trim())
  const durationSeconds = Math.max(1, Number(duration || DEFAULT_MANUAL_DURATION))
  const startSeconds = parseTimeInput(startTime)
  const endSeconds = Math.min(DAY_SECONDS, startSeconds + durationSeconds)
  const conflict =
    selected && schedule.day
      ? findScheduleConflicts(blocks, {
          id: block?.id ?? "new",
          programDayId: schedule.day.id,
          startTimeSeconds: startSeconds,
          durationSeconds
        })
      : null
  const conflictMessage = conflict ? scheduleConflictMessage(conflict) : ""
  const canSave = Boolean(selected || mode === "edit" || hasReutersStream) && !conflict?.hasConflict

  function chooseKind(value: BlockType) {
    setKind(value)
    if (value !== "video") setShowName("")
    const next = options.find((option) => contentKind(option) === value)
    if (next) chooseContent(next.value)
  }

  function chooseContent(value: string) {
    const next = options.find((option) => option.value === value) ?? null
    setContentValue(value)
    if (next) {
      setTitle((current) => (mode === "add" || !current ? next.title : current))
      setDuration(String(next.durationSeconds ?? DEFAULT_MANUAL_DURATION))
    }
  }

  return (
    <section className="surface-panel sticky top-32 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">{mode === "add" ? "Add Block" : "Edit Block"}</p>
          <h2 className="mt-1 text-lg font-semibold">
            {mode === "add" ? "Choose content and time" : block?.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface text-muted"
          aria-label="Close editor"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <form action={mode === "add" ? createAction : updateAction} className="grid gap-4 p-4">
        {block ? <input type="hidden" name="block_id" value={block.id} /> : null}
        <input type="hidden" name="pre_roll_seconds" value="0" />
        <input type="hidden" name="post_roll_seconds" value="0" />
        <input type="hidden" name="hide_overlays" value={block?.hideOverlays ? "on" : ""} />
        <input type="hidden" name="fallback_asset_id" value={block?.fallbackAssetId ?? ""} />
        <input type="hidden" name="notes" value={block?.notes ?? ""} />
        <input type="hidden" name="conflict_resolution" value={conflictResolution} />

        <div className="grid grid-cols-3 gap-2">
          {(["video", "slide", "image", "ad", "promo", "fallback"] as BlockType[]).map((item) => (
            <button
              key={item}
              type="button"
              className={kind === item ? "chip-active justify-center" : "chip justify-center"}
              onClick={() => chooseKind(item)}
            >
              {typeLabel(item)}
            </button>
          ))}
        </div>

        <label className="grid gap-1 text-xs font-semibold text-muted">
          Search content
          <span className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title or show"
              className="border border-line px-9 py-2 text-sm font-normal text-ink"
            />
          </span>
        </label>

        {kind === "video" && availableShows.length ? (
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Show
            <select
              value={showName}
              onChange={(event) => setShowName(event.target.value)}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            >
              <option value="">All shows</option>
              {availableShows.map((show) => (
                <option key={show} value={show}>
                  {show}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-line bg-panel-soft p-2">
          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                "rounded-md border px-3 py-2 text-left text-sm",
                selected?.value === option.value
                  ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                  : "border-line bg-surface text-ink hover:bg-panel"
              ].join(" ")}
              onClick={() => chooseContent(option.value)}
            >
              <span className="block truncate font-semibold">{option.title}</span>
              <span className="mt-0.5 block truncate text-xs opacity-75">{option.meta}</span>
            </button>
          ))}
          {!filteredOptions.length ? (
            <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
              No ready content for this filter. Add it in Library first.
            </p>
          ) : null}
        </div>

        <label className="grid gap-1 text-xs font-semibold text-muted">
          Title
          <input
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Start
            <input
              name="start_time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Seconds
            <input
              name="duration_seconds"
              required
              type="number"
              min="1"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </label>
        </div>
        <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-xs font-semibold text-muted">
          <span className="uppercase">Ends automatically</span>
          <span className="mt-1 block text-sm tabular-nums text-ink">
            {formatPlayoutTimeLabel(endSeconds, true)}
            {startSeconds + durationSeconds > DAY_SECONDS ? " (clamped to end of day)" : ""}
          </span>
        </div>

        {selected?.durationSeconds ? (
          <p className="rounded-md bg-success-soft px-3 py-2 text-xs font-semibold text-success-strong">
            Duration from content: {formatTimecode(selected.durationSeconds)}
          </p>
        ) : null}

        {kind === "video" ? (
          <div className="grid gap-3 rounded-md border border-info-line bg-info-soft p-3">
            <p className="text-xs font-semibold text-info-strong">Reuters dynamic stream</p>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              HLS or RTMP URL
              <input
                name="reuters_stream_url"
                value={reutersStreamUrl}
                onChange={(event) => {
                  setReutersStreamUrl(event.target.value)
                  if (event.target.value && !title) setTitle("Reuters live")
                }}
                placeholder="https://...m3u8 or rtmp://..."
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-muted">
                Stream label
                <input
                  name="reuters_stream_label"
                  value={reutersStreamLabel}
                  onChange={(event) => setReutersStreamLabel(event.target.value)}
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-muted">
                Expires at
                <input
                  name="reuters_stream_expires_at"
                  type="datetime-local"
                  value={reutersStreamExpiresAt}
                  onChange={(event) => setReutersStreamExpiresAt(event.target.value)}
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </label>
            </div>
          </div>
        ) : null}

        <label className="grid gap-1 text-xs font-semibold text-muted">
          Status
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProgramStatus)}
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <input type="hidden" name="block_type" value={hiddenBlockType} />
        <input type="hidden" name="asset_id" value={hiddenAssetId} />
        <input type="hidden" name="slide_id" value={hiddenSlideId} />

        {selected?.slideId ? (
          <a className="btn-secondary justify-center" href={slidePreviewHref(selected.slideId)}>
            View Slide
          </a>
        ) : null}

        {conflict?.hasConflict ? (
          <div className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
            <p className="font-semibold">{conflictMessage}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {conflict.suggestedStartSeconds !== null ? (
                <button
                  type="button"
                  className="btn-secondary min-h-8 px-2"
                  onClick={() => setStartTime(formatTimecode(conflict.suggestedStartSeconds!))}
                >
                  Use {formatPlayoutTimeLabel(conflict.suggestedStartSeconds)}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary min-h-8 px-2"
                onClick={() => setConflictResolution("archive_conflicts")}
              >
                Archive conflicts
              </button>
            </div>
          </div>
        ) : null}

        <button
          className="btn-primary justify-center"
          disabled={!canSave && conflictResolution === "none"}
        >
          {mode === "add" ? "Add to Rundown" : "Save Block"}
        </button>
      </form>
      {mode === "edit" && block ? (
        <div className="grid gap-2 border-t border-line p-4">
          <button
            type="button"
            className="btn-secondary justify-center"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await resizeAction({
                  blockId: block.id,
                  durationSeconds: block.durationSeconds + 300
                })
              })
            }
          >
            Add 5 minutes
          </button>
          <button
            type="button"
            className="btn-danger justify-center"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Remove "${block.title}" from the rundown?`)) {
                startTransition(async () => {
                  await archiveAction({ blockId: block.id })
                })
              }
            }}
          >
            Remove from Rundown
          </button>
          <Link
            className="btn-secondary justify-center"
            href={`/admin/schedule/${date}/blocks/${block.id}`}
          >
            <ExternalLink size={15} aria-hidden="true" />
            Advanced Settings
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function RundownControls({
  date,
  schedule,
  blocks,
  selectedBlockId,
  disabled,
  sensors,
  displayOrderedIds,
  onDragEnd,
  onSelect,
  onMoveByButton,
  onDuplicate,
  onArchive
}: {
  date: string
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  selectedBlockId: string
  disabled: boolean
  sensors: ReturnType<typeof useSensors>
  displayOrderedIds: string[]
  onDragEnd: (event: DragEndEvent) => void
  onSelect: (blockId: string) => void
  onMoveByButton: (blockId: string, delta: number) => void
  onDuplicate: (blockId: string) => void
  onArchive: (blockId: string) => void
}) {
  if (!blocks.length) return null
  return (
    <details className="surface-panel mt-4 overflow-hidden" open>
      <summary className="cursor-pointer border-b border-line px-4 py-3 text-sm font-semibold">
        Rundown Controls
      </summary>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={displayOrderedIds} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-line">
            {blocks.map((block, index) => (
              <CompactRundownRow
                key={block.id}
                block={block}
                date={date}
                schedule={schedule}
                selected={selectedBlockId === block.id}
                disabled={disabled}
                canMoveUp={index > 0}
                canMoveDown={index < blocks.length - 1}
                onSelect={() => onSelect(block.id)}
                onMoveUp={() => onMoveByButton(block.id, -1)}
                onMoveDown={() => onMoveByButton(block.id, 1)}
                onDuplicate={() => onDuplicate(block.id)}
                onArchive={() => onArchive(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </details>
  )
}

function CompactRundownRow({
  block,
  date,
  schedule,
  selected,
  disabled,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onArchive
}: {
  block: ProgramBlock
  date: string
  schedule: ScheduleBundle
  selected: boolean
  disabled: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onArchive: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        "grid gap-2 p-3 text-sm",
        selected ? "bg-surface-selected-positive" : "bg-panel",
        isDragging ? "relative z-20 shadow-lg" : ""
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted"
          disabled={disabled}
          aria-label={`Drag ${block.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold">{block.title}</span>
          <span className="block truncate text-xs text-muted">
            <PlayoutTime airDate={date} seconds={block.startTimeSeconds} /> ·{" "}
            <Timecode seconds={block.durationSeconds} /> · {blockAssetLabel(schedule, block)}
          </span>
        </button>
        <StatusPill status={block.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-10">
        <button
          className="btn-secondary min-h-8 px-2"
          disabled={disabled || !canMoveUp}
          onClick={onMoveUp}
        >
          Up
        </button>
        <button
          className="btn-secondary min-h-8 px-2"
          disabled={disabled || !canMoveDown}
          onClick={onMoveDown}
        >
          Down
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
          disabled={disabled}
          onClick={onDuplicate}
          aria-label={`Duplicate ${block.title}`}
        >
          <Copy size={14} aria-hidden="true" />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
          disabled={disabled}
          onClick={onArchive}
          aria-label={`Remove ${block.title}`}
        >
          <Archive size={14} aria-hidden="true" />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
          onClick={onSelect}
          aria-label={`Edit ${block.title}`}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function CalendarScheduleView({
  date,
  schedule,
  blocks,
  issues,
  selectedBlockId,
  createdBlockId,
  onSelect,
  onAdd
}: {
  date: string
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  issues: ScheduleIssue[]
  selectedBlockId: string
  createdBlockId: string
  onSelect: (blockId: string) => void
  onAdd: (startSeconds?: number, durationSeconds?: number) => void
}) {
  const hourHeight = 80
  const canvasHeight = hourHeight * 24
  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hasAutoScrolledRef = useRef(false)
  const timezone = schedule.day?.timezone ?? "America/Los_Angeles"
  const liveState = useScheduleLiveState(date, timezone, blocks)
  const liveTop = liveState.nowSeconds !== null ? (liveState.nowSeconds / 3600) * hourHeight : null
  const gaps = schedule.day ? findSameDayGaps(blocks, schedule.day.id) : []
  const issueMap = new Map(
    issues.filter((issue) => issue.blockId).map((issue) => [issue.blockId, issue])
  )

  useEffect(() => {
    hasAutoScrolledRef.current = false
  }, [date])

  useEffect(() => {
    if (!liveState.isToday || liveTop === null || hasAutoScrolledRef.current) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const target = Math.max(0, liveTop - scroller.clientHeight * 0.35)
    scroller.scrollTo({ top: target, behavior: "smooth" })
    hasAutoScrolledRef.current = true
  }, [liveState.isToday, liveTop])

  function addAtPointer(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-calendar-block]")) return
    if ((event.target as HTMLElement).closest("[data-calendar-gap]")) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    onAdd(snapCalendarSeconds((y / rect.height) * DAY_SECONDS))
  }

  return (
    <div className="bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            {formatScheduleDate(date, schedule.day?.timezone)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Click an empty slot or gap to add content ·{" "}
            {schedule.day?.timezone ?? "schedule timezone"}
          </p>
          {!blocks.length ? (
            <p className="mt-1 text-xs font-semibold text-accent-positive">
              Empty day. Click any time slot to add a block.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatusBadge state={liveState} />
          <button type="button" className="btn-secondary min-h-8 px-2" onClick={() => onAdd()}>
            <Plus size={14} aria-hidden="true" />
            Add Block
          </button>
        </div>
      </div>
      <NowLineDock state={liveState} />
      <div ref={scrollerRef} className="max-h-[720px] overflow-y-auto p-4">
        <div
          className="relative ml-14 border-l border-line"
          style={{ minHeight: `${canvasHeight}px` }}
          aria-label="Calendar schedule"
          data-testid="calendar-schedule-canvas"
          role="button"
          tabIndex={0}
          onClick={addAtPointer}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onAdd()
          }}
        >
          {hours.map((hour) => {
            const top = hour * hourHeight
            return (
              <div key={hour}>
                <div className="absolute left-0 right-0 border-t border-line" style={{ top }}>
                  <span className="absolute -left-2 top-2 -translate-x-full pr-3 text-xs font-semibold tabular-nums text-muted">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-line/60"
                  style={{ top: top + hourHeight / 2 }}
                >
                  <span className="absolute -left-2 top-1 -translate-x-full pr-3 text-[10px] font-semibold tabular-nums text-muted/70">
                    {String(hour).padStart(2, "0")}:30
                  </span>
                </div>
              </div>
            )
          })}
          {liveTop !== null ? (
            <div
              className="pointer-events-none absolute -left-14 right-2 z-40 border-t-2 border-accent-live"
              style={{ top: liveTop }}
              role="separator"
              aria-label={`Live position ${formatPlayoutTimeLabel(liveState.nowSeconds ?? 0, true)}`}
            >
              <span className="absolute -top-3 left-0 inline-flex min-w-12 justify-center rounded bg-accent-live px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                Now
              </span>
              <span className="absolute -top-3 left-16 inline-flex max-w-[calc(100%-4rem)] items-center gap-1 rounded bg-accent-live px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                {formatPlayoutTimeLabel(liveState.nowSeconds ?? 0, true)} ·{" "}
                <span className="truncate">
                  {liveState.activeBlock?.title ?? "No active block"}
                </span>
              </span>
            </div>
          ) : null}
          <div className="absolute inset-y-0 left-4 right-0">
            {gaps
              .filter((gap) => gap.durationSeconds >= CALENDAR_SNAP_SECONDS)
              .map((gap) => {
                const top = (gap.startTimeSeconds / 3600) * hourHeight
                const height = Math.max(34, (gap.durationSeconds / 3600) * hourHeight)
                return (
                  <button
                    key={`${gap.startTimeSeconds}-${gap.durationSeconds}`}
                    type="button"
                    data-calendar-gap
                    onClick={() => onAdd(gap.startTimeSeconds, gap.durationSeconds)}
                    className="absolute left-0 right-2 rounded-md border border-dashed border-warn-line bg-warn-soft/50 px-3 py-2 text-left text-xs text-warn-strong hover:bg-warn-soft"
                    style={{ top, height }}
                  >
                    <span className="block font-semibold">Fill Gap</span>
                    <span className="block truncate tabular-nums">
                      {formatCalendarRange(gap.startTimeSeconds, gap.durationSeconds)} ·{" "}
                      {formatTimecode(gap.durationSeconds)}
                    </span>
                  </button>
                )
              })}
          </div>
          <div className="absolute inset-y-0 left-4 right-0">
            {blocks.map((block) => {
              const top = (block.startTimeSeconds / 3600) * hourHeight
              const height = Math.max(42, (block.durationSeconds / 3600) * hourHeight)
              const selected = selectedBlockId === block.id
              const created = createdBlockId === block.id
              const onAir = liveState.activeBlock?.id === block.id
              const issue = issueMap.get(block.id)
              return (
                <button
                  key={block.id}
                  id={`block-${block.id}`}
                  type="button"
                  data-calendar-block
                  onClick={() => onSelect(block.id)}
                  aria-label={`${created ? "New block: " : "Edit "}${block.title}, ${formatBlockRange(block)}`}
                  className={[
                    "absolute left-0 right-2 overflow-hidden rounded-md border px-3 py-2 text-left text-sm shadow-sm focus-visible:z-30",
                    onAir
                      ? "z-30 border-accent-live bg-surface-selected-positive text-accent-live ring-2 ring-accent-live/60"
                      : created
                        ? "schedule-new-block border-accent-positive bg-surface-selected-positive text-accent-positive ring-2 ring-accent-positive/50"
                        : selected
                          ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                          : issue?.severity === "critical"
                            ? "border-danger-line bg-danger-soft text-danger-strong hover:bg-danger-soft"
                            : issue?.severity === "warning"
                              ? "border-warn-line bg-warn-soft text-warn-strong hover:bg-warn-soft"
                              : "border-line bg-surface text-ink hover:bg-panel-soft",
                    !onAir && (created || selected)
                      ? "z-20"
                      : !onAir && issue?.severity === "critical"
                        ? "z-10"
                        : "",
                    height < 58 ? "py-1.5" : ""
                  ].join(" ")}
                  style={{ top, height }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold tabular-nums">{formatBlockRange(block)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {onAir ? (
                        <span className="rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          On Air
                        </span>
                      ) : null}
                      {created ? (
                        <span className="rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          New
                        </span>
                      ) : null}
                      {issue ? (
                        <span className="rounded border border-current/25 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          {issue.severity}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-semibold text-ink">
                    {block.title}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs opacity-80">
                    <span className="shrink-0 rounded border border-current/20 px-1.5 py-0.5 font-semibold tabular-nums">
                      {formatDurationLabel(block.durationSeconds)}
                    </span>
                    <span className="truncate">{blockAssetLabel(schedule, block)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function NowLineDock({ state }: { state: ReturnType<typeof getScheduleLiveState> }) {
  if (!state.isToday || state.nowSeconds === null) return null

  const isOnAir = Boolean(state.activeBlock)
  return (
    <div
      className={[
        "sticky top-0 z-50 border-b px-4 py-2 shadow-sm",
        isOnAir
          ? "border-accent-live bg-surface-selected-positive text-accent-live"
          : "border-warn-line bg-warn-soft text-warn-strong"
      ].join(" ")}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={[
              "h-2.5 w-2.5 shrink-0 rounded-full",
              isOnAir ? "animate-pulse bg-accent-live" : "bg-warn"
            ].join(" ")}
          />
          <span className="shrink-0 font-bold uppercase tracking-wide">
            Now {formatPlayoutTimeLabel(state.nowSeconds, true)}
          </span>
          <span className="min-w-0 truncate font-semibold text-ink">
            Should be playing: {state.activeBlock?.title ?? "nothing scheduled at this time"}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 font-semibold tabular-nums">
          {state.activeBlock ? (
            <span>
              {formatTimecode(state.elapsedSeconds)} /{" "}
              {formatTimecode(state.activeBlock.durationSeconds)}
            </span>
          ) : null}
          {state.nextBlock ? (
            <span className="text-muted">Next: {state.nextBlock.title}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function useScheduleLiveState(date: string, timezone: string, blocks: ProgramBlock[]) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(new Date()), 0)
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [])

  return useMemo(
    () =>
      now
        ? getScheduleLiveState({ date, timezone, blocks, now })
        : {
            isToday: false,
            nowSeconds: null,
            activeBlock: null,
            elapsedSeconds: 0,
            nextBlock: null
          },
    [blocks, date, now, timezone]
  )
}

function LiveStatusBadge({ state }: { state: ReturnType<typeof getScheduleLiveState> }) {
  if (!state.isToday || state.nowSeconds === null) {
    return (
      <span className="rounded-md border border-line bg-panel-soft px-2 py-1 text-xs font-semibold text-muted">
        Offline planning view
      </span>
    )
  }

  return (
    <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border border-accent-live bg-surface-selected-positive px-2 py-1 text-xs font-semibold text-accent-live">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-live" />
      <span className="truncate">
        On air: {state.activeBlock?.title ?? "No active block"} ·{" "}
        {formatPlayoutTimeLabel(state.nowSeconds, true)}
        {state.activeBlock
          ? ` · ${formatTimecode(state.elapsedSeconds)} / ${formatTimecode(state.activeBlock.durationSeconds)}`
          : ""}
        {state.nextBlock ? ` · Next ${state.nextBlock.title}` : ""}
      </span>
    </span>
  )
}

function snapCalendarSeconds(seconds: number) {
  return Math.max(
    0,
    Math.min(
      DAY_SECONDS - CALENDAR_SNAP_SECONDS,
      Math.round(seconds / CALENDAR_SNAP_SECONDS) * CALENDAR_SNAP_SECONDS
    )
  )
}

function formatBlockRange(block: ProgramBlock) {
  return formatCalendarRange(block.startTimeSeconds, block.durationSeconds)
}

function formatCalendarRange(startTimeSeconds: number, durationSeconds: number) {
  return `${formatPlayoutTimeLabel(startTimeSeconds)} → ${formatPlayoutTimeLabel(
    Math.min(DAY_SECONDS, startTimeSeconds + durationSeconds)
  )}`
}

function formatDurationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

function buildContentOptions(schedule: ScheduleBundle): ContentOption[] {
  const assets = schedule.mediaAssets
    .filter((asset) => asset.status === "ready" && asset.assetType !== "music")
    .map(assetOption)
  const slides = schedule.slideAssets.filter((slide) => slide.status === "ready").map(slideOption)
  return [
    ...assets.sort((a, b) => a.title.localeCompare(b.title)),
    ...slides.sort((a, b) => a.title.localeCompare(b.title))
  ]
}

function assetOption(asset: MediaAsset): ContentOption {
  const showName = metadataText(asset, "vimeo_show_name")
  return {
    value: `asset:${asset.id}`,
    title: asset.title,
    kind: "asset",
    blockType: normalizeBlockType(asset.assetType),
    durationSeconds: asset.durationSeconds ?? null,
    meta: [
      showName,
      asset.assetType,
      asset.sourceType,
      asset.durationSeconds ? formatTimecode(asset.durationSeconds) : null
    ]
      .filter(Boolean)
      .join(" / "),
    searchText: [asset.title, asset.description, asset.sourceType, asset.mediaKind, showName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    mediaKind: asset.mediaKind,
    assetType: asset.assetType,
    showName: showName || undefined,
    assetId: asset.id
  }
}

function slideOption(slide: SlideAsset): ContentOption {
  return {
    value: `slide:${slide.id}`,
    title: slide.title,
    kind: "slide",
    blockType: "slide",
    durationSeconds: slide.defaultDurationSeconds ?? null,
    meta: `slide${slide.defaultDurationSeconds ? ` / ${formatTimecode(slide.defaultDurationSeconds)}` : ""}`,
    searchText: [slide.title, slide.slideType, "slide"].join(" ").toLowerCase(),
    mediaKind: "graphic",
    assetType: "overlay",
    slideId: slide.id
  }
}

function contentKind(option: ContentOption | null | undefined) {
  if (!option) return undefined
  if (option.kind === "slide") return "slide"
  if (option.assetType === "fallback") return "fallback"
  if (option.assetType === "ad") return "ad"
  if (option.assetType === "promo") return "promo"
  if (option.mediaKind === "image" || option.assetType === "image") return "image"
  return "video"
}

function contentValueForBlock(block: ProgramBlock) {
  if (block.assetId) return `asset:${block.assetId}`
  if (block.slideId) return `slide:${block.slideId}`
  return ""
}

function blockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock) {
  const asset = block.assetId
    ? schedule.mediaAssets.find((item) => item.id === block.assetId)
    : null
  const slide = block.slideId
    ? schedule.slideAssets.find((item) => item.id === block.slideId)
    : null
  if (asset) return asset.title
  if (slide) return slide.title
  return "No content"
}

function metadataText(asset: MediaAsset, key: string) {
  const value = asset.metadata?.[key]
  return typeof value === "string" ? value : ""
}

function metadataTextFromBlock(block: ProgramBlock | null, key: string) {
  const value = block?.metadata?.[key]
  return typeof value === "string" ? value : ""
}

function normalizeBlockType(assetType: MediaAsset["assetType"]): BlockType {
  if (assetType === "music" || assetType === "overlay") return "video"
  return assetType
}

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b)
  )
}

function nextSuggestedStart(blocks: ProgramBlock[]) {
  const activeBlocks = blocks
    .filter((block) => block.status !== "archived")
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  const last = activeBlocks[activeBlocks.length - 1]
  return formatTimecode(last ? last.startTimeSeconds + last.durationSeconds : 0)
}

function parseTimeInput(value: string) {
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":")
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  if (!Number.isFinite(total)) return 0
  return Math.max(0, Math.min(total, 86399))
}

function typeLabel(type: BlockType) {
  switch (type) {
    case "ad":
      return "Ad"
    case "promo":
      return "Promo"
    case "fallback":
      return "Fallback"
    case "image":
      return "Image"
    case "slide":
      return "Slide"
    default:
      return "Video"
  }
}

function formatScheduleDate(date: string, timezone?: string) {
  const day = new Date(`${date}T12:00:00`)
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone
  }).format(day)
  return formatted
}
