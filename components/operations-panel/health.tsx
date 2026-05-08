import { getTranslations } from "next-intl/server"
import { AlertTriangle, AlertOctagon, Check } from "lucide-react"
import { getLiveSchedule } from "@/lib/data"
import { analyzeSchedule } from "@/lib/schedule-health"
import { isoDateInTimezone } from "@/lib/time"

export async function OperationsPanelHealth() {
  const t = await getTranslations()
  const now = new Date()
  const tz = "America/Argentina/Buenos_Aires"
  const isoDate = isoDateInTimezone(now, tz)
  const bundle = await getLiveSchedule(now)
  const isToday = bundle.day?.airDate === isoDate

  if (!isToday || !bundle.day) {
    return (
      <div aria-live="polite" className="text-xs text-white/40">
        {t("ops.health.idle")}
      </div>
    )
  }

  const health = analyzeSchedule(bundle)
  const issues = health.issues

  if (issues.length === 0) {
    return (
      <ul aria-live="polite" className="space-y-1">
        <li className="flex items-center gap-2 text-xs text-accent-positive">
          <Check size={12} aria-hidden="true" />
          <span>{t("ops.health.allGood")}</span>
        </li>
      </ul>
    )
  }

  return (
    <ul aria-live="polite" className="space-y-1">
      {issues.map((issue, i) => {
        const Icon = issue.severity === "critical" ? AlertOctagon : AlertTriangle
        const tone = issue.severity === "critical" ? "text-negative-red" : "text-warn-amber"
        return (
          <li key={`${issue.kind}-${i}`} className={`flex items-start gap-2 text-xs ${tone}`}>
            <Icon size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="text-white/80">{t(issue.i18n.titleKey, issue.i18n.titleValues)}</span>
          </li>
        )
      })}
    </ul>
  )
}
