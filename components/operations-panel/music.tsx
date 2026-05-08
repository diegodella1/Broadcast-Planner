"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Volume2, VolumeX } from "lucide-react"

export function OperationsPanelMusic() {
  const t = useTranslations("ops.music")
  const [enabled, setEnabled] = useState(false)
  const [volume, setVolume] = useState(50)

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 text-xs text-white/80">
        <span>{t("enabled")}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-accent-positive"
          aria-label={t("enabled")}
        />
      </label>
      <div className="flex items-center gap-2">
        {enabled ? (
          <Volume2 size={12} className="text-white/60" aria-hidden="true" />
        ) : (
          <VolumeX size={12} className="text-white/30" aria-hidden="true" />
        )}
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          disabled={!enabled}
          aria-label={t("volume")}
          aria-valuenow={volume}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex-1 accent-accent-positive disabled:opacity-30"
        />
        <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">{volume}%</span>
      </div>
    </div>
  )
}
