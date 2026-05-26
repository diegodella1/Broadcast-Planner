import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { StatusPill } from '@/components/status-pill';
import { ButtonLink, EmptyState, Field, FormHeader, MetricTile } from '@/components/ui';
import { getDays, getProgrammedSecondsByDate, getScheduleForDate } from '@/lib/data';
import { DAY_TEMPLATES } from '@/lib/day-templates';
import { createProgramDayFromTemplate, ensureProgramDay } from '@/lib/mutations';
import { analyzeSchedule } from '@/lib/schedule-health';
import { findActiveSchedule } from '@/lib/scheduler';
import {
    formatPlayoutTimeLabel,
    formatTimecode,
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; setup?: string }>;
}) {
    const params = await searchParams;
    const days = await getDays();
    const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE);
    const selectedMonth = parseMonth(params.month ?? today.slice(0, 7));
    const monthDays = buildMonthGrid(selectedMonth.year, selectedMonth.month);
    const selectedMonthKey = monthKey(selectedMonth.year, selectedMonth.month);
    const daysInMonth = days.filter((day) => day.airDate.startsWith(selectedMonthKey));
    const programmedSecondsByDate = await getProgrammedSecondsByDate(daysInMonth);
    const monthSchedules = await Promise.all(
        daysInMonth.map(async (day) => {
            const schedule = await getScheduleForDate(day.airDate);

            return [day.airDate, analyzeSchedule(schedule)] as const;
        }),
    );
    const healthByDate = new Map(monthSchedules);
    const todaySchedule = await getScheduleForDate(today);
    const todayNowSeconds = secondsSinceMidnightInTimezone(new Date(), PLAYOUT_TIMEZONE);
    const todayActive = todaySchedule.day
        ? findActiveSchedule(todaySchedule, todayNowSeconds)
        : null;
    const todayNextBlock =
        todaySchedule.blocks
            .filter((block) => block.status === 'ready' || block.status === 'active')
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
            .find((block) => block.startTimeSeconds > todayNowSeconds) ?? null;
    const coverage = new Map(
        daysInMonth.map((day) => {
            const programmedSeconds = programmedSecondsByDate.get(day.airDate) ?? 0;

            return [day.airDate, Math.min(100, Math.round((programmedSeconds / 86400) * 100))];
        }),
    );
    const dayByDate = new Map(days.map((day) => [day.airDate, day]));
    const previousMonth = addMonths(selectedMonth.year, selectedMonth.month, -1);
    const nextMonth = addMonths(selectedMonth.year, selectedMonth.month, 1);
    const activeDays = days.filter((day) => day.status === 'active').length;
    const completeDays = daysInMonth.filter(
        (day) => (coverage.get(day.airDate) ?? 0) >= 100,
    ).length;
    const riskyDays = daysInMonth.filter((day) => {
        const health = healthByDate.get(day.airDate);

        return health && (health.criticalCount > 0 || health.warnCount > 0);
    }).length;
    async function createDay(formData: FormData) {
        'use server';
        const result = await ensureProgramDay(String(formData.get('date')));

        if (!result.success) {
            throw new Error(result.error);
        }
    }
    async function setupDayFromTemplate(formData: FormData) {
        'use server';
        const date = String(formData.get('date'));
        const result = await createProgramDayFromTemplate({
            date,
            templateId: String(formData.get('template_id')),
            startTime: String(formData.get('start_time') || '00:00:00'),
        });

        if (!result.success) {
            throw new Error(result.error);
        }
        redirect(`/admin/schedule/${date}?setup=1`);
    }

    return (
        <AdminShell
            title="Schedule"
            description="Choose a broadcast day, check coverage and open the timeline planner."
            actions={<ButtonLink href={`/admin/schedule/${today}`}>Open Today</ButtonLink>}
        >
            <section className="mb-5 grid gap-3 md:grid-cols-4">
                <MetricTile
                    label="Month Days"
                    value={String(daysInMonth.length)}
                    detail="Created this month"
                />
                <MetricTile
                    label="Complete"
                    value={String(completeDays)}
                    detail="100% programmed"
                    tone="ok"
                />
                <MetricTile
                    label="Risky"
                    value={String(riskyDays)}
                    detail="Warnings or critical"
                    tone={riskyDays ? 'warn' : 'ok'}
                />
                <MetricTile
                    label="Active"
                    value={String(activeDays)}
                    detail="Days marked active"
                    tone={activeDays ? 'ok' : 'neutral'}
                />
                <MetricTile
                    label="Today"
                    value={today}
                    detail="San Francisco playout date"
                    tone="info"
                />
            </section>
            <section className="surface-panel mb-5 overflow-hidden border-accent-live">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                        <p className="eyebrow text-accent-live">Now</p>
                        <h2 className="mt-1 truncate text-lg font-semibold">
                            {todayActive?.block?.title ?? 'Nothing scheduled right now'}
                        </h2>
                        <p className="mt-1 text-sm text-muted">
                            {formatPlayoutTimeLabel(todayNowSeconds, true)}
                            {todayActive?.block
                                ? ` · ${formatTimecode(todayActive.elapsedInBlock)} / ${formatTimecode(
                                      todayActive.block.durationSeconds,
                                  )}`
                                : todayNextBlock
                                  ? ` · Next ${todayNextBlock.title}`
                                  : ' · No upcoming ready block'}
                        </p>
                    </div>
                    <ButtonLink href={`/admin/schedule/${today}`} variant="secondary">
                        Open Today
                    </ButtonLink>
                </div>
                <div className="h-1 bg-panel">
                    <div
                        className="h-full bg-accent-live"
                        style={{ width: `${Math.round((todayNowSeconds / 86400) * 100)}%` }}
                    />
                </div>
            </section>
            <section className="surface-panel mb-5 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                        <h2 className="font-semibold">Broadcast Month</h2>
                        <p className="mt-1 text-sm text-muted">
                            Coverage, readiness and schedule risk for every created day.
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
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                        <div key={label} className="px-2 py-2">
                            {label}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {monthDays.map((date) => {
                        const day = dayByDate.get(date);
                        const percent = coverage.get(date) ?? 0;
                        const health = healthByDate.get(date);
                        const inMonth = date.startsWith(
                            monthKey(selectedMonth.year, selectedMonth.month),
                        );
                        const isToday = date === today;
                        const dayTone = !day
                            ? 'Setup'
                            : health?.criticalCount
                              ? `${health.criticalCount} critical`
                              : health?.warnCount
                                ? `${health.warnCount} warning`
                                : percent >= 100
                                  ? 'Ready'
                                  : 'In progress';

                        return (
                            <Link
                                key={date}
                                href={
                                    day
                                        ? `/admin/schedule/${date}`
                                        : `/admin/schedule/${date}?setup=1`
                                }
                                className={[
                                    'min-h-28 border-b border-r border-line p-3 text-sm hover:bg-panel-soft',
                                    inMonth ? 'bg-surface' : 'bg-panel-soft/60 text-muted',
                                    isToday
                                        ? 'outline outline-2 outline-info-line outline-offset-[-2px]'
                                        : '',
                                ].join(' ')}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold tabular-nums">
                                        {Number(date.slice(8, 10))}
                                    </span>
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
                                                ? 'h-full bg-success'
                                                : percent > 0
                                                  ? 'h-full bg-info'
                                                  : 'h-full bg-line'
                                        }
                                        style={{
                                            width: `${Math.max(percent, percent > 0 ? 4 : 0)}%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-semibold tabular-nums">
                                    {percent}% programmed
                                </p>
                                {isToday ? (
                                    <div className="mt-2 rounded-md border border-accent-live bg-surface-selected-positive px-2 py-1 text-[11px] font-semibold text-accent-live">
                                        <span className="block tabular-nums">
                                            Now {formatPlayoutTimeLabel(todayNowSeconds, true)}
                                        </span>
                                        <span className="block truncate text-ink">
                                            {todayActive?.block?.title ?? 'No active block'}
                                        </span>
                                    </div>
                                ) : null}
                                <p
                                    className={[
                                        'mt-1 truncate text-xs font-semibold',
                                        health?.criticalCount
                                            ? 'text-danger'
                                            : health?.warnCount
                                              ? 'text-warn'
                                              : day
                                                ? 'text-muted'
                                                : 'text-accent-positive',
                                    ].join(' ')}
                                >
                                    {dayTone}
                                </p>
                            </Link>
                        );
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
                        <Field label="Clock start (24 h)">
                            <input
                                name="start_time"
                                defaultValue="00:00:00"
                                required
                                placeholder="13:30:00"
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
                <button className="btn-primary">Create Empty Day</button>
            </form>
            <section className="surface-panel overflow-hidden">
                <div className="border-b border-line px-4 py-3">
                    <h2 className="font-semibold">This Month</h2>
                    <p className="mt-1 text-sm text-muted">
                        Fast access to created days in the selected month.
                    </p>
                </div>
                <div className="divide-y divide-line">
                    {daysInMonth.map((day) => {
                        const percent = coverage.get(day.airDate) ?? 0;
                        const health = healthByDate.get(day.airDate);

                        return (
                            <Link
                                key={day.id}
                                href={`/admin/schedule/${day.airDate}`}
                                className="grid gap-3 px-4 py-3 text-sm hover:bg-panel-soft md:grid-cols-[150px_1fr_120px_130px_120px] md:items-center"
                            >
                                <span className="font-semibold tabular-nums">{day.airDate}</span>
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold">
                                        {day.title ?? 'Programming day'}
                                    </span>
                                    <span className="block truncate text-xs text-muted">
                                        {day.timezone}
                                    </span>
                                </span>
                                <StatusPill status={day.status} />
                                <span className="font-semibold tabular-nums">
                                    {percent}% programmed
                                </span>
                                <span
                                    className={
                                        health?.criticalCount
                                            ? 'text-danger'
                                            : health?.warnCount
                                              ? 'text-warn'
                                              : 'text-muted'
                                    }
                                >
                                    {health?.criticalCount
                                        ? `${health.criticalCount} critical`
                                        : health?.warnCount
                                          ? `${health.warnCount} warning`
                                          : 'Clear'}
                                </span>
                            </Link>
                        );
                    })}
                </div>
                {days.length === 0 ? (
                    <EmptyState title="No scheduled days yet">
                        Pick a date and create the day before adding content.
                    </EmptyState>
                ) : null}
            </section>
        </AdminShell>
    );
}

function parseMonth(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})/);

    if (!match) {
        const now = new Date();

        return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
    }

    return { year: Number(match[1]), month: Number(match[2]) };
}

function buildMonthGrid(year: number, month: number) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const start = new Date(first);
    start.setUTCDate(first.getUTCDate() - first.getUTCDay());

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);

        return date.toISOString().slice(0, 10);
    });
}

function addMonths(year: number, month: number, delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));

    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthKey(year: number, month: number) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(year: number, month: number) {
    return new Intl.DateTimeFormat('en', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1)));
}
