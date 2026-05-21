import { getTranslations } from "next-intl/server"

import { AdminShell } from "@/components/admin-shell"
import { OutputMonitorPanel } from "@/components/output-monitor-panel"
import { StopBroadcastButton } from "@/components/stop-broadcast-button"
import { ClearStateBadge, StatusBanner } from "@/components/ui"
import { recordAuditEvent } from "@/lib/audit"
import { getLiveSchedule } from "@/lib/data"
import { collectOperatorHealth } from "@/lib/health-checks"
import { updateProgramDayStatus } from "@/lib/mutations"
import {
  clearOutputOverride,
  getActiveOutputOverride,
  setReutersOutputOverride
} from "@/lib/output-overrides"
import { liveOutputHref } from "@/lib/output-auth"
import { findActiveSchedule } from "@/lib/scheduler"
import { createDaySchema } from "@/lib/schemas"
import { secondsSinceMidnightInTimezone, isoDateInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"

export default async function AdminOutputPage() {
  const [t, tOps, liveBundle, healthReport] = await Promise.all([
    getTranslations(),
    getTranslations("ops"),
    getLiveSchedule(),
    collectOperatorHealth()
  ])
  const outputOverride = await getActiveOutputOverride(liveBundle.day?.id)

  const nowSeconds = secondsSinceMidnightInTimezone(new Date())
  const active = findActiveSchedule(liveBundle, nowSeconds)
  const dayStatus = liveBundle.day?.status ?? "draft"
  const isLive = dayStatus === "active" && active.block !== null
  const dayId = liveBundle.day?.id ?? null
  const dayDate = liveBundle.day
    ? isoDateInTimezone(new Date(), liveBundle.day.timezone ?? PLAYOUT_TIMEZONE)
    : null
  const monitorHref = liveOutputHref(true)

  // Status label derivation
  const broadcastStatusLabel = isLive
    ? t("chrome.onAir")
    : dayStatus === "active"
      ? "Paused"
      : "Idle"

  // Source label for active block
  const activeSourceLabel = active.block
    ? (active.asset?.sourceType ?? active.slide?.slideType ?? "—")
    : "—"
  const activeBlockLabel = active.block?.title ?? t("output.fallback.noActiveBlock")
  const outputHref = liveOutputHref(false)
  const initialMonitor = {
    generatedAt: new Date().toISOString(),
    timezone: liveBundle.day?.timezone ?? PLAYOUT_TIMEZONE,
    serverSeconds: secondsSinceMidnightInTimezone(
      new Date(),
      liveBundle.day?.timezone ?? PLAYOUT_TIMEZONE
    ),
    day: liveBundle.day
      ? {
          airDate: liveBundle.day.airDate,
          status: liveBundle.day.status
        }
      : null,
    block: active.block
      ? {
          title: active.block.title,
          status: active.block.status,
          elapsedInBlock: active.elapsedInBlock,
          durationSeconds: active.block.durationSeconds
        }
      : null,
    asset: active.asset
      ? {
          id: active.asset.id,
          title: active.asset.title,
          sourceType: active.asset.sourceType,
          status: active.asset.status,
          lifecycleState: active.asset.lifecycleState ?? "reviewed",
          playbackReadinessStatus: active.asset.playbackReadinessStatus ?? "unchecked",
          playbackError: active.asset.playbackError ?? null
        }
      : null,
    fallback: active.fallbackAsset ? { title: active.fallbackAsset.title } : null,
    fallbackReason: active.reason ?? null,
    override: outputOverride
      ? {
          id: outputOverride.id,
          sourceType: outputOverride.sourceType,
          label: outputOverride.label ?? null,
          streamProtocol: outputOverride.streamProtocol ?? null,
          expiresAt: outputOverride.expiresAt ?? null
        }
      : null,
    mediaError:
      active.asset?.sourceType === "vimeo" && active.asset.playbackReadinessStatus === "failed"
        ? (active.asset.playbackError ?? "Vimeo playback failed")
        : null
  }

  // Server action: stop the broadcast by reverting day status to "ready"
  async function stopBroadcast() {
    "use server"
    if (!dayDate) return
    const parsed = createDaySchema.safeParse({ date: dayDate })
    if (!parsed.success) return
    if (dayId) await clearOutputOverride(dayId)
    await updateProgramDayStatus({
      date: parsed.data.date,
      status: "ready",
      allowWarnings: true
    })
    await recordAuditEvent({
      action: "broadcast.stopped",
      entityType: "program_days",
      entityId: dayId,
      metadata: { date: parsed.data.date }
    })
  }

  async function setReutersOverride(formData: FormData) {
    "use server"
    if (!dayId) return
    await setReutersOutputOverride({
      programDayId: dayId,
      streamUrl: String(formData.get("stream_url") || ""),
      label: String(formData.get("label") || "Reuters live"),
      expiresAt: String(formData.get("expires_at") || "")
    })
  }

  async function clearOverride() {
    "use server"
    if (!dayId) return
    await clearOutputOverride(dayId)
  }

  return (
    <AdminShell title={t("chrome.output")} description={t("schedule.broadcast")}>
      {healthReport.status !== "ok" ? (
        <StatusBanner
          tone={healthReport.status === "fail" ? "danger" : "warn"}
          label="Broadcast health"
          title={healthReport.status === "fail" ? "Production health failing" : "Output degraded"}
          detail="Open Admin Health before handoff or unattended operation."
          action={
            <a className="btn-secondary" href="/admin/health">
              Admin Health
            </a>
          }
        />
      ) : null}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="surface-panel p-5" id="browser-output">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Capture URL</p>
                <h2 className="mt-2 text-2xl font-semibold">Browser output</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Open this page on the capture machine, click Start Output once, then capture the
                  browser window in OBS/vMix.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn-primary" href={outputHref} target="_blank" rel="noreferrer">
                  Open output page
                </a>
                <a className="btn-secondary" href={monitorHref} target="_blank" rel="noreferrer">
                  Debug view
                </a>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <StatusTile label="State" value={broadcastStatusLabel} />
              <StatusTile label="Source" value={activeSourceLabel} />
              <StatusTile label="Block" value={activeBlockLabel} />
            </div>
            <div className="mt-5">
              <OutputMonitorPanel initial={initialMonitor} />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-live px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-live-text">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-live-text"
                  aria-hidden="true"
                />
                {t("chrome.onAir")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" aria-hidden="true" />
                {t("chrome.offAir")}
              </span>
            )}
            <span className="text-xs text-white/40">{activeBlockLabel}</span>
          </div>
        </div>

        <aside
          className="w-full shrink-0 overflow-y-auto rounded-md border border-white/10 bg-surface-elevated-1 lg:w-[320px]"
          aria-label="Operator controls"
        >
          <ControlSection title="Broadcast status">
            <ClearStateBadge tone={isLive ? "ok" : dayStatus === "active" ? "warn" : "info"}>
              {broadcastStatusLabel}
            </ClearStateBadge>
            {active.block && (
              <p className="mt-1 truncate text-[11px] text-white/40">{active.block.title}</p>
            )}
          </ControlSection>

          <ControlSection title="Active source">
            <p className="text-xs font-semibold text-white/80">{activeSourceLabel}</p>
            <p className="mt-1 text-[11px] leading-4 text-white/40">
              Change the active source from the scheduled block when needed.
            </p>
            {outputOverride ? (
              <div className="mt-2 rounded-md border border-info-line bg-info-soft px-2 py-2 text-[11px] text-white/70">
                Override: {outputOverride.label ?? outputOverride.sourceType}
              </div>
            ) : null}
          </ControlSection>

          <ControlSection title="Reuters source">
            <form action={setReutersOverride} className="grid gap-2">
              <input
                name="label"
                placeholder="Reuters live"
                className="border border-line px-2 py-1 text-xs text-ink"
              />
              <input
                name="stream_url"
                required
                placeholder="HLS .m3u8 or RTMP URL"
                className="border border-line px-2 py-1 text-xs text-ink"
              />
              <input
                name="expires_at"
                type="datetime-local"
                className="border border-line px-2 py-1 text-xs text-ink"
              />
              <button className="btn-secondary min-h-8 px-2 text-xs">Set Reuters live</button>
            </form>
            {outputOverride ? (
              <form action={clearOverride} className="mt-2">
                <button className="btn-secondary min-h-8 w-full px-2 text-xs">
                  Return to schedule
                </button>
              </form>
            ) : null}
          </ControlSection>

          <ControlSection title="Actions">
            <StopBroadcastButton
              action={stopBroadcast}
              disabled={!isLive}
              label={tOps("stopBroadcast")}
              confirmMessage="Stop the broadcast? This will revert the day status to 'ready'."
            />
            {!isLive && (
              <p className="mt-2 text-[10px] text-white/30">
                Button active only when broadcast is live.
              </p>
            )}
          </ControlSection>
        </aside>
      </div>
    </AdminShell>
  )
}

// ── Small inline helpers ────────────────────────────────────────────────────

function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 px-4 py-3 last:border-b-0">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
        {title}
      </h2>
      {children}
    </section>
  )
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-soft p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}
