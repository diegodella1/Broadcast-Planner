import { CalendarDays, CheckCircle2, ListChecks, Repeat, ShieldCheck } from 'lucide-react';

import { FlowCard, FlowGrid, FlowHero, FlowRail } from '@/components/admin-flow';
import { AdminShell } from '@/components/admin-shell';
import { ButtonLink } from '@/components/ui';
import { getDays, getScheduleForDate } from '@/lib/data';
import { getGlobalFallbackCarousel } from '@/lib/fallback-carousel';
import { analyzeSchedule } from '@/lib/schedule-health';
import { isoDateInTimezone, PLAYOUT_TIMEZONE } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function ProgramPage() {
    const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE);
    const [days, schedule, fallbackCarousel] = await Promise.all([
        getDays(),
        getScheduleForDate(today),
        getGlobalFallbackCarousel(),
    ]);
    const blocks = [...schedule.blocks].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const health = analyzeSchedule(schedule, blocks);
    const fallbackVideo = schedule.mediaAssets.find(
        (asset) =>
            asset.status === 'ready' &&
            asset.mediaKind === 'video' &&
            asset.metadata?.fallback_loop === true,
    );
    const fallbackLabel =
        fallbackVideo?.title ?? (fallbackCarousel?.enabled ? 'Slide carousel' : 'Missing');
    const fallbackTone = fallbackVideo || fallbackCarousel?.enabled ? 'ok' : 'warn';

    return (
        <AdminShell
            title="Program"
            description="Build the day, create slide loops and set fallback policy."
            actions={
                <>
                    <ButtonLink href={`/admin/schedule/${today}`}>Open today</ButtonLink>
                    <ButtonLink href="/admin/calendar" variant="secondary">
                        Calendar
                    </ButtonLink>
                </>
            }
        >
            <FlowHero
                eyebrow="One rundown"
                title="Program the day from time, loops and fallback."
                detail="Calendar and Schedule stay available, but the mental model is smaller: choose day, build rundown, create loop, set fallback, fix health, activate."
            />
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <FlowGrid>
                    <FlowCard
                        href="/admin/calendar"
                        icon={CalendarDays}
                        label="Day"
                        title="Calendar"
                        detail="Create or open program days. Daily programming remains the source of truth."
                        tone="program"
                        badge={`${days.length} days`}
                    />
                    <FlowCard
                        href={`/admin/schedule/${today}`}
                        icon={ListChecks}
                        label="Rundown"
                        title="Today schedule"
                        detail="Place ready media, slides, promos and ads on the timed rundown."
                        tone={health.criticalCount ? 'warn' : 'program'}
                        badge={`${blocks.length} blocks`}
                    />
                    <FlowCard
                        href={`/admin/schedule/${today}#bulk-cards`}
                        icon={Repeat}
                        label="Loop builder"
                        title="Bulk slide loop"
                        detail="Create a scheduled loop, a fallback carousel, or both from the same slide list."
                        tone="program"
                    />
                    <FlowCard
                        href={`/admin/schedule/${today}#bulk-cards`}
                        icon={ShieldCheck}
                        label="Fallback"
                        title="Fallback policy"
                        detail="Use one place to understand what wins when output needs protection."
                        tone={fallbackTone === 'ok' ? 'program' : 'warn'}
                        badge={fallbackLabel}
                    />
                    <FlowCard
                        href={`/admin/schedule/${today}`}
                        icon={CheckCircle2}
                        label="Health"
                        title="Fix before active"
                        detail="Critical issues should be solved before a day becomes active."
                        tone={health.criticalCount ? 'warn' : 'program'}
                        badge={
                            health.criticalCount
                                ? `${health.criticalCount} critical`
                                : health.warnCount
                                  ? `${health.warnCount} warn`
                                  : 'Clear'
                        }
                    />
                </FlowGrid>
                <FlowRail
                    title="Program state"
                    items={[
                        { label: 'Today', value: today },
                        { label: 'Day status', value: schedule.day?.status ?? 'missing' },
                        { label: 'Fallback', value: fallbackLabel, tone: fallbackTone },
                        {
                            label: 'Health',
                            value: health.criticalCount
                                ? `${health.criticalCount} critical`
                                : 'Clear',
                            tone: health.criticalCount ? 'danger' : 'ok',
                        },
                    ]}
                />
            </section>
        </AdminShell>
    );
}
