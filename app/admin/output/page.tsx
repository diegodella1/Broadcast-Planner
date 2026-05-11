import { getTranslations } from "next-intl/server"

import { AdminShell } from "@/components/admin-shell"
import { OperationsPanelLowerThird } from "@/components/operations-panel/lower-third"
import { StopBroadcastButton } from "@/components/stop-broadcast-button"
import { StatusBanner } from "@/components/ui"
import { recordAuditEvent } from "@/lib/audit"
import { getLiveSchedule } from "@/lib/data"
import { updateProgramDayStatus } from "@/lib/mutations"
import { liveOutputHref } from "@/lib/output-auth"
import { findActiveSchedule } from "@/lib/scheduler"
import { createDaySchema } from "@/lib/schemas"
import { secondsSinceMidnightInTimezone, isoDateInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"

export default async function AdminOutputPage() {
  const [t, tOps, liveBundle] = await Promise.all([
    getTranslations(),
    getTranslations("ops"),
    getLiveSchedule()
  ])

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

  // Server action: stop the broadcast by reverting day status to "ready"
  async function stopBroadcast() {
    "use server"
    if (!dayDate) return
    const parsed = createDaySchema.safeParse({ date: dayDate })
    if (!parsed.success) return
    // TODO: if a manual override block concept is introduced, clear it here
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

  return (
    <AdminShell title={t("chrome.output")} description={t("schedule.broadcast")}>
      <div className="mb-5">
        <StatusBanner
          tone={isLive ? "ok" : dayStatus === "active" ? "warn" : "info"}
          label="Output control"
          title={broadcastStatusLabel}
          detail={
            active.block
              ? `${active.block.title} · ${activeSourceLabel}`
              : (active.reason ?? "No active block")
          }
          action={
            <a className="btn-secondary" href={monitorHref} target="_blank" rel="noreferrer">
              Open monitor
            </a>
          }
        />
      </div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* ── Broadcast preview pane ────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* 16:9 frame */}
          <div
            className="relative w-full overflow-hidden rounded-md border border-white/10 bg-surface-elevated-1"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              title="Live output preview"
              src={monitorHref}
              className="h-full w-full border-0"
            />
          </div>

          {/* ON AIR / status banner below preview */}
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

        {/* ── Operator control surface ──────────────────────────────────── */}
        <aside
          className="w-full shrink-0 overflow-y-auto rounded-md border border-white/10 bg-surface-elevated-1 lg:w-[320px]"
          aria-label="Operator controls"
        >
          {/* Broadcast status section */}
          <ControlSection title="Broadcast status">
            <div className="flex items-center gap-2">
              <span
                className={
                  isLive
                    ? "h-2 w-2 rounded-full bg-accent-live-text animate-pulse"
                    : "h-2 w-2 rounded-full bg-white/20"
                }
                aria-hidden="true"
              />
              <span
                className={`text-xs font-semibold ${isLive ? "text-accent-live-text" : "text-white/50"}`}
              >
                {broadcastStatusLabel}
              </span>
            </div>
            {active.block && (
              <p className="mt-1 truncate text-[11px] text-white/40">{active.block.title}</p>
            )}
          </ControlSection>

          <ControlSection title="Active source">
            <p className="text-xs font-semibold text-white/80">{activeSourceLabel}</p>
            <p className="mt-1 text-[11px] leading-4 text-white/40">
              Source switching is hidden until mutation is wired. Use timeline block edit to change
              source.
            </p>
          </ControlSection>

          <ControlSection title="Observability">
            <dl className="grid gap-2 text-[11px]">
              <MetricLine label="Block" value={active.block?.title ?? "none"} />
              <MetricLine
                label="Asset"
                value={
                  active.asset?.title ??
                  active.slide?.title ??
                  active.fallbackAsset?.title ??
                  "none"
                }
              />
              <MetricLine label="Fallback" value={active.fallbackAsset?.title ?? "none"} />
              <MetricLine label="Reason" value={active.reason ?? "normal"} />
              <MetricLine
                label="Vimeo"
                value={
                  active.asset?.sourceType === "vimeo"
                    ? (active.asset.playbackReadinessStatus ?? "unchecked")
                    : "n/a"
                }
              />
              <MetricLine
                label="Clock"
                value={`${secondsSinceMidnightInTimezone(new Date(), liveBundle.day?.timezone ?? PLAYOUT_TIMEZONE)}s`}
              />
            </dl>
          </ControlSection>

          {/* Lower-third editor — reuse existing component */}
          <ControlSection title={tOps("lowerThird.title")}>
            <OperationsPanelLowerThird />
          </ControlSection>

          {/* Stop broadcast action */}
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

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-white/35">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-white/75">{value}</dd>
    </div>
  )
}
