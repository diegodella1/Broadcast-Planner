'use client';

import { Plus } from 'lucide-react';
import type { MouseEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { findSameDayGaps } from '@/lib/schedule-conflicts';
import { formatPlayoutTimeLabel } from '@/lib/time';
import type { ProgramBlock, ScheduleBundle } from '@/lib/types';
import type { ScheduleIssue } from '@/lib/schedule-health';

import {
    CALENDAR_SNAP_SECONDS,
    DAY_SECONDS,
    buildRundownItems,
    formatCalendarRange,
    formatScheduleDate,
    normalizeCalendarSelection,
    snapCalendarSeconds,
    type TimelineZoom,
} from './helpers';
import { LiveStatusBadge, NowLineDock } from './schedule-now-line';
import { useScheduleLiveState } from './use-schedule-live-state';
import { CalendarMiniMap, RundownTable } from './schedule-calendar-panels';

type CalendarScheduleViewProps = {
    date: string;
    schedule: ScheduleBundle;
    blocks: ProgramBlock[];
    issues: ScheduleIssue[];
    selectedBlockId: string;
    createdBlockId: string;
    onSelect: (blockId: string) => void;
    onAdd: (startSeconds?: number, durationSeconds?: number) => void;
};

export function CalendarScheduleView({
    date,
    schedule,
    blocks,
    issues,
    selectedBlockId,
    createdBlockId,
    onSelect,
    onAdd,
}: CalendarScheduleViewProps) {
    const [zoom, setZoom] = useState<TimelineZoom>('work');
    const [dragStartSeconds, setDragStartSeconds] = useState<number | null>(null);
    const [dragCurrentSeconds, setDragCurrentSeconds] = useState<number | null>(null);
    const [viewportStartSeconds, setViewportStartSeconds] = useState(0);
    const [viewportDurationSeconds, setViewportDurationSeconds] = useState(6 * 3600);
    const hasAutoScrolledRef = useRef(false);
    const suppressClickRef = useRef(false);
    const pointerSelectionRef = useRef(false);
    const timezone = schedule.day?.timezone ?? 'America/Los_Angeles';
    const liveState = useScheduleLiveState(date, timezone, blocks);
    const gaps = schedule.day ? findSameDayGaps(blocks, schedule.day.id) : [];
    const issueMap = new Map(
        issues.filter((issue) => issue.blockId).map((issue) => [issue.blockId, issue]),
    );
    const hasReadyFallback = schedule.mediaAssets.some(
        (asset) => asset.assetType === 'fallback' && asset.status === 'ready',
    );
    const selection =
        dragStartSeconds !== null && dragCurrentSeconds !== null
            ? normalizeCalendarSelection(dragStartSeconds, dragCurrentSeconds)
            : null;
    const viewportEndSeconds = Math.min(
        DAY_SECONDS,
        viewportStartSeconds + viewportDurationSeconds,
    );
    const timelineItems = buildRundownItems(blocks, gaps);
    const visibleItems = timelineItems.filter(
        (item) => item.endSeconds > viewportStartSeconds && item.startSeconds < viewportEndSeconds,
    );
    const activeItem = liveState.activeBlock
        ? timelineItems.find(
              (item) => item.kind === 'block' && item.block.id === liveState.activeBlock?.id,
          )
        : liveState.nowSeconds !== null
          ? timelineItems.find(
                (item) =>
                    item.kind === 'gap' &&
                    item.startSeconds <= liveState.nowSeconds! &&
                    item.endSeconds > liveState.nowSeconds!,
            )
          : null;
    const nextGap = gaps.find(
        (gap) => gap.durationSeconds > 0 && gap.startTimeSeconds >= (liveState.nowSeconds ?? 0),
    );

    useEffect(() => {
        hasAutoScrolledRef.current = false;
    }, [date]);

    useEffect(() => {
        if (!liveState.isToday || liveState.nowSeconds === null || hasAutoScrolledRef.current) {
            return;
        }
        showNow();
        hasAutoScrolledRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveState.isToday, liveState.nowSeconds]);

    function setViewport(startSeconds: number, durationSeconds = viewportDurationSeconds) {
        const safeDuration = Math.max(15 * 60, Math.min(DAY_SECONDS, durationSeconds));
        setViewportDurationSeconds(safeDuration);
        setViewportStartSeconds(
            Math.max(0, Math.min(DAY_SECONDS - safeDuration, Math.floor(startSeconds))),
        );
    }

    function showNow() {
        const nowSeconds = liveState.nowSeconds ?? 0;
        setZoom('work');
        setViewport(Math.max(0, nowSeconds - 5 * 60), 30 * 60);
    }

    function showNextGap() {
        const gap = nextGap ?? gaps[0];

        if (!gap) {
            return;
        }
        setZoom('detail');
        setViewport(
            Math.max(0, gap.startTimeSeconds - 5 * 60),
            Math.max(15 * 60, gap.durationSeconds + 10 * 60),
        );
    }

    function showFullDay() {
        setZoom('overview');
        setViewport(0, DAY_SECONDS);
    }

    function zoomBy(direction: -1 | 1) {
        const durations = [15 * 60, 30 * 60, 60 * 60, 2 * 3600, 6 * 3600, 12 * 3600, DAY_SECONDS];
        const currentIndex = durations.reduce(
            (closest, duration, index) =>
                Math.abs(duration - viewportDurationSeconds) <
                Math.abs(durations[closest]! - viewportDurationSeconds)
                    ? index
                    : closest,
            0,
        );
        const nextDuration =
            durations[Math.max(0, Math.min(durations.length - 1, currentIndex + direction))]!;
        const center = viewportStartSeconds + viewportDurationSeconds / 2;
        setViewport(center - nextDuration / 2, nextDuration);
        setZoom(
            nextDuration === DAY_SECONDS ? 'overview' : nextDuration <= 3600 ? 'detail' : 'work',
        );
    }

    function addAtPointer(event: MouseEvent<HTMLDivElement>) {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;

            return;
        }

        if ((event.target as HTMLElement).closest('[data-calendar-block]')) {
            return;
        }

        if ((event.target as HTMLElement).closest('[data-calendar-gap]')) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
        onAdd(snapCalendarSeconds((y / rect.height) * DAY_SECONDS));
    }

    function secondsFromClientY(element: HTMLDivElement, clientY: number) {
        if (!Number.isFinite(clientY)) {
            return 0;
        }
        const rect = element.getBoundingClientRect();
        const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);

        return snapCalendarSeconds((y / rect.height) * DAY_SECONDS);
    }

    function secondsFromPointer(event: PointerEvent<HTMLDivElement>) {
        return secondsFromClientY(event.currentTarget, event.clientY);
    }

    function secondsFromMouse(event: MouseEvent<HTMLDivElement>) {
        return secondsFromClientY(event.currentTarget, event.clientY);
    }

    function startMouseSelection(event: MouseEvent<HTMLDivElement>) {
        if (pointerSelectionRef.current) {
            return;
        }

        if ((event.target as HTMLElement).closest('[data-calendar-block]')) {
            return;
        }

        if ((event.target as HTMLElement).closest('[data-calendar-gap]')) {
            return;
        }
        const seconds = secondsFromMouse(event);
        setDragStartSeconds(seconds);
        setDragCurrentSeconds(Math.min(DAY_SECONDS, seconds + CALENDAR_SNAP_SECONDS));
    }

    function updateMouseSelection(event: MouseEvent<HTMLDivElement>) {
        if (pointerSelectionRef.current) {
            return;
        }

        if (dragStartSeconds === null) {
            return;
        }
        setDragCurrentSeconds(secondsFromMouse(event));
    }

    function finishMouseSelection() {
        if (pointerSelectionRef.current) {
            return;
        }

        if (dragStartSeconds === null || dragCurrentSeconds === null) {
            return;
        }
        const next = normalizeCalendarSelection(dragStartSeconds, dragCurrentSeconds);
        setDragStartSeconds(null);
        setDragCurrentSeconds(null);

        if (next.durationSeconds > CALENDAR_SNAP_SECONDS) {
            suppressClickRef.current = true;
            onAdd(next.startSeconds, next.durationSeconds);
        }
    }

    function startSelection(event: PointerEvent<HTMLDivElement>) {
        if ((event.target as HTMLElement).closest('[data-calendar-block]')) {
            return;
        }

        if ((event.target as HTMLElement).closest('[data-calendar-gap]')) {
            return;
        }
        pointerSelectionRef.current = true;
        const seconds = secondsFromPointer(event);
        setDragStartSeconds(seconds);
        setDragCurrentSeconds(Math.min(DAY_SECONDS, seconds + CALENDAR_SNAP_SECONDS));
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function updateSelection(event: PointerEvent<HTMLDivElement>) {
        if (dragStartSeconds === null) {
            return;
        }
        setDragCurrentSeconds(secondsFromPointer(event));
    }

    function finishSelection(event: PointerEvent<HTMLDivElement>) {
        if (dragStartSeconds === null || dragCurrentSeconds === null) {
            return;
        }
        const next = normalizeCalendarSelection(dragStartSeconds, dragCurrentSeconds);
        setDragStartSeconds(null);
        setDragCurrentSeconds(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
        window.setTimeout(() => {
            pointerSelectionRef.current = false;
        }, 0);

        if (next.durationSeconds > CALENDAR_SNAP_SECONDS) {
            suppressClickRef.current = true;
            onAdd(next.startSeconds, next.durationSeconds);
        }
    }

    // Suppress unused variable lint — activeItem is computed for potential future use
    void activeItem;

    return (
        <div className="bg-panel">
            <div className="border-b border-line bg-black px-4 py-4 text-white">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">
                            Broadcast rundown
                        </p>
                        <h3 className="mt-2 truncate text-2xl font-semibold tracking-normal">
                            {liveState.activeBlock?.title ??
                                (activeItem?.kind === 'gap'
                                    ? 'Fallback / open time'
                                    : 'No block on air')}
                        </h3>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/65">
                            <span className="rounded border border-white/15 px-2 py-1 tabular-nums">
                                {formatScheduleDate(date, schedule.day?.timezone)}
                            </span>
                            <span className="rounded border border-white/15 px-2 py-1 tabular-nums">
                                View{' '}
                                {formatCalendarRange(viewportStartSeconds, viewportDurationSeconds)}
                            </span>
                            <span
                                className={[
                                    'rounded border px-2 py-1',
                                    hasReadyFallback
                                        ? 'border-emerald-400/40 text-emerald-300'
                                        : 'border-amber-400/45 text-amber-200',
                                ].join(' ')}
                            >
                                Fallback {hasReadyFallback ? 'ready' : 'missing'}
                            </span>
                        </div>
                    </div>
                    <div className="grid gap-2 text-sm">
                        <div className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                                Now
                            </p>
                            <p className="mt-1 truncate font-semibold">
                                {liveState.isToday && liveState.nowSeconds !== null
                                    ? `${formatPlayoutTimeLabel(liveState.nowSeconds, true)} · ${
                                          liveState.activeBlock?.title ?? 'fallback / gap'
                                      }`
                                    : 'Planning view'}
                            </p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                                Next
                            </p>
                            <p className="mt-1 truncate font-semibold">
                                {liveState.nextBlock
                                    ? `${formatPlayoutTimeLabel(liveState.nextBlock.startTimeSeconds, true)} · ${liveState.nextBlock.title}`
                                    : 'No next block'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                    <p className="text-sm font-semibold">Lente operativa</p>
                    <p className="mt-1 text-xs text-muted">
                        Pick an open slot, then choose content. Short ads and promos stay readable
                        even when they only run for seconds.
                    </p>
                    {!blocks.length ? (
                        <p className="mt-1 text-xs font-semibold text-accent-positive">
                            Empty day. Click any time slot on the mini map to add a block.
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <LiveStatusBadge state={liveState} />
                    <button
                        type="button"
                        className="btn-secondary min-h-8 px-2"
                        onClick={showNow}
                        disabled={!liveState.isToday}
                    >
                        Now
                    </button>
                    <button
                        type="button"
                        className="btn-secondary min-h-8 px-2"
                        onClick={showNextGap}
                        disabled={!gaps.length}
                    >
                        Next gap
                    </button>
                    <button
                        type="button"
                        className="btn-secondary min-h-8 px-2"
                        onClick={showFullDay}
                    >
                        Full day
                    </button>
                    <div
                        className="flex rounded-md border border-line bg-surface p-0.5"
                        aria-label="Zoom"
                    >
                        <button
                            type="button"
                            className="min-h-7 rounded px-2 text-xs font-semibold text-muted hover:bg-panel-soft"
                            onClick={() => zoomBy(-1)}
                        >
                            -
                        </button>
                        <span className="grid min-h-7 min-w-16 place-items-center rounded bg-ink px-2 text-xs font-semibold capitalize text-surface">
                            {zoom}
                        </span>
                        <button
                            type="button"
                            className="min-h-7 rounded px-2 text-xs font-semibold text-muted hover:bg-panel-soft"
                            onClick={() => zoomBy(1)}
                        >
                            +
                        </button>
                    </div>
                    <button
                        type="button"
                        className="btn-secondary min-h-8 px-2"
                        onClick={() => onAdd()}
                    >
                        <Plus size={14} aria-hidden="true" />
                        Add Block
                    </button>
                </div>
            </div>
            <NowLineDock state={liveState} />
            <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_170px]">
                <RundownTable
                    visibleItems={visibleItems}
                    selectedBlockId={selectedBlockId}
                    createdBlockId={createdBlockId}
                    hasReadyFallback={hasReadyFallback}
                    liveState={liveState}
                    issueMap={issueMap}
                    viewportStartSeconds={viewportStartSeconds}
                    viewportDurationSeconds={viewportDurationSeconds}
                    onSelect={onSelect}
                    onAdd={onAdd}
                />
                <CalendarMiniMap
                    blocks={blocks}
                    gaps={gaps}
                    selection={selection}
                    selectedBlockId={selectedBlockId}
                    createdBlockId={createdBlockId}
                    viewportStartSeconds={viewportStartSeconds}
                    viewportDurationSeconds={viewportDurationSeconds}
                    liveState={liveState}
                    onSelect={onSelect}
                    onAdd={onAdd}
                    addAtPointer={addAtPointer}
                    startSelection={startSelection}
                    updateSelection={updateSelection}
                    finishSelection={finishSelection}
                    startMouseSelection={startMouseSelection}
                    updateMouseSelection={updateMouseSelection}
                    finishMouseSelection={finishMouseSelection}
                    onPointerCancel={() => {
                        setDragStartSeconds(null);
                        setDragCurrentSeconds(null);
                        pointerSelectionRef.current = false;
                    }}
                />
            </div>
        </div>
    );
}
