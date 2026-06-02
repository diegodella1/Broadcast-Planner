'use client';

import { ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';

import type { ContentOption } from './helpers';

import type { ProgramBlock } from '@/lib/types';
import type { ScheduleConflictResult } from '@/lib/scheduling/schedule-conflicts';

// ─── LiveObjectFields ─────────────────────────────────────────────────────────

export type LiveObjectFieldsProps = {
    liveSourceType: string;
    liveUrl: string;
    onSourceTypeChange: (value: string) => void;
    onUrlChange: (value: string) => void;
};

export function LiveObjectFields({
    liveSourceType,
    liveUrl,
    onSourceTypeChange,
    onUrlChange,
}: LiveObjectFieldsProps) {
    return (
        <div className="grid gap-3 rounded-md border border-info-line bg-info-soft p-3">
            <p className="text-xs font-semibold text-info-strong">Live source</p>
            <label className="grid gap-1 text-xs font-semibold text-muted">
                Source
                <select
                    value={liveSourceType}
                    onChange={(event) => onSourceTypeChange(event.target.value)}
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                    <option value="youtube">YouTube</option>
                    <option value="hls">HLS</option>
                </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
                Live URL
                <input
                    value={liveUrl}
                    onChange={(event) => onUrlChange(event.target.value)}
                    placeholder={
                        liveSourceType === 'hls'
                            ? 'https://example.com/live.m3u8'
                            : 'https://www.youtube.com/watch?v=...'
                    }
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
            </label>
            <p className="text-xs text-info-strong">
                Estimated duration is for planning only. Output stays on this live until auto-end or
                an operator ends it.
            </p>
        </div>
    );
}

// ─── ReutersStreamFields ──────────────────────────────────────────────────────

export type ReutersStreamFieldsProps = {
    reutersStreamUrl: string;
    reutersStreamLabel: string;
    reutersStreamExpiresAt: string;
    title: string;
    onUrlChange: (value: string) => void;
    onLabelChange: (value: string) => void;
    onExpiresAtChange: (value: string) => void;
    onTitleChange: (value: string) => void;
};

export function ReutersStreamFields({
    reutersStreamUrl,
    reutersStreamLabel,
    reutersStreamExpiresAt,
    title,
    onUrlChange,
    onLabelChange,
    onExpiresAtChange,
    onTitleChange,
}: ReutersStreamFieldsProps) {
    return (
        <div className="grid gap-3 rounded-md border border-info-line bg-info-soft p-3">
            <p className="text-xs font-semibold text-info-strong">Reuters dynamic stream</p>
            <label className="grid gap-1 text-xs font-semibold text-muted">
                HLS or RTMP URL
                <input
                    name="reuters_stream_url"
                    value={reutersStreamUrl}
                    onChange={(event) => {
                        onUrlChange(event.target.value);

                        if (event.target.value && !title) {
                            onTitleChange('Reuters live');
                        }
                    }}
                    placeholder="https://...m3u8 or rtmp://..."
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Stream label
                    <input
                        name="reuters_stream_label"
                        value={reutersStreamLabel}
                        onChange={(event) => onLabelChange(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Expires at
                    <input
                        name="reuters_stream_expires_at"
                        type="datetime-local"
                        value={reutersStreamExpiresAt}
                        onChange={(event) => onExpiresAtChange(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    />
                </label>
            </div>
        </div>
    );
}

// ─── PreviouslyRecordedFields ─────────────────────────────────────────────────

export type PreviouslyRecordedFieldsProps = {
    enabled: boolean;
    position: string;
    onEnabledChange: (value: boolean) => void;
    onPositionChange: (value: string) => void;
};

export function PreviouslyRecordedFields({
    enabled,
    position,
    onEnabledChange,
    onPositionChange,
}: PreviouslyRecordedFieldsProps) {
    return (
        <div className="grid gap-3 rounded-md border border-line bg-panel-soft p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => onEnabledChange(event.target.checked)}
                />
                Previously Recorded bug
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
                Screen position
                <select
                    value={position}
                    onChange={(event) => onPositionChange(event.target.value)}
                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                >
                    <option value="top_right">Top right</option>
                    <option value="top_left">Top left</option>
                    <option value="bottom_right">Bottom right</option>
                    <option value="bottom_left">Bottom left</option>
                </select>
            </label>
        </div>
    );
}

// ─── ConflictResolutionPanel ──────────────────────────────────────────────────

type ConflictResolution = 'insert_shift' | 'archive_conflicts' | 'strict';

export type ConflictResolutionPanelProps = {
    conflict: ScheduleConflictResult;
    conflictMessage: string;
    conflictResolution: ConflictResolution;
    onResolutionChange: (value: ConflictResolution) => void;
    onStartAfterConflict: (seconds: number) => void;
};

export function ConflictResolutionPanel({
    conflict,
    conflictMessage,
    conflictResolution,
    onResolutionChange,
    onStartAfterConflict,
}: ConflictResolutionPanelProps) {
    return (
        <div className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
            <p className="font-semibold">{conflictMessage}</p>
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    className={
                        conflictResolution === 'insert_shift'
                            ? 'btn-primary min-h-8 px-2'
                            : 'btn-secondary min-h-8 px-2'
                    }
                    onClick={() => onResolutionChange('insert_shift')}
                >
                    Make room
                </button>
                {conflict.suggestedStartSeconds !== null ? (
                    <button
                        type="button"
                        className="btn-secondary min-h-8 px-2"
                        onClick={() => onStartAfterConflict(conflict.suggestedStartSeconds!)}
                    >
                        Start after conflict
                    </button>
                ) : null}
                <button
                    type="button"
                    className={
                        conflictResolution === 'archive_conflicts'
                            ? 'btn-primary min-h-8 px-2'
                            : 'btn-secondary min-h-8 px-2'
                    }
                    onClick={() => onResolutionChange('archive_conflicts')}
                >
                    Replace overlap
                </button>
                <button
                    type="button"
                    className={
                        conflictResolution === 'strict'
                            ? 'btn-primary min-h-8 px-2'
                            : 'btn-secondary min-h-8 px-2'
                    }
                    onClick={() => onResolutionChange('strict')}
                >
                    Do not allow overlap
                </button>
            </div>
        </div>
    );
}

// ─── BlockEditActions ─────────────────────────────────────────────────────────

export type BlockEditActionsProps = {
    date: string;
    block: ProgramBlock;
    resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>;
    archiveAction: (input: { blockId: string }) => Promise<void>;
};

export function BlockEditActions({
    date,
    block,
    resizeAction,
    archiveAction,
}: BlockEditActionsProps) {
    const [isPending, startTransition] = useTransition();

    return (
        <div className="grid gap-2 border-t border-line p-4">
            <button
                type="button"
                className="btn-secondary justify-center"
                disabled={isPending}
                onClick={() =>
                    startTransition(async () => {
                        await resizeAction({
                            blockId: block.id,
                            durationSeconds: block.durationSeconds + 300,
                        });
                    })
                }
            >
                Add 5 minutes
            </button>
            <button
                type="button"
                className="btn-danger justify-center"
                disabled={isPending}
                onClick={() => {
                    if (window.confirm(`Remove "${block.title}" from the rundown?`)) {
                        startTransition(async () => {
                            await archiveAction({ blockId: block.id });
                        });
                    }
                }}
            >
                Remove from Rundown
            </button>
            <Link
                className="btn-secondary justify-center"
                href={`/admin/schedule/${date}/blocks/${block.id}`}
            >
                <ExternalLink size={15} aria-hidden="true" />
                Advanced Settings
            </Link>
        </div>
    );
}

// ─── ContentPicker ────────────────────────────────────────────────────────────

export type ContentPickerProps = {
    kind: string;
    query: string;
    showName: string;
    availableShows: string[];
    filteredOptions: ContentOption[];
    selectedValue: string;
    onQueryChange: (value: string) => void;
    onShowChange: (value: string) => void;
    onChooseContent: (value: string) => void;
};

export function ContentPicker({
    kind,
    query,
    showName,
    availableShows,
    filteredOptions,
    selectedValue,
    onQueryChange,
    onShowChange,
    onChooseContent,
}: ContentPickerProps) {
    return (
        <>
            <label className="grid gap-1 text-xs font-semibold text-muted">
                Find ready content
                <span className="relative">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                        aria-hidden="true"
                    />
                    <input
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Title or show"
                        className="border border-line px-9 py-2 text-sm font-normal text-ink"
                    />
                </span>
            </label>

            {kind === 'video' && availableShows.length ? (
                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Show
                    <select
                        value={showName}
                        onChange={(event) => onShowChange(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    >
                        <option value="">All shows</option>
                        {availableShows.map((show) => (
                            <option key={show} value={show}>
                                {show}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}

            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-line bg-panel-soft p-2">
                {filteredOptions.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={[
                            'rounded-md border px-3 py-2 text-left text-sm',
                            selectedValue === option.value
                                ? 'border-accent-positive bg-surface-selected-positive text-accent-positive'
                                : 'border-line bg-surface text-ink hover:bg-panel',
                        ].join(' ')}
                        onClick={() => onChooseContent(option.value)}
                    >
                        <span className="block truncate font-semibold">{option.title}</span>
                        <span className="mt-0.5 block truncate text-xs opacity-75">
                            {option.meta}
                        </span>
                    </button>
                ))}
                {!filteredOptions.length ? (
                    <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
                        No ready content for this type. Add it in Library first, then come back
                        here.
                    </p>
                ) : null}
            </div>
        </>
    );
}
