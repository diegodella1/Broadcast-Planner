"use client"

import { useTranslations } from "next-intl"
import { useActiveBlock } from "@/app/hooks/useActiveBlock"
import { BlockBadge } from "@/components/block-badge"
import { formatTimecode } from "@/lib/time"

export function OperationsPanelOnAir() {
  const t = useTranslations()
  const { data } = useActiveBlock()
  const active = data?.active ?? null

  if (!active) {
    return (
      <div aria-live="polite" className="text-xs text-white/40">
        {t("schedule.noActiveBlock")}
      </div>
    )
  }

  const pct = Math.min(
    100,
    Math.max(0, Math.round((active.elapsedInBlock / Math.max(1, active.durationSeconds)) * 100))
  )

  return (
    <div aria-live="polite" className="space-y-2">
      <div className="flex items-center gap-2">
        <BlockBadge
          category={active.blockCategory}
          label={t(`block.category.${active.blockCategory}`)}
          size="sm"
        />
        <span className="text-sm text-white/90 truncate">{active.blockTitle}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-sm bg-white/10">
        <div
          className="h-full bg-accent-positive transition-[width]"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/50 tabular-nums">
        <span>{formatTimecode(active.elapsedInBlock)}</span>
        <span>{formatTimecode(active.durationSeconds)}</span>
      </div>
    </div>
  )
}
