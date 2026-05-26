'use client';

import { closestCenter, DndContext, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, Copy, GripVertical, Pencil } from 'lucide-react';

import { PlayoutTime } from '@/components/output/playout-time';
import { StatusPill } from '@/components/ui/status-pill';
import { Timecode } from '@/components/ui/timecode';
import type { ProgramBlock, ScheduleBundle } from '@/lib/types';

import { blockAssetLabel } from './helpers';

type RundownControlsProps = {
    date: string;
    schedule: ScheduleBundle;
    blocks: ProgramBlock[];
    selectedBlockId: string;
    disabled: boolean;
    sensors: ReturnType<typeof useSensors>;
    displayOrderedIds: string[];
    onDragEnd: (event: DragEndEvent) => void;
    onSelect: (blockId: string) => void;
    onMoveByButton: (blockId: string, delta: number) => void;
    onDuplicate: (blockId: string) => void;
    onArchive: (blockId: string) => void;
};

export function RundownControls({
    date,
    schedule,
    blocks,
    selectedBlockId,
    disabled,
    sensors,
    displayOrderedIds,
    onDragEnd,
    onSelect,
    onMoveByButton,
    onDuplicate,
    onArchive,
}: RundownControlsProps) {
    if (!blocks.length) {
        return null;
    }

    return (
        <details className="surface-panel mt-4 overflow-hidden" open>
            <summary className="cursor-pointer border-b border-line px-4 py-3 text-sm font-semibold">
                Rundown Controls
            </summary>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={displayOrderedIds} strategy={verticalListSortingStrategy}>
                    <div className="divide-y divide-line">
                        {blocks.map((block, index) => (
                            <CompactRundownRow
                                key={block.id}
                                block={block}
                                date={date}
                                schedule={schedule}
                                selected={selectedBlockId === block.id}
                                disabled={disabled}
                                canMoveUp={index > 0}
                                canMoveDown={index < blocks.length - 1}
                                onSelect={() => onSelect(block.id)}
                                onMoveUp={() => onMoveByButton(block.id, -1)}
                                onMoveDown={() => onMoveByButton(block.id, 1)}
                                onDuplicate={() => onDuplicate(block.id)}
                                onArchive={() => onArchive(block.id)}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </details>
    );
}

type CompactRundownRowProps = {
    block: ProgramBlock;
    date: string;
    schedule: ScheduleBundle;
    selected: boolean;
    disabled: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onSelect: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onArchive: () => void;
};

function CompactRundownRow({
    block,
    date,
    schedule,
    selected,
    disabled,
    canMoveUp,
    canMoveDown,
    onSelect,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onArchive,
}: CompactRundownRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: block.id,
        disabled,
    });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={[
                'grid gap-2 p-3 text-sm',
                selected ? 'bg-surface-selected-positive' : 'bg-panel',
                isDragging ? 'relative z-20 shadow-lg' : '',
            ].join(' ')}
        >
            <div className="flex min-w-0 items-start gap-2">
                <button
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-muted"
                    disabled={disabled}
                    aria-label={`Drag ${block.title}`}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-semibold">{block.title}</span>
                    <span className="block truncate text-xs text-muted">
                        <PlayoutTime airDate={date} seconds={block.startTimeSeconds} /> ·{' '}
                        <Timecode seconds={block.durationSeconds} /> ·{' '}
                        {blockAssetLabel(schedule, block)}
                    </span>
                </button>
                <StatusPill status={block.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-10">
                <button
                    className="btn-secondary min-h-8 px-2"
                    disabled={disabled || !canMoveUp}
                    onClick={onMoveUp}
                >
                    Up
                </button>
                <button
                    className="btn-secondary min-h-8 px-2"
                    disabled={disabled || !canMoveDown}
                    onClick={onMoveDown}
                >
                    Down
                </button>
                <button
                    className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
                    disabled={disabled}
                    onClick={onDuplicate}
                    aria-label={`Duplicate ${block.title}`}
                >
                    <Copy size={14} aria-hidden="true" />
                </button>
                <button
                    className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
                    disabled={disabled}
                    onClick={onArchive}
                    aria-label={`Remove ${block.title}`}
                >
                    <Archive size={14} aria-hidden="true" />
                </button>
                <button
                    className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface"
                    onClick={onSelect}
                    aria-label={`Edit ${block.title}`}
                >
                    <Pencil size={14} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
