import Link from "next/link"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { ButtonLink, EmptyState, MetricTile } from "@/components/ui"
import { getDays } from "@/lib/data"
import { ensureProgramDay } from "@/lib/mutations"

export default async function CalendarPage() {
  const days = await getDays()
  const today = new Date().toISOString().slice(0, 10)
  const activeDays = days.filter((day) => day.status === "active").length
  async function createDay(formData: FormData) {
    "use server"
    await ensureProgramDay(String(formData.get("date")))
  }
  return (
    <AdminShell
      title="Calendario de programacion"
      description="Dias operativos con bloques horarios, overlays, fallback y estado de publicacion."
      actions={
        <ButtonLink href={`/admin/schedule/${today}`}>
          Programar hoy
        </ButtonLink>
      }
    >
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Dias" value={String(days.length)} detail="Programaciones creadas" />
        <MetricTile label="Activos" value={String(activeDays)} detail="Dias al aire o marcados activos" tone={activeDays ? "ok" : "neutral"} />
        <MetricTile label="Hoy" value={today} detail="Fecha operativa local" tone="info" />
      </section>
      <form action={createDay} className="surface-panel mb-5 flex max-w-xl gap-3 p-4">
        <input name="date" type="date" required className="min-w-0 flex-1 border border-line px-3 py-2 text-sm" defaultValue={today} />
        <button className="btn-primary">Crear dia</button>
      </form>
      <div className="grid gap-3">
        {days.map((day) => (
          <Link key={day.id} href={`/admin/schedule/${day.airDate}`} className="surface-card p-4 hover:border-line-strong hover:bg-panel-soft">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{day.title ?? day.airDate}</p>
                <p className="text-sm text-muted">{day.airDate} · {day.timezone}</p>
              </div>
              <StatusPill status={day.status} />
            </div>
          </Link>
        ))}
        {days.length === 0 ? <EmptyState title="No hay dias creados">Elegí una fecha y creá la primera programacion para empezar a cargar bloques.</EmptyState> : null}
      </div>
    </AdminShell>
  )
}
