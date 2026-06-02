import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/admin/admin-shell';
import { ScheduleHealthPoller } from '@/components/schedule/schedule-health-poller';
import { ScheduleWorkspace } from '@/components/schedule-workspace';
import { StatusPill } from '@/components/ui/status-pill';
import { Timecode } from '@/components/ui/timecode';
import { ButtonLink, Field, FormHeader, Notice } from '@/components/ui';
import { getScheduleForDate } from '@/lib/data';
import { DAY_TEMPLATES } from '@/lib/scheduling/day-templates';
import {
    archiveProgramBlock,
    createBulkCardLoop,
    createLongTestSchedule,
    createProgramDayFromTemplate,
    createProgramBlock,
    duplicateProgramBlock,
    ensureProgramDay,
    reorderProgramBlocks,
    resizeProgramBlock,
    updateProgramBlock,
    updateProgramDayStatus,
    saveGlobalFallbackCarouselFromSlides,
} from '@/lib/mutations';
import { liveOutputHref } from '@/lib/auth/output-auth';
import { analyzeSchedule, withScheduleIssueLinks } from '@/lib/scheduling/schedule-health';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import {
    formatPlayoutTimeLabel,
    formatTimecode,
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';

export default async function ScheduleDatePage({
    params,
    searchParams,
}: {
    params: Promise<{ date: string }>;
    searchParams: Promise<{
        uploaded?: string;
        asset?: string;
        slide?: string;
        q?: string;
        kind?: string;
        source?: string;
        show_name?: string;
        error?: string;
        month?: string;
        year?: string;
        created?: string;
        fallback_carousel?: string;
    }>;
}) {
    const { date } = await params;
    const query = await searchParams;
    const schedule = await getScheduleForDate(date);
    const blocks = schedule.blocks.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    async function addBlock(formData: FormData) {
        'use server';
        const result = await createProgramBlock({
            date,
            title: String(formData.get('title')),
            blockType: String(formData.get('block_type')),
            assetId: String(formData.get('asset_id') || ''),
            slideId: String(formData.get('slide_id') || ''),
            startTime: String(formData.get('start_time')),
            durationSeconds: Number(formData.get('duration_seconds')),
            preRollSeconds: Number(formData.get('pre_roll_seconds') || 0),
            postRollSeconds: Number(formData.get('post_roll_seconds') || 0),
            hideOverlays: formData.get('hide_overlays') === 'on',
            conflictResolution: formConflictResolution(formData),
            reutersStreamUrl: String(formData.get('reuters_stream_url') || ''),
            reutersStreamLabel: String(formData.get('reuters_stream_label') || ''),
            reutersStreamExpiresAt: String(formData.get('reuters_stream_expires_at') || ''),
            liveSourceType: String(formData.get('live_source_type') || ''),
            liveUrl: String(formData.get('live_url') || ''),
            previouslyRecordedEnabled: formData.get('previously_recorded_enabled') === 'on',
            previouslyRecordedPosition: String(formData.get('previously_recorded_position') || ''),
        });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error), 'add-block'));
        }
        redirect(
            `/admin/schedule/${date}?created=${encodeURIComponent(result.data.id)}#block-${result.data.id}`,
        );
    }
    async function updateBlockInline(formData: FormData) {
        'use server';
        const blockId = String(formData.get('block_id'));
        const result = await updateProgramBlock({
            date,
            blockId,
            title: String(formData.get('title')),
            blockType: String(formData.get('block_type')),
            assetId: String(formData.get('asset_id') || ''),
            slideId: String(formData.get('slide_id') || ''),
            startTime: String(formData.get('start_time')),
            durationSeconds: Number(formData.get('duration_seconds')),
            status: String(formData.get('status')),
            hideOverlays: formData.get('hide_overlays') === 'on',
            fallbackAssetId: String(formData.get('fallback_asset_id') || ''),
            notes: String(formData.get('notes') || ''),
            conflictResolution: formConflictResolution(formData),
            reutersStreamUrl: String(formData.get('reuters_stream_url') || ''),
            reutersStreamLabel: String(formData.get('reuters_stream_label') || ''),
            reutersStreamExpiresAt: String(formData.get('reuters_stream_expires_at') || ''),
            liveSourceType: String(formData.get('live_source_type') || ''),
            liveUrl: String(formData.get('live_url') || ''),
            previouslyRecordedEnabled: formData.get('previously_recorded_enabled') === 'on',
            previouslyRecordedPosition: String(formData.get('previously_recorded_position') || ''),
        });

        if (!result.success) {
            redirect(
                scheduleErrorHref(
                    date,
                    new Error(result.error),
                    blockId ? `block-${blockId}` : 'add-block',
                ),
            );
        }
    }
    async function generateLongSchedule(formData: FormData) {
        'use server';
        const result = await createLongTestSchedule({
            date,
            startTime: String(formData.get('start_time') || '00:00:00'),
            totalHours: Number(formData.get('total_hours') || 12),
            programMinutes: Number(formData.get('program_minutes') || 48),
            adBreakMinutes: Number(formData.get('ad_break_minutes') || 4),
            imageBumperSeconds: Number(formData.get('image_bumper_seconds') || 30),
            replaceWindow: formData.get('replace_window') === 'on',
        });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error)));
        }
    }
    async function bulkCreateCardLoop(formData: FormData) {
        'use server';
        const slideIds = formData.getAll('slide_ids').map(String);
        const durations = formData.getAll('durations').map(Number);
        const loopMode = String(formData.get('loop_mode') || 'scheduled');
        const cards = slideIds.map((slideId, index) => ({
            slideId,
            durationSeconds: durations[index] || 30,
        }));

        if (loopMode === 'fallback' || loopMode === 'both') {
            const fallbackResult = await saveGlobalFallbackCarouselFromSlides({ cards });

            if (!fallbackResult.success) {
                redirect(scheduleErrorHref(date, new Error(fallbackResult.error)));
            }
        }

        if (loopMode === 'scheduled' || loopMode === 'both') {
            const result = await createBulkCardLoop({
                date,
                startTime: String(formData.get('start_time') || '00:00:00'),
                endTime: String(formData.get('end_time') || '00:00:00'),
                cards,
                replaceWindow: formData.get('replace_window') === 'on',
            });

            if (!result.success) {
                redirect(scheduleErrorHref(date, new Error(result.error)));
            }
        }

        if (loopMode === 'fallback') {
            redirect(`/admin/schedule/${date}?fallback_carousel=1#bulk-cards`);
        }
    }
    async function setDayStatus(formData: FormData) {
        'use server';
        const result = await updateProgramDayStatus({
            date,
            status: String(formData.get('status')),
            allowWarnings: formData.get('allow_warnings') === 'on',
        });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error)));
        }
    }
    async function reorderRundown(input: { orderedBlockIds: string[] }) {
        'use server';
        const result = await reorderProgramBlocks({ date, orderedBlockIds: input.orderedBlockIds });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error)));
        }
    }
    async function resizeRundownBlock(input: { blockId: string; durationSeconds: number }) {
        'use server';
        const result = await resizeProgramBlock({
            date,
            blockId: input.blockId,
            durationSeconds: input.durationSeconds,
        });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error), `block-${input.blockId}`));
        }
    }
    async function duplicateRundownBlock(input: { blockId: string }) {
        'use server';
        const result = await duplicateProgramBlock({ date, blockId: input.blockId });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error), `block-${input.blockId}`));
        }
    }
    async function archiveRundownBlock(input: { blockId: string }) {
        'use server';
        const result = await archiveProgramBlock({ date, blockId: input.blockId });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error), `block-${input.blockId}`));
        }
    }
    async function createEmptyDay() {
        'use server';
        const result = await ensureProgramDay(date);

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error)));
        }
        redirect(`/admin/schedule/${date}`);
    }
    async function setupDayFromTemplate(formData: FormData) {
        'use server';
        const result = await createProgramDayFromTemplate({
            date,
            templateId: String(formData.get('template_id')),
            startTime: String(formData.get('start_time') || '00:00:00'),
        });

        if (!result.success) {
            redirect(scheduleErrorHref(date, new Error(result.error)));
        }
        redirect(`/admin/schedule/${date}`);
    }
    const totalScheduledSeconds = blocks.reduce((total, block) => total + block.durationSeconds, 0);
    const timezone = schedule.day?.timezone ?? PLAYOUT_TIMEZONE;
    const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone);
    const isToday = date === isoDateInTimezone(new Date(), timezone);
    const active = isToday ? findActiveSchedule(schedule, nowSeconds) : null;
    const nextBlock = isToday
        ? (blocks.find(
              (block) =>
                  (block.status === 'ready' || block.status === 'active') &&
                  block.startTimeSeconds > nowSeconds,
          ) ?? null)
        : null;
    const health = analyzeSchedule(schedule, blocks);
    const readyBlocks = blocks.filter(
        (block) => block.status === 'ready' || block.status === 'active',
    ).length;
    const firstBlock = blocks[0] ?? null;
    const lastBlock = blocks[blocks.length - 1] ?? null;
    const lastEnd = lastBlock ? lastBlock.startTimeSeconds + lastBlock.durationSeconds : 0;

    if (!schedule.day) {
        return (
            <AdminShell
                title={`Set up ${date}`}
                description="Create this day before adding blocks."
                actions={
                    <>
                        <ButtonLink href="/admin/calendar" variant="secondary">
                            Calendar
                        </ButtonLink>
                        <ButtonLink href="/admin/assets" variant="secondary">
                            Library
                        </ButtonLink>
                    </>
                }
            >
                <section className="surface-panel p-4">
                    <FormHeader
                        title="Create schedule day"
                        detail="Use a template for draft slots, or start empty and add blocks manually."
                    />
                    <form
                        action={setupDayFromTemplate}
                        className="mt-4 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_150px]"
                    >
                        <Field label="Clock start (24 h)">
                            <input
                                name="start_time"
                                defaultValue="00:00:00"
                                required
                                placeholder="13:30:00"
                                className="border border-line px-3 py-2 text-sm font-normal text-ink"
                            />
                        </Field>
                        <Field label="Template">
                            <select
                                name="template_id"
                                defaultValue={DAY_TEMPLATES[0]?.id}
                                className="border border-line px-3 py-2 text-sm font-normal text-ink"
                            >
                                {DAY_TEMPLATES.map((template) => (
                                    <option key={template.id} value={template.id}>
                                        {template.name} - {template.description}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <button className="btn-primary self-end">Create from template</button>
                    </form>
                    <form action={createEmptyDay} className="mt-3">
                        <button className="btn-secondary">Create empty day</button>
                    </form>
                </section>
            </AdminShell>
        );
    }

    return (
        <AdminShell
            title={`Schedule ${date}`}
            description="Place ready Library content on the day. Output follows the active schedule."
            actions={
                <>
                    <ButtonLink href="/admin/assets" variant="secondary">
                        Library
                    </ButtonLink>
                    <ButtonLink href={liveOutputHref(true)}>Browser output</ButtonLink>
                </>
            }
        >
            {query.uploaded ? <Notice tone="ok">Media uploaded and scheduled.</Notice> : null}
            {query.fallback_carousel ? (
                <Notice tone="ok">
                    Fallback carousel updated from Loop Builder. This did not create scheduled
                    blocks.
                </Notice>
            ) : null}
            <ScheduleControlBar
                date={date}
                timezone={timezone}
                dayStatus={schedule.day.status}
                readyBlocks={readyBlocks}
                totalBlocks={blocks.length}
                totalScheduledSeconds={totalScheduledSeconds}
                healthCriticalCount={health.criticalCount}
                healthWarnCount={health.warnCount}
                activeLabel={
                    active?.block?.title ?? (isToday ? 'No active block' : 'Planning view')
                }
                activeMeta={
                    active?.block
                        ? `${formatTimecode(active.elapsedInBlock)} / ${formatTimecode(active.block.durationSeconds)}`
                        : isToday
                          ? (active?.reason ?? 'Outside scheduled window')
                          : date
                }
                nextLabel={nextBlock?.title ?? firstBlock?.title ?? 'No blocks'}
                nextMeta={
                    nextBlock
                        ? `Next ${formatPlayoutTimeLabel(nextBlock.startTimeSeconds)}`
                        : firstBlock
                          ? `First ${formatPlayoutTimeLabel(firstBlock.startTimeSeconds)}`
                          : 'Empty day'
                }
                coverageLabel={
                    firstBlock && lastBlock
                        ? `${formatPlayoutTimeLabel(firstBlock.startTimeSeconds)}-${formatPlayoutTimeLabel(lastEnd)}`
                        : 'No coverage'
                }
                setDayStatus={setDayStatus}
            />

            <ScheduleHealthPoller
                date={date}
                initial={{
                    generatedAt: new Date().toISOString(),
                    criticalCount: health.criticalCount,
                    warnCount: health.warnCount,
                    issues: health.issues.map((issue) => withScheduleIssueLinks(date, issue)),
                }}
            />

            <ScheduleWorkspace
                date={date}
                schedule={schedule}
                blocks={blocks}
                createAction={addBlock}
                updateAction={updateBlockInline}
                reorderAction={reorderRundown}
                resizeAction={resizeRundownBlock}
                duplicateAction={duplicateRundownBlock}
                archiveAction={archiveRundownBlock}
                bulkCreateAction={bulkCreateCardLoop}
                initialContentValue={initialContentValue(query)}
                initialFilters={initialContentFilters(query)}
                createdBlockId={query.created}
                initialMessage={query.error}
            />

            <details className="surface-panel mb-5 p-4">
                <summary className="cursor-pointer font-semibold">More tools</summary>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <FormHeader
                            title="Long grid generator"
                            detail="Create consecutive blocks for long-duration tests with programs, ad breaks and image bumpers."
                        />
                    </div>
                    <p className="rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
                        Total loaded: <Timecode seconds={totalScheduledSeconds} />
                    </p>
                </div>
                <form
                    action={generateLongSchedule}
                    className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[120px_100px_130px_120px_130px_minmax(0,1fr)_130px]"
                >
                    <input
                        name="start_time"
                        required
                        defaultValue="00:00:00"
                        title="Clock start in 24-hour format"
                        placeholder="13:30:00"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="total_hours"
                        required
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        defaultValue="12"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="program_minutes"
                        required
                        type="number"
                        min="1"
                        defaultValue="48"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="ad_break_minutes"
                        required
                        type="number"
                        min="0"
                        max="5"
                        defaultValue="4"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <input
                        name="image_bumper_seconds"
                        required
                        type="number"
                        min="0"
                        defaultValue="30"
                        className="border border-line px-3 py-2 text-sm"
                    />
                    <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm">
                        <input name="replace_window" type="checkbox" defaultChecked />
                        Replace window
                    </label>
                    <button className="btn-primary">Generate grid</button>
                </form>
            </details>
        </AdminShell>
    );
}

function ScheduleControlBar({
    date,
    timezone,
    dayStatus,
    readyBlocks,
    totalBlocks,
    totalScheduledSeconds,
    healthCriticalCount,
    healthWarnCount,
    activeLabel,
    activeMeta,
    nextLabel,
    nextMeta,
    coverageLabel,
    setDayStatus,
}: {
    date: string;
    timezone: string;
    dayStatus: string;
    readyBlocks: number;
    totalBlocks: number;
    totalScheduledSeconds: number;
    healthCriticalCount: number;
    healthWarnCount: number;
    activeLabel: string;
    activeMeta: string;
    nextLabel: string;
    nextMeta: string;
    coverageLabel: string;
    setDayStatus: (formData: FormData) => Promise<void>;
}) {
    const healthLabel = healthCriticalCount
        ? `${healthCriticalCount} critical`
        : healthWarnCount
          ? `${healthWarnCount} warnings`
          : 'Ready';

    return (
        <section className="surface-panel mb-4 px-3 py-2">
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{date}</p>
                        <StatusPill status={dayStatus} />
                        <span className="text-xs text-muted">{timezone}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                        {readyBlocks}/{totalBlocks} ready · {formatTimecode(totalScheduledSeconds)}{' '}
                        loaded · {coverageLabel}
                    </p>
                </div>
                <CompactSignal label="Now" value={activeLabel} meta={activeMeta} />
                <CompactSignal label="Next" value={nextLabel} meta={nextMeta} />
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span
                        className={[
                            'rounded-md border px-2 py-1 text-xs font-semibold',
                            healthCriticalCount
                                ? 'border-danger-line bg-danger-soft text-danger-strong'
                                : healthWarnCount
                                  ? 'border-warn-line bg-warn-soft text-warn-strong'
                                  : 'border-success-line bg-success-soft text-success-strong',
                        ].join(' ')}
                    >
                        {healthLabel}
                    </span>
                    <a className="btn-primary min-h-8 px-2" href="#add-block">
                        Add content
                    </a>
                    <details className="rounded-md border border-line bg-surface px-2 py-1.5">
                        <summary className="cursor-pointer text-xs font-semibold">Day</summary>
                        <form action={setDayStatus} className="mt-2 grid gap-2">
                            <label className="flex min-h-8 items-center gap-2 rounded-md border border-line bg-surface px-2 text-xs font-medium">
                                <input name="allow_warnings" type="checkbox" />
                                Allow warnings
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    name="status"
                                    value="draft"
                                    className="btn-secondary min-h-8 px-2 text-xs"
                                >
                                    Draft
                                </button>
                                <button
                                    name="status"
                                    value="ready"
                                    className="btn-secondary min-h-8 px-2 text-xs"
                                >
                                    Ready
                                </button>
                                <button
                                    name="status"
                                    value="active"
                                    className="btn-primary min-h-8 px-2 text-xs"
                                >
                                    Active
                                </button>
                            </div>
                        </form>
                    </details>
                </div>
            </div>
        </section>
    );
}

function CompactSignal({ label, value, meta }: { label: string; value: string; meta: string }) {
    return (
        <div className="min-w-0 rounded-md border border-line bg-panel-soft px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-muted">{label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
            <p className="truncate text-xs text-muted">{meta}</p>
        </div>
    );
}

function scheduleErrorHref(date: string, error: unknown, anchor = 'add-block') {
    const message = error instanceof Error ? error.message : String(error);

    return `/admin/schedule/${date}?error=${encodeURIComponent(message)}#${anchor}`;
}

function formConflictResolution(formData: FormData) {
    const value = String(formData.get('conflict_resolution') || 'insert_shift');

    if (value === 'archive_conflicts' || value === 'strict') {
        return value;
    }

    return 'insert_shift';
}

function initialContentValue(query: { asset?: string; slide?: string }) {
    if (query.asset) {
        return `asset:${query.asset}`;
    }

    if (query.slide) {
        return `slide:${query.slide}`;
    }

    return undefined;
}

function initialContentFilters(query: {
    q?: string;
    kind?: string;
    source?: string;
    show_name?: string;
    month?: string;
    year?: string;
}) {
    return {
        query: query.q,
        kind: normalizeScheduleKind(query.kind),
        source: query.source,
        showName: query.show_name,
        month: query.month,
        year: query.year,
    };
}

function normalizeScheduleKind(kind?: string) {
    if (kind === 'videos') {
        return 'video';
    }

    if (kind === 'graphics' || kind === 'images') {
        return 'image';
    }

    if (kind === 'slides') {
        return 'slide';
    }

    if (kind === 'all') {
        return undefined;
    }

    return kind;
}
