import Link from "next/link"
import clsx from "clsx"
import { BlockBadge } from "@/components/block-badge"
import { PlayoutTime } from "@/components/playout-time"
import { formatTimecode } from "@/lib/time"
import { getDurationDisplay } from "@/lib/duration-display"
import type { BlockCategory, ProgramBlock, ScheduleBundle } from "@/lib/types"

type RundownRowState = "active" | "next" | "default"

type Props = {
  block: ProgramBlock
  schedule: ScheduleBundle
  date: string
  state: RundownRowState
  categoryLabel: string
  liveLabel: string
  statusLabel: string | null
}

function cardClasses(state: RundownRowState, isBroadcast: boolean): string {
  const base = "flex-1 rounded-md border p-3 text-sm transition hover:brightness-95"
  if (state === "active") {
    return clsx(base, "bg-surface-selected-positive border-accent-positive shadow-accent-positive-glow")
  }
  if (state === "next") {
    return clsx(
      base,
      "opacity-60",
      isBroadcast ? "border-accent-live bg-surface-elevated-2" : "bg-surface-elevated-2 border-white/10"
    )
  }
  return clsx(
    base,
    isBroadcast ? "border-accent-live bg-surface-elevated-2" : "bg-surface-elevated-2 border-white/10"
  )
}

export function RundownRow({ block, schedule, date, state, categoryLabel, liveLabel, statusLabel }: Props) {
  const asset = block.assetId
    ? schedule.mediaAssets.find((a) => a.id === block.assetId) ?? null
    : null
  const slide = block.slideId
    ? schedule.slideAssets.find((s) => s.id === block.slideId) ?? null
    : null

  const duration = getDurationDisplay({
    durationSeconds: block.durationSeconds ?? null,
    sourceType: asset?.sourceType ?? "remote_mp4"
  })

  const isBroadcast = block.category === "broadcast"
  const subtitleParts: string[] = []
  if (asset) subtitleParts.push(asset.title)
  else if (slide) subtitleParts.push(slide.title)
  if (block.blockType) subtitleParts.push(block.blockType)

  return (
    <div className="flex items-start gap-0">
      {/* Time label */}
      <div className="w-[60px] shrink-0 pt-3.5 text-right pr-3">
        <span className="text-sm font-medium text-white/60 tabular-nums">
          <PlayoutTime airDate={date} seconds={block.startTimeSeconds} />
        </span>
      </div>

      {/* Axis column */}
      <div className="relative flex w-4 shrink-0 flex-col items-center self-stretch">
        <div className="absolute inset-0 flex justify-center">
          <div className="w-px bg-white/10" />
        </div>
        <div className="relative mt-4 h-[7px] w-[7px] rounded-full bg-white/30" />
      </div>

      {/* Card */}
      <div className="flex-1 py-1 pl-3">
        <Link href={`/admin/schedule/${date}/blocks/${block.id}`} className={cardClasses(state, isBroadcast)}>
          {/* Top row: badge + status + duration */}
          <div className="flex flex-wrap items-center gap-2">
            <BlockBadge
              category={block.category as BlockCategory}
              label={categoryLabel}
              size="sm"
            />
            {statusLabel && (
              <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                {statusLabel}
              </span>
            )}
            <span className="ml-auto shrink-0">
              {duration.kind === "live" ? (
                <span className="rounded-sm bg-accent-live px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {liveLabel}
                </span>
              ) : (
                <span className="text-[11px] tabular-nums text-white/40">
                  {formatTimecode(duration.seconds)}
                </span>
              )}
            </span>
          </div>

          {/* Title */}
          <p className="mt-1.5 truncate text-sm font-medium text-white/90">{block.title}</p>

          {/* Subtitle */}
          {subtitleParts.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-white/40">{subtitleParts.join(" · ")}</p>
          )}
        </Link>
      </div>
    </div>
  )
}
