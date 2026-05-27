import Link from 'next/link';
import type { ReactNode } from 'react';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    HeartPulse,
    MonitorPlay,
    Plus,
    RadioTower,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/admin-shell';
import { StatusPill } from '@/components/ui/status-pill';
import { Timecode } from '@/components/ui/timecode';
import { PlayoutTime } from '@/components/output/playout-time';
import { ButtonLink, EmptyState, MetricTile, Notice, PrimaryActionPanel } from '@/components/ui';
import { getAssetSummaries, getDays, getScheduleForDate } from '@/lib/data';
import { collectOperatorHealth } from '@/lib/health/health-checks';
import { analyzeSchedule } from '@/lib/scheduling/schedule-health';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import {
    formatTimecode,
    formatPlayoutTimeLabel,
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
    const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE);
    const [days, schedule, assets] = await Promise.all([
        getDays(),
        getScheduleForDate(today),
        getAssetSummaries(),
    ]);
    const healthReport = await collectOperatorHealth();
    const blocks = [...schedule.blocks].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const health = analyzeSchedule(schedule, blocks);
    const nowSeconds = secondsSinceMidnightInTimezone(new Date());
    const active = findActiveSchedule(schedule, nowSeconds);
    const nextBlock =
        blocks.find(
            (block) =>
                (block.status === 'ready' || block.status === 'active') &&
                block.startTimeSeconds > nowSeconds,
        ) ?? null;
    const readyAssets = assets.filter((asset) => asset.status === 'ready').length;
    const reviewAssets = assets.filter(
        (asset) =>
            asset.status !== 'ready' || (asset.mediaKind === 'video' && !asset.durationSeconds),
    ).length;
    const scheduledHours = blocks.reduce((total, block) => total + block.durationSeconds, 0) / 3600;

    return (
        <AdminShell
            title="Dashboard"
            description="Simple operator path: add content, schedule the day, open browser output for OBS/vMix."
            actions={
                <>
                    <ButtonLink href="/admin/prepare">Prepare</ButtonLink>
                    <ButtonLink href="/admin/program" variant="secondary">
                        Program
                    </ButtonLink>
                    <ButtonLink href="/admin/output" variant="secondary">
                        Browser Output
                    </ButtonLink>
                </>
            }
        >
            {healthReport.status !== 'ok' ? (
                <Notice
                    tone={healthReport.status === 'fail' ? 'danger' : 'warn'}
                    title={
                        healthReport.status === 'fail'
                            ? 'Production health failing'
                            : 'Health degraded'
                    }
                >
                    <Link href="/admin/health">Open Admin Health</Link> before handoff or live
                    operation.
                </Notice>
            ) : null}
            <PrimaryActionPanel
                eyebrow="Start here"
                title={
                    !assets.length
                        ? 'Add your first video or slide'
                        : blocks.length
                          ? 'Check today, then open browser output'
                          : "Build today's schedule"
                }
                detail={
                    !assets.length
                        ? 'New operators only need three modes: Prepare content, Program the day, then Operate the output for OBS/vMix capture.'
                        : blocks.length
                          ? `${readyBlocksLabel(readyAssets, assets.length)} · ${blocks.length} blocks on today's rundown.`
                          : 'Library has content. Add the first block to today and the output will follow the schedule.'
                }
                action={
                    <ButtonLink
                        href={
                            !assets.length
                                ? '/admin/prepare'
                                : blocks.length
                                  ? '/admin/operate'
                                  : '/admin/program'
                        }
                    >
                        {!assets.length
                            ? 'Open Prepare'
                            : blocks.length
                              ? 'Open Operate'
                              : 'Open Program'}
                    </ButtonLink>
                }
                secondary={
                    blocks.length ? (
                        <ButtonLink href="/admin/output" variant="secondary">
                            Open Output
                        </ButtonLink>
                    ) : null
                }
            />
            <section className="mb-5 grid gap-3 xl:grid-cols-[1.25fr_1fr]">
                <div className="surface-panel p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="eyebrow">Today</p>
                            <h2 className="mt-2 text-2xl font-semibold">
                                {schedule.day?.title ?? `Programming ${today}`}
                            </h2>
                            <p className="mt-1 text-sm text-muted">
                                {today} · {schedule.day?.timezone ?? PLAYOUT_TIMEZONE}
                            </p>
                        </div>
                        {schedule.day ? (
                            <StatusPill status={schedule.day.status} />
                        ) : (
                            <StatusPill status="missing" />
                        )}
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <SignalTile
                            icon={<RadioTower size={18} />}
                            label="Now"
                            title={active.block?.title ?? 'No active block'}
                            detail={
                                active.block
                                    ? `${formatTimecode(active.elapsedInBlock)} / ${formatTimecode(active.block.durationSeconds)}`
                                    : (active.reason ?? 'No schedule window')
                            }
                            tone={active.block ? 'ok' : 'warn'}
                        />
                        <SignalTile
                            icon={<CalendarDays size={18} />}
                            label="Next"
                            title={nextBlock?.title ?? 'No next block'}
                            detail={
                                nextBlock
                                    ? `Starts ${formatPlayoutTimeLabel(nextBlock.startTimeSeconds)}`
                                    : 'Add or generate blocks'
                            }
                            tone={nextBlock ? 'neutral' : 'warn'}
                        />
                        <SignalTile
                            icon={
                                health.criticalCount ? (
                                    <AlertTriangle size={18} />
                                ) : (
                                    <CheckCircle2 size={18} />
                                )
                            }
                            label="Schedule health"
                            title={
                                health.criticalCount
                                    ? `${health.criticalCount} critical`
                                    : health.warnCount
                                      ? `${health.warnCount} warnings`
                                      : 'Clear'
                            }
                            detail={`${blocks.length} blocks · ${schedule.layers.length} overlays`}
                            tone={
                                health.criticalCount ? 'danger' : health.warnCount ? 'warn' : 'ok'
                            }
                        />
                    </div>
                </div>

                <section className="surface-panel p-5">
                    <p className="eyebrow">Operator path</p>
                    <div className="mt-4 grid gap-2">
                        <ActionLink
                            href="/admin/prepare"
                            icon={<Plus size={17} />}
                            title="1. Prepare"
                            detail={`${readyAssets} ready assets, ${reviewAssets} need fix.`}
                        />
                        <ActionLink
                            href="/admin/program"
                            icon={<CalendarDays size={17} />}
                            title="2. Program"
                            detail={
                                blocks.length
                                    ? 'Edit today, loops and fallback.'
                                    : "Create today's first block."
                            }
                        />
                        <ActionLink
                            href="/admin/operate"
                            icon={<MonitorPlay size={17} />}
                            title="3. Operate"
                            detail="Open output, health and recovery."
                        />
                        <ActionLink
                            href="/admin/health"
                            icon={<HeartPulse size={17} />}
                            title="Health"
                            detail="Check production readiness and integrations."
                        />
                    </div>
                </section>
            </section>

            <section className="mb-5 grid gap-3 md:grid-cols-4">
                <MetricTile label="Days" value={String(days.length)} detail="Programming days" />
                <MetricTile
                    label="Blocks today"
                    value={String(blocks.length)}
                    detail="Scheduled blocks"
                    tone={blocks.length ? 'ok' : 'warn'}
                />
                <MetricTile
                    label="Ready assets"
                    value={`${readyAssets}/${assets.length}`}
                    detail="Playable media"
                    tone={reviewAssets ? 'warn' : 'ok'}
                />
                <MetricTile
                    label="Hours"
                    value={scheduledHours.toFixed(1)}
                    detail="Scheduled today"
                    tone={blocks.length ? 'info' : 'warn'}
                />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="surface-panel overflow-hidden">
                    <div className="border-b border-line px-4 py-3">
                        <h2 className="font-semibold">Upcoming today</h2>
                        <p className="mt-1 text-sm text-muted">
                            The next ready or active blocks from the current time.
                        </p>
                    </div>
                    {blocks.length ? (
                        <div className="divide-y divide-line">
                            {blocks.slice(0, 8).map((block) => (
                                <Link
                                    key={block.id}
                                    href={`/admin/schedule/${today}/blocks/${block.id}`}
                                    className="grid gap-3 px-4 py-3 text-sm hover:bg-panel-soft md:grid-cols-[90px_1fr_110px_90px] md:items-center"
                                >
                                    <PlayoutTime airDate={today} seconds={block.startTimeSeconds} />
                                    <span>
                                        <span className="block font-semibold">{block.title}</span>
                                        <span className="text-muted">{block.blockType}</span>
                                    </span>
                                    <Timecode seconds={block.durationSeconds} />
                                    <StatusPill status={block.status} />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4">
                            <EmptyState
                                title="No blocks today"
                                action={
                                    <ButtonLink href={`/admin/schedule/${today}`}>
                                        Open timeline
                                    </ButtonLink>
                                }
                            >
                                Create the first block from the agenda form.
                            </EmptyState>
                        </div>
                    )}
                </div>

                <section className="surface-panel p-4">
                    <h2 className="font-semibold">Alerts</h2>
                    <div className="mt-4 grid gap-2">
                        {health.issues.slice(0, 8).map((issue) => (
                            <Link
                                key={issue.id}
                                href={
                                    issue.blockId
                                        ? `/admin/schedule/${today}/blocks/${issue.blockId}`
                                        : `/admin/schedule/${today}`
                                }
                                className={
                                    issue.severity === 'critical'
                                        ? 'rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong'
                                        : 'rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong'
                                }
                            >
                                <span className="block font-semibold">{issue.title}</span>
                                <span className="text-xs opacity-80">{issue.detail}</span>
                            </Link>
                        ))}
                        {!health.issues.length ? (
                            <p className="rounded-md border border-success-line bg-success-soft px-3 py-2 text-sm text-success-strong">
                                No schedule issues detected today.
                            </p>
                        ) : null}
                    </div>
                </section>
            </section>
        </AdminShell>
    );
}

function SignalTile({
    icon,
    label,
    title,
    detail,
    tone,
}: {
    icon: ReactNode;
    label: string;
    title: string;
    detail: string;
    tone: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
    return (
        <section className={`rounded-md border p-4 ${signalTone(tone)}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase">
                {icon}
                {label}
            </div>
            <p className="mt-3 truncate text-lg font-semibold">{title}</p>
            <p className="mt-1 text-sm opacity-80">{detail}</p>
        </section>
    );
}

function ActionLink({
    href,
    icon,
    title,
    detail,
}: {
    href: string;
    icon: ReactNode;
    title: string;
    detail: string;
}) {
    return (
        <Link
            href={href}
            className="flex gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm hover:bg-panel-soft"
        >
            <span className="mt-0.5 text-muted">{icon}</span>
            <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-0.5 block text-muted">{detail}</span>
            </span>
        </Link>
    );
}

function signalTone(tone: 'ok' | 'warn' | 'danger' | 'neutral') {
    switch (tone) {
        case 'ok':
            return 'border-success-line bg-success-soft text-success-strong';
        case 'warn':
            return 'border-warn-line bg-warn-soft text-warn-strong';
        case 'danger':
            return 'border-danger-line bg-danger-soft text-danger-strong';
        default:
            return 'border-line bg-surface text-ink';
    }
}

function readyBlocksLabel(readyAssets: number, totalAssets: number) {
    return `${readyAssets}/${totalAssets} library items ready`;
}
