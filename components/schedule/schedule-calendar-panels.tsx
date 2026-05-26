'use client';

import type { MouseEvent, PointerEvent } from 'react';

import { getScheduleLiveState } from '@/lib/scheduling/schedule-live-state';
import { formatPlayoutTimeLabel } from '@/lib/helpers/time';
import type { ProgramBlock } from '@/lib/types';

import {
    buildRundownItems,
    CalendarSelection,
    DAY_SECONDS,
    DEFAULT_MANUAL_DURATION,
    formatBlockRange,
    formatCalendarRange,
    formatDurationLabel,
    typeLabel,
} from './helpers';

// ─── RundownTable ────────────────────────────────────────────────────────────

export type RundownTableProps = {
    visibleItems: ReturnType<typeof buildRundownItems>;
    selectedBlockId: string;
    createdBlockId: string;
    hasReadyFallback: boolean;
    liveState: ReturnType<typeof getScheduleLiveState>;
    issueMap: Map<string | undefined, { severity: string }>;
    viewportStartSeconds: number;
    viewportDurationSeconds: number;
    onSelect: (blockId: string) => void;
    onAdd: (startSeconds?: number, durationSeconds?: number) => void;
};

export function RundownTable({
    visibleItems,
    selectedBlockId,
    createdBlockId,
    hasReadyFallback,
    liveState,
    issueMap,
    viewportStartSeconds,
    viewportDurationSeconds,
    onSelect,
    onAdd,
}: RundownTableProps) {
    return (
        <div className="min-w-0 overflow-hidden rounded-md border border-line bg-surface">
            <div className="grid grid-cols-[96px_minmax(0,1fr)_96px_92px] border-b border-line bg-panel-soft px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                <span>Clock</span>
                <span>Rundown</span>
                <span>Block len</span>
                <span>Status</span>
            </div>
            <div className="divide-y divide-line">
                {visibleItems.length ? (
                    visibleItems.map((item) =>
                        item.kind === 'gap' ? (
                            <button
                                key={`gap-${item.startSeconds}-${item.durationSeconds}`}
                                type="button"
                                data-calendar-gap
                                onClick={() => onAdd(item.startSeconds, item.durationSeconds)}
                                className="grid w-full grid-cols-[96px_minmax(0,1fr)_96px_92px] items-center gap-3 px-3 py-3 text-left text-sm hover:bg-warn-soft"
                            >
                                <span className="font-semibold tabular-nums text-warn-strong">
                                    {formatPlayoutTimeLabel(item.startSeconds)}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold text-ink">
                                        {hasReadyFallback ? 'Fallback loop' : 'Open gap'}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-muted">
                                        {formatCalendarRange(
                                            item.startSeconds,
                                            item.durationSeconds,
                                        )}
                                    </span>
                                </span>
                                <span className="tabular-nums text-muted">
                                    {formatDurationLabel(item.durationSeconds)}
                                </span>
                                <span
                                    className={
                                        hasReadyFallback ? 'text-success' : 'text-warn-strong'
                                    }
                                >
                                    {hasReadyFallback ? 'Covered' : 'Risk'}
                                </span>
                            </button>
                        ) : (
                            <button
                                key={item.block.id}
                                id={`block-${item.block.id}`}
                                type="button"
                                data-calendar-block
                                onClick={() => onSelect(item.block.id)}
                                aria-label={`${createdBlockId === item.block.id ? 'New block: ' : 'Edit '}${item.block.title}, ${formatBlockRange(item.block)}`}
                                className={[
                                    'grid w-full grid-cols-[96px_minmax(0,1fr)_96px_92px] items-center gap-3 px-3 py-3 text-left text-sm hover:bg-panel-soft',
                                    selectedBlockId === item.block.id
                                        ? 'bg-surface-selected-positive'
                                        : '',
                                    createdBlockId === item.block.id
                                        ? 'schedule-new-block bg-surface-selected-positive'
                                        : '',
                                    liveState.activeBlock?.id === item.block.id
                                        ? 'bg-surface-selected-positive text-accent-live'
                                        : '',
                                ].join(' ')}
                            >
                                <span className="font-semibold tabular-nums">
                                    {formatPlayoutTimeLabel(item.block.startTimeSeconds)}
                                </span>
                                <span className="min-w-0">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="truncate font-semibold text-ink">
                                            {item.block.title}
                                        </span>
                                        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                                            {typeLabel(item.block.blockType)}
                                        </span>
                                        {createdBlockId === item.block.id ? (
                                            <span className="shrink-0 rounded border border-accent-positive/30 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent-positive">
                                                New
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-muted">
                                        {formatBlockRange(item.block)}
                                    </span>
                                </span>
                                <span className="tabular-nums text-muted">
                                    {formatDurationLabel(item.block.durationSeconds)}
                                </span>
                                <span
                                    className={
                                        issueMap.get(item.block.id)?.severity === 'critical'
                                            ? 'text-danger'
                                            : issueMap.get(item.block.id)?.severity === 'warning'
                                              ? 'text-warn'
                                              : 'text-muted'
                                    }
                                >
                                    {liveState.activeBlock?.id === item.block.id
                                        ? 'On air'
                                        : (issueMap.get(item.block.id)?.severity ??
                                          item.block.status)}
                                </span>
                            </button>
                        ),
                    )
                ) : (
                    <button
                        type="button"
                        onClick={() =>
                            onAdd(
                                viewportStartSeconds,
                                Math.min(DEFAULT_MANUAL_DURATION, viewportDurationSeconds),
                            )
                        }
                        className="w-full px-4 py-10 text-center text-sm font-semibold text-muted hover:bg-panel-soft"
                    >
                        No blocks in this lens. Add content here.
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── CalendarMiniMap ─────────────────────────────────────────────────────────

type ScheduleGapEntry = {
    startTimeSeconds: number;
    durationSeconds: number;
};

export type CalendarMiniMapProps = {
    blocks: ProgramBlock[];
    gaps: ScheduleGapEntry[];
    selection: CalendarSelection;
    selectedBlockId: string;
    createdBlockId: string;
    viewportStartSeconds: number;
    viewportDurationSeconds: number;
    liveState: ReturnType<typeof getScheduleLiveState>;
    onSelect: (blockId: string) => void;
    onAdd: (startSeconds?: number, durationSeconds?: number) => void;
    addAtPointer: (event: MouseEvent<HTMLDivElement>) => void;
    startSelection: (event: PointerEvent<HTMLDivElement>) => void;
    updateSelection: (event: PointerEvent<HTMLDivElement>) => void;
    finishSelection: (event: PointerEvent<HTMLDivElement>) => void;
    startMouseSelection: (event: MouseEvent<HTMLDivElement>) => void;
    updateMouseSelection: (event: MouseEvent<HTMLDivElement>) => void;
    finishMouseSelection: () => void;
    onPointerCancel: () => void;
};

export function CalendarMiniMap({
    blocks,
    gaps,
    selection,
    selectedBlockId,
    createdBlockId,
    viewportStartSeconds,
    viewportDurationSeconds,
    liveState,
    onSelect,
    onAdd,
    addAtPointer,
    startSelection,
    updateSelection,
    finishSelection,
    startMouseSelection,
    updateMouseSelection,
    finishMouseSelection,
    onPointerCancel,
}: CalendarMiniMapProps) {
    return (
        <div
            className="relative h-[520px] rounded-md border border-line bg-panel-soft"
            aria-label="Calendar schedule"
            data-testid="calendar-schedule-canvas"
            role="button"
            tabIndex={0}
            onClick={addAtPointer}
            onPointerDown={startSelection}
            onPointerMove={updateSelection}
            onPointerUp={finishSelection}
            onPointerCancel={onPointerCancel}
            onMouseDown={startMouseSelection}
            onMouseMove={updateMouseSelection}
            onMouseUp={finishMouseSelection}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    onAdd();
                }
            }}
        >
            {Array.from({ length: 24 }, (_, hour) => (
                <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-line/70"
                    style={{ top: `${(hour / 24) * 100}%` }}
                >
                    <span className="absolute left-2 top-0 text-[9px] font-semibold tabular-nums text-muted">
                        {String(hour).padStart(2, '0')}
                    </span>
                </div>
            ))}
            <div
                className="absolute left-8 right-2 rounded border border-accent-positive bg-surface-selected-positive/50"
                style={{
                    top: `${(viewportStartSeconds / DAY_SECONDS) * 100}%`,
                    height: `${Math.max((viewportDurationSeconds / DAY_SECONDS) * 100, 2)}%`,
                }}
            />
            {selection ? <CalendarSelectionOverlay selection={selection} /> : null}
            {gaps.map((gap) => (
                <button
                    key={`map-gap-${gap.startTimeSeconds}-${gap.durationSeconds}`}
                    type="button"
                    data-calendar-gap
                    onClick={() => onAdd(gap.startTimeSeconds, gap.durationSeconds)}
                    className="absolute left-8 right-2 rounded-sm border border-dashed border-warn-line bg-warn-soft"
                    style={{
                        top: `${(gap.startTimeSeconds / DAY_SECONDS) * 100}%`,
                        height: `${Math.max((gap.durationSeconds / DAY_SECONDS) * 100, 1.3)}%`,
                    }}
                    aria-label={`Fallback gap ${formatCalendarRange(gap.startTimeSeconds, gap.durationSeconds)}`}
                />
            ))}
            {blocks.map((block) => (
                <button
                    key={`map-${block.id}`}
                    type="button"
                    data-calendar-block
                    onClick={() => onSelect(block.id)}
                    className={[
                        'absolute left-8 right-2 rounded-sm border',
                        liveState.activeBlock?.id === block.id
                            ? 'border-accent-live bg-accent-live'
                            : selectedBlockId === block.id || createdBlockId === block.id
                              ? 'border-accent-positive bg-accent-positive'
                              : 'border-line bg-ink/80',
                    ].join(' ')}
                    style={{
                        top: `${(block.startTimeSeconds / DAY_SECONDS) * 100}%`,
                        height: `${Math.max((block.durationSeconds / DAY_SECONDS) * 100, 1.3)}%`,
                    }}
                    aria-label={`${createdBlockId === block.id ? 'New block: ' : 'Edit '}${block.title}, ${formatBlockRange(block)}`}
                />
            ))}
        </div>
    );
}

// ─── CalendarSelectionOverlay ─────────────────────────────────────────────────

type CalendarSelectionOverlayProps = {
    selection: NonNullable<CalendarSelection>;
};

function CalendarSelectionOverlay({ selection }: CalendarSelectionOverlayProps) {
    return (
        <div
            className="pointer-events-none absolute left-8 right-2 z-50 rounded-sm border border-accent-positive bg-surface-selected-positive/90 px-2 py-1 text-[10px] font-semibold text-accent-positive shadow-lg"
            style={{
                top: `${(selection.startSeconds / DAY_SECONDS) * 100}%`,
                height: `${Math.max((selection.durationSeconds / DAY_SECONDS) * 100, 1.3)}%`,
            }}
        >
            <span className="block truncate tabular-nums">
                {formatCalendarRange(selection.startSeconds, selection.durationSeconds)} ·{' '}
                {formatDurationLabel(selection.durationSeconds)}
            </span>
        </div>
    );
}
