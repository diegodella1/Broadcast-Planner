import clsx from "clsx"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AgendaBlockForm } from "@/components/agenda-block-form"
import { AdminShell } from "@/components/admin-shell"
import { RundownEditor } from "@/components/rundown-editor"
import { ScheduleTimeline } from "@/components/schedule-timeline"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import {
  ButtonLink,
  EmptyState,
  Field,
  FormHeader,
  Notice,
  PrimaryActionPanel,
  StatusBanner
} from "@/components/ui"
import { getScheduleForDate } from "@/lib/data"
import { DAY_TEMPLATES } from "@/lib/day-templates"
import {
  archiveProgramBlock,
  bulkUpdateProgramBlockStatus,
  createLongTestSchedule,
  createProgramDayFromTemplate,
  fillProgramBlockContent,
  createProgramBlock,
  duplicateProgramBlock,
  ensureProgramDay,
  moveProgramBlock,
  reorderProgramBlocks,
  resizeProgramBlock,
  updateProgramDayStatus
} from "@/lib/mutations"
import { liveOutputHref } from "@/lib/output-auth"
import { analyzeSchedule } from "@/lib/schedule-health"
import { findActiveSchedule } from "@/lib/scheduler"
import {
  formatPlayoutTimeLabel,
  formatTimecode,
  isoDateInTimezone,
  PLAYOUT_TIMEZONE,
  secondsSinceMidnightInTimezone
} from "@/lib/time"

import type {
  MediaAsset,
  ProgramBlock,
  ProgramStatus,
  ScheduleBundle,
  SlideAsset
} from "@/lib/types"

export default async function ScheduleDatePage({
  params,
  searchParams
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{
    uploaded?: string
    asset?: string
    slide?: string
    q?: string
    kind?: string
    source?: string
    show_name?: string
    month?: string
    year?: string
  }>
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
      hideOverlays: formData.get("hide_overlays") === "on",
      conflictResolution:
        formData.get("conflict_resolution") === "archive_conflicts" ? "archive_conflicts" : "none"
    })
  }
  async function fillBlock(formData: FormData) {
    "use server"
    await fillProgramBlockContent({
      date,
      blockId: String(formData.get("block_id")),
      assetId: String(formData.get("asset_id") || ""),
      slideId: String(formData.get("slide_id") || "")
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
  async function reorderRundown(input: { orderedBlockIds: string[] }) {
    "use server"
    await reorderProgramBlocks({ date, orderedBlockIds: input.orderedBlockIds })
  }
  async function resizeRundownBlock(input: { blockId: string; durationSeconds: number }) {
    "use server"
    await resizeProgramBlock({
      date,
      blockId: input.blockId,
      durationSeconds: input.durationSeconds
    })
  }
  async function moveTimelineBlock(input: { blockId: string; startTimeSeconds: number }) {
    "use server"
    await moveProgramBlock({
      date,
      blockId: input.blockId,
      startTimeSeconds: input.startTimeSeconds
    })
  }
  async function duplicateRundownBlock(input: { blockId: string }) {
    "use server"
    await duplicateProgramBlock({ date, blockId: input.blockId })
  }
  async function archiveRundownBlock(input: { blockId: string }) {
    "use server"
    await archiveProgramBlock({ date, blockId: input.blockId })
  }
  async function bulkSetRundownStatus(input: { blockIds: string[]; status: ProgramStatus }) {
    "use server"
    await bulkUpdateProgramBlockStatus({
      date,
      blockIds: input.blockIds,
      status: input.status
    })
  }
  async function createEmptyDay() {
    "use server"
    await ensureProgramDay(date)
    redirect(`/admin/schedule/${date}`)
  }
  async function setupDayFromTemplate(formData: FormData) {
    "use server"
    await createProgramDayFromTemplate({
      date,
      templateId: String(formData.get("template_id")),
      startTime: String(formData.get("start_time") || "00:00:00")
    })
    redirect(`/admin/schedule/${date}`)
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
  const readyAssets = schedule.mediaAssets.filter(
    (asset) => asset.status === "ready" && asset.assetType !== "music"
  )
  const readySlides = schedule.slideAssets.filter((slide) => slide.status === "ready")
  const firstBlock = blocks[0] ?? null
  const lastBlock = blocks[blocks.length - 1] ?? null
  const lastEnd = lastBlock ? lastBlock.startTimeSeconds + lastBlock.durationSeconds : 0
  if (!schedule.day) {
    return (
      <AdminShell
        title={`Set up ${date}`}
        description="Create this day before adding blocks."
        actions={
          <>
            <ButtonLink href="/admin/calendar" variant="secondary">
              Calendar
            </ButtonLink>
            <ButtonLink href="/admin/assets" variant="secondary">
              Library
            </ButtonLink>
          </>
        }
      >
        <section className="surface-panel p-4">
          <FormHeader
            title="Create schedule day"
            detail="Use a template for draft slots, or start empty and add blocks manually."
          />
          <form
            action={setupDayFromTemplate}
            className="mt-4 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_150px]"
          >
            <Field label="Start">
              <input
                name="start_time"
                defaultValue="00:00:00"
                required
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </Field>
            <Field label="Template">
              <select
                name="template_id"
                defaultValue={DAY_TEMPLATES[0]?.id}
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              >
                {DAY_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn-primary self-end">Create from template</button>
          </form>
          <form action={createEmptyDay} className="mt-3">
            <button className="btn-secondary">Create empty day</button>
          </form>
        </section>
      </AdminShell>
    )
  }
  return (
    <AdminShell
      title={`Schedule ${date}`}
      description="Place ready Library content on the day. Output follows the active schedule."
      actions={
        <>
          <ButtonLink href="/admin/assets" variant="secondary">
            Library
          </ButtonLink>
          <ButtonLink href={liveOutputHref(true)}>Clean output</ButtonLink>
        </>
      }
    >
      {query.uploaded ? <Notice tone="ok">Media uploaded and scheduled.</Notice> : null}
      <PrimaryActionPanel
        eyebrow="Step 2"
        title={
          blocks.length ? "Review the rundown and fill missing content" : "Add the first block"
        }
        detail={
          blocks.length
            ? `${readyBlocks}/${blocks.length} blocks ready · ${formatTimecode(totalScheduledSeconds)} scheduled.`
            : "Choose ready Library content, confirm start time, then save it to the rundown."
        }
        action={
          <a className="btn-primary" href="#add-block">
            Add Block
          </a>
        }
        secondary={
          <ButtonLink href="/admin/output" variant="secondary">
            VLC Output
          </ButtonLink>
        }
      />
      <StatusBanner
        tone={health.criticalCount ? "danger" : health.warnCount ? "warn" : "ok"}
        label="Day readiness"
        title={
          health.criticalCount
            ? `${health.criticalCount} critical blockers`
            : health.warnCount
              ? `${health.warnCount} warnings before air`
              : "Ready to test"
        }
        detail={`${readyBlocks}/${blocks.length} blocks ready · ${formatTimecode(totalScheduledSeconds)} scheduled · ${timezone}`}
        action={
          <>
            <ButtonLink href="/admin/assets" variant="secondary">
              1. Library
            </ButtonLink>
            <ButtonLink href={`/admin/schedule/${date}`} variant="secondary">
              2. Timeline
            </ButtonLink>
            <ButtonLink href="/admin/output" variant="secondary">
              3. Control
            </ButtonLink>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          {schedule.day && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              {schedule.day.timezone}
              <StatusPill status={schedule.day.status} />
            </p>
          )}
        </div>
        <details className="rounded-md border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Day status</summary>
          <form action={setDayStatus} className="mt-3 flex flex-wrap items-center gap-2">
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
        </details>
      </div>

      <section className="mb-5 mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
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

      <FillDayPanel schedule={schedule} blocks={blocks} action={fillBlock} />

      <AgendaBlockForm
        schedule={schedule}
        action={addBlock}
        initialContentValue={initialContentValue(query)}
        initialFilters={initialContentFilters(query)}
      />

      <section className="mb-5 grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="surface-panel min-w-0 overflow-hidden">
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
            moveBlockAction={moveTimelineBlock}
          />
        </div>

        <aside className="grid min-w-0 grid-cols-1 content-start gap-5">
          <section className="surface-panel p-4">
            <h2 className="font-semibold">Library</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Upload videos, images and fallbacks before scheduling them. Ready content appears in
              the main picker.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <Metric label="Ready assets" value={String(readyAssets.length)} tone="ok" />
              <Metric label="Ready slides" value={String(readySlides.length)} tone="ok" />
            </div>
            <div className="mt-4">
              <ButtonLink href="/admin/assets" variant="secondary">
                Open library
              </ButtonLink>
            </div>
          </section>

          <details className="surface-panel p-4">
            <summary className="cursor-pointer font-semibold">Health check</summary>
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
          </details>

          <details className="surface-panel p-4">
            <summary className="cursor-pointer font-semibold">Advanced form</summary>
            <form action={addBlock} className="mt-4 grid grid-cols-1 gap-3">
              <Field label="Show title">
                <input
                  name="title"
                  required
                  placeholder="Show title"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Start time">
                  <input
                    name="start_time"
                    required
                    defaultValue="00:00:00"
                    title="San Francisco time. Tooltip equivalents appear on saved schedule times."
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                  />
                </Field>
                <Field label="Duration seconds" hint="Save expands to media duration when needed.">
                  <input
                    name="duration_seconds"
                    required
                    type="number"
                    min="1"
                    defaultValue="30"
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                  />
                </Field>
              </div>
              <Field label="Block type">
                <select
                  name="block_type"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                  <option value="video">Video show</option>
                  <option value="image">Image plate</option>
                  <option value="slide">System slide</option>
                  <option value="ad">Ad</option>
                  <option value="promo">Promo</option>
                  <option value="fallback">Fallback</option>
                </select>
              </Field>
              <Field label="Media asset">
                <select
                  name="asset_id"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                  <option value="">No asset</option>
                  {schedule.mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {assetOptionLabel(asset)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="System slide">
                <select
                  name="slide_id"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                  <option value="">No slide</option>
                  {schedule.slideAssets.map((slide) => (
                    <option key={slide.id} value={slide.id}>
                      {slide.title} · {slide.status}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <details className="surface-panel mb-5 p-4">
        <summary className="cursor-pointer font-semibold">Advanced grid tools</summary>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
          className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[120px_100px_130px_120px_130px_minmax(0,1fr)_130px]"
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
      </details>

      {blocks.length === 0 ? (
        <div className="surface-panel p-4">
          <EmptyState title="No blocks scheduled">
            Add the first block from the agenda form above.
          </EmptyState>
        </div>
      ) : (
        <RundownEditor
          date={date}
          blocks={blocks}
          schedule={schedule}
          reorderAction={reorderRundown}
          resizeAction={resizeRundownBlock}
          duplicateAction={duplicateRundownBlock}
          archiveAction={archiveRundownBlock}
          bulkStatusAction={bulkSetRundownStatus}
        />
      )}
    </AdminShell>
  )
}

function FillDayPanel({
  schedule,
  blocks,
  action
}: {
  schedule: ScheduleBundle
  blocks: ProgramBlock[]
  action: (formData: FormData) => Promise<void>
}) {
  const fillableBlocks = blocks.filter(blockNeedsContent).sort((a, b) => {
    if (a.status === "draft" && b.status !== "draft") return -1
    if (a.status !== "draft" && b.status === "draft") return 1
    return a.startTimeSeconds - b.startTimeSeconds
  })
  if (!fillableBlocks.length) return null
  return (
    <section className="surface-panel mb-5 overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="eyebrow">Day setup</p>
        <h2 className="mt-1 text-xl font-semibold">Fill this day</h2>
        <p className="mt-1 text-sm text-muted">
          Assign ready Library content to template slots. Filled slots become ready.
        </p>
      </div>
      <div className="divide-y divide-line">
        {fillableBlocks.map((block) => {
          const mediaOptions = mediaOptionsForBlock(schedule.mediaAssets, block)
          const slideOptions =
            block.blockType === "slide"
              ? schedule.slideAssets.filter((slide) => slide.status === "ready")
              : []
          const hasOptions = mediaOptions.length > 0 || slideOptions.length > 0
          return (
            <form
              key={block.id}
              action={action}
              className="grid gap-3 p-4 lg:grid-cols-[130px_minmax(0,1fr)_minmax(0,1.2fr)_140px]"
            >
              <input type="hidden" name="block_id" value={block.id} />
              <div className="text-sm">
                <p className="font-semibold tabular-nums">
                  {formatPlayoutTimeLabel(block.startTimeSeconds)}
                </p>
                <p className="mt-1 text-xs text-muted">{formatTimecode(block.durationSeconds)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{block.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {block.blockType} · {block.status}
                </p>
              </div>
              {block.blockType === "slide" ? (
                <select
                  name="slide_id"
                  required
                  className="border border-line px-3 py-2 text-sm"
                  disabled={!hasOptions}
                >
                  <option value="">Choose ready slide</option>
                  {slideOptions.map((slide) => (
                    <option key={slide.id} value={slide.id}>
                      {slide.title}
                      {slide.defaultDurationSeconds
                        ? ` · ${formatTimecode(slide.defaultDurationSeconds)}`
                        : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  name="asset_id"
                  required
                  className="border border-line px-3 py-2 text-sm"
                  disabled={!hasOptions}
                >
                  <option value="">Choose ready content</option>
                  {mediaOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {assetOptionLabel(asset)}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn-primary self-end" disabled={!hasOptions}>
                Fill slot
              </button>
              {!hasOptions ? (
                <p className="text-sm font-semibold text-warn-strong lg:col-span-4">
                  No ready {block.blockType} content yet. Add it in Library first.
                </p>
              ) : null}
            </form>
          )
        })}
      </div>
    </section>
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

function blockNeedsContent(block: ProgramBlock) {
  if (block.status === "archived") return false
  if (block.blockType === "slide") return block.status === "draft" || !block.slideId
  return block.status === "draft" || !block.assetId
}

function mediaOptionsForBlock(assets: MediaAsset[], block: ProgramBlock) {
  return assets
    .filter(
      (asset) => asset.status === "ready" && assetMatchesBlock(block.blockType, asset.assetType)
    )
    .sort((a, b) => a.title.localeCompare(b.title))
}

function assetMatchesBlock(
  blockType: ProgramBlock["blockType"],
  assetType: MediaAsset["assetType"]
) {
  if (blockType === "video") return assetType === "video"
  if (blockType === "image") return assetType === "image"
  if (blockType === "ad") return assetType === "ad"
  if (blockType === "promo") return assetType === "promo"
  if (blockType === "fallback") return assetType === "fallback"
  return false
}

function assetOptionLabel(asset: MediaAsset) {
  const showName =
    typeof asset.metadata?.vimeo_show_name === "string"
      ? `${asset.metadata.vimeo_show_name} · `
      : ""
  return `${showName}${asset.title} · ${asset.sourceType} · ${asset.status}${
    asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ""
  }`
}

function initialContentValue(query: { asset?: string; slide?: string }) {
  if (query.asset) return `asset:${query.asset}`
  if (query.slide) return `slide:${query.slide}`
  return undefined
}

function initialContentFilters(query: {
  q?: string
  kind?: string
  source?: string
  show_name?: string
  month?: string
  year?: string
}) {
  return {
    query: query.q,
    kind: normalizeScheduleKind(query.kind),
    source: query.source,
    showName: query.show_name,
    month: query.month,
    year: query.year
  }
}

function normalizeScheduleKind(kind?: string) {
  if (kind === "videos") return "video"
  if (kind === "graphics" || kind === "images") return "image"
  if (kind === "slides") return "slide"
  if (kind === "all") return undefined
  return kind
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
