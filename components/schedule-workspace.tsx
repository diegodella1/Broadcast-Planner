'use client';

import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { analyzeSchedule } from '@/lib/schedule-health';
import { formatTimecode } from '@/lib/time';
import type { ProgramBlock, ScheduleBundle } from '@/lib/types';

import { BulkCardLoopPanel } from './schedule/schedule-bulk-loop';
import { CalendarScheduleView } from './schedule/schedule-calendar';
import { BlockDrawer } from './schedule/schedule-drawer';
import {
    blockAssetLabel,
    buildContentOptions,
    type DrawerMode,
    formatDurationLabel,
    formatScheduleDate,
    type InitialContentFilters,
} from './schedule/helpers';
import { RundownControls } from './schedule/schedule-rundown';
import { TimelineSummary } from './schedule/schedule-timeline-summary';

type ScheduleWorkspaceProps = {
    date: string;
    schedule: ScheduleBundle;
    blocks: ProgramBlock[];
    createAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    reorderAction: (input: { orderedBlockIds: string[] }) => Promise<void>;
    resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>;
    duplicateAction: (input: { blockId: string }) => Promise<void>;
    archiveAction: (input: { blockId: string }) => Promise<void>;
    bulkCreateAction: (formData: FormData) => Promise<void>;
    initialContentValue?: string | undefined;
    initialFilters?: InitialContentFilters | undefined;
    createdBlockId?: string | undefined;
    initialMessage?: string | undefined;
};

export function ScheduleWorkspace({
    date,
    schedule,
    blocks,
    createAction,
    updateAction,
    reorderAction,
    resizeAction,
    duplicateAction,
    archiveAction,
    bulkCreateAction,
    initialContentValue,
    initialFilters,
    createdBlockId,
    initialMessage,
}: ScheduleWorkspaceProps) {
    const activeBlocks = useMemo(
        () => blocks.filter((block) => block.status !== 'archived'),
        [blocks],
    );
    const activeIds = useMemo(() => activeBlocks.map((block) => block.id), [activeBlocks]);
    const options = useMemo(() => buildContentOptions(schedule), [schedule]);
    const initialOption = options.find((option) => option.value === initialContentValue) ?? null;
    const createdBlock = activeBlocks.find((block) => block.id === createdBlockId) ?? null;
    const [orderedIds, setOrderedIds] = useState(activeIds);
    const [drawerMode, setDrawerMode] = useState<DrawerMode>(
        initialOption || (!createdBlock && activeBlocks.length === 0) ? 'add' : 'edit',
    );
    const [selectedBlockId, setSelectedBlockId] = useState(
        createdBlock?.id ?? activeBlocks[0]?.id ?? '',
    );
    const [drawerOpen, setDrawerOpen] = useState(Boolean(initialOption));
    const [message, setMessage] = useState<string | null>(initialMessage ?? null);
    const [pendingStartTime, setPendingStartTime] = useState<string | null>(null);
    const [pendingDurationSeconds, setPendingDurationSeconds] = useState<number | null>(null);
    const [isPending, startTransition] = useTransition();
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const blockById = useMemo(
        () => new Map(activeBlocks.map((block) => [block.id, block])),
        [activeBlocks],
    );
    const displayOrderedIds = useMemo(
        () => [
            ...orderedIds.filter((id) => blockById.has(id)),
            ...activeIds.filter((id) => !orderedIds.includes(id)),
        ],
        [activeIds, blockById, orderedIds],
    );
    const orderedBlocks = displayOrderedIds
        .map((id) => blockById.get(id))
        .filter(Boolean) as ProgramBlock[];
    const selectedBlock = blockById.get(selectedBlockId) ?? orderedBlocks[0] ?? null;
    const health = useMemo(
        () => analyzeSchedule(schedule, orderedBlocks),
        [orderedBlocks, schedule],
    );

    const openAdd = useCallback((startSeconds?: number, durationSeconds?: number) => {
        setDrawerMode('add');
        setSelectedBlockId('');
        setPendingStartTime(typeof startSeconds === 'number' ? formatTimecode(startSeconds) : null);
        setPendingDurationSeconds(typeof durationSeconds === 'number' ? durationSeconds : null);
        setDrawerOpen(true);
    }, []);

    const openEdit = useCallback((blockId: string) => {
        setDrawerMode('edit');
        setSelectedBlockId(blockId);
        setPendingStartTime(null);
        setPendingDurationSeconds(null);
        setDrawerOpen(true);
    }, []);

    useEffect(() => {
        function openFromHash() {
            if (window.location.hash === '#add-block') {
                openAdd();
            }
        }

        openFromHash();
        window.addEventListener('hashchange', openFromHash);

        return () => window.removeEventListener('hashchange', openFromHash);
    }, [openAdd]);

    useEffect(() => {
        if (!createdBlock) {
            return;
        }
        const element = document.getElementById(`block-${createdBlock.id}`);

        if (!element) {
            return;
        }
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => element.focus({ preventScroll: true }), 250);
    }, [createdBlock]);

    function run(action: () => Promise<void>, optimistic?: () => void) {
        setMessage(null);
        startTransition(async () => {
            try {
                optimistic?.();
                await action();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : String(error));
                setOrderedIds(activeIds);
            }
        });
    }

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;

            if (!over || active.id === over.id) {
                return;
            }
            const oldIndex = displayOrderedIds.indexOf(String(active.id));
            const newIndex = displayOrderedIds.indexOf(String(over.id));
            const nextIds = arrayMove(displayOrderedIds, oldIndex, newIndex);
            run(
                () => reorderAction({ orderedBlockIds: nextIds }),
                () => setOrderedIds(nextIds),
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [displayOrderedIds, reorderAction],
    );

    const moveByButton = useCallback(
        (id: string, delta: number) => {
            const oldIndex = displayOrderedIds.indexOf(id);
            const newIndex = oldIndex + delta;

            if (newIndex < 0 || newIndex >= displayOrderedIds.length) {
                return;
            }
            const nextIds = arrayMove(displayOrderedIds, oldIndex, newIndex);
            run(
                () => reorderAction({ orderedBlockIds: nextIds }),
                () => setOrderedIds(nextIds),
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [displayOrderedIds, reorderAction],
    );

    const handleDuplicate = useCallback(
        (blockId: string) => run(() => duplicateAction({ blockId })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [duplicateAction],
    );

    const handleArchive = useCallback(
        (blockId: string) => run(() => archiveAction({ blockId })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [archiveAction],
    );

    const editor = drawerOpen ? (
        <BlockEditorModal onClose={() => setDrawerOpen(false)}>
            <BlockDrawer
                key={`${drawerMode}-${selectedBlock?.id ?? 'new'}-${initialContentValue ?? ''}-${pendingStartTime ?? ''}-${pendingDurationSeconds ?? ''}`}
                mode={drawerMode}
                date={date}
                schedule={schedule}
                blocks={activeBlocks}
                block={drawerMode === 'edit' ? selectedBlock : null}
                options={options}
                createAction={createAction}
                updateAction={updateAction}
                resizeAction={resizeAction}
                archiveAction={archiveAction}
                initialContentValue={drawerMode === 'add' ? initialContentValue : undefined}
                initialFilters={drawerMode === 'add' ? initialFilters : undefined}
                initialStartTime={drawerMode === 'add' ? pendingStartTime : null}
                initialDurationSeconds={drawerMode === 'add' ? pendingDurationSeconds : null}
                onClose={() => setDrawerOpen(false)}
            />
        </BlockEditorModal>
    ) : null;

    return (
        <section id="add-block" className="mb-5 grid min-w-0 grid-cols-1 gap-5">
            <div className="surface-panel min-w-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                        <p className="eyebrow">Day Planner</p>
                        <h2 className="mt-1 text-xl font-semibold">Rundown</h2>
                        <p className="mt-1 text-sm text-muted">
                            {formatScheduleDate(date, schedule.day?.timezone)} ·{' '}
                            {schedule.day?.timezone ?? 'Schedule timezone'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button className="btn-primary" type="button" onClick={() => openAdd()}>
                            <Plus size={16} aria-hidden="true" />
                            Add Block
                        </button>
                    </div>
                </div>
                {message ? (
                    <div className="border-b border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-strong">
                        {message}
                    </div>
                ) : null}
                {createdBlock ? (
                    <CreatedBlockNotice date={date} schedule={schedule} block={createdBlock} />
                ) : null}
                <TimelineSummary schedule={schedule} blocks={orderedBlocks} health={health} />
                <CalendarScheduleView
                    date={date}
                    schedule={schedule}
                    blocks={orderedBlocks}
                    issues={health.issues}
                    selectedBlockId={drawerOpen && drawerMode === 'edit' ? selectedBlockId : ''}
                    createdBlockId={createdBlock?.id ?? ''}
                    onSelect={openEdit}
                    onAdd={openAdd}
                />
                <BulkCardLoopPanel schedule={schedule} action={bulkCreateAction} />
            </div>

            <RundownControls
                date={date}
                schedule={schedule}
                blocks={orderedBlocks}
                selectedBlockId={drawerOpen && drawerMode === 'edit' ? selectedBlockId : ''}
                disabled={isPending}
                sensors={sensors}
                displayOrderedIds={displayOrderedIds}
                onDragEnd={onDragEnd}
                onSelect={openEdit}
                onMoveByButton={moveByButton}
                onDuplicate={handleDuplicate}
                onArchive={handleArchive}
            />
            {editor}
        </section>
    );
}

function BlockEditorModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="w-full max-w-xl" role="dialog" aria-modal="true">
                {children}
            </div>
        </div>
    );
}

type CreatedBlockNoticeProps = {
    date: string;
    schedule: ScheduleBundle;
    block: ProgramBlock;
};

function CreatedBlockNotice({ date, schedule, block }: CreatedBlockNoticeProps) {
    const blockRange = `${formatTimecode(block.startTimeSeconds)} → ${formatTimecode(
        Math.min(86400, block.startTimeSeconds + block.durationSeconds),
    )}`;
    const durationLabel = formatDurationLabel(block.durationSeconds);
    const assetLabel = blockAssetLabel(schedule, block);

    return (
        <div
            aria-live="polite"
            className="border-b border-accent-positive bg-surface-selected-positive px-4 py-3 text-sm text-accent-positive"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase">Block Added</p>
                    <p className="mt-1 truncate font-semibold text-ink">{block.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                        {blockRange} · {durationLabel} · {assetLabel}
                    </p>
                </div>
                <a
                    className="btn-secondary min-h-8 px-2"
                    href={`/admin/schedule/${date}/blocks/${block.id}`}
                >
                    Advanced Settings
                </a>
            </div>
        </div>
    );
}
