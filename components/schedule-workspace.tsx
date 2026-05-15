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
  CalendarDays,
  Copy,
  ExternalLink,
  GripVertical,
  List,
  Pencil,
  Plus,
  Search,
  X
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"

import { PlayoutTime } from "@/components/playout-time"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { findScheduleConflicts, scheduleConflictMessage } from "@/lib/schedule-conflicts"
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
type WorkspaceMode = "rundown" | "calendar"

type InitialContentFilters = {
  query?: string | undefined
  kind?: string | undefined
  showName?: string | undefined
}

const DEFAULT_MANUAL_DURATION = 30

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
  initialContentValue,
  initialFilters
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
  initialContentValue?: string | undefined
  initialFilters?: InitialContentFilters | undefined
}) {
  const activeBlocks = useMemo(
    () => blocks.filter((block) => block.status !== "archived"),
    [blocks]
  )
  const activeIds = useMemo(() => activeBlocks.map((block) => block.id), [activeBlocks])
  const options = useMemo(() => buildContentOptions(schedule), [schedule])
  const initialOption = options.find((option) => option.value === initialContentValue) ?? null
  const [orderedIds, setOrderedIds] = useState(activeIds)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(initialOption ? "add" : "edit")
  const [selectedBlockId, setSelectedBlockId] = useState(activeBlocks[0]?.id ?? "")
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialOption) || activeBlocks.length === 0)
  const [message, setMessage] = useState<string | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("rundown")
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

  function openAdd() {
    setDrawerMode("add")
    setSelectedBlockId("")
    setDrawerOpen(true)
  }

  function openEdit(blockId: string) {
    setDrawerMode("edit")
    setSelectedBlockId(blockId)
    setDrawerOpen(true)
  }

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
    <section className="mb-5 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
      <div className="surface-panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="eyebrow">One-page editor</p>
            <h2 className="mt-1 text-xl font-semibold">Rundown</h2>
            <p className="mt-1 text-sm text-muted">
              {formatScheduleDate(date, schedule.day?.timezone)} ·{" "}
              {schedule.day?.timezone ?? "Schedule timezone"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-h-10 overflow-hidden rounded-md border border-line bg-surface text-sm font-semibold">
              <button
                type="button"
                className={[
                  "flex items-center gap-2 px-3",
                  workspaceMode === "rundown" ? "bg-ink text-white" : "text-muted"
                ].join(" ")}
                onClick={() => setWorkspaceMode("rundown")}
              >
                <List size={15} aria-hidden="true" />
                Rundown
              </button>
              <button
                type="button"
                className={[
                  "flex items-center gap-2 border-l border-line px-3",
                  workspaceMode === "calendar" ? "bg-ink text-white" : "text-muted"
                ].join(" ")}
                onClick={() => setWorkspaceMode("calendar")}
              >
                <CalendarDays size={15} aria-hidden="true" />
                Calendar
              </button>
            </div>
            <button className="btn-primary" type="button" onClick={openAdd}>
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
        {workspaceMode === "calendar" ? (
          <CalendarScheduleView
            date={date}
            schedule={schedule}
            blocks={orderedBlocks}
            selectedBlockId={drawerOpen && drawerMode === "edit" ? selectedBlockId : ""}
            onSelect={openEdit}
            onAdd={openAdd}
          />
        ) : orderedBlocks.length ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={displayOrderedIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-line">
                {orderedBlocks.map((block, index) => (
                  <SortableScheduleRow
                    key={block.id}
                    block={block}
                    date={date}
                    schedule={schedule}
                    selected={drawerOpen && drawerMode === "edit" && selectedBlockId === block.id}
                    disabled={isPending}
                    canMoveUp={index > 0}
                    canMoveDown={index < orderedBlocks.length - 1}
                    onSelect={() => openEdit(block.id)}
                    onMoveUp={() => moveByButton(block.id, -1)}
                    onMoveDown={() => moveByButton(block.id, 1)}
                    onDuplicate={() => run(() => duplicateAction({ blockId: block.id }))}
                    onArchive={() => run(() => archiveAction({ blockId: block.id }))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="p-4">
            <button
              type="button"
              onClick={openAdd}
              className="w-full rounded-md border border-dashed border-accent-positive bg-surface-selected-positive px-4 py-8 text-center"
            >
              <span className="block text-lg font-semibold text-accent-positive">
                Add the first block
              </span>
              <span className="mt-1 block text-sm text-muted">
                Choose ready Library content and set the on-air time.
              </span>
            </button>
          </div>
        )}
      </div>

      <aside className="min-w-0">
        {drawerOpen ? (
          <BlockDrawer
            key={`${drawerMode}-${selectedBlock?.id ?? "new"}-${initialContentValue ?? ""}`}
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
            <button type="button" className="btn-primary mt-4" onClick={openAdd}>
              Add Block
            </button>
          </section>
        )}
      </aside>
    </section>
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
  const [startTime, setStartTime] = useState(block?.startTime ?? nextSuggestedStart(blocks))
  const [duration, setDuration] = useState(
    String(block?.durationSeconds ?? initialOption?.durationSeconds ?? DEFAULT_MANUAL_DURATION)
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
  const durationSeconds = Math.max(1, Number(duration || DEFAULT_MANUAL_DURATION))
  const startSeconds = parseTimeInput(startTime)
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
  const canSave = Boolean(selected || mode === "edit") && !conflict?.hasConflict

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

        {selected?.durationSeconds ? (
          <p className="rounded-md bg-success-soft px-3 py-2 text-xs font-semibold text-success-strong">
            Duration from content: {formatTimecode(selected.durationSeconds)}
          </p>
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

function SortableScheduleRow({
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
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "grid gap-3 px-4 py-3 text-sm md:grid-cols-[42px_96px_minmax(0,1fr)_130px_120px_190px] md:items-center",
        selected ? "bg-surface-selected-positive" : "bg-panel",
        isDragging ? "relative z-20 shadow-lg" : ""
      ].join(" ")}
    >
      <button
        className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-muted"
        disabled={disabled}
        aria-label={`Drag ${block.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={onSelect} className="text-left tabular-nums text-muted">
        <PlayoutTime airDate={date} seconds={block.startTimeSeconds} />
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <span className="block truncate font-semibold">{block.title}</span>
        <span className="block truncate text-xs text-muted">
          {blockAssetLabel(schedule, block)} · {block.blockType}
        </span>
      </button>
      <button type="button" onClick={onSelect} className="text-left">
        <Timecode seconds={block.durationSeconds} />
      </button>
      <StatusPill status={block.status} />
      <div className="flex flex-wrap items-center justify-end gap-2">
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
  selectedBlockId,
  onSelect,
  onAdd
}: {
  date: string
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  selectedBlockId: string
  onSelect: (blockId: string) => void
  onAdd: () => void
}) {
  if (!blocks.length) {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-md border border-dashed border-accent-positive bg-surface-selected-positive px-4 py-8 text-center"
        >
          <span className="block text-lg font-semibold text-accent-positive">
            Add the first block
          </span>
          <span className="mt-1 block text-sm text-muted">
            {formatScheduleDate(date, schedule.day?.timezone)}
          </span>
        </button>
      </div>
    )
  }

  const firstStart = Math.min(...blocks.map((block) => block.startTimeSeconds))
  const lastEnd = Math.max(...blocks.map((block) => block.startTimeSeconds + block.durationSeconds))
  const startHour = Math.max(0, Math.floor(firstStart / 3600) - 1)
  const endHour = Math.min(24, Math.max(startHour + 2, Math.ceil(lastEnd / 3600) + 1))
  const hourHeight = 72
  const baseSeconds = startHour * 3600
  const totalSeconds = Math.max(3600, (endHour - startHour) * 3600)
  const canvasHeight = Math.max(hourHeight * 2, (totalSeconds / 3600) * hourHeight)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)

  return (
    <div className="bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            {formatScheduleDate(date, schedule.day?.timezone)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Calendar view · {schedule.day?.timezone ?? "schedule timezone"}
          </p>
        </div>
        <button type="button" className="btn-secondary min-h-8 px-2" onClick={onAdd}>
          <Plus size={14} aria-hidden="true" />
          Add Block
        </button>
      </div>
      <div className="max-h-[720px] overflow-y-auto p-4">
        <div
          className="relative border-l border-line"
          style={{ minHeight: `${canvasHeight}px` }}
          aria-label="Calendar schedule"
        >
          {hours.map((hour) => {
            const top = (hour - startHour) * hourHeight
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-line"
                style={{ top }}
              >
                <span className="absolute -left-1 top-2 -translate-x-full pr-3 text-xs font-semibold tabular-nums text-muted">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            )
          })}
          <div className="absolute inset-y-0 left-4 right-0">
            {blocks.map((block) => {
              const top = ((block.startTimeSeconds - baseSeconds) / 3600) * hourHeight
              const height = Math.max(42, (block.durationSeconds / 3600) * hourHeight)
              const selected = selectedBlockId === block.id
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => onSelect(block.id)}
                  className={[
                    "absolute left-0 right-2 overflow-hidden rounded-md border px-3 py-2 text-left text-sm shadow-sm",
                    selected
                      ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                      : "border-line bg-surface text-ink hover:bg-panel-soft"
                  ].join(" ")}
                  style={{ top, height }}
                >
                  <span className="block font-semibold tabular-nums">
                    {formatPlayoutTimeLabel(block.startTimeSeconds)}
                  </span>
                  <span className="block truncate font-semibold">{block.title}</span>
                  <span className="mt-0.5 block truncate text-xs opacity-75">
                    {blockAssetLabel(schedule, block)} · {formatTimecode(block.durationSeconds)}
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
