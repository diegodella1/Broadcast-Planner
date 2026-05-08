import Link from "next/link"
import clsx from "clsx"
import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { ButtonLink, EmptyState, FormHeader } from "@/components/ui"
import { getScheduleForDate } from "@/lib/data"
import { createLongTestSchedule, createProgramBlock, updateProgramDayStatus } from "@/lib/mutations"
import { analyzeSchedule, type ScheduleIssue } from "@/lib/schedule-health"
import { findActiveSchedule } from "@/lib/scheduler"
import { formatTimecode, isoDateInTimezone, secondsSinceLocalMidnight } from "@/lib/time"
import type { MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from "@/lib/types"

export default async function ScheduleDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const [schedule, t, tSchedule, tHealth, tBlock, tActions] = await Promise.all([
    getScheduleForDate(date),
    getTranslations(),
    getTranslations("schedule"),
    getTranslations("health"),
    getTranslations("block"),
    getTranslations("actions")
  ])
  const blocks = schedule.blocks.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  async function addBlock(formData: FormData) {
    "use server"
    await createProgramBlock({
      date,
      title: String(formData.get("title")),
      blockType: String(formData.get("block_type")),
      assetId: String(formData.get("asset_id") || ""),
      slideId: String(formData.get("slide_id") || ""),
      startTime: String(formData.get("start_time")),
      durationSeconds: Number(formData.get("duration_seconds")),
      hideOverlays: formData.get("hide_overlays") === "on"
    })
  }
  async function generateLongSchedule(formData: FormData) {
    "use server"
    await createLongTestSchedule({
      date,
      startTime: String(formData.get("start_time") || "00:00:00"),
      totalHours: Number(formData.get("total_hours") || 12),
      programMinutes: Number(formData.get("program_minutes") || 48),
      adBreakMinutes: Number(formData.get("ad_break_minutes") || 4),
      imageBumperSeconds: Number(formData.get("image_bumper_seconds") || 30),
      replaceWindow: formData.get("replace_window") === "on"
    })
  }
  async function setDayStatus(formData: FormData) {
    "use server"
    await updateProgramDayStatus({
      date,
      status: String(formData.get("status")),
      allowWarnings: formData.get("allow_warnings") === "on"
    })
  }
  const totalScheduledSeconds = blocks.reduce((total, block) => total + block.durationSeconds, 0)
  const timezone = schedule.day?.timezone ?? "America/Argentina/Buenos_Aires"
  const nowSeconds = secondsSinceLocalMidnight(new Date())
  const isToday = date === isoDateInTimezone(new Date(), timezone)
  const active = isToday ? findActiveSchedule(schedule, nowSeconds) : null
  const nextBlock = isToday
    ? blocks.find((block) => (block.status === "ready" || block.status === "active") && block.startTimeSeconds > nowSeconds) ?? null
    : null
  const health = analyzeSchedule(schedule, blocks)
  const readyBlocks = blocks.filter((block) => block.status === "ready" || block.status === "active").length
  const firstBlock = blocks[0] ?? null
  const lastBlock = blocks[blocks.length - 1] ?? null
  const lastEnd = lastBlock ? lastBlock.startTimeSeconds + lastBlock.durationSeconds : 0
  return (
    <AdminShell
      title={tSchedule("title", { date })}
      description={tSchedule("description")}
      actions={
        <ButtonLink href="/output/live?debug=true">
          {tSchedule("viewOutputLive")}
        </ButtonLink>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          {schedule.day && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              {schedule.day.timezone}
              <StatusPill status={schedule.day.status} />
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={setDayStatus} className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium">
              <input name="allow_warnings" type="checkbox" />
              {tSchedule("allowWarnings")}
            </label>
            <button name="status" value="draft" className="btn-secondary">{tSchedule("status.draft")}</button>
            <button name="status" value="ready" className="btn-secondary">{tSchedule("status.ready")}</button>
            <button name="status" value="active" className="btn-primary">{tSchedule("status.active")}</button>
          </form>
        </div>
      </div>

      <section className="mb-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <StatusPanel
          title={isToday ? tSchedule("now") : tSchedule("selectedDay")}
          tone={active?.block ? "ok" : isToday ? "danger" : "neutral"}
          primary={active?.block?.title ?? (isToday ? tSchedule("noActiveBlock") : date)}
          meta={
            active?.block
              ? `${formatTimecode(active.elapsedInBlock)} / ${formatTimecode(active.block.durationSeconds)}`
              : isToday
                ? active?.reason ?? tSchedule("outOfWindow")
                : tSchedule("offlineView")
          }
          detail={active?.asset?.title ?? active?.slide?.title ?? active?.fallbackAsset?.title ?? null}
        />
        <StatusPanel
          title={tSchedule("next")}
          tone={nextBlock ? "neutral" : isToday ? "warn" : "neutral"}
          primary={nextBlock?.title ?? (isToday ? tSchedule("noNextBlock") : firstBlock?.title ?? tSchedule("noBlocks"))}
          meta={
            nextBlock
              ? tSchedule("startsAt", { time: formatTimecode(nextBlock.startTimeSeconds) })
              : firstBlock
                ? tSchedule("firstAt", { time: formatTimecode(firstBlock.startTimeSeconds) })
                : tSchedule("emptyAgenda")
          }
          detail={nextBlock ? blockAssetLabel(schedule, nextBlock) : null}
        />
        <StatusPanel
          title={tSchedule("coverage")}
          tone={health.criticalCount ? "danger" : health.warnCount ? "warn" : "ok"}
          primary={tSchedule("loaded", { time: formatTimecode(totalScheduledSeconds) })}
          meta={tSchedule("blocksReady", { ready: readyBlocks, total: blocks.length })}
          detail={firstBlock && lastBlock ? tSchedule("rangeAtoB", { start: formatTimecode(firstBlock.startTimeSeconds), end: formatTimecode(lastEnd) }) : tSchedule("noCoverage")}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="surface-panel min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-semibold">{tSchedule("timeline.title")}</h2>
              <p className="mt-1 text-sm text-muted">{tSchedule("timeline.description")}</p>
            </div>
            {health.issues.length ? (
              <span className="rounded-full border border-warn-line bg-warn-soft px-3 py-1 text-xs font-semibold text-warn-strong">
                {tSchedule("timeline.alertsCount", { count: health.issues.length })}
              </span>
            ) : (
              <span className="rounded-full border border-success-line bg-success-soft px-3 py-1 text-xs font-semibold text-success-strong">
                {tSchedule("timeline.noAlerts")}
              </span>
            )}
          </div>
          <DailyTimeline blocks={blocks} schedule={schedule} date={date} nowSeconds={isToday ? nowSeconds : null} issues={health.issues} liveLabel={tBlock("live")} />
        </div>

        <aside className="grid gap-5 content-start">
          <section className="surface-panel p-4">
            <h2 className="font-semibold">{tHealth("title")}</h2>
            <div className="mt-4 grid gap-3">
              <Metric label={tHealth("metrics.gaps")} value={String(health.gaps.length)} tone={health.gaps.length ? "warn" : "ok"} />
              <Metric label={tHealth("metrics.overlaps")} value={String(health.overlaps.length)} tone={health.overlaps.length ? "danger" : "ok"} />
              <Metric label={tHealth("metrics.missingAssets")} value={String(health.missingAssets.length)} tone={health.missingAssets.length ? "danger" : "ok"} />
              <Metric label={tHealth("metrics.unreadyAssets")} value={String(health.unreadyAssets.length)} tone={health.unreadyAssets.length ? "warn" : "ok"} />
            </div>
            <div className="mt-4 grid gap-2">
              {health.issues.slice(0, 8).map((issue) => (
                <Link
                  key={issue.id}
                  href={issue.blockId ? `/admin/schedule/${date}/blocks/${issue.blockId}` : `/admin/schedule/${date}`}
                  className={clsx(
                    "rounded-md border px-3 py-2 text-sm",
                    issue.severity === "critical" ? "border-danger-line bg-danger-soft text-danger-strong" : "border-warn-line bg-warn-soft text-warn-strong"
                  )}
                >
                  <span className="block font-semibold">{t(issue.i18n.titleKey as Parameters<typeof t>[0], issue.i18n.titleValues)}</span>
                  <span className="text-xs opacity-80">{t(issue.i18n.detailKey as Parameters<typeof t>[0], issue.i18n.detailValues)}</span>
                </Link>
              ))}
              {health.issues.length === 0 && <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">{tSchedule("timeline.noConflicts")}</p>}
            </div>
          </section>

          <details className="surface-panel p-4">
            <summary className="cursor-pointer font-semibold">{tSchedule("addBlock.title")}</summary>
            <form action={addBlock} className="mt-4 grid gap-3">
              <input name="title" required placeholder={tSchedule("addBlock.titlePlaceholder")} className="border border-line px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="start_time" required defaultValue="00:00:00" className="border border-line px-3 py-2 text-sm" />
                <input name="duration_seconds" required type="number" min="1" defaultValue="30" className="border border-line px-3 py-2 text-sm" />
              </div>
              <select name="block_type" className="border border-line px-3 py-2 text-sm">
                <option value="video">Video</option>
                <option value="image">Image</option>
                <option value="slide">Slide</option>
                <option value="ad">Ad</option>
                <option value="promo">Promo</option>
                <option value="fallback">Fallback</option>
              </select>
              <select name="asset_id" className="border border-line px-3 py-2 text-sm">
                <option value="">{tSchedule("addBlock.noAssetOption")}</option>
                {schedule.mediaAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title} · {asset.status}{asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ""}
                  </option>
                ))}
              </select>
              <select name="slide_id" className="border border-line px-3 py-2 text-sm">
                <option value="">{tSchedule("addBlock.noSlideOption")}</option>
                {schedule.slideAssets.map((slide) => (
                  <option key={slide.id} value={slide.id}>{slide.title} · {slide.status}</option>
                ))}
              </select>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm">
                <input name="hide_overlays" type="checkbox" />
                {tSchedule("addBlock.hideOverlays")}
              </label>
              <button className="btn-primary">{tSchedule("addBlock.submit")}</button>
            </form>
          </details>
        </aside>
      </section>

      <section className="surface-panel mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <FormHeader title={tSchedule("longGenerator.title")} detail={tSchedule("longGenerator.detail")} />
          </div>
          <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
            {tSchedule("longGenerator.totalLoaded")} <Timecode seconds={totalScheduledSeconds} />
          </p>
        </div>
        <form action={generateLongSchedule} className="mt-4 grid gap-3 lg:grid-cols-[120px_100px_130px_120px_130px_1fr_130px]">
          <input name="start_time" required defaultValue="00:00:00" className="border border-line px-3 py-2 text-sm" />
          <input name="total_hours" required type="number" min="1" max="24" step="0.5" defaultValue="12" className="border border-line px-3 py-2 text-sm" />
          <input name="program_minutes" required type="number" min="1" defaultValue="48" className="border border-line px-3 py-2 text-sm" />
          <input name="ad_break_minutes" required type="number" min="0" max="5" defaultValue="4" className="border border-line px-3 py-2 text-sm" />
          <input name="image_bumper_seconds" required type="number" min="0" defaultValue="30" className="border border-line px-3 py-2 text-sm" />
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm">
            <input name="replace_window" type="checkbox" defaultChecked />
            {tSchedule("longGenerator.replaceWindow")}
          </label>
          <button className="btn-primary">{tSchedule("longGenerator.submit")}</button>
        </form>
      </section>

      <div className="surface-panel overflow-x-auto">
        <div className="min-w-[560px]">
        <div className="grid grid-cols-[120px_1fr_120px_120px] border-b border-line bg-panel-soft px-4 py-3 text-sm font-semibold text-muted">
          <span>{tSchedule("table.start")}</span>
          <span>{tSchedule("table.block")}</span>
          <span>{tSchedule("table.duration")}</span>
          <span>{tSchedule("table.status")}</span>
        </div>
        {blocks.map((block) => {
          const asset = schedule.mediaAssets.find((item) => item.id === block.assetId)
          const slide = schedule.slideAssets.find((item) => item.id === block.slideId)
          return (
            <Link
              key={block.id}
              href={`/admin/schedule/${date}/blocks/${block.id}`}
              className="grid grid-cols-[120px_1fr_120px_120px] items-center border-b border-line px-4 py-4 text-sm last:border-b-0 hover:bg-panel-soft"
            >
              <Timecode seconds={block.startTimeSeconds} />
              <span>
                <span className="block font-semibold">{block.title}</span>
                <span className="text-muted">{block.blockType} · {asset?.title ?? slide?.title ?? t("block.noAsset")}</span>
              </span>
              <Timecode seconds={block.durationSeconds} />
              <StatusPill status={block.status} />
            </Link>
          )
        })}
        {blocks.length === 0 ? (
          <div className="p-4">
            <EmptyState title={tSchedule("table.empty.title")}>{tSchedule("table.empty.body")}</EmptyState>
          </div>
        ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

function StatusPanel({
  title,
  primary,
  meta,
  detail,
  tone
}: {
  title: string
  primary: string
  meta: string
  detail: string | null
  tone: "ok" | "warn" | "danger" | "neutral"
}) {
  return (
    <section className={clsx("surface-card p-4", panelTone(tone))}>
      <p className="eyebrow">{title}</p>
      <p className="mt-2 truncate text-xl font-semibold">{primary}</p>
      <p className="mt-1 text-sm text-muted">{meta}</p>
      {detail && <p className="mt-3 truncate rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">{detail}</p>}
    </section>
  )
}

function DailyTimeline({
  blocks,
  schedule,
  date,
  nowSeconds,
  issues,
  liveLabel
}: {
  blocks: ProgramBlock[]
  schedule: ScheduleBundle
  date: string
  nowSeconds: number | null
  issues: ScheduleIssue[]
  liveLabel: string
}) {
  const issueMap = new Map(issues.filter((issue) => issue.blockId).map((issue) => [issue.blockId, issue]))
  return (
    <div className="max-h-[920px] overflow-auto">
      <div className="relative min-w-[680px]">
        {Array.from({ length: 24 }, (_, hour) => {
          const hourStart = hour * 3600
          const segments = blocks.flatMap((block) => timelineSegments(block, hourStart))
          return (
            <div key={hour} className="grid min-h-[84px] grid-cols-[72px_1fr] border-b border-line last:border-b-0">
              <div className="border-r border-line bg-panel-soft px-3 py-2 text-xs font-semibold text-muted">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="relative">
                {nowSeconds !== null && nowSeconds >= hourStart && nowSeconds < hourStart + 3600 ? (
                  <div
                    className="absolute left-0 right-0 z-20 border-t-2 border-accent-live"
                    style={{ top: `${((nowSeconds - hourStart) / 3600) * 100}%` }}
                  >
                    <span className="absolute -top-3 right-2 rounded bg-accent-live px-2 py-0.5 text-[10px] font-semibold text-white">{liveLabel}</span>
                  </div>
                ) : null}
                {segments.map(({ block, top, height }) => {
                  const assetLabel = blockAssetLabel(schedule, block)
                  const issue = issueMap.get(block.id)
                  return (
                    <Link
                      key={`${block.id}-${hour}`}
                      href={`/admin/schedule/${date}/blocks/${block.id}`}
                    className={clsx(
                        "absolute left-2 right-2 overflow-hidden rounded-md border px-3 py-2 text-xs shadow-sm transition hover:brightness-95",
                        blockTone(block, issue)
                      )}
                      style={{ top: `${top}%`, height: `${height}%`, minHeight: "34px" }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{block.title}</span>
                        <span className="shrink-0">{formatTimecode(block.durationSeconds)}</span>
                      </span>
                      <span className="mt-0.5 block truncate opacity-80">
                        {formatTimecode(block.startTimeSeconds)} · {block.blockType} · {assetLabel}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-panel-soft px-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", metricTone(tone))}>{value}</span>
    </div>
  )
}

function timelineSegments(block: ProgramBlock, hourStart: number) {
  const hourEnd = hourStart + 3600
  const blockStart = block.startTimeSeconds
  const blockEnd = block.startTimeSeconds + block.durationSeconds
  const start = Math.max(blockStart, hourStart)
  const end = Math.min(blockEnd, hourEnd)
  if (end <= start) return []
  return [{
    block,
    top: ((start - hourStart) / 3600) * 100,
    height: Math.max(((end - start) / 3600) * 100, 5)
  }]
}

function blockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock) {
  const asset = block.assetId ? schedule.mediaAssets.find((item) => item.id === block.assetId) : null
  const slide = block.slideId ? schedule.slideAssets.find((item) => item.id === block.slideId) : null
  return assetLabel(asset, slide)
}

function assetLabel(asset: MediaAsset | null | undefined, slide: SlideAsset | null | undefined) {
  if (asset) return `${asset.title} (${asset.status})`
  if (slide) return `${slide.title} (${slide.status})`
  return ""
}

function blockTone(block: ProgramBlock, issue?: ScheduleIssue) {
  if (issue?.severity === "critical") return "border-danger-line bg-danger-soft text-danger-strong"
  if (issue?.severity === "warning") return "border-warn-line bg-warn-soft text-warn-strong"
  if (block.status !== "ready" && block.status !== "active") return "border-line bg-panel text-muted"
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

function panelTone(tone: "ok" | "warn" | "danger" | "neutral") {
  switch (tone) {
    case "ok":
      return "border-success-line"
    case "warn":
      return "border-warn-line"
    case "danger":
      return "border-danger-line"
    default:
      return "border-line"
  }
}

function metricTone(tone: "ok" | "warn" | "danger") {
  switch (tone) {
    case "ok":
      return "bg-success-soft text-success-strong"
    case "warn":
      return "bg-warn-soft text-warn-strong"
    case "danger":
      return "bg-danger-soft text-danger-strong"
  }
}
