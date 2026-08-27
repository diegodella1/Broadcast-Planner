'use client';

import { useMemo, useState } from 'react';

import { Notice } from '@/components/ui';
import {
    findScheduleConflicts,
    scheduleConflictMessage,
} from '@/lib/scheduling/schedule-conflicts';
import { slidePreviewHref } from '@/lib/helpers/slide-preview';
import { formatPlayoutTimeLabel, formatTimecode } from '@/lib/helpers/time';

import type { BlockType, MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from '@/lib/types';

type ContentOption = {
    value: string;
    title: string;
    kind: 'asset' | 'slide';
    blockType: BlockType;
    durationSeconds: number | null;
    meta: string;
    searchText: string;
    sourceType?: MediaAsset['sourceType'] | undefined;
    mediaKind?: MediaAsset['mediaKind'] | undefined;
    assetType?: MediaAsset['assetType'] | undefined;
    showName?: string | undefined;
    month?: string | undefined;
    year?: string | undefined;
    assetId?: string;
    slideId?: string;
};

const DEFAULT_MANUAL_DURATION = 30;
const ALL_FILTERS = 'all';
const DEFAULT_CONTENT_KIND = 'video';

type InitialContentFilters = {
    query?: string | undefined;
    kind?: string | undefined;
    source?: string | undefined;
    showName?: string | undefined;
    month?: string | undefined;
    year?: string | undefined;
};

export function AgendaBlockForm({
    schedule,
    action,
    initialContentValue,
    initialFilters,
}: {
    schedule: ScheduleBundle;
    action: (formData: FormData) => Promise<void>;
    initialContentValue?: string | undefined;
    initialFilters?: InitialContentFilters;
}) {
    const options = useMemo(() => buildContentOptions(schedule), [schedule]);
    const initialOption =
        options.find((option) => option.value === initialContentValue) ?? options[0];
    const [query, setQuery] = useState(initialFilters?.query ?? '');
    const [kind, setKind] = useState(
        initialFilters?.kind ?? contentKind(initialOption) ?? DEFAULT_CONTENT_KIND,
    );
    const [source, setSource] = useState(initialFilters?.source ?? ALL_FILTERS);
    const [showName, setShowName] = useState(
        initialFilters?.showName ?? initialOption?.showName ?? '',
    );
    const [month, setMonth] = useState(initialFilters?.month ?? ALL_FILTERS);
    const [year, setYear] = useState(initialFilters?.year ?? ALL_FILTERS);
    const filteredOptions = useMemo(
        () =>
            filterContentOptions(options, {
                query,
                kind,
                source: kind === 'video' ? source : ALL_FILTERS,
                showName,
                month,
                year,
            }),
        [options, query, kind, source, showName, month, year],
    );
    const availableShows = useMemo(
        () => uniqueSorted(options.map((option) => option.showName)),
        [options],
    );
    const availableYears = useMemo(
        () => uniqueSorted(options.map((option) => option.year)),
        [options],
    );
    const [contentValue, setContentValue] = useState(initialOption?.value ?? '');
    const [startTime, setStartTime] = useState(nextSuggestedStart(schedule.blocks));
    const selectedFromState = options.find((option) => option.value === contentValue) ?? null;
    const selected =
        selectedFromState &&
        filteredOptions.some((option) => option.value === selectedFromState.value)
            ? selectedFromState
            : (filteredOptions[0] ?? null);
    const [manualDuration, setManualDuration] = useState(
        String(initialOption?.durationSeconds ?? DEFAULT_MANUAL_DURATION),
    );
    const durationSeconds = Math.max(
        1,
        selected?.durationSeconds ?? Number(manualDuration || DEFAULT_MANUAL_DURATION),
    );
    const startSeconds = parseTimeInput(startTime);
    const endSeconds = Math.min(86400, startSeconds + durationSeconds);
    const conflict =
        schedule.day && selected
            ? findScheduleConflicts(
                  schedule.blocks.filter((block) => block.status !== 'archived'),
                  {
                      programDayId: schedule.day.id,
                      startTimeSeconds: startSeconds,
                      durationSeconds,
                  },
              )
            : null;
    const conflictMessage = conflict ? scheduleConflictMessage(conflict) : '';
    const canSubmit = Boolean(selected) && !conflict?.hasConflict;

    function chooseContent(value: string) {
        setContentValue(value);
        const next = options.find((option) => option.value === value);
        setManualDuration(String(next?.durationSeconds ?? DEFAULT_MANUAL_DURATION));
    }

    function chooseKind(value: string) {
        setKind(value);

        if (value !== 'video') {
            setSource(ALL_FILTERS);
            setShowName('');
            setMonth(ALL_FILTERS);
            setYear(ALL_FILTERS);
        }
    }

    return (
        <section className="surface-panel mb-5 overflow-hidden" id="add-block">
            <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">Add Block</p>
                <h2 className="mt-1 text-xl font-semibold">Choose content, time, save</h2>
                <p className="mt-1 text-sm text-muted">
                    The picker only shows ready Library items that match the selected type.
                </p>
            </div>
            <form
                action={action}
                className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[160px_minmax(0,1fr)_160px_150px]"
            >
                <div className="grid gap-3 rounded-md border border-line bg-panel-soft p-3 lg:col-span-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                        <label className="grid gap-1 text-xs font-semibold text-muted">
                            1. Type
                            <select
                                value={kind}
                                onChange={(event) => chooseKind(event.target.value)}
                                className="border border-line bg-surface px-3 py-2 text-sm font-normal text-ink"
                            >
                                <option value="video">Video</option>
                                <option value="slide">Slide</option>
                                <option value="image">Image</option>
                                <option value="fallback">Fallback</option>
                            </select>
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-muted">
                            2. Search
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={kind === 'video' ? 'Title or show' : 'Title'}
                                className="border border-line bg-surface px-3 py-2 text-sm font-normal text-ink"
                            />
                        </label>
                    </div>
                    {kind === 'video' ? (
                        <details className="rounded-md border border-line bg-surface p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-muted">
                                Provider metadata filters
                            </summary>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px]">
                                <label className="grid gap-1 text-xs font-semibold text-muted">
                                    Provider
                                    <select
                                        value={showName}
                                        onChange={(event) => setShowName(event.target.value)}
                                        className="border border-line bg-surface px-3 py-2 text-sm font-normal text-ink"
                                    >
                                        <option value="">All shows</option>
                                        {availableShows.map((show) => (
                                            <option key={show} value={show}>
                                                {show}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="grid gap-1 text-xs font-semibold text-muted">
                                    Month
                                    <select
                                        value={month}
                                        onChange={(event) => setMonth(event.target.value)}
                                        className="border border-line bg-surface px-3 py-2 text-sm font-normal text-ink"
                                    >
                                        <option value={ALL_FILTERS}>All</option>
                                        {Array.from({ length: 12 }, (_, index) =>
                                            String(index + 1).padStart(2, '0'),
                                        ).map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="grid gap-1 text-xs font-semibold text-muted">
                                    Year
                                    <select
                                        value={year}
                                        onChange={(event) => setYear(event.target.value)}
                                        className="border border-line bg-surface px-3 py-2 text-sm font-normal text-ink"
                                    >
                                        <option value={ALL_FILTERS}>All</option>
                                        {availableYears.map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </details>
                    ) : null}
                    <p className="text-xs font-semibold text-muted">
                        Showing {filteredOptions.length} of {options.length} ready items
                    </p>
                </div>
                <div className="grid gap-1">
                    <label
                        className="text-xs font-semibold text-muted"
                        htmlFor="agenda-clock-start"
                    >
                        3. Clock start (24 h)
                    </label>
                    <input
                        id="agenda-clock-start"
                        name="start_time"
                        required
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        placeholder="13:30:00"
                        aria-describedby="agenda-clock-start-help"
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    />
                    <p id="agenda-clock-start-help" className="text-[11px] font-normal text-muted">
                        Real on-air clock time, not video timecode.
                    </p>
                </div>
                <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted">
                    Content
                    <select
                        required
                        value={selected?.value ?? ''}
                        onChange={(event) => chooseContent(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    >
                        {filteredOptions.length ? null : <option value="">No ready content</option>}
                        {filteredOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.title} - {option.meta}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Duration
                    <input
                        name="duration_seconds"
                        required
                        type="number"
                        min="1"
                        value={selected?.durationSeconds ?? manualDuration}
                        readOnly={Boolean(selected?.durationSeconds)}
                        onChange={(event) => setManualDuration(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    />
                </label>
                <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase text-muted">Ends</p>
                    <p className="mt-1 font-semibold tabular-nums">
                        {formatPlayoutTimeLabel(endSeconds)}
                    </p>
                </div>
                {selected?.slideId ? (
                    <a
                        className="btn-secondary self-end justify-center"
                        href={slidePreviewHref(selected.slideId)}
                        target="_blank"
                        rel="noreferrer"
                    >
                        View Slide
                    </a>
                ) : null}
                <input type="hidden" name="title" value={selected?.title ?? ''} />
                <input type="hidden" name="block_type" value={selected?.blockType ?? 'video'} />
                <input type="hidden" name="asset_id" value={selected?.assetId ?? ''} />
                <input type="hidden" name="slide_id" value={selected?.slideId ?? ''} />
                <input type="hidden" name="pre_roll_seconds" value="0" />
                <input type="hidden" name="post_roll_seconds" value="0" />
                <div className="grid gap-2 lg:col-span-4">
                    {selected?.durationSeconds ? (
                        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-semibold text-success-strong">
                            Automatic duration: {formatTimecode(selected.durationSeconds)}
                        </p>
                    ) : (
                        <p className="rounded-md bg-info-soft px-3 py-2 text-sm font-semibold text-info-strong">
                            This content has no duration. Set how many seconds it stays on air.
                        </p>
                    )}
                    {conflict?.hasConflict ? (
                        <Notice tone="warn" title="That time is already occupied">
                            <div className="flex flex-wrap items-center gap-2">
                                <span>{conflictMessage}</span>
                                {conflict.suggestedStartSeconds !== null ? (
                                    <button
                                        type="button"
                                        className="btn-secondary min-h-8 px-2"
                                        onClick={() =>
                                            setStartTime(
                                                formatTimecode(conflict.suggestedStartSeconds!),
                                            )
                                        }
                                    >
                                        Use {formatPlayoutTimeLabel(conflict.suggestedStartSeconds)}
                                    </button>
                                ) : null}
                                {!selected?.durationSeconds &&
                                conflict.maxSafeDurationSeconds &&
                                conflict.maxSafeDurationSeconds > 0 ? (
                                    <button
                                        type="button"
                                        className="btn-secondary min-h-8 px-2"
                                        onClick={() =>
                                            setManualDuration(
                                                String(conflict.maxSafeDurationSeconds),
                                            )
                                        }
                                    >
                                        Trim to {formatTimecode(conflict.maxSafeDurationSeconds)}
                                    </button>
                                ) : null}
                            </div>
                        </Notice>
                    ) : null}
                    <button className="btn-primary w-full justify-center" disabled={!canSubmit}>
                        Save to schedule
                    </button>
                </div>
            </form>
        </section>
    );
}

function buildContentOptions(schedule: ScheduleBundle): ContentOption[] {
    const assets = schedule.mediaAssets
        .filter((asset) => asset.status === 'ready' && asset.assetType !== 'music')
        .map(assetOption);
    const slides = schedule.slideAssets
        .filter((slide) => slide.status === 'ready')
        .map(slideOption);

    return [
        ...assets.sort((a, b) => a.title.localeCompare(b.title)),
        ...slides.sort((a, b) => a.title.localeCompare(b.title)),
    ];
}

function assetOption(asset: MediaAsset): ContentOption {
    const showName = metadataText(asset, 'provider_name');
    const createdDate = parseIsoDate(metadataText(asset, 'provider_published_at'));

    return {
        value: `asset:${asset.id}`,
        title: asset.title,
        kind: 'asset',
        blockType: normalizeBlockType(asset.assetType),
        durationSeconds: asset.durationSeconds ?? null,
        meta: [
            showName,
            asset.assetType,
            asset.sourceType,
            asset.durationSeconds ? formatTimecode(asset.durationSeconds) : null,
        ]
            .filter(Boolean)
            .join(' / '),
        searchText: [
            asset.title,
            asset.description,
            asset.sourceType,
            asset.mediaKind,
            asset.assetType,
            showName,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        sourceType: asset.sourceType,
        mediaKind: asset.mediaKind,
        assetType: asset.assetType,
        showName: showName || undefined,
        month: createdDate ? String(createdDate.getUTCMonth() + 1).padStart(2, '0') : undefined,
        year: createdDate ? String(createdDate.getUTCFullYear()) : undefined,
        assetId: asset.id,
    };
}

function slideOption(slide: SlideAsset): ContentOption {
    return {
        value: `slide:${slide.id}`,
        title: slide.title,
        kind: 'slide',
        blockType: 'slide',
        durationSeconds: slide.defaultDurationSeconds ?? null,
        meta: `slide${slide.defaultDurationSeconds ? ` / ${formatTimecode(slide.defaultDurationSeconds)}` : ''}`,
        searchText: [slide.title, slide.slideType, 'slide'].join(' ').toLowerCase(),
        sourceType: undefined,
        mediaKind: 'graphic',
        assetType: 'overlay',
        slideId: slide.id,
    };
}

function filterContentOptions(options: ContentOption[], filters: Required<InitialContentFilters>) {
    const normalizedQuery = (filters.query ?? '').trim().toLowerCase();

    return options.filter((option) => {
        if (normalizedQuery && !option.searchText.includes(normalizedQuery)) {
            return false;
        }

        if (filters.kind !== ALL_FILTERS) {
            if (contentKind(option) !== filters.kind) {
                return false;
            }
        }

        if (filters.source !== ALL_FILTERS) {
            if (filters.source === 'slide') {
                if (option.kind !== 'slide') {
                    return false;
                }
            } else if (option.sourceType !== filters.source) {
                return false;
            }
        }

        if (filters.showName && option.showName !== filters.showName) {
            return false;
        }

        if (filters.month !== ALL_FILTERS && option.month !== filters.month) {
            return false;
        }

        if (filters.year !== ALL_FILTERS && option.year !== filters.year) {
            return false;
        }

        return true;
    });
}

function contentKind(option: ContentOption | undefined) {
    if (!option) {
        return undefined;
    }

    if (option.kind === 'slide') {
        return 'slide';
    }

    if (option.assetType === 'fallback') {
        return 'fallback';
    }

    if (option.mediaKind === 'image' || option.assetType === 'image') {
        return 'image';
    }

    return 'video';
}

function metadataText(asset: MediaAsset, key: string) {
    const value = asset.metadata?.[key];

    return typeof value === 'string' ? value : '';
}

function parseIsoDate(value: string) {
    if (!value) {
        return null;
    }
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueSorted(values: Array<string | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b),
    );
}

function normalizeBlockType(assetType: MediaAsset['assetType']): BlockType {
    if (assetType === 'music' || assetType === 'overlay') {
        return 'video';
    }

    return assetType;
}

function nextSuggestedStart(blocks: ProgramBlock[]) {
    const activeBlocks = blocks
        .filter((block) => block.status !== 'archived')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const last = activeBlocks[activeBlocks.length - 1];

    return formatTimecode(last ? last.startTimeSeconds + last.durationSeconds : 0);
}

function parseTimeInput(value: string) {
    const [hours = '0', minutes = '0', seconds = '0'] = value.split(':');
    const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

    if (!Number.isFinite(total)) {
        return 0;
    }

    return Math.max(0, Math.min(total, 86399));
}
