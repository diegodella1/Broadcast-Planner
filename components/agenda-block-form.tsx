"use client"

import { useMemo, useState } from "react"

import { Notice } from "@/components/ui"
import { findScheduleConflicts, scheduleConflictMessage } from "@/lib/schedule-conflicts"
import { formatPlayoutTimeLabel, formatTimecode } from "@/lib/time"

import type { BlockType, MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from "@/lib/types"

type ContentOption = {
  value: string
  title: string
  kind: "asset" | "slide"
  blockType: BlockType
  durationSeconds: number | null
  meta: string
  assetId?: string
  slideId?: string
}

const DEFAULT_MANUAL_DURATION = 30

export function AgendaBlockForm({
  schedule,
  action,
  initialContentValue
}: {
  schedule: ScheduleBundle
  action: (formData: FormData) => Promise<void>
  initialContentValue?: string | undefined
}) {
  const options = useMemo(() => buildContentOptions(schedule), [schedule])
  const initialOption = options.find((option) => option.value === initialContentValue) ?? options[0]
  const [contentValue, setContentValue] = useState(initialOption?.value ?? "")
  const [startTime, setStartTime] = useState(nextSuggestedStart(schedule.blocks))
  const selected = options.find((option) => option.value === contentValue) ?? null
  const [manualDuration, setManualDuration] = useState(
    String(initialOption?.durationSeconds ?? DEFAULT_MANUAL_DURATION)
  )
  const durationSeconds = Math.max(
    1,
    selected?.durationSeconds ?? Number(manualDuration || DEFAULT_MANUAL_DURATION)
  )
  const startSeconds = parseTimeInput(startTime)
  const endSeconds = Math.min(86400, startSeconds + durationSeconds)
  const conflict =
    schedule.day && selected
      ? findScheduleConflicts(
          schedule.blocks.filter((block) => block.status !== "archived"),
          {
            programDayId: schedule.day.id,
            startTimeSeconds: startSeconds,
            durationSeconds
          }
        )
      : null
  const conflictMessage = conflict ? scheduleConflictMessage(conflict) : ""
  const canSubmit = Boolean(selected) && !conflict?.hasConflict

  function chooseContent(value: string) {
    setContentValue(value)
    const next = options.find((option) => option.value === value)
    setManualDuration(String(next?.durationSeconds ?? DEFAULT_MANUAL_DURATION))
  }

  return (
    <section className="surface-panel mb-5 overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="eyebrow">Programar contenido</p>
        <h2 className="mt-1 text-xl font-semibold">Agregar bloque al día</h2>
        <p className="mt-1 text-sm text-muted">
          Elegí inicio y contenido. Si el archivo tiene duración, el final se calcula solo.
        </p>
      </div>
      <form
        action={action}
        className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[160px_minmax(0,1fr)_160px_150px]"
      >
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Inicio
          <input
            name="start_time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted">
          Contenido
          <select
            required
            value={contentValue}
            onChange={(event) => chooseContent(event.target.value)}
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          >
            {options.length ? null : <option value="">No hay contenido listo</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.title} - {option.meta}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Duración
          <input
            name="duration_seconds"
            required
            type="number"
            min="1"
            value={selected?.durationSeconds ?? manualDuration}
            readOnly={Boolean(selected?.durationSeconds)}
            onChange={(event) => setManualDuration(event.target.value)}
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          />
        </label>
        <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase text-muted">Finaliza</p>
          <p className="mt-1 font-semibold tabular-nums">{formatPlayoutTimeLabel(endSeconds)}</p>
        </div>
        <input type="hidden" name="title" value={selected?.title ?? ""} />
        <input type="hidden" name="block_type" value={selected?.blockType ?? "video"} />
        <input type="hidden" name="asset_id" value={selected?.assetId ?? ""} />
        <input type="hidden" name="slide_id" value={selected?.slideId ?? ""} />
        <input type="hidden" name="pre_roll_seconds" value="0" />
        <input type="hidden" name="post_roll_seconds" value="0" />
        <div className="grid gap-2 lg:col-span-4">
          {selected?.durationSeconds ? (
            <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success-strong">
              Duración automática: {formatTimecode(selected.durationSeconds)}
            </p>
          ) : (
            <p className="rounded-md bg-info-soft px-3 py-2 text-sm font-semibold text-info-strong">
              Este contenido no trae duración. Definí cuántos segundos queda al aire.
            </p>
          )}
          {conflict?.hasConflict ? (
            <Notice tone="warn" title="Ese horario ya está ocupado">
              <div className="flex flex-wrap items-center gap-2">
                <span>{conflictMessage}</span>
                {conflict.suggestedStartSeconds !== null ? (
                  <button
                    type="button"
                    className="btn-secondary min-h-8 px-2"
                    onClick={() => setStartTime(formatTimecode(conflict.suggestedStartSeconds!))}
                  >
                    Usar {formatPlayoutTimeLabel(conflict.suggestedStartSeconds)}
                  </button>
                ) : null}
                {!selected?.durationSeconds &&
                conflict.maxSafeDurationSeconds &&
                conflict.maxSafeDurationSeconds > 0 ? (
                  <button
                    type="button"
                    className="btn-secondary min-h-8 px-2"
                    onClick={() => setManualDuration(String(conflict.maxSafeDurationSeconds))}
                  >
                    Recortar a {formatTimecode(conflict.maxSafeDurationSeconds)}
                  </button>
                ) : null}
              </div>
            </Notice>
          ) : null}
          <button className="btn-primary w-full justify-center" disabled={!canSubmit}>
            Guardar en programación
          </button>
        </div>
      </form>
    </section>
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
  return {
    value: `asset:${asset.id}`,
    title: asset.title,
    kind: "asset",
    blockType: normalizeBlockType(asset.assetType),
    durationSeconds: asset.durationSeconds ?? null,
    meta: `${asset.assetType} / ${asset.sourceType}${asset.durationSeconds ? ` / ${formatTimecode(asset.durationSeconds)}` : ""}`,
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
    slideId: slide.id
  }
}

function normalizeBlockType(assetType: MediaAsset["assetType"]): BlockType {
  if (assetType === "music" || assetType === "overlay") return "video"
  return assetType
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
