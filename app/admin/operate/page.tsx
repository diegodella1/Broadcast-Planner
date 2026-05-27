import {
    Activity,
    ClipboardCheck,
    HeartPulse,
    History,
    MonitorPlay,
    RadioTower,
} from 'lucide-react';

import { FlowCard, FlowGrid, FlowHero, FlowRail } from '@/components/admin/admin-flow';
import { AdminShell } from '@/components/admin/admin-shell';
import { ButtonLink } from '@/components/ui';
import { getLiveSchedule } from '@/lib/data';
import { getGlobalFallbackCarousel } from '@/lib/fallback-carousel';
import { collectOperatorHealth } from '@/lib/health/health-checks';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import { liveOutputHref } from '@/lib/auth/output-auth';
import {
    formatPlayoutTimeLabel,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';

export const dynamic = 'force-dynamic';

export default async function OperatePage() {
    const schedule = await getLiveSchedule();
    const [health, fallbackCarousel] = await Promise.all([
        collectOperatorHealth({ preloadedLiveSchedule: schedule }),
        getGlobalFallbackCarousel(),
    ]);
    const timezone = schedule.day?.timezone ?? PLAYOUT_TIMEZONE;
    const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone);
    const active = findActiveSchedule(schedule, nowSeconds);
    const next =
        schedule.blocks
            .filter((block) => block.status === 'ready' || block.status === 'active')
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
            .find((block) => block.startTimeSeconds > nowSeconds) ?? null;
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
            title="Operate"
            description="Control room for live output, health, runbook and recovery."
            actions={
                <>
                    <ButtonLink href="/admin/output">Open output control</ButtonLink>
                    <ButtonLink href={liveOutputHref(true)} variant="secondary">
                        Live browser
                    </ButtonLink>
                </>
            }
        >
            <FlowHero
                eyebrow="One control room"
                title="Operate from signal state, not raw edit forms."
                detail="This is the live path: output, audio unlock, current block, next block, fallback, health, runbook and audit."
            />
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <FlowGrid>
                    <FlowCard
                        href="/admin/output"
                        icon={MonitorPlay}
                        label="Signal"
                        title="Output control"
                        detail="Launch browser output, monitor playback state and keep OBS/vMix capture clean."
                        tone="operate"
                        badge={active.block ? 'On air' : 'Idle'}
                    />
                    <FlowCard
                        href={liveOutputHref(true)}
                        icon={RadioTower}
                        label="Capture"
                        title="Live browser output"
                        detail="Fullscreen playout route. Keep it clean: no admin UI, no debug unless explicit."
                        tone="operate"
                    />
                    <FlowCard
                        href="/admin/health"
                        icon={HeartPulse}
                        label="Preflight"
                        title="Health and smoke"
                        detail="Validate environment, data, storage, static assets, output token and deploy smoke."
                        tone={health.status === 'ok' ? 'operate' : 'warn'}
                        badge={health.status}
                    />
                    <FlowCard
                        href="/admin/runbook"
                        icon={ClipboardCheck}
                        label="Procedure"
                        title="Runbook"
                        detail="Preflight, live notes, incident handling and shutdown checks."
                        tone="operate"
                    />
                    <FlowCard
                        href="/admin/audit"
                        icon={History}
                        label="Trace"
                        title="Audit trail"
                        detail="Review who changed broadcast-critical state before and during air."
                        tone="operate"
                    />
                    <FlowCard
                        href="/admin/output"
                        icon={Activity}
                        label="Recover"
                        title="Fallback and overrides"
                        detail="When media stalls or audio is locked, recover from one live surface."
                        tone={fallbackTone === 'ok' ? 'operate' : 'warn'}
                        badge={fallbackLabel}
                    />
                </FlowGrid>
                <FlowRail
                    title="Live state"
                    items={[
                        {
                            label: 'Now',
                            value: active.block?.title ?? 'Nothing scheduled',
                            tone: active.block ? 'ok' : 'warn',
                        },
                        {
                            label: 'Next',
                            value: next
                                ? `${formatPlayoutTimeLabel(next.startTimeSeconds)} · ${next.title}`
                                : 'No next block',
                            tone: next ? 'neutral' : 'warn',
                        },
                        { label: 'Fallback', value: fallbackLabel, tone: fallbackTone },
                        {
                            label: 'Health',
                            value: health.status,
                            tone: health.status === 'ok' ? 'ok' : 'danger',
                        },
                    ]}
                />
            </section>
        </AdminShell>
    );
}
