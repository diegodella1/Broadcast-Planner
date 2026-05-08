import { getTranslations } from "next-intl/server"

import { AdminShell } from "@/components/admin-shell"
import { OperationsPanelLowerThird } from "@/components/operations-panel/lower-third"
import { StopBroadcastButton } from "@/components/stop-broadcast-button"
import { getLiveSchedule } from "@/lib/data"
import { updateProgramDayStatus } from "@/lib/mutations"
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
    console.log("[audit] stopBroadcast triggered", { dayId, dayDate: parsed.data.date })
    // TODO: if a manual override block concept is introduced, clear it here
    await updateProgramDayStatus({
      date: parsed.data.date,
      status: "ready",
      allowWarnings: true
    })
  }

  return (
    <AdminShell title={t("chrome.output")} description={t("schedule.broadcast")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* ── Broadcast preview pane ────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* 16:9 frame */}
          <div
            className="relative w-full overflow-hidden rounded-md border border-white/10 bg-surface-elevated-1"
            style={{ aspectRatio: "16 / 9" }}
          >
            {active.block ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
                <p className="text-2xl font-semibold text-white/90">{active.block.title}</p>
                {active.asset && (
                  <p className="text-sm text-white/50">
                    {active.asset.sourceType} · {active.asset.title}
                  </p>
                )}
                {active.slide && !active.asset && (
                  <p className="text-sm text-white/50">
                    {active.slide.slideType} · {active.slide.title}
                  </p>
                )}
                <p className="text-xs text-white/30">
                  {t("chrome.broadcastOutput")} — captured by vMix / OBS
                </p>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <p className="text-base font-semibold text-white/30">
                  {t("output.fallback.noActiveBlock")}
                </p>
                <p className="text-xs text-white/20">{t("output.brand")}</p>
              </div>
            )}

            {/* Lower-third overlay preview inside the 16:9 frame */}
            {active.layers.length > 0 && (
              <div className="absolute bottom-[8%] left-[6%] pointer-events-none">
                <div className="lower-third-card rounded-sm">
                  <div className="lower-third-accent" />
                  <div>
                    {active.layers.map((layer) => (
                      <div key={layer.id} className="lower-third-primary text-white text-sm">
                        {layer.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
          className="w-full shrink-0 overflow-y-auto rounded-md border border-white/10 bg-surface-elevated-1 lg:w-[260px]"
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

          {/* Source switcher */}
          <ControlSection title="Source switcher">
            <p className="mb-2 text-[10px] text-white/30">Active: {activeSourceLabel}</p>
            {/* Local state only — wire-up to mutation is a follow-up task */}
            <SourceSwitcherStub />
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

// Stub source switcher — local state only; real mutation wired in a follow-up
function SourceSwitcherStub() {
  // This must be a client component to hold state; keeping it here as a
  // static stub that shows the shape. Upgrade to a "use client" subcomponent
  // when the mutation is wired.
  return (
    <select
      className="w-full rounded-sm border border-white/10 bg-surface-elevated-2 px-2 py-1 text-xs text-white/80"
      defaultValue="vimeo"
      disabled
      aria-label="Source switcher (stub — follow-up)"
    >
      <option value="vimeo">Vimeo — recording</option>
      <option value="reuters">Reuters embed</option>
      <option value="slide">Slide / static</option>
      <option value="hls">HLS / MP4 direct</option>
      <option value="remote_image">Remote image</option>
    </select>
  )
}
