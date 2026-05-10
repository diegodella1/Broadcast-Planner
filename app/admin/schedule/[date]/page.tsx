import clsx from "clsx"
import Link from "next/link"

import { AdminShell } from "@/components/admin-shell"
import { MediaUploadForm } from "@/components/media-upload-form"
import { PlayoutTime } from "@/components/playout-time"
import { ScheduleTimeline } from "@/components/schedule-timeline"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { ButtonLink, EmptyState, FormHeader, Notice } from "@/components/ui"
import { getScheduleForDate } from "@/lib/data"
import { createLongTestSchedule, createProgramBlock, updateProgramDayStatus } from "@/lib/mutations"
import { analyzeSchedule } from "@/lib/schedule-health"
import { findActiveSchedule } from "@/lib/scheduler"
import {
  formatPlayoutTimeLabel,
  formatTimecode,
  isoDateInTimezone,
  PLAYOUT_TIMEZONE,
  secondsSinceMidnightInTimezone
} from "@/lib/time"

import type { MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from "@/lib/types"

export default async function ScheduleDatePage({
  params,
  searchParams
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ uploaded?: string }>
}) {
  const { date } = await params
  const query = await searchParams
  const schedule = await getScheduleForDate(date)
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
      preRollSeconds: Number(formData.get("pre_roll_seconds") || 0),
      postRollSeconds: Number(formData.get("post_roll_seconds") || 0),
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
  const timezone = schedule.day?.timezone ?? PLAYOUT_TIMEZONE
  const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone)
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
      title={`Programming day ${date}`}
      description="Operational schedule by time, media, continuity and pre-air warnings."
      actions={<ButtonLink href="/output/live?debug=true">Open live output</ButtonLink>}
    >
      {query.uploaded ? <Notice tone="ok">Media uploaded and scheduled.</Notice> : null}
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
              Allow warnings
            </label>
            <button name="status" value="draft" className="btn-secondary">
              Draft
            </button>
            <button name="status" value="ready" className="btn-secondary">
              Ready
            </button>
            <button name="status" value="active" className="btn-primary">
              Active
            </button>
          </form>
        </div>
      </div>

      <section className="mb-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <StatusPanel
          title={isToday ? "Now" : "Selected day"}
          tone={active?.block ? "ok" : isToday ? "danger" : "neutral"}
          primary={active?.block?.title ?? (isToday ? "No active block" : date)}
          meta={
            active?.block
              ? `${formatTimecode(active.elapsedInBlock)} / ${formatTimecode(active.block.durationSeconds)}`
              : isToday
                ? (active?.reason ?? "Outside scheduled window")
                : "Offline planning view"
          }
          detail={
            active?.asset?.title ?? active?.slide?.title ?? active?.fallbackAsset?.title ?? null
          }
        />
        <StatusPanel
          title="Next"
          tone={nextBlock ? "neutral" : isToday ? "warn" : "neutral"}
          primary={
            nextBlock?.title ?? (isToday ? "No next block" : (firstBlock?.title ?? "No blocks"))
          }
          meta={
            nextBlock
              ? `Starts ${formatPlayoutTimeLabel(nextBlock.startTimeSeconds)}`
              : firstBlock
                ? `First ${formatPlayoutTimeLabel(firstBlock.startTimeSeconds)}`
                : "Empty schedule"
          }
          detail={nextBlock ? blockAssetLabel(schedule, nextBlock) : null}
        />
        <StatusPanel
          title="Coverage"
          tone={health.criticalCount ? "danger" : health.warnCount ? "warn" : "ok"}
          primary={`${formatTimecode(totalScheduledSeconds)} loaded`}
          meta={`${readyBlocks}/${blocks.length} blocks ready`}
          detail={
            firstBlock && lastBlock
              ? `${formatPlayoutTimeLabel(firstBlock.startTimeSeconds)} to ${formatPlayoutTimeLabel(lastEnd)}`
              : "No coverage"
          }
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="surface-panel min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-semibold">Daily timeline</h2>
              <p className="mt-1 text-sm text-muted">
                Hourly blocks with proportional duration and continuity warnings.
              </p>
            </div>
            {health.issues.length ? (
              <span className="rounded-full border border-warn-line bg-warn-soft px-3 py-1 text-xs font-semibold text-warn-strong">
                {health.issues.length} alerts
              </span>
            ) : (
              <span className="rounded-full border border-success-line bg-success-soft px-3 py-1 text-xs font-semibold text-success-strong">
                No alerts
              </span>
            )}
          </div>
          <ScheduleTimeline
            blocks={blocks}
            schedule={schedule}
            date={date}
            nowSeconds={isToday ? nowSeconds : null}
            issues={health.issues}
            createBlockAction={addBlock}
          />
        </div>

        <aside className="grid gap-5 content-start">
          <MediaUploadForm
            action="/api/assets/upload-schedule"
            title="Upload and schedule"
            detail="Add an image or short video directly to this day. Blank or 0 seconds uses detected video duration; images default to 25 seconds."
            submitLabel="Upload and schedule"
            returnTo={`/admin/schedule/${date}?uploaded=1`}
            includeAudio={false}
            scheduleDate={date}
          />

          <section className="surface-panel p-4">
            <h2 className="font-semibold">Health check</h2>
            <div className="mt-4 grid gap-3">
              <Metric
                label="Gaps"
                value={String(health.gaps.length)}
                tone={health.gaps.length ? "warn" : "ok"}
              />
              <Metric
                label="Overlaps"
                value={String(health.overlaps.length)}
                tone={health.overlaps.length ? "danger" : "ok"}
              />
              <Metric
                label="Missing assets"
                value={String(health.missingAssets.length)}
                tone={health.missingAssets.length ? "danger" : "ok"}
              />
              <Metric
                label="Unready assets"
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
                  <span className="block font-semibold">{issue.title}</span>
                  <span className="text-xs opacity-80">{issue.detail}</span>
                </Link>
              ))}
              {health.issues.length === 0 && (
                <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
                  No conflicts detected for this schedule.
                </p>
              )}
            </div>
          </section>

          <details className="surface-panel p-4">
            <summary className="cursor-pointer font-semibold">Add block</summary>
            <form action={addBlock} className="mt-4 grid gap-3">
              <input
                name="title"
                required
                placeholder="Block title"
                className="border border-line px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="start_time"
                  required
                  defaultValue="00:00:00"
                  title="San Francisco time. Tooltip equivalents appear on saved schedule times."
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
                <option value="">No asset</option>
                {schedule.mediaAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title} · {asset.status}
                    {asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ""}
                  </option>
                ))}
              </select>
              <select name="slide_id" className="border border-line px-3 py-2 text-sm">
                <option value="">No slide</option>
                {schedule.slideAssets.map((slide) => (
                  <option key={slide.id} value={slide.id}>
                    {slide.title} · {slide.status}
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  name="pre_roll_seconds"
                  type="number"
                  min="0"
                  defaultValue="0"
                  placeholder="Before sec"
                  className="border border-line px-3 py-2 text-sm"
                />
                <input
                  name="post_roll_seconds"
                  type="number"
                  min="0"
                  defaultValue="0"
                  placeholder="After sec"
                  className="border border-line px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs leading-5 text-muted">
                If the asset or slide has a known duration, save expands the block to at least
                content plus before/after time.
              </p>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm">
                <input name="hide_overlays" type="checkbox" />
                Hide overlays
              </label>
              <button className="btn-primary">Add block</button>
            </form>
          </details>
        </aside>
      </section>

      <section className="surface-panel mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <FormHeader
              title="Long grid generator"
              detail="Create consecutive blocks for long-duration tests with programs, ad breaks and image bumpers."
            />
          </div>
          <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
            Total loaded: <Timecode seconds={totalScheduledSeconds} />
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
            title="San Francisco time"
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
            Replace window
          </label>
          <button className="btn-primary">Generate grid</button>
        </form>
      </section>

      <div className="surface-panel overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[120px_1fr_120px_120px] border-b border-line bg-panel-soft px-4 py-3 text-sm font-semibold text-muted">
            <span>Start</span>
            <span>Block</span>
            <span>Duration</span>
            <span>Status</span>
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
                <PlayoutTime airDate={date} seconds={block.startTimeSeconds} />
                <span>
                  <span className="block font-semibold">{block.title}</span>
                  <span className="text-muted">
                    {block.blockType} · {asset?.title ?? slide?.title ?? "No asset"}
                  </span>
                </span>
                <Timecode seconds={block.durationSeconds} />
                <StatusPill status={block.status} />
              </Link>
            )
          })}
          {blocks.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No blocks scheduled">
                Add the first block or generate a long grid to test continuity.
              </EmptyState>
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
      {detail && (
        <p className="mt-3 truncate rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
          {detail}
        </p>
      )}
    </section>
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

function blockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock) {
  const asset = block.assetId
    ? schedule.mediaAssets.find((item) => item.id === block.assetId)
    : null
  const slide = block.slideId
    ? schedule.slideAssets.find((item) => item.id === block.slideId)
    : null
  return assetLabel(asset, slide)
}

function assetLabel(asset: MediaAsset | null | undefined, slide: SlideAsset | null | undefined) {
  if (asset) return `${asset.title} (${asset.status})`
  if (slide) return `${slide.title} (${slide.status})`
  return "No asset"
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
