import clsx from "clsx"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { AdminShell } from "@/components/admin-shell"
import { NowLine } from "@/components/now-line"
import { OperationsPanel } from "@/components/operations-panel"
import { RundownRow } from "@/components/rundown-row"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { ButtonLink, EmptyState, FormHeader } from "@/components/ui"
import { getScheduleForDate } from "@/lib/data"
import { createLongTestSchedule, createProgramBlock, updateProgramDayStatus } from "@/lib/mutations"
import { analyzeSchedule } from "@/lib/schedule-health"
import { findActiveSchedule } from "@/lib/scheduler"
import {
  createBlockSchema,
  generateLongScheduleSchema,
  parseFormData,
  setDayStatusSchema
} from "@/lib/schemas"
import { formatTimecode, isoDateInTimezone, secondsSinceLocalMidnight } from "@/lib/time"

import type { BlockCategory, ProgramBlock, ScheduleBundle } from "@/lib/types"

export default async function ScheduleDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const [schedule, t, tSchedule, tHealth, tBlock] = await Promise.all([
    getScheduleForDate(date),
    getTranslations(),
    getTranslations("schedule"),
    getTranslations("health"),
    getTranslations("block")
  ])
  const blocks = schedule.blocks.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  async function addBlock(formData: FormData) {
    "use server"
    const data = parseFormData(createBlockSchema, {
      title: formData.get("title"),
      blockType: formData.get("block_type"),
      assetId: formData.get("asset_id") ?? "",
      slideId: formData.get("slide_id") ?? "",
      startTime: formData.get("start_time"),
      durationSeconds: formData.get("duration_seconds"),
      category: formData.get("category") ?? undefined,
      hideOverlays: formData.get("hide_overlays") === "on"
    })
    await createProgramBlock({
      date,
      title: data.title,
      blockType: data.blockType,
      category: data.category as BlockCategory,
      startTime: data.startTime,
      durationSeconds: data.durationSeconds,
      hideOverlays: data.hideOverlays,
      ...(data.assetId !== undefined ? { assetId: data.assetId } : {}),
      ...(data.slideId !== undefined ? { slideId: data.slideId } : {})
    })
  }
  async function generateLongSchedule(formData: FormData) {
    "use server"
    const data = parseFormData(generateLongScheduleSchema, {
      startTime: formData.get("start_time") ?? "00:00:00",
      totalHours: formData.get("total_hours") ?? 12,
      programMinutes: formData.get("program_minutes") ?? 48,
      adBreakMinutes: formData.get("ad_break_minutes") ?? 4,
      imageBumperSeconds: formData.get("image_bumper_seconds") ?? 30,
      replaceWindow: formData.get("replace_window") === "on"
    })
    await createLongTestSchedule({ date, ...data })
  }
  async function setDayStatus(formData: FormData) {
    "use server"
    const data = parseFormData(setDayStatusSchema, {
      status: formData.get("status"),
      allowWarnings: formData.get("allow_warnings") === "on"
    })
    await updateProgramDayStatus({
      date,
      status: data.status,
      allowWarnings: data.allowWarnings
    })
  }
  const totalScheduledSeconds = blocks.reduce((total, block) => total + block.durationSeconds, 0)
  const timezone = schedule.day?.timezone ?? "America/Argentina/Buenos_Aires"
  const nowSeconds = secondsSinceLocalMidnight(new Date())
  const isToday = date === isoDateInTimezone(new Date(), timezone)
  const active = isToday ? findActiveSchedule(schedule, nowSeconds) : null
  const nextBlock = isToday
    ? (blocks.find(
        (block) =>
          (block.status === "ready" || block.status === "active") &&
          block.startTimeSeconds > nowSeconds
      ) ?? null)
    : null
  const health = analyzeSchedule(schedule, blocks)
  const readyBlocks = blocks.filter(
    (block) => block.status === "ready" || block.status === "active"
  ).length
  const firstBlock = blocks[0] ?? null
  const lastBlock = blocks[blocks.length - 1] ?? null
  const lastEnd = lastBlock ? lastBlock.startTimeSeconds + lastBlock.durationSeconds : 0
  return (
    <AdminShell
      title={tSchedule("title", { date })}
      description={tSchedule("description")}
      actions={
        <ButtonLink href="/output/live?debug=true">{tSchedule("viewOutputLive")}</ButtonLink>
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
            <button name="status" value="draft" className="btn-secondary">
              {tSchedule("status.draft")}
            </button>
            <button name="status" value="ready" className="btn-secondary">
              {tSchedule("status.ready")}
            </button>
            <button name="status" value="active" className="btn-primary">
              {tSchedule("status.active")}
            </button>
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
                ? (active?.reason ?? tSchedule("outOfWindow"))
                : tSchedule("offlineView")
          }
          detail={
            active?.asset?.title ?? active?.slide?.title ?? active?.fallbackAsset?.title ?? null
          }
        />
        <StatusPanel
          title={tSchedule("next")}
          tone={nextBlock ? "neutral" : isToday ? "warn" : "neutral"}
          primary={
            nextBlock?.title ??
            (isToday ? tSchedule("noNextBlock") : (firstBlock?.title ?? tSchedule("noBlocks")))
          }
          meta={
            nextBlock
              ? tSchedule("startsAt", { time: formatTimecode(nextBlock.startTimeSeconds) })
              : firstBlock
                ? tSchedule("firstAt", { time: formatTimecode(firstBlock.startTimeSeconds) })
                : tSchedule("emptyAgenda")
          }
          detail={nextBlock ? nextBlockAssetLabel(schedule, nextBlock) : null}
        />
        <StatusPanel
          title={tSchedule("coverage")}
          tone={health.criticalCount ? "danger" : health.warnCount ? "warn" : "ok"}
          primary={tSchedule("loaded", { time: formatTimecode(totalScheduledSeconds) })}
          meta={tSchedule("blocksReady", { ready: readyBlocks, total: blocks.length })}
          detail={
            firstBlock && lastBlock
              ? tSchedule("rangeAtoB", {
                  start: formatTimecode(firstBlock.startTimeSeconds),
                  end: formatTimecode(lastEnd)
                })
              : tSchedule("noCoverage")
          }
        />
      </section>

      <div className="mb-5 flex gap-6">
        {/* Main column: rundown + health + add-block */}
        <div className="min-w-0 flex-1 grid gap-5 content-start">
          <section className="surface-panel min-w-0">
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
            <Rundown
              blocks={blocks}
              schedule={schedule}
              date={date}
              nowSeconds={isToday ? nowSeconds : null}
              activeBlockId={active?.block?.id ?? null}
              nextBlockId={nextBlock?.id ?? null}
              liveLabel={tBlock("live")}
              nowLabel={tSchedule("now")}
              tBlockCategory={(cat) => tBlock(`category.${cat}` as Parameters<typeof tBlock>[0])}
              tBlockStatus={(status) => tBlock(`status.${status}` as Parameters<typeof tBlock>[0])}
            />
          </section>

          <aside className="grid gap-5 content-start">
            <section className="surface-panel p-4">
              <h2 className="font-semibold">{tHealth("title")}</h2>
              <div className="mt-4 grid gap-3">
                <Metric
                  label={tHealth("metrics.gaps")}
                  value={String(health.gaps.length)}
                  tone={health.gaps.length ? "warn" : "ok"}
                />
                <Metric
                  label={tHealth("metrics.overlaps")}
                  value={String(health.overlaps.length)}
                  tone={health.overlaps.length ? "danger" : "ok"}
                />
                <Metric
                  label={tHealth("metrics.missingAssets")}
                  value={String(health.missingAssets.length)}
                  tone={health.missingAssets.length ? "danger" : "ok"}
                />
                <Metric
                  label={tHealth("metrics.unreadyAssets")}
                  value={String(health.unreadyAssets.length)}
                  tone={health.unreadyAssets.length ? "warn" : "ok"}
                />
              </div>
              <div className="mt-4 grid gap-2">
                {health.issues.slice(0, 8).map((issue) => (
                  <Link
                    key={issue.id}
                    href={
                      issue.blockId
                        ? `/admin/schedule/${date}/blocks/${issue.blockId}`
                        : `/admin/schedule/${date}`
                    }
                    className={clsx(
                      "rounded-md border px-3 py-2 text-sm",
                      issue.severity === "critical"
                        ? "border-danger-line bg-danger-soft text-danger-strong"
                        : "border-warn-line bg-warn-soft text-warn-strong"
                    )}
                  >
                    <span className="block font-semibold">
                      {t(issue.i18n.titleKey as Parameters<typeof t>[0], issue.i18n.titleValues)}
                    </span>
                    <span className="text-xs opacity-80">
                      {t(issue.i18n.detailKey as Parameters<typeof t>[0], issue.i18n.detailValues)}
                    </span>
                  </Link>
                ))}
                {health.issues.length === 0 && (
                  <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
                    {tSchedule("timeline.noConflicts")}
                  </p>
                )}
              </div>
            </section>

            <details className="surface-panel p-4">
              <summary className="cursor-pointer font-semibold">
                {tSchedule("addBlock.title")}
              </summary>
              <form action={addBlock} className="mt-4 grid gap-3">
                <input
                  name="title"
                  required
                  placeholder={tSchedule("addBlock.titlePlaceholder")}
                  className="border border-line px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    name="start_time"
                    required
                    defaultValue="00:00:00"
                    className="border border-line px-3 py-2 text-sm"
                  />
                  <input
                    name="duration_seconds"
                    required
                    type="number"
                    min="1"
                    defaultValue="30"
                    className="border border-line px-3 py-2 text-sm"
                  />
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
                      {asset.title} · {asset.status}
                      {asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ""}
                    </option>
                  ))}
                </select>
                <select name="slide_id" className="border border-line px-3 py-2 text-sm">
                  <option value="">{tSchedule("addBlock.noSlideOption")}</option>
                  {schedule.slideAssets.map((slide) => (
                    <option key={slide.id} value={slide.id}>
                      {slide.title} · {slide.status}
                    </option>
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
        </div>

        {/* Right rail: operations panel */}
        <OperationsPanel />
      </div>

      <section className="surface-panel mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <FormHeader
              title={tSchedule("longGenerator.title")}
              detail={tSchedule("longGenerator.detail")}
            />
          </div>
          <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
            {tSchedule("longGenerator.totalLoaded")} <Timecode seconds={totalScheduledSeconds} />
          </p>
        </div>
        <form
          action={generateLongSchedule}
          className="mt-4 grid gap-3 lg:grid-cols-[120px_100px_130px_120px_130px_1fr_130px]"
        >
          <input
            name="start_time"
            required
            defaultValue="00:00:00"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="total_hours"
            required
            type="number"
            min="1"
            max="24"
            step="0.5"
            defaultValue="12"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="program_minutes"
            required
            type="number"
            min="1"
            defaultValue="48"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="ad_break_minutes"
            required
            type="number"
            min="0"
            max="5"
            defaultValue="4"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="image_bumper_seconds"
            required
            type="number"
            min="0"
            defaultValue="30"
            className="border border-line px-3 py-2 text-sm"
          />
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
                  <span className="text-muted">
                    {block.blockType} · {asset?.title ?? slide?.title ?? t("block.noAsset")}
                  </span>
                </span>
                <Timecode seconds={block.durationSeconds} />
                <StatusPill status={block.status} />
              </Link>
            )
          })}
          {blocks.length === 0 ? (
            <div className="p-4">
              <EmptyState title={tSchedule("table.empty.title")}>
                {tSchedule("table.empty.body")}
              </EmptyState>
            </div>
          ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

function nextBlockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock): string {
  const asset = block.assetId ? schedule.mediaAssets.find((a) => a.id === block.assetId) : null
  const slide = block.slideId ? schedule.slideAssets.find((s) => s.id === block.slideId) : null
  if (asset) return `${asset.title} (${asset.status})`
  if (slide) return `${slide.title} (${slide.status})`
  return ""
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
      {detail && (
        <p className="mt-3 truncate rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
          {detail}
        </p>
      )}
    </section>
  )
}

function Rundown({
  blocks,
  schedule,
  date,
  nowSeconds,
  activeBlockId,
  nextBlockId,
  liveLabel,
  nowLabel,
  tBlockCategory,
  tBlockStatus
}: {
  blocks: ProgramBlock[]
  schedule: ScheduleBundle
  date: string
  nowSeconds: number | null
  activeBlockId: string | null
  nextBlockId: string | null
  liveLabel: string
  nowLabel: string
  tBlockCategory: (cat: BlockCategory) => string
  tBlockStatus: (status: string) => string
}) {
  const NON_DEFAULT_STATUSES = new Set(["draft", "archived"])

  // Determine where to insert the now-line: before the first block that starts >= nowSeconds
  const nowLineIndex =
    nowSeconds !== null ? blocks.findIndex((block) => block.startTimeSeconds >= nowSeconds) : -1

  // If nowSeconds is past all blocks, append at end
  const nowAtEnd = nowSeconds !== null && nowLineIndex === -1 && blocks.length > 0

  return (
    <div className="max-h-[920px] overflow-auto py-3">
      {blocks.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Schedule with no blocks">
            Add the first block or generate a long grid to test continuity.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pr-3">
          {blocks.map((block, index) => {
            const state =
              block.id === activeBlockId ? "active" : block.id === nextBlockId ? "next" : "default"

            const statusLabel = NON_DEFAULT_STATUSES.has(block.status)
              ? tBlockStatus(block.status)
              : null

            const row = (
              <RundownRow
                key={block.id}
                block={block}
                schedule={schedule}
                date={date}
                state={state}
                categoryLabel={tBlockCategory(block.category)}
                liveLabel={liveLabel}
                statusLabel={statusLabel}
              />
            )

            if (nowLineIndex === index) {
              return (
                <div key={`now-before-${block.id}`}>
                  <NowLine label={nowLabel} />
                  {row}
                </div>
              )
            }

            return row
          })}

          {nowAtEnd && <NowLine label={nowLabel} />}
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: "ok" | "warn" | "danger"
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-panel-soft px-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", metricTone(tone))}>
        {value}
      </span>
    </div>
  )
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
