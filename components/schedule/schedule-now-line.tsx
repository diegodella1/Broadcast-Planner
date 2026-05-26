'use client';

import { getScheduleLiveState } from '@/lib/schedule-live-state';
import { formatPlayoutTimeLabel, formatTimecode } from '@/lib/time';

type LiveState = ReturnType<typeof getScheduleLiveState>;

type NowLineDockProps = {
    state: LiveState;
};

export function NowLineDock({ state }: NowLineDockProps) {
    if (!state.isToday || state.nowSeconds === null) {
        return null;
    }

    const isOnAir = Boolean(state.activeBlock);

    return (
        <div
            className={[
                'sticky top-0 z-50 border-b px-4 py-2 shadow-sm',
                isOnAir
                    ? 'border-accent-live bg-surface-selected-positive text-accent-live'
                    : 'border-warn-line bg-warn-soft text-warn-strong',
            ].join(' ')}
            aria-live="polite"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={[
                            'h-2.5 w-2.5 shrink-0 rounded-full',
                            isOnAir ? 'animate-pulse bg-accent-live' : 'bg-warn',
                        ].join(' ')}
                    />
                    <span className="shrink-0 font-bold uppercase tracking-wide">
                        Now {formatPlayoutTimeLabel(state.nowSeconds, true)}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-ink">
                        Should be playing:{' '}
                        {state.activeBlock?.title ?? 'nothing scheduled at this time'}
                    </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 font-semibold tabular-nums">
                    {state.activeBlock ? (
                        <span>
                            {formatTimecode(state.elapsedSeconds)} /{' '}
                            {formatTimecode(state.activeBlock.durationSeconds)}
                        </span>
                    ) : null}
                    {state.nextBlock ? (
                        <span className="text-muted">Next: {state.nextBlock.title}</span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

type LiveStatusBadgeProps = {
    state: LiveState;
};

export function LiveStatusBadge({ state }: LiveStatusBadgeProps) {
    if (!state.isToday || state.nowSeconds === null) {
        return (
            <span className="rounded-md border border-line bg-panel-soft px-2 py-1 text-xs font-semibold text-muted">
                Offline planning view
            </span>
        );
    }

    return (
        <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border border-accent-live bg-surface-selected-positive px-2 py-1 text-xs font-semibold text-accent-live">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-live" />
            <span className="truncate">
                On air: {state.activeBlock?.title ?? 'No active block'} ·{' '}
                {formatPlayoutTimeLabel(state.nowSeconds, true)}
                {state.activeBlock
                    ? ` · ${formatTimecode(state.elapsedSeconds)} / ${formatTimecode(state.activeBlock.durationSeconds)}`
                    : ''}
                {state.nextBlock ? ` · Next ${state.nextBlock.title}` : ''}
            </span>
        </span>
    );
}
