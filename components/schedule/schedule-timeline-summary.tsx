'use client';

import { findSameDayGaps } from '@/lib/schedule-conflicts';
import { analyzeSchedule } from '@/lib/schedule-health';
import { formatPlayoutTimeLabel, formatTimecode } from '@/lib/time';
import type { ProgramBlock, ScheduleBundle } from '@/lib/types';

import { CALENDAR_SNAP_SECONDS } from './helpers';

type PlannerStatProps = {
    label: string;
    value: string;
    tone?: 'neutral' | 'ok' | 'warn' | 'danger';
};

function PlannerStat({ label, value, tone = 'neutral' }: PlannerStatProps) {
    const toneClass =
        tone === 'ok'
            ? 'text-success'
            : tone === 'warn'
              ? 'text-warn'
              : tone === 'danger'
                ? 'text-danger'
                : 'text-ink';

    return (
        <div className="rounded-md border border-line bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-muted">{label}</p>
            <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${toneClass}`}>
                {value}
            </p>
        </div>
    );
}

type TimelineSummaryProps = {
    schedule: ScheduleBundle;
    blocks: ProgramBlock[];
    health: ReturnType<typeof analyzeSchedule>;
};

export function TimelineSummary({ schedule, blocks, health }: TimelineSummaryProps) {
    const programmedSeconds = blocks.reduce((total, block) => total + block.durationSeconds, 0);
    const readyBlocks = blocks.filter(
        (block) => block.status === 'ready' || block.status === 'active',
    );
    const gaps = schedule.day ? findSameDayGaps(blocks, schedule.day.id) : [];
    const nextGap = gaps.find((gap) => gap.durationSeconds >= CALENDAR_SNAP_SECONDS);
    const hasReadyFallback = schedule.mediaAssets.some(
        (asset) => asset.assetType === 'fallback' && asset.status === 'ready',
    );

    return (
        <div className="grid gap-2 border-b border-line bg-panel-soft p-3 md:grid-cols-5">
            <PlannerStat label="Programmed" value={formatTimecode(programmedSeconds)} />
            <PlannerStat label="Ready" value={`${readyBlocks.length}/${blocks.length}`} />
            <PlannerStat
                label="Next Gap"
                value={nextGap ? `${formatPlayoutTimeLabel(nextGap.startTimeSeconds)}` : 'None'}
                tone={nextGap ? 'warn' : 'ok'}
            />
            <PlannerStat
                label="Issues"
                value={`${health.criticalCount}C / ${health.warnCount}W`}
                tone={health.criticalCount ? 'danger' : health.warnCount ? 'warn' : 'ok'}
            />
            <PlannerStat
                label="Fallback"
                value={hasReadyFallback ? 'Ready' : 'Missing'}
                tone={hasReadyFallback ? 'ok' : 'warn'}
            />
        </div>
    );
}
