"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

export function OperationsPanelLowerThird() {
  const t = useTranslations("ops.lowerThird")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30"
        aria-label={t("titleLabel")}
      />
      <input
        type="text"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        placeholder={t("subtitlePlaceholder")}
        className="w-full rounded-sm bg-surface-elevated-2 border border-white/10 text-xs text-white/80 px-2 py-1 placeholder:text-white/30"
        aria-label={t("subtitleLabel")}
      />
      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="accent-accent-positive"
        />
        {t("visible")}
      </label>
      {visible && (title || subtitle) && (
        <div className="lower-third-card rounded-sm">
          <div className="lower-third-accent" />
          <div>
            {title && <div className="lower-third-primary text-white">{title}</div>}
            {subtitle && <div className="lower-third-secondary">{subtitle}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
