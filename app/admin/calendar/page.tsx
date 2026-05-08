import Link from "next/link"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { ButtonLink, EmptyState, MetricTile } from "@/components/ui"
import { getDays } from "@/lib/data"
import { ensureProgramDay } from "@/lib/mutations"

export const dynamic = "force-dynamic"

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
      title="Programming"
      description="Operational broadcast days with scheduled blocks, overlays, fallback coverage and publish state."
      actions={
        <ButtonLink href={`/admin/schedule/${today}`}>
          Program today
        </ButtonLink>
      }
    >
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Days" value={String(days.length)} detail="Programming days created" />
        <MetricTile label="Active" value={String(activeDays)} detail="Days currently marked active" tone={activeDays ? "ok" : "neutral"} />
        <MetricTile label="Today" value={today} detail="Local operating date" tone="info" />
      </section>
      <form action={createDay} className="surface-panel mb-5 flex max-w-xl gap-3 p-4">
        <input name="date" type="date" required className="min-w-0 flex-1 border border-line px-3 py-2 text-sm" defaultValue={today} />
        <button className="btn-primary">Create day</button>
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
        {days.length === 0 ? <EmptyState title="No programming days yet">Pick a date and create the first day before adding blocks.</EmptyState> : null}
      </div>
    </AdminShell>
  )
}
