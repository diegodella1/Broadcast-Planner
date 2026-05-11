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
import { Archive, Copy, GripVertical, Minus, Plus } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"

import { PlayoutTime } from "@/components/playout-time"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { formatTimecode } from "@/lib/time"

import type {
  MediaAsset,
  ProgramBlock,
  ProgramStatus,
  ScheduleBundle,
  SlideAsset
} from "@/lib/types"

type Props = {
  date: string
  blocks: ProgramBlock[]
  schedule: ScheduleBundle
  reorderAction: (input: { orderedBlockIds: string[] }) => Promise<void>
  resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>
  duplicateAction: (input: { blockId: string }) => Promise<void>
  archiveAction: (input: { blockId: string }) => Promise<void>
  bulkStatusAction: (input: { blockIds: string[]; status: ProgramStatus }) => Promise<void>
}

export function RundownEditor({
  date,
  blocks,
  schedule,
  reorderAction,
  resizeAction,
  duplicateAction,
  archiveAction,
  bulkStatusAction
}: Props) {
  const activeBlocks = useMemo(
    () => blocks.filter((block) => block.status !== "archived"),
    [blocks]
  )
  const [orderedIds, setOrderedIds] = useState(activeBlocks.map((block) => block.id))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkStatus, setBulkStatus] = useState<ProgramStatus>("ready")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const blockById = useMemo(
    () => new Map(activeBlocks.map((block) => [block.id, block])),
    [activeBlocks]
  )
  const orderedBlocks = orderedIds.map((id) => blockById.get(id)).filter(Boolean) as ProgramBlock[]

  function run(action: () => Promise<void>, optimistic?: () => void) {
    setMessage(null)
    startTransition(async () => {
      try {
        optimistic?.()
        await action()
        setSelectedIds([])
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
        setOrderedIds(activeBlocks.map((block) => block.id))
      }
    })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedIds.indexOf(String(active.id))
    const newIndex = orderedIds.indexOf(String(over.id))
    const nextIds = arrayMove(orderedIds, oldIndex, newIndex)
    run(
      () => reorderAction({ orderedBlockIds: nextIds }),
      () => setOrderedIds(nextIds)
    )
  }

  function moveByButton(id: string, delta: number) {
    const oldIndex = orderedIds.indexOf(id)
    const newIndex = oldIndex + delta
    if (newIndex < 0 || newIndex >= orderedIds.length) return
    const nextIds = arrayMove(orderedIds, oldIndex, newIndex)
    run(
      () => reorderAction({ orderedBlockIds: nextIds }),
      () => setOrderedIds(nextIds)
    )
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  return (
    <section className="surface-panel mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-semibold">Rundown editor</h2>
          <p className="mt-1 text-sm text-muted">
            Drag reorder, resize, duplicate, archive and bulk status for the programming day.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as ProgramStatus)}
            className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="active">Active</option>
            <option value="archived">Archive</option>
          </select>
          <button
            className="btn-secondary"
            disabled={isPending || selectedIds.length === 0}
            onClick={() =>
              run(() => bulkStatusAction({ blockIds: selectedIds, status: bulkStatus }))
            }
          >
            Apply to {selectedIds.length}
          </button>
        </div>
      </div>
      {message ? (
        <div className="border-b border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-strong">
          {message}
        </div>
      ) : null}
      <div className="min-w-[760px]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            {orderedBlocks.map((block, index) => (
              <SortableRundownRow
                key={block.id}
                block={block}
                date={date}
                schedule={schedule}
                selected={selectedIds.includes(block.id)}
                disabled={isPending}
                canMoveUp={index > 0}
                canMoveDown={index < orderedBlocks.length - 1}
                onSelect={() => toggleSelected(block.id)}
                onMoveUp={() => moveByButton(block.id, -1)}
                onMoveDown={() => moveByButton(block.id, 1)}
                onResize={(durationSeconds) =>
                  run(() => resizeAction({ blockId: block.id, durationSeconds }))
                }
                onDuplicate={() => run(() => duplicateAction({ blockId: block.id }))}
                onArchive={() => run(() => archiveAction({ blockId: block.id }))}
              />
            ))}
          </SortableContext>
        </DndContext>
        {orderedBlocks.length === 0 ? (
          <div className="p-4 text-sm text-muted">No active blocks in this rundown.</div>
        ) : null}
      </div>
    </section>
  )
}

function SortableRundownRow({
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
  onResize,
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
  onResize: (durationSeconds: number) => void
  onDuplicate: () => void
  onArchive: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled
  })
  const asset = block.assetId
    ? schedule.mediaAssets.find((item) => item.id === block.assetId)
    : null
  const slide = block.slideId
    ? schedule.slideAssets.find((item) => item.id === block.slideId)
    : null
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "grid grid-cols-[44px_44px_108px_1fr_170px_132px_220px] items-center gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0",
        isDragging ? "relative z-20 bg-surface shadow-lg" : "bg-panel"
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        aria-label={`Select ${block.title}`}
      />
      <button
        className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-muted"
        disabled={disabled}
        aria-label={`Drag ${block.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="tabular-nums text-muted">
        <PlayoutTime airDate={date} seconds={block.startTimeSeconds} />
      </span>
      <Link href={`/admin/schedule/${date}/blocks/${block.id}`} className="min-w-0 hover:underline">
        <span className="block truncate font-semibold">{block.title}</span>
        <span className="block truncate text-xs text-muted">
          {assetOrSlideLabel(asset, slide)} · {block.blockType} ·{" "}
          {formatTimecode(block.startTimeSeconds)}
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <button
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
          disabled={disabled}
          onClick={() => onResize(Math.max(300, block.durationSeconds - 300))}
          aria-label={`Shorten ${block.title}`}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <span className="w-20 text-center tabular-nums">
          <Timecode seconds={block.durationSeconds} />
        </span>
        <button
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
          disabled={disabled}
          onClick={() => onResize(block.durationSeconds + 300)}
          aria-label={`Lengthen ${block.title}`}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
      <StatusPill status={block.status} />
      <div className="flex items-center justify-end gap-2">
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
          aria-label={`Archive ${block.title}`}
        >
          <Archive size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function assetOrSlideLabel(
  asset: MediaAsset | null | undefined,
  slide: SlideAsset | null | undefined
) {
  if (asset) return asset.title
  if (slide) return slide.title
  return "No asset"
}
