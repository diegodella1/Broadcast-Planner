import { getTranslations } from "next-intl/server"
import { OperationsPanelOnAir } from "./operations-panel/on-air"
import { OperationsPanelManualBroadcast } from "./operations-panel/manual-broadcast"
import { OperationsPanelHealth } from "./operations-panel/health"
import { OperationsPanelMusic } from "./operations-panel/music"

export async function OperationsPanel() {
  const t = await getTranslations("ops")
  return (
    <aside
      className="w-60 shrink-0 overflow-y-auto bg-surface-elevated-1 border-l border-white/10"
      aria-label="Operations"
    >
      <PanelSection title={t("onAir.title")}>
        <OperationsPanelOnAir />
      </PanelSection>
      <PanelSection title={t("manualBroadcast.title")}>
        <OperationsPanelManualBroadcast />
      </PanelSection>
      <PanelSection title={t("health.title")}>
        <OperationsPanelHealth />
      </PanelSection>
      <PanelSection title={t("music.title")}>
        <OperationsPanelMusic />
      </PanelSection>
    </aside>
  )
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 px-4 py-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-wide text-white/50 mb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}
