'use client';

import { X } from 'lucide-react';
import { useState, useMemo } from 'react';

import {
    findScheduleConflicts,
    scheduleConflictMessage,
} from '@/lib/scheduling/schedule-conflicts';
import { slidePreviewHref } from '@/lib/helpers/slide-preview';
import { formatPlayoutTimeLabel } from '@/lib/helpers/time';
import type { BlockType, ProgramBlock, ProgramStatus, ScheduleBundle } from '@/lib/types';

import { ScheduleImpactPreview } from './schedule-impact-preview';
import {
    type ContentOption,
    type DrawerMode,
    type InitialContentFilters,
    DAY_SECONDS,
    DEFAULT_MANUAL_DURATION,
    compactDurationLabel,
    contentKind,
    contentValueForBlock,
    formatDurationInput,
    metadataTextFromBlock,
    nextSuggestedStart,
    parseHumanDuration,
    parseTimeInput,
    recordedBugPosition,
    recordedBugPositionValue,
    safePreviewInsertShift,
    typeLabel,
    uniqueSorted,
} from './helpers';
import {
    BlockEditActions,
    ConflictResolutionPanel,
    ContentPicker,
    LiveObjectFields,
    PreviouslyRecordedFields,
    ReutersStreamFields,
} from './schedule-drawer-fields';

type BlockKind = BlockType | 'live';

type BlockDrawerProps = {
    mode: DrawerMode;
    date: string;
    schedule: ScheduleBundle;
    blocks: ProgramBlock[];
    block: ProgramBlock | null;
    options: ContentOption[];
    createAction: (formData: FormData) => Promise<void>;
    updateAction: (formData: FormData) => Promise<void>;
    resizeAction: (input: { blockId: string; durationSeconds: number }) => Promise<void>;
    archiveAction: (input: { blockId: string }) => Promise<void>;
    initialContentValue?: string | undefined;
    initialFilters?: InitialContentFilters | undefined;
    initialStartTime?: string | null | undefined;
    initialDurationSeconds?: number | null | undefined;
    onClose: () => void;
};

export function BlockDrawer({
    mode,
    date,
    schedule,
    blocks,
    block,
    options,
    createAction,
    updateAction,
    resizeAction,
    archiveAction,
    initialContentValue,
    initialFilters,
    initialStartTime,
    initialDurationSeconds,
    onClose,
}: BlockDrawerProps) {
    const selectedFromBlock = block ? contentValueForBlock(block) : '';
    const requestedContentValue = initialContentValue || selectedFromBlock;
    const initialOption =
        options.find((option) => option.value === requestedContentValue) ??
        (mode === 'add' ? (options[0] ?? null) : null);
    const blockIsLive = block?.metadata?.live_object === true;
    const [kind, setKind] = useState<BlockKind>(
        (initialFilters?.kind as BlockType | undefined) ??
            (blockIsLive ? 'live' : undefined) ??
            (contentKind(initialOption) as BlockType | undefined) ??
            block?.blockType ??
            'video',
    );
    const [query, setQuery] = useState(initialFilters?.query ?? '');
    const [showName, setShowName] = useState(
        initialFilters?.showName ?? initialOption?.showName ?? '',
    );
    const [contentValue, setContentValue] = useState(initialOption?.value ?? '');
    const [title, setTitle] = useState(block?.title ?? initialOption?.title ?? '');
    const [startTime, setStartTime] = useState(
        block?.startTime ?? initialStartTime ?? nextSuggestedStart(blocks),
    );
    const [duration, setDuration] = useState(
        formatDurationInput(
            block?.durationSeconds ??
                initialDurationSeconds ??
                initialOption?.durationSeconds ??
                DEFAULT_MANUAL_DURATION,
        ),
    );
    const [reutersStreamUrl, setReutersStreamUrl] = useState(
        metadataTextFromBlock(block, 'reuters_stream_url'),
    );
    const [reutersStreamLabel, setReutersStreamLabel] = useState(
        metadataTextFromBlock(block, 'reuters_stream_label') || 'Reuters live',
    );
    const [reutersStreamExpiresAt, setReutersStreamExpiresAt] = useState(
        metadataTextFromBlock(block, 'reuters_stream_expires_at'),
    );
    const [liveSourceType, setLiveSourceType] = useState(
        metadataTextFromBlock(block, 'live_source_type') || 'youtube',
    );
    const [liveUrl, setLiveUrl] = useState(metadataTextFromBlock(block, 'live_url'));
    const [previouslyRecordedEnabled, setPreviouslyRecordedEnabled] = useState(
        block?.metadata?.previously_recorded_enabled === true,
    );
    const [previouslyRecordedPosition, setPreviouslyRecordedPosition] = useState(
        recordedBugPosition(block?.metadata),
    );
    const [status, setStatus] = useState<ProgramStatus>(block?.status ?? 'ready');
    const [conflictResolution, setConflictResolution] = useState<
        'insert_shift' | 'archive_conflicts' | 'strict'
    >('insert_shift');

    const availableShows = useMemo(
        () => uniqueSorted(options.map((option) => option.showName)),
        [options],
    );
    const filteredOptions = useMemo(
        () =>
            options.filter((option) => {
                if (kind === 'live' || contentKind(option) !== kind) {
                    return false;
                }

                if (query && !option.searchText.includes(query.toLowerCase())) {
                    return false;
                }

                if (showName && option.showName !== showName) {
                    return false;
                }

                return true;
            }),
        [kind, options, query, showName],
    );

    const selected = options.find((option) => option.value === contentValue) ?? null;
    const isLiveKind = kind === 'live';
    const hiddenBlockType = isLiveKind
        ? 'video'
        : (selected?.blockType ?? block?.blockType ?? kind);
    const hiddenAssetId = isLiveKind
        ? ''
        : (selected?.assetId ?? (mode === 'edit' ? (block?.assetId ?? '') : ''));
    const hiddenSlideId = isLiveKind
        ? ''
        : (selected?.slideId ?? (mode === 'edit' ? (block?.slideId ?? '') : ''));
    const hasReutersStream = !isLiveKind && Boolean(reutersStreamUrl.trim());
    const canConfigureRecordedBug = hiddenBlockType === 'video' && !hasReutersStream && !isLiveKind;
    const durationSeconds = parseHumanDuration(duration);
    const startSeconds = parseTimeInput(startTime);
    const endSeconds = Math.min(DAY_SECONDS, startSeconds + durationSeconds);
    const exceedsDay = startSeconds + durationSeconds > DAY_SECONDS;
    const adTooLong = hiddenBlockType === 'ad' && durationSeconds > 300;
    const conflict =
        (selected || isLiveKind) && schedule.day && !exceedsDay
            ? findScheduleConflicts(blocks, {
                  id: block?.id ?? 'new',
                  programDayId: schedule.day.id,
                  startTimeSeconds: startSeconds,
                  durationSeconds,
              })
            : null;
    const conflictMessage = conflict ? scheduleConflictMessage(conflict) : '';
    const insertPreview =
        schedule.day && status !== 'archived' && !exceedsDay
            ? safePreviewInsertShift({
                  blocks,
                  candidate: {
                      id: block?.id ?? 'new',
                      programDayId: schedule.day.id,
                      startTimeSeconds: startSeconds,
                      durationSeconds,
                      status,
                  },
              })
            : null;
    const canSave =
        Boolean(
            selected || mode === 'edit' || hasReutersStream || (isLiveKind && liveUrl.trim()),
        ) &&
        !exceedsDay &&
        !adTooLong &&
        (!conflict?.hasConflict || conflictResolution !== 'strict');

    function chooseKind(value: BlockKind) {
        setKind(value);

        if (value !== 'video') {
            setShowName('');
        }

        if (value === 'live') {
            setContentValue('');
            setTitle((current) => current || 'Live');
            setDuration((current) =>
                current === formatDurationInput(DEFAULT_MANUAL_DURATION) ? '01:00:00' : current,
            );

            return;
        }
        const next = options.find((option) => contentKind(option) === value);

        if (next) {
            chooseContent(next.value);
        }
    }

    function chooseContent(value: string) {
        const next = options.find((option) => option.value === value) ?? null;
        setContentValue(value);

        if (next) {
            setTitle((current) => (mode === 'add' || !current ? next.title : current));
            setDuration(formatDurationInput(next.durationSeconds ?? DEFAULT_MANUAL_DURATION));
        }
    }

    return (
        <section className="surface-panel max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                    <p className="eyebrow">{mode === 'add' ? 'Add Block' : 'Edit Block'}</p>
                    <h2 className="mt-1 text-lg font-semibold">
                        {mode === 'add' ? 'Add content to the day' : block?.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                        {mode === 'add'
                            ? 'Choose what plays, when it starts, and confirm what happens next.'
                            : 'Change what plays, when it starts, or how long it stays on air.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface text-muted"
                    aria-label="Close editor"
                >
                    <X size={15} aria-hidden="true" />
                </button>
            </div>
            <form action={mode === 'add' ? createAction : updateAction} className="grid gap-4 p-4">
                {block ? <input type="hidden" name="block_id" value={block.id} /> : null}
                <input type="hidden" name="pre_roll_seconds" value="0" />
                <input type="hidden" name="post_roll_seconds" value="0" />
                <input type="hidden" name="hide_overlays" value={block?.hideOverlays ? 'on' : ''} />
                <input
                    type="hidden"
                    name="fallback_asset_id"
                    value={block?.fallbackAssetId ?? ''}
                />
                <input type="hidden" name="notes" value={block?.notes ?? ''} />
                <input type="hidden" name="conflict_resolution" value={conflictResolution} />
                <input type="hidden" name="duration_seconds" value={durationSeconds} />
                <input
                    type="hidden"
                    name="previously_recorded_enabled"
                    value={canConfigureRecordedBug && previouslyRecordedEnabled ? 'on' : ''}
                />
                <input
                    type="hidden"
                    name="previously_recorded_position"
                    value={previouslyRecordedPosition}
                />

                <div className="rounded-md border border-line bg-panel-soft px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-muted">Clock time · 24 h</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                        {formatPlayoutTimeLabel(startSeconds, true)} to{' '}
                        {formatPlayoutTimeLabel(endSeconds, true)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                        These are real clock times in 24-hour format, not video timecode.
                    </p>
                    {initialDurationSeconds ? (
                        <p className="mt-0.5 text-xs text-muted">
                            Selected clock range length:{' '}
                            {formatDurationInput(initialDurationSeconds)}
                        </p>
                    ) : null}
                </div>

                <p className="text-[10px] font-bold uppercase text-muted">What plays</p>
                <div className="grid grid-cols-3 gap-2">
                    {(
                        [
                            'video',
                            'live',
                            'slide',
                            'image',
                            'ad',
                            'promo',
                            'fallback',
                        ] as BlockKind[]
                    ).map((item) => (
                        <button
                            key={item}
                            type="button"
                            className={
                                kind === item ? 'chip-active justify-center' : 'chip justify-center'
                            }
                            onClick={() => chooseKind(item)}
                        >
                            {item === 'live' ? 'Live' : typeLabel(item)}
                        </button>
                    ))}
                </div>

                {isLiveKind ? (
                    <LiveObjectFields
                        liveSourceType={liveSourceType}
                        liveUrl={liveUrl}
                        onSourceTypeChange={setLiveSourceType}
                        onUrlChange={setLiveUrl}
                    />
                ) : (
                    <ContentPicker
                        kind={kind}
                        query={query}
                        showName={showName}
                        availableShows={availableShows}
                        filteredOptions={filteredOptions}
                        selectedValue={contentValue}
                        onQueryChange={setQuery}
                        onShowChange={setShowName}
                        onChooseContent={chooseContent}
                    />
                )}

                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Block name
                    <input
                        name="title"
                        required
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                        <label
                            className="text-xs font-semibold text-muted"
                            htmlFor="block-clock-start"
                        >
                            Clock start (24 h)
                        </label>
                        <input
                            id="block-clock-start"
                            name="start_time"
                            required
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                            placeholder="13:30:00"
                            aria-describedby="block-clock-start-help"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                        <p
                            id="block-clock-start-help"
                            className="text-[11px] font-normal text-muted"
                        >
                            Use 24 h clock time: 09:00 = 9 AM, 13:00 = 1 PM.
                        </p>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                        Block duration
                        <input
                            required
                            value={duration}
                            onChange={(event) => setDuration(event.target.value)}
                            placeholder="30s, 57s, 1m, 2h, 01:30:00"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </label>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[30, 57, 60, 300, 1800, 7200].map((seconds) => (
                        <button
                            key={seconds}
                            type="button"
                            className="btn-secondary min-h-8 px-2 text-xs"
                            onClick={() => setDuration(formatDurationInput(seconds))}
                        >
                            {compactDurationLabel(seconds)}
                        </button>
                    ))}
                </div>

                {exceedsDay ? (
                    <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-strong">
                        This block runs past the 24 hour day. Shorten it or start earlier.
                    </p>
                ) : null}

                {selected?.durationSeconds ? (
                    <p className="rounded-md border border-success-line bg-success-soft px-3 py-2 text-xs font-semibold text-success-strong">
                        Media duration detected: {formatDurationInput(selected.durationSeconds)}.
                        The clock end is calculated from clock start plus block duration.
                    </p>
                ) : null}

                {adTooLong ? (
                    <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-strong">
                        Ads can be at most 5 minutes. Shorten this block or use Promo/Video.
                    </p>
                ) : null}

                {kind === 'video' ? (
                    <ReutersStreamFields
                        reutersStreamUrl={reutersStreamUrl}
                        reutersStreamLabel={reutersStreamLabel}
                        reutersStreamExpiresAt={reutersStreamExpiresAt}
                        title={title}
                        onUrlChange={setReutersStreamUrl}
                        onLabelChange={setReutersStreamLabel}
                        onExpiresAtChange={setReutersStreamExpiresAt}
                        onTitleChange={setTitle}
                    />
                ) : null}

                {canConfigureRecordedBug ? (
                    <PreviouslyRecordedFields
                        enabled={previouslyRecordedEnabled}
                        position={previouslyRecordedPosition}
                        onEnabledChange={setPreviouslyRecordedEnabled}
                        onPositionChange={(value) =>
                            setPreviouslyRecordedPosition(recordedBugPositionValue(value))
                        }
                    />
                ) : null}

                <label className="grid gap-1 text-xs font-semibold text-muted">
                    Status
                    <select
                        name="status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value as ProgramStatus)}
                        className="border border-line px-3 py-2 text-sm font-normal text-ink"
                    >
                        <option value="draft">Draft</option>
                        <option value="ready">Ready</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                    </select>
                </label>

                <input type="hidden" name="block_type" value={hiddenBlockType} />
                <input type="hidden" name="asset_id" value={hiddenAssetId} />
                <input type="hidden" name="slide_id" value={hiddenSlideId} />
                <input
                    type="hidden"
                    name="live_source_type"
                    value={isLiveKind ? liveSourceType : ''}
                />
                <input type="hidden" name="live_url" value={isLiveKind ? liveUrl : ''} />

                {selected?.slideId ? (
                    <a
                        className="btn-secondary justify-center"
                        href={slidePreviewHref(selected.slideId)}
                    >
                        View Slide
                    </a>
                ) : null}

                <ScheduleImpactPreview
                    conflict={conflict}
                    insertPreview={insertPreview}
                    exceedsDay={exceedsDay}
                />

                {conflict?.hasConflict ? (
                    <ConflictResolutionPanel
                        conflict={conflict}
                        conflictMessage={conflictMessage}
                        conflictResolution={conflictResolution}
                        onResolutionChange={setConflictResolution}
                        onStartAfterConflict={(seconds) =>
                            setStartTime(formatDurationInput(seconds))
                        }
                    />
                ) : null}

                {!canSave ? (
                    <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-strong">
                        Select ready content and resolve timing issues before saving.
                    </p>
                ) : null}

                <button className="btn-primary justify-center" disabled={!canSave}>
                    {mode === 'add'
                        ? `Add clock ${formatPlayoutTimeLabel(startSeconds, true)}-${formatPlayoutTimeLabel(endSeconds, true)}`
                        : 'Save block'}
                </button>
            </form>
            {mode === 'edit' && block ? (
                <BlockEditActions
                    date={date}
                    block={block}
                    resizeAction={resizeAction}
                    archiveAction={archiveAction}
                />
            ) : null}
        </section>
    );
}
