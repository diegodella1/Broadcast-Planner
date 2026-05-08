import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { ButtonLink, EmptyState, MetricTile } from "@/components/ui"
import { getDays } from "@/lib/data"
import { ensureProgramDay } from "@/lib/mutations"

export default async function CalendarPage() {
  const t = await getTranslations("calendar")
  const days = await getDays()
  const today = new Date().toISOString().slice(0, 10)
  const activeDays = days.filter((day) => day.status === "active").length
  async function createDay(formData: FormData) {
    "use server"
    await ensureProgramDay(String(formData.get("date")))
  }
  return (
    <AdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <ButtonLink href={`/admin/schedule/${today}`}>
          {t("scheduleToday")}
        </ButtonLink>
      }
    >
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label={t("metrics.days")} value={String(days.length)} detail={t("metrics.daysDetail")} />
        <MetricTile label={t("metrics.active")} value={String(activeDays)} detail={t("metrics.activeDetail")} tone={activeDays ? "ok" : "neutral"} />
        <MetricTile label={t("metrics.today")} value={today} detail={t("metrics.todayDetail")} tone="info" />
      </section>
      <form action={createDay} className="surface-panel mb-5 flex max-w-xl gap-3 p-4">
        <input name="date" type="date" required className="min-w-0 flex-1 border border-line px-3 py-2 text-sm" defaultValue={today} />
        <button className="btn-primary">{t("createDay")}</button>
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
        {days.length === 0 ? <EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState> : null}
      </div>
    </AdminShell>
  )
}
