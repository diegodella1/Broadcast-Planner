import Link from "next/link"
import { redirect } from "next/navigation"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { ButtonLink, EmptyState, Field, FormHeader, MetricTile } from "@/components/ui"
import { getDays, getScheduleForDate } from "@/lib/data"
import { DAY_TEMPLATES } from "@/lib/day-templates"
import { createProgramDayFromTemplate, ensureProgramDay } from "@/lib/mutations"
import { isoDateInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"

export const dynamic = "force-dynamic"

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; setup?: string }>
}) {
  const params = await searchParams
  const days = await getDays()
  const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE)
  const selectedMonth = parseMonth(params.month ?? today.slice(0, 7))
  const monthDays = buildMonthGrid(selectedMonth.year, selectedMonth.month)
  const schedules = await Promise.all(
    days
      .filter((day) => day.airDate.startsWith(monthKey(selectedMonth.year, selectedMonth.month)))
      .map(async (day) => [day.airDate, await getScheduleForDate(day.airDate)] as const)
  )
  const coverage = new Map(
    schedules.map(([date, schedule]) => {
      const programmedSeconds = schedule.blocks.reduce(
        (total, block) => total + block.durationSeconds,
        0
      )
      return [date, Math.min(100, Math.round((programmedSeconds / 86400) * 100))]
    })
  )
  const dayByDate = new Map(days.map((day) => [day.airDate, day]))
  const previousMonth = addMonths(selectedMonth.year, selectedMonth.month, -1)
  const nextMonth = addMonths(selectedMonth.year, selectedMonth.month, 1)
  const activeDays = days.filter((day) => day.status === "active").length
  async function createDay(formData: FormData) {
    "use server"
    await ensureProgramDay(String(formData.get("date")))
  }
  async function setupDayFromTemplate(formData: FormData) {
    "use server"
    const date = String(formData.get("date"))
    await createProgramDayFromTemplate({
      date,
      templateId: String(formData.get("template_id")),
      startTime: String(formData.get("start_time") || "00:00:00")
    })
    redirect(`/admin/schedule/${date}?setup=1`)
  }
  return (
    <AdminShell
      title="Schedule"
      description="Pick a day and build output like an agenda: time, content and save."
      actions={<ButtonLink href={`/admin/schedule/${today}`}>Schedule today</ButtonLink>}
    >
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Days" value={String(days.length)} detail="Created days" />
        <MetricTile
          label="Active"
          value={String(activeDays)}
          detail="Days marked active"
          tone={activeDays ? "ok" : "neutral"}
        />
        <MetricTile label="Today" value={today} detail="San Francisco playout date" tone="info" />
      </section>
      <section className="surface-panel mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-semibold">Monthly calendar</h2>
            <p className="mt-1 text-sm text-muted">
              Each day shows how much of the grid is already programmed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="btn-secondary"
              href={`/admin/calendar?month=${monthKey(previousMonth.year, previousMonth.month)}`}
            >
              Previous
            </Link>
            <span className="rounded-md border border-line px-3 py-2 text-sm font-semibold">
              {monthLabel(selectedMonth.year, selectedMonth.month)}
            </span>
            <Link
              className="btn-secondary"
              href={`/admin/calendar?month=${monthKey(nextMonth.year, nextMonth.month)}`}
            >
              Next
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line bg-panel-soft text-center text-xs font-semibold uppercase text-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div key={label} className="px-2 py-2">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((date) => {
            const day = dayByDate.get(date)
            const percent = coverage.get(date) ?? 0
            const inMonth = date.startsWith(monthKey(selectedMonth.year, selectedMonth.month))
            const isToday = date === today
            return (
              <Link
                key={date}
                href={
                  day
                    ? `/admin/schedule/${date}`
                    : `/admin/calendar?month=${monthKey(selectedMonth.year, selectedMonth.month)}&setup=${date}`
                }
                className={[
                  "min-h-28 border-b border-r border-line p-3 text-sm hover:bg-panel-soft",
                  inMonth ? "bg-surface" : "bg-panel-soft/60 text-muted",
                  isToday ? "outline outline-2 outline-info-line outline-offset-[-2px]" : ""
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold tabular-nums">{Number(date.slice(8, 10))}</span>
                  {day ? (
                    <StatusPill status={day.status} />
                  ) : (
                    <span className="text-xs text-muted">Setup</span>
                  )}
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-panel">
                  <div
                    className={
                      percent >= 100
                        ? "h-full bg-success"
                        : percent > 0
                          ? "h-full bg-info"
                          : "h-full bg-line"
                    }
                    style={{ width: `${Math.max(percent, percent > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-semibold tabular-nums">{percent}% programmed</p>
              </Link>
            )
          })}
        </div>
      </section>
      {params.setup ? (
        <section className="surface-panel mb-5 p-4">
          <FormHeader
            title={`Set up ${params.setup}`}
            detail="Choose a built-in clock template. The day opens with draft blocks ready to fill."
          />
          <form
            action={setupDayFromTemplate}
            className="mt-4 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_160px_150px]"
          >
            <input type="hidden" name="date" value={params.setup} />
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
            <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm">
              <p className="text-xs font-semibold uppercase text-muted">Blocks</p>
              <p className="mt-1 font-semibold tabular-nums">
                {DAY_TEMPLATES[0]?.slots.length ?? 0} in recommended preset
              </p>
            </div>
            <button className="btn-primary self-end">Create day</button>
          </form>
        </section>
      ) : null}
      <form action={createDay} className="surface-panel mb-5 flex max-w-xl gap-3 p-4">
        <input
          name="date"
          type="date"
          required
          className="min-w-0 flex-1 border border-line px-3 py-2 text-sm"
          defaultValue={today}
        />
        <button className="btn-primary">Create day</button>
      </form>
      <div className="grid gap-3">
        {days.map((day) => (
          <Link
            key={day.id}
            href={`/admin/schedule/${day.airDate}`}
            className="surface-card p-4 hover:border-line-strong hover:bg-panel-soft"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{day.title ?? day.airDate}</p>
                <p className="text-sm text-muted">
                  {day.airDate} · {day.timezone}
                </p>
              </div>
              <StatusPill status={day.status} />
            </div>
          </Link>
        ))}
        {days.length === 0 ? (
          <EmptyState title="No scheduled days yet">
            Pick a date and create the day before adding content.
          </EmptyState>
        ) : null}
      </div>
    </AdminShell>
  )
}

function parseMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})/)
  if (!match) {
    const now = new Date()
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
  }
  return { year: Number(match[1]), month: Number(match[2]) }
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const start = new Date(first)
  start.setUTCDate(first.getUTCDate() - first.getUTCDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

function addMonths(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  )
}
