import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';

import { auditedMutation } from '../audit/audit';
import { getScheduleForDate } from '../data';
import { buildTemplateBlocks, getDayTemplate } from '../scheduling/day-templates';
import { err, extractError, ok, type Result } from '../result';
import { buildBulkCardLoop, buildLongTestSchedule } from '../scheduling/schedule-builder';
import { analyzeSchedule } from '../scheduling/schedule-health';
import {
    planScheduleMutation,
    type ScheduleBlockShift,
    type ScheduleMutationMode,
} from '../scheduling/schedule-planner';
import { parseReutersStreamInput, maskStreamUrl } from '../services/reuters-stream';
import { recordedBugMetadata, type RecordedBugPosition } from '../recorded-bug';
import {
    buildLiveObjectMetadata,
    LIVE_ESTIMATED_DURATION_SECONDS,
    type LiveEndReason,
} from '../live-object';
import { getDb, type DrizzleD1Client } from '../db/client';
import { programBlocks, programDays, scheduledLayers } from '../db/schema';
import { formatTimecode, parseTimecode, PLAYOUT_TIMEZONE } from '../helpers/time';

import type { BlockCategory, ProgramBlock, ProgramStatus } from '../types';

type ConflictResolutionMode = 'none' | 'insert_shift' | 'archive_conflicts' | 'strict';

// ─── Overlap guard ───────────────────────────────────────────────────────────
//
// Replicates the final PostgreSQL trigger defined across:
//   20260510123000_prevent_program_block_overlaps.sql  (baseline)
//   20260520163500_ignore_archived_block_overlaps.sql  (skip archived)
//   20260603124500_allow_live_object_overlaps.sql      (skip live objects)
//
// Rules:
//   1. Skip the check when the CANDIDATE block is 'archived'.
//   2. Skip the check when the CANDIDATE block has metadata.live_object === true.
//   3. Reject if any EXISTING block overlaps where the existing block is:
//      - NOT 'archived', AND
//      - does NOT have metadata.live_object === true
//   4. Overlap condition: [start, start+duration) intervals intersect,
//      i.e. candidateStart < existingEnd && candidateEnd > existingStart.
//   5. A block is always excluded from matching against itself (excludeBlockId).

async function assertNoBlockOverlap(
    db: DrizzleD1Client,
    programDayId: string,
    candidate: {
        startTimeSeconds: number;
        durationSeconds: number;
        status: string;
        metadata?: Record<string, unknown>;
    },
    excludeBlockId?: string,
): Promise<void> {
    // Rule 1 & 2: skip check if candidate is archived or is a live object.
    if (candidate.status === 'archived') {
        return;
    }

    if (candidate.metadata?.live_object === true) {
        return;
    }

    const candidateEnd = candidate.startTimeSeconds + candidate.durationSeconds;

    const rows = await db
        .select({
            id: programBlocks.id,
            startTimeSeconds: programBlocks.startTimeSeconds,
            durationSeconds: programBlocks.durationSeconds,
            status: programBlocks.status,
            metadata: programBlocks.metadata,
        })
        .from(programBlocks)
        .where(
            excludeBlockId
                ? and(
                      eq(programBlocks.programDayId, programDayId),
                      ne(programBlocks.id, excludeBlockId),
                  )
                : eq(programBlocks.programDayId, programDayId),
        );

    for (const row of rows) {
        // Rule 3a: skip archived existing blocks.
        if (row.status === 'archived') {
            continue;
        }

        // Rule 3b: skip existing live-object blocks.
        const existingMeta =
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};

        if (existingMeta.live_object === true) {
            continue;
        }

        const existingEnd = row.startTimeSeconds + row.durationSeconds;
        const overlaps =
            candidate.startTimeSeconds < existingEnd && candidateEnd > row.startTimeSeconds;

        if (overlaps) {
            throw new Error(`program_blocks overlap for program_day_id ${programDayId}`);
        }
    }
}

// ─── ensureProgramDay ─────────────────────────────────────────────────────────

export async function ensureProgramDay(date: string): Promise<Result<string>> {
    try {
        const db = await getDb();

        await db
            .insert(programDays)
            .values({
                airDate: date,
                timezone: PLAYOUT_TIMEZONE,
                status: 'draft',
                title: `Programming ${date}`,
            })
            .onConflictDoUpdate({
                target: programDays.airDate,
                set: {
                    timezone: PLAYOUT_TIMEZONE,
                    title: `Programming ${date}`,
                },
            });

        const [row] = await db
            .select({ id: programDays.id })
            .from(programDays)
            .where(eq(programDays.airDate, date))
            .limit(1);

        if (!row) {
            throw new Error('Failed to upsert program day');
        }

        revalidatePath('/admin/calendar');
        revalidatePath(`/admin/schedule/${date}`);

        return ok(row.id);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── createProgramBlock ───────────────────────────────────────────────────────

export async function createProgramBlock(input: {
    date: string;
    title: string;
    blockType: string;
    category?: BlockCategory;
    assetId?: string;
    slideId?: string;
    startTime: string;
    durationSeconds: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
    hideOverlays: boolean;
    conflictResolution?: ConflictResolutionMode;
    reutersStreamUrl?: string;
    reutersStreamLabel?: string;
    reutersStreamExpiresAt?: string;
    liveSourceType?: string;
    liveUrl?: string;
    previouslyRecordedEnabled?: boolean;
    previouslyRecordedPosition?: RecordedBugPosition | string;
}): Promise<Result<{ id: string; startTimeSeconds: number }>> {
    try {
        const dayResult = await ensureProgramDay(input.date);

        if (!dayResult.success) {
            return dayResult;
        }

        const dayId = dayResult.data;
        const startTimeSeconds = parseTimecode(input.startTime);
        const schedule = await getScheduleForDate(input.date);
        const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId);
        const preRollSeconds = Math.max(0, Number(input.preRollSeconds || 0) || 0);
        const postRollSeconds = Math.max(0, Number(input.postRollSeconds || 0) || 0);
        const reutersStream = parseReutersStreamInput({
            ...(input.reutersStreamUrl ? { url: input.reutersStreamUrl } : {}),
            ...(input.reutersStreamLabel ? { label: input.reutersStreamLabel } : {}),
            ...(input.reutersStreamExpiresAt ? { expiresAt: input.reutersStreamExpiresAt } : {}),
        });
        const liveMetadata = input.liveUrl
            ? buildLiveObjectMetadata({
                  sourceType: input.liveSourceType || 'youtube',
                  url: input.liveUrl,
                  title: input.title,
              })
            : null;

        if (input.liveUrl && !liveMetadata) {
            return err('Live URL must be a YouTube video link or HLS .m3u8 URL');
        }

        const metadata = liveMetadata
            ? liveMetadata
            : reutersStream
              ? reutersBlockMetadata(reutersStream)
              : recordedBugMetadata({
                    blockType: input.blockType as ProgramBlock['blockType'],
                    enabled: input.previouslyRecordedEnabled,
                    position: input.previouslyRecordedPosition,
                });
        const minimumDuration = contentDuration
            ? contentDuration + preRollSeconds + postRollSeconds
            : 1;
        const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), minimumDuration);

        if (input.blockType === 'ad' && durationSeconds > 300) {
            return err('Ads cannot be longer than 300 seconds');
        }

        const db = await getDb();
        const candidate: ProgramBlock = {
            id: 'candidate',
            programDayId: dayId,
            title: input.title,
            blockType: input.blockType as ProgramBlock['blockType'],
            category: input.category ?? 'mercados',
            assetId: input.assetId || null,
            slideId: input.slideId || null,
            startTime: input.startTime,
            startTimeSeconds,
            durationSeconds,
            status: 'ready',
            hideOverlays: input.hideOverlays,
            fallbackAssetId: null,
            createdAt: '',
            updatedAt: '',
        };
        const mutationMode = scheduleMutationMode(input.conflictResolution);
        const plan = planScheduleMutation({
            blocks: schedule.blocks,
            candidate,
            mode: mutationMode,
        });
        let createdBlock = { id: '', start_time_seconds: startTimeSeconds };

        await auditedMutation(
            {
                action: 'program_block.created',
                entityType: 'program_blocks',
                metadata: { date: input.date },
                next: {
                    title: input.title,
                    start_time: input.startTime,
                    duration_seconds: durationSeconds,
                    status: 'ready',
                    ...(reutersStream
                        ? {
                              reuters_stream_protocol: reutersStream.protocol,
                              reuters_stream_url: maskStreamUrl(reutersStream.url),
                          }
                        : {}),
                },
            },
            async () => {
                await applySchedulePlanPreparation({
                    date: input.date,
                    shifts: plan.blocksToShift,
                    archives: plan.blocksToArchive,
                    reason: 'program_block.conflict_replaced',
                });

                const blockStatus = 'ready';
                const category = liveMetadata
                    ? 'broadcast'
                    : reutersStream
                      ? 'reuters'
                      : (input.category ?? 'mercados');

                await assertNoBlockOverlap(db, dayId, {
                    startTimeSeconds,
                    durationSeconds,
                    status: blockStatus,
                    metadata: metadata as Record<string, unknown>,
                });

                const [inserted] = await db
                    .insert(programBlocks)
                    .values({
                        programDayId: dayId,
                        title: input.title,
                        blockType: input.blockType,
                        category,
                        assetId: input.assetId || null,
                        slideId: input.slideId || null,
                        startTime: input.startTime,
                        startTimeSeconds,
                        durationSeconds,
                        status: blockStatus,
                        hideOverlays: input.hideOverlays,
                        metadata: metadata as Record<string, unknown>,
                    })
                    .returning({
                        id: programBlocks.id,
                        start_time_seconds: programBlocks.startTimeSeconds,
                    });

                if (!inserted) {
                    throw new Error('Failed to insert program block');
                }

                createdBlock = inserted as { id: string; start_time_seconds: number };
                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok({
            id: createdBlock.id,
            startTimeSeconds: createdBlock.start_time_seconds,
        });
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── scheduleLiveObjectOverride ───────────────────────────────────────────────

export async function scheduleLiveObjectOverride(input: {
    date: string;
    title: string;
    startTime: string;
    liveSourceType: string;
    liveUrl: string;
}): Promise<Result<{ id: string; startTimeSeconds: number }>> {
    try {
        const dayResult = await ensureProgramDay(input.date);

        if (!dayResult.success) {
            return dayResult;
        }

        const dayId = dayResult.data;
        const title = input.title.trim() || 'Live';
        const liveMetadata = buildLiveObjectMetadata({
            sourceType: input.liveSourceType,
            url: input.liveUrl,
            title,
        });

        if (!liveMetadata) {
            return err('Live URL must be a YouTube video link or HLS .m3u8 URL');
        }

        const startTimeSeconds = parseTimecode(input.startTime);
        const db = await getDb();
        let createdBlock = { id: '', start_time_seconds: startTimeSeconds };

        await auditedMutation(
            {
                action: 'live_object.override_created',
                entityType: 'program_blocks',
                metadata: { date: input.date, live_source_type: input.liveSourceType },
                next: {
                    title,
                    start_time: input.startTime,
                    duration_seconds: LIVE_ESTIMATED_DURATION_SECONDS,
                },
            },
            async () => {
                // Live objects are exempt from overlap check (live_object === true in metadata).
                const [inserted] = await db
                    .insert(programBlocks)
                    .values({
                        programDayId: dayId,
                        title,
                        blockType: 'video',
                        category: 'broadcast',
                        assetId: null,
                        slideId: null,
                        startTime: input.startTime,
                        startTimeSeconds,
                        durationSeconds: LIVE_ESTIMATED_DURATION_SECONDS,
                        status: 'ready',
                        hideOverlays: true,
                        fallbackAssetId: null,
                        metadata: liveMetadata as Record<string, unknown>,
                    })
                    .returning({
                        id: programBlocks.id,
                        start_time_seconds: programBlocks.startTimeSeconds,
                    });

                if (!inserted) {
                    throw new Error('Failed to insert live block');
                }

                createdBlock = inserted as { id: string; start_time_seconds: number };

                await db
                    .update(programBlocks)
                    .set({ status: 'ready', updatedAt: new Date().toISOString() })
                    .where(eq(programBlocks.id, createdBlock.id));
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath('/admin/output');
        revalidatePath('/live');
        revalidatePath('/output/live');

        return ok({
            id: createdBlock.id,
            startTimeSeconds: createdBlock.start_time_seconds,
        });
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── createProgramDayFromTemplate ─────────────────────────────────────────────

export async function createProgramDayFromTemplate(input: {
    date: string;
    templateId: string;
    startTime: string;
}): Promise<Result<void>> {
    try {
        const template = getDayTemplate(input.templateId);

        if (!template) {
            return err('Unknown day template');
        }

        const dayResult = await ensureProgramDay(input.date);

        if (!dayResult.success) {
            return dayResult;
        }

        const dayId = dayResult.data;
        const blocks = buildTemplateBlocks(template, input.startTime);
        const lastBlock = blocks[blocks.length - 1];

        if (!lastBlock) {
            return err('Template has no blocks');
        }

        if (lastBlock.startTimeSeconds + lastBlock.durationSeconds > 86400) {
            return err('Template exceeds the 24 hour day');
        }

        const schedule = await getScheduleForDate(input.date);
        const activeBlocks = schedule.blocks.filter((block) => block.status !== 'archived');

        if (activeBlocks.length) {
            return err('Day already has blocks. Open the schedule and edit it instead.');
        }

        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_day.template_created',
                entityType: 'program_blocks',
                metadata: {
                    date: input.date,
                    template_id: template.id,
                    start_time: input.startTime,
                    blocks: blocks.length,
                },
                next: { template: template.name, blocks: blocks.length },
            },
            async () => {
                await db.insert(programBlocks).values(
                    blocks.map((block) => ({
                        programDayId: dayId,
                        title: block.title,
                        blockType: block.blockType,
                        category: block.category,
                        assetId: null,
                        slideId: null,
                        startTime: block.startTime,
                        startTimeSeconds: block.startTimeSeconds,
                        durationSeconds: block.durationSeconds,
                        status: 'draft',
                        hideOverlays: false,
                    })),
                );
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── fillProgramBlockContent ──────────────────────────────────────────────────

export async function fillProgramBlockContent(input: {
    date: string;
    blockId: string;
    assetId?: string;
    slideId?: string;
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const asset = input.assetId
            ? schedule.mediaAssets.find((item) => item.id === input.assetId)
            : null;
        const slide = input.slideId
            ? schedule.slideAssets.find((item) => item.id === input.slideId)
            : null;

        if (!asset && !slide) {
            return err('Choose content for this block');
        }

        if (asset && slide) {
            return err('Choose either media or slide, not both');
        }

        if (asset && asset.status !== 'ready') {
            return err('Asset is not ready');
        }

        if (slide && slide.status !== 'ready') {
            return err('Slide is not ready');
        }

        if (asset && !assetMatchesBlock(block.blockType, asset.assetType)) {
            return err('Asset type does not match this block');
        }

        if (slide && block.blockType !== 'slide') {
            return err('Slides can only fill slide blocks');
        }

        const contentDuration = asset?.durationSeconds ?? slide?.defaultDurationSeconds ?? 0;
        const durationSeconds = Math.max(block.durationSeconds, contentDuration || 1);
        const title = asset?.title ?? slide?.title ?? block.title;
        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_block.content_filled',
                entityType: 'program_blocks',
                entityId: block.id,
                metadata: { date: input.date },
                previous: { title: block.title, status: block.status },
                next: { title, status: 'ready', duration_seconds: durationSeconds },
            },
            async () => {
                await db
                    .update(programBlocks)
                    .set({
                        title,
                        assetId: asset?.id ?? null,
                        slideId: slide?.id ?? null,
                        durationSeconds,
                        status: 'ready',
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(programBlocks.id, block.id));
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

function getKnownContentDuration(
    schedule: Awaited<ReturnType<typeof getScheduleForDate>>,
    assetId?: string,
    slideId?: string,
) {
    const assetDuration = assetId
        ? schedule.mediaAssets.find((asset) => asset.id === assetId)?.durationSeconds
        : null;

    if (assetDuration) {
        return assetDuration;
    }

    const slideDuration = slideId
        ? schedule.slideAssets.find((slide) => slide.id === slideId)?.defaultDurationSeconds
        : null;

    return slideDuration ?? 0;
}

function assetMatchesBlock(blockType: ProgramBlock['blockType'], assetType: string) {
    if (blockType === 'video') {
        return assetType === 'video';
    }

    if (blockType === 'image') {
        return assetType === 'image';
    }

    if (blockType === 'ad') {
        return assetType === 'ad';
    }

    if (blockType === 'promo') {
        return assetType === 'promo';
    }

    if (blockType === 'fallback') {
        return assetType === 'fallback';
    }

    return false;
}

function reutersBlockMetadata(stream: {
    protocol: 'hls' | 'rtmp';
    url: string;
    label: string;
    expiresAt?: string | null;
}) {
    return {
        reuters_stream_protocol: stream.protocol,
        reuters_stream_url: stream.url,
        reuters_stream_url_masked: maskStreamUrl(stream.url),
        reuters_stream_label: stream.label,
        reuters_stream_expires_at: stream.expiresAt ?? null,
        reuters_stream_refreshed_at: new Date().toISOString(),
    };
}

// ─── updateProgramDayStatus ───────────────────────────────────────────────────

export async function updateProgramDayStatus(input: {
    date: string;
    status: string;
    allowWarnings?: boolean;
}): Promise<Result<void>> {
    try {
        if (!['draft', 'ready', 'active', 'archived'].includes(input.status)) {
            return err('Estado invalido');
        }

        const schedule = await getScheduleForDate(input.date);

        if (!schedule.day) {
            return err('Dia no encontrado');
        }

        const day = schedule.day;
        const health = analyzeSchedule(schedule);

        if ((input.status === 'ready' || input.status === 'active') && health.criticalCount > 0) {
            return err('No se puede publicar con alertas criticas');
        }

        if (
            (input.status === 'ready' || input.status === 'active') &&
            health.warnCount > 0 &&
            !input.allowWarnings
        ) {
            return err('Hay advertencias pendientes');
        }

        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_day.status_updated',
                entityType: 'program_days',
                entityId: day.id,
                metadata: { date: input.date },
                previous: { status: day.status },
                next: { status: input.status },
            },
            async () => {
                await db
                    .update(programDays)
                    .set({ status: input.status, updatedAt: new Date().toISOString() })
                    .where(eq(programDays.id, day.id));
            },
        );
        revalidatePath('/admin/calendar');
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── updateProgramBlock ───────────────────────────────────────────────────────

export async function updateProgramBlock(input: {
    date: string;
    blockId: string;
    title: string;
    blockType: string;
    category?: BlockCategory;
    assetId?: string;
    slideId?: string;
    startTime: string;
    durationSeconds: number;
    status: string;
    hideOverlays: boolean;
    fallbackAssetId?: string;
    notes?: string;
    conflictResolution?: ConflictResolutionMode;
    reutersStreamUrl?: string;
    reutersStreamLabel?: string;
    reutersStreamExpiresAt?: string;
    liveSourceType?: string;
    liveUrl?: string;
    previouslyRecordedEnabled?: boolean;
    previouslyRecordedPosition?: RecordedBugPosition | string;
}): Promise<Result<void>> {
    try {
        if (!['video', 'image', 'slide', 'ad', 'promo', 'fallback'].includes(input.blockType)) {
            return err('Tipo de bloque invalido');
        }

        if (!['draft', 'ready', 'active', 'archived'].includes(input.status)) {
            return err('Estado invalido');
        }

        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const startTimeSeconds = parseTimecode(input.startTime);
        const reutersStream = parseReutersStreamInput({
            ...(input.reutersStreamUrl ? { url: input.reutersStreamUrl } : {}),
            ...(input.reutersStreamLabel ? { label: input.reutersStreamLabel } : {}),
            ...(input.reutersStreamExpiresAt ? { expiresAt: input.reutersStreamExpiresAt } : {}),
        });
        const liveMetadata = input.liveUrl
            ? buildLiveObjectMetadata({
                  sourceType: input.liveSourceType || 'youtube',
                  url: input.liveUrl,
                  title: input.title,
              })
            : null;

        if (input.liveUrl && !liveMetadata) {
            return err('Live URL must be a YouTube video link or HLS .m3u8 URL');
        }

        const metadata = liveMetadata
            ? {
                  ...liveMetadata,
                  live_status:
                      block.metadata?.live_status === 'ended' ||
                      block.metadata?.live_status === 'failed'
                          ? 'scheduled'
                          : (block.metadata?.live_status ?? 'scheduled'),
              }
            : reutersStream
              ? reutersBlockMetadata(reutersStream)
              : recordedBugMetadata({
                    metadata: block.metadata,
                    blockType: input.blockType as ProgramBlock['blockType'],
                    enabled: input.previouslyRecordedEnabled,
                    position: input.previouslyRecordedPosition,
                });
        const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId);
        const durationSeconds = Math.max(
            1,
            Number(input.durationSeconds || 0),
            contentDuration || 1,
        );

        if (input.blockType === 'ad' && durationSeconds > 300) {
            return err('Ads cannot be longer than 300 seconds');
        }

        const plan = planScheduleMutation({
            blocks: schedule.blocks,
            candidate: {
                id: input.blockId,
                programDayId: block.programDayId,
                startTimeSeconds,
                durationSeconds,
                status: input.status as ProgramStatus,
            },
            mode: scheduleMutationMode(input.conflictResolution),
        });
        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_block.updated',
                entityType: 'program_blocks',
                entityId: input.blockId,
                metadata: { date: input.date },
                previous: {
                    title: block.title,
                    start_time: block.startTime,
                    duration_seconds: block.durationSeconds,
                    status: block.status,
                },
                next: {
                    title: input.title,
                    start_time: input.startTime,
                    duration_seconds: durationSeconds,
                    status: input.status,
                    ...(reutersStream
                        ? {
                              reuters_stream_protocol: reutersStream.protocol,
                              reuters_stream_url: maskStreamUrl(reutersStream.url),
                          }
                        : {}),
                },
            },
            async () => {
                await applySchedulePlanPreparation({
                    date: input.date,
                    shifts: plan.blocksToShift,
                    archives: plan.blocksToArchive,
                    reason: 'program_block.conflict_replaced',
                });

                await assertNoBlockOverlap(
                    db,
                    block.programDayId,
                    {
                        startTimeSeconds,
                        durationSeconds,
                        status: input.status,
                        metadata: metadata as Record<string, unknown>,
                    },
                    input.blockId,
                );

                await db
                    .update(programBlocks)
                    .set({
                        title: input.title,
                        blockType: input.blockType,
                        category: liveMetadata
                            ? 'broadcast'
                            : reutersStream
                              ? 'reuters'
                              : (input.category ?? block.category),
                        assetId: input.assetId || null,
                        slideId: input.slideId || null,
                        startTime: input.startTime,
                        startTimeSeconds,
                        durationSeconds,
                        status: input.status,
                        hideOverlays: input.hideOverlays,
                        fallbackAssetId: input.fallbackAssetId || null,
                        notes: input.notes || null,
                        metadata: metadata as Record<string, unknown>,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(programBlocks.id, input.blockId));

                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── markLiveObjectEnded ──────────────────────────────────────────────────────

export async function markLiveObjectEnded(input: {
    blockId: string;
    reason: LiveEndReason | string;
    failed?: boolean;
}): Promise<Result<void>> {
    try {
        const db = await getDb();
        const [data] = await db
            .select({
                id: programBlocks.id,
                title: programBlocks.title,
                metadata: programBlocks.metadata,
                programDayId: programBlocks.programDayId,
            })
            .from(programBlocks)
            .where(eq(programBlocks.id, input.blockId))
            .limit(1);

        if (!data?.id) {
            return err('Live block not found');
        }

        const metadata =
            typeof data.metadata === 'object' && data.metadata !== null
                ? (data.metadata as Record<string, unknown>)
                : {};

        if (metadata.live_object !== true) {
            return err('Block is not a live object');
        }

        if (metadata.live_status === 'ended' || metadata.live_status === 'failed') {
            return ok(undefined);
        }

        const now = new Date().toISOString();
        const nextMetadata = {
            ...metadata,
            live_status: input.failed ? 'failed' : 'ended',
            live_ended_at: now,
            live_end_reason: input.reason,
        };

        await auditedMutation(
            {
                action: input.failed ? 'live_object.failed' : 'live_object.ended',
                entityType: 'program_blocks',
                entityId: String(data.id),
                metadata: { reason: input.reason },
                previous: { live_status: metadata.live_status ?? 'scheduled' },
                next: { live_status: nextMetadata.live_status, live_ended_at: now },
            },
            async () => {
                await db
                    .update(programBlocks)
                    .set({ metadata: nextMetadata, updatedAt: now })
                    .where(eq(programBlocks.id, String(data.id)));
            },
        );
        revalidatePath('/admin/output');
        revalidatePath('/output/live');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── updateLiveObjectLowerThird ───────────────────────────────────────────────

export async function updateLiveObjectLowerThird(input: {
    blockId: string;
    visible: boolean;
    text: string;
}): Promise<Result<void>> {
    try {
        const db = await getDb();
        const [data] = await db
            .select({
                id: programBlocks.id,
                metadata: programBlocks.metadata,
                programDayId: programBlocks.programDayId,
            })
            .from(programBlocks)
            .where(eq(programBlocks.id, input.blockId))
            .limit(1);

        if (!data?.id) {
            return err('Live block not found');
        }

        const metadata =
            typeof data.metadata === 'object' && data.metadata !== null
                ? (data.metadata as Record<string, unknown>)
                : {};

        if (metadata.live_object !== true) {
            return err('Block is not a live object');
        }

        const now = new Date().toISOString();
        const nextMetadata = {
            ...metadata,
            lower_third_visible: input.visible,
            lower_third_text: input.text.trim(),
        };

        await auditedMutation(
            {
                action: 'live_object.lower_third_updated',
                entityType: 'program_blocks',
                entityId: String(data.id),
                previous: {
                    lower_third_visible: metadata.lower_third_visible === true,
                    lower_third_text: metadata.lower_third_text ?? '',
                },
                next: {
                    lower_third_visible: nextMetadata.lower_third_visible,
                    lower_third_text: nextMetadata.lower_third_text,
                },
            },
            async () => {
                await db
                    .update(programBlocks)
                    .set({ metadata: nextMetadata, updatedAt: now })
                    .where(eq(programBlocks.id, String(data.id)));
            },
        );
        revalidatePath('/live');
        revalidatePath('/output/live');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── reorderProgramBlocks ─────────────────────────────────────────────────────

export async function reorderProgramBlocks(input: {
    date: string;
    orderedBlockIds: string[];
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const activeBlocks = schedule.blocks
            .filter((block) => block.status !== 'archived')
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
        const orderedSet = new Set(input.orderedBlockIds);

        if (orderedSet.size !== input.orderedBlockIds.length) {
            return err('Hay bloques repetidos en el orden del rundown');
        }

        if (activeBlocks.length !== input.orderedBlockIds.length) {
            return err('El rundown cambio. Recarga antes de reordenar');
        }

        const byId = new Map(activeBlocks.map((block) => [block.id, block]));

        if (input.orderedBlockIds.some((id) => !byId.has(id))) {
            return err('El rundown incluye un bloque inexistente');
        }

        const startSeconds = activeBlocks[0]?.startTimeSeconds ?? 0;
        let cursor = startSeconds;
        const updates = input.orderedBlockIds.map((id) => {
            const block = byId.get(id)!;
            const next = {
                id,
                startTimeSeconds: cursor,
                startTime: formatTimecode(cursor),
                status: block.status,
            };
            cursor += block.durationSeconds;

            return next;
        });

        if (cursor > 86400) {
            return err('El rundown excede las 24 horas');
        }

        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_blocks.reordered',
                entityType: 'program_blocks',
                metadata: { date: input.date, blocks: updates.length },
                previous: {
                    blocks: activeBlocks.map((block) => ({
                        id: block.id,
                        start_time: block.startTime,
                    })),
                },
                next: { blocks: updates },
            },
            async () => {
                for (const update of updates) {
                    await db
                        .update(programBlocks)
                        .set({
                            status: 'archived',
                            updatedAt: new Date().toISOString(),
                        })
                        .where(eq(programBlocks.id, update.id));
                }

                for (const update of updates) {
                    await db
                        .update(programBlocks)
                        .set({
                            startTime: update.startTime,
                            startTimeSeconds: update.startTimeSeconds,
                            status: update.status,
                            updatedAt: new Date().toISOString(),
                        })
                        .where(eq(programBlocks.id, update.id));
                }
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── resizeProgramBlock ───────────────────────────────────────────────────────

export async function resizeProgramBlock(input: {
    date: string;
    blockId: string;
    durationSeconds: number;
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const durationSeconds = Math.max(1, Math.floor(Number(input.durationSeconds || 0)));
        const plan = planScheduleMutation({
            blocks: schedule.blocks,
            candidate: {
                id: block.id,
                programDayId: block.programDayId,
                startTimeSeconds: block.startTimeSeconds,
                durationSeconds,
                status: block.status,
            },
            mode: 'insert_shift',
        });
        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_block.resized',
                entityType: 'program_blocks',
                entityId: block.id,
                metadata: { date: input.date },
                previous: { duration_seconds: block.durationSeconds },
                next: { duration_seconds: durationSeconds },
            },
            async () => {
                await applySchedulePlanPreparation({
                    date: input.date,
                    shifts: plan.blocksToShift,
                    archives: [],
                    reason: 'program_block.resize_shift',
                });

                await assertNoBlockOverlap(
                    db,
                    block.programDayId,
                    {
                        startTimeSeconds: block.startTimeSeconds,
                        durationSeconds,
                        status: block.status,
                        metadata: (block.metadata as Record<string, unknown> | undefined) ?? {},
                    },
                    block.id,
                );

                await db
                    .update(programBlocks)
                    .set({
                        durationSeconds,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(programBlocks.id, block.id));

                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── moveProgramBlock ─────────────────────────────────────────────────────────

export async function moveProgramBlock(input: {
    date: string;
    blockId: string;
    startTimeSeconds: number;
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const startTimeSeconds = Math.min(
            Math.max(0, Math.floor(Number(input.startTimeSeconds || 0))),
            86400 - block.durationSeconds,
        );
        const plan = planScheduleMutation({
            blocks: schedule.blocks,
            candidate: {
                id: block.id,
                programDayId: block.programDayId,
                startTimeSeconds,
                durationSeconds: block.durationSeconds,
                status: block.status,
            },
            mode: 'insert_shift',
        });
        const startTime = formatTimecode(startTimeSeconds);
        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_block.moved',
                entityType: 'program_blocks',
                entityId: block.id,
                metadata: { date: input.date },
                previous: {
                    start_time: block.startTime,
                    start_time_seconds: block.startTimeSeconds,
                },
                next: { start_time: startTime, start_time_seconds: startTimeSeconds },
            },
            async () => {
                await applySchedulePlanPreparation({
                    date: input.date,
                    shifts: plan.blocksToShift,
                    archives: [],
                    reason: 'program_block.move_shift',
                });

                await assertNoBlockOverlap(
                    db,
                    block.programDayId,
                    {
                        startTimeSeconds,
                        durationSeconds: block.durationSeconds,
                        status: block.status,
                        metadata: (block.metadata as Record<string, unknown> | undefined) ?? {},
                    },
                    block.id,
                );

                await db
                    .update(programBlocks)
                    .set({
                        startTime,
                        startTimeSeconds,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(programBlocks.id, block.id));

                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── duplicateProgramBlock ────────────────────────────────────────────────────

export async function duplicateProgramBlock(input: {
    date: string;
    blockId: string;
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const insertStart = block.startTimeSeconds + block.durationSeconds;
        const plan = planScheduleMutation({
            blocks: schedule.blocks,
            candidate: {
                programDayId: block.programDayId,
                startTimeSeconds: insertStart,
                durationSeconds: block.durationSeconds,
                status: 'draft',
            },
            mode: 'insert_shift',
        });
        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_block.duplicated',
                entityType: 'program_blocks',
                entityId: block.id,
                metadata: { date: input.date, shifted_blocks: plan.blocksToShift.length },
                next: { title: `${block.title} copy`, start_time: formatTimecode(insertStart) },
            },
            async () => {
                await applySchedulePlanPreparation({
                    date: input.date,
                    shifts: plan.blocksToShift,
                    archives: [],
                    reason: 'program_block.duplicate_shift',
                });

                await assertNoBlockOverlap(db, block.programDayId, {
                    startTimeSeconds: insertStart,
                    durationSeconds: block.durationSeconds,
                    status: 'draft',
                    metadata: {},
                });

                await db.insert(programBlocks).values({
                    programDayId: block.programDayId,
                    title: `${block.title} copy`,
                    blockType: block.blockType,
                    category: block.category,
                    assetId: block.assetId || null,
                    slideId: block.slideId || null,
                    startTime: formatTimecode(insertStart),
                    startTimeSeconds: insertStart,
                    durationSeconds: block.durationSeconds,
                    status: 'draft',
                    hideOverlays: block.hideOverlays,
                    fallbackAssetId: block.fallbackAssetId || null,
                    notes: block.notes || null,
                });

                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── archiveProgramBlock / bulkUpdateProgramBlockStatus ───────────────────────

export async function archiveProgramBlock(input: {
    date: string;
    blockId: string;
}): Promise<Result<void>> {
    return bulkUpdateProgramBlockStatus({
        date: input.date,
        blockIds: [input.blockId],
        status: 'archived',
    });
}

export async function bulkUpdateProgramBlockStatus(input: {
    date: string;
    blockIds: string[];
    status: ProgramStatus;
}): Promise<Result<void>> {
    try {
        if (!['draft', 'ready', 'active', 'archived'].includes(input.status)) {
            return err('Estado invalido');
        }

        const blockIds = [...new Set(input.blockIds)].filter(Boolean);

        if (!blockIds.length) {
            return err('Selecciona al menos un bloque');
        }

        const schedule = await getScheduleForDate(input.date);
        const existing = schedule.blocks.filter((block) => blockIds.includes(block.id));

        if (existing.length !== blockIds.length) {
            return err('Uno o mas bloques no existen');
        }

        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_blocks.bulk_status_updated',
                entityType: 'program_blocks',
                metadata: { date: input.date, blocks: blockIds.length },
                previous: {
                    blocks: existing.map((block) => ({ id: block.id, status: block.status })),
                },
                next: { status: input.status },
            },
            async () => {
                await db
                    .update(programBlocks)
                    .set({ status: input.status, updatedAt: new Date().toISOString() })
                    .where(inArray(programBlocks.id, blockIds));
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── deleteProgramBlock ───────────────────────────────────────────────────────

export async function deleteProgramBlock(input: {
    date: string;
    blockId: string;
}): Promise<Result<void>> {
    try {
        const schedule = await getScheduleForDate(input.date);
        const block = schedule.blocks.find((item) => item.id === input.blockId);

        if (!block) {
            return err('Bloque no encontrado');
        }

        const db = await getDb();

        await db.delete(scheduledLayers).where(eq(scheduledLayers.programBlockId, input.blockId));

        await auditedMutation(
            {
                action: 'program_block.deleted',
                entityType: 'program_blocks',
                entityId: input.blockId,
                metadata: { date: input.date },
                previous: { title: block.title, start_time: block.startTime, status: block.status },
            },
            async () => {
                await db.delete(programBlocks).where(eq(programBlocks.id, input.blockId));
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── createLongTestSchedule ───────────────────────────────────────────────────

export async function createLongTestSchedule(input: {
    date: string;
    startTime: string;
    totalHours: number;
    programMinutes: number;
    adBreakMinutes: number;
    imageBumperSeconds: number;
    replaceWindow: boolean;
}): Promise<Result<void>> {
    try {
        const dayResult = await ensureProgramDay(input.date);

        if (!dayResult.success) {
            return dayResult;
        }

        const dayId = dayResult.data;
        const schedule = await getScheduleForDate(input.date);
        const generatedBlocks = buildLongTestSchedule({
            mediaAssets: schedule.mediaAssets,
            slideAssets: schedule.slideAssets,
            startTime: input.startTime,
            totalHours: input.totalHours,
            programMinutes: input.programMinutes,
            adBreakMinutes: input.adBreakMinutes,
            imageBumperSeconds: input.imageBumperSeconds,
        });
        const firstBlock = generatedBlocks[0];
        const lastBlock = generatedBlocks[generatedBlocks.length - 1];

        if (!firstBlock || !lastBlock) {
            return err('No se pudo generar la grilla');
        }

        const db = await getDb();
        const startSeconds = firstBlock.startTimeSeconds;
        const endSeconds = lastBlock.startTimeSeconds + lastBlock.durationSeconds;

        if (input.replaceWindow) {
            await db
                .delete(programBlocks)
                .where(
                    and(
                        eq(programBlocks.programDayId, dayId),
                        gte(programBlocks.startTimeSeconds, startSeconds),
                        lt(programBlocks.startTimeSeconds, endSeconds),
                    ),
                );
        }

        await auditedMutation(
            {
                action: 'program_blocks.generated',
                entityType: 'program_blocks',
                metadata: {
                    date: input.date,
                    start_time: input.startTime,
                    total_hours: input.totalHours,
                    blocks: generatedBlocks.length,
                    replace_window: input.replaceWindow,
                },
                next: {
                    start_seconds: startSeconds,
                    end_seconds: endSeconds,
                    blocks: generatedBlocks.length,
                },
            },
            async () => {
                await db.insert(programBlocks).values(
                    generatedBlocks.map((block) => ({
                        programDayId: dayId,
                        title: block.title,
                        blockType: block.blockType,
                        category: 'broadcast' satisfies BlockCategory,
                        assetId: block.assetId || null,
                        slideId: block.slideId || null,
                        startTime: block.startTime,
                        startTimeSeconds: block.startTimeSeconds,
                        durationSeconds: block.durationSeconds,
                        status: 'ready',
                        hideOverlays: false,
                    })),
                );
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath('/admin/calendar');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── createBulkCardLoop ───────────────────────────────────────────────────────

export async function createBulkCardLoop(input: {
    date: string;
    startTime: string;
    endTime: string;
    cards: Array<{ slideId: string; durationSeconds: number }>;
    replaceWindow: boolean;
}): Promise<Result<void>> {
    try {
        const dayResult = await ensureProgramDay(input.date);

        if (!dayResult.success) {
            return dayResult;
        }

        const dayId = dayResult.data;
        const schedule = await getScheduleForDate(input.date);
        const slideById = new Map(
            schedule.slideAssets
                .filter((slide) => slide.status === 'ready')
                .map((slide) => [slide.id, slide]),
        );
        const cards = input.cards
            .map((card) => {
                const slide = slideById.get(card.slideId);

                if (!slide) {
                    return null;
                }

                return {
                    slideId: slide.id,
                    title: slide.title,
                    durationSeconds: Math.max(
                        1,
                        Math.round(
                            Number(card.durationSeconds || slide.defaultDurationSeconds || 30),
                        ),
                    ),
                };
            })
            .filter(Boolean) as Array<{ slideId: string; title: string; durationSeconds: number }>;

        if (!cards.length) {
            return err('Selecciona al menos una card ready');
        }

        const generatedBlocks = buildBulkCardLoop({
            cards,
            startTime: input.startTime,
            endTime: input.endTime,
        });
        const firstBlock = generatedBlocks[0];
        const lastBlock = generatedBlocks[generatedBlocks.length - 1];

        if (!firstBlock || !lastBlock) {
            return err('El rango no admite ninguna card completa');
        }

        const startSeconds = firstBlock.startTimeSeconds;
        const endSeconds = parseTimecode(input.endTime);
        const conflicts = schedule.blocks
            .filter((block) => block.programDayId === dayId && block.status !== 'archived')
            .filter((block) => {
                const blockEnd = block.startTimeSeconds + block.durationSeconds;

                return startSeconds < blockEnd && endSeconds > block.startTimeSeconds;
            });

        if (conflicts.length && !input.replaceWindow) {
            return err('El rango se solapa con bloques existentes');
        }

        const db = await getDb();

        await auditedMutation(
            {
                action: 'program_blocks.bulk_card_loop_created',
                entityType: 'program_blocks',
                metadata: {
                    date: input.date,
                    start_time: input.startTime,
                    end_time: input.endTime,
                    cards: cards.length,
                    blocks: generatedBlocks.length,
                    replace_window: input.replaceWindow,
                },
                previous: {
                    conflicts: conflicts.map((block) => ({
                        id: block.id,
                        title: block.title,
                        start_time: block.startTime,
                    })),
                },
                next: {
                    start_seconds: startSeconds,
                    end_seconds: endSeconds,
                    blocks: generatedBlocks.length,
                },
            },
            async () => {
                if (conflicts.length) {
                    await db
                        .update(programBlocks)
                        .set({ status: 'archived', updatedAt: new Date().toISOString() })
                        .where(
                            inArray(
                                programBlocks.id,
                                conflicts.map((block) => block.id),
                            ),
                        );
                }

                await db.insert(programBlocks).values(
                    generatedBlocks.map((block) => ({
                        programDayId: dayId,
                        title: block.title,
                        blockType: 'slide',
                        category: 'broadcast' satisfies BlockCategory,
                        assetId: null,
                        slideId: block.slideId,
                        startTime: block.startTime,
                        startTimeSeconds: block.startTimeSeconds,
                        durationSeconds: block.durationSeconds,
                        status: 'ready',
                        hideOverlays: false,
                    })),
                );
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath('/admin/calendar');
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function revalidateSchedule(date: string) {
    revalidatePath(`/admin/schedule/${date}`);
    revalidatePath('/admin/calendar');
    revalidatePath('/admin/output');
}

function scheduleMutationMode(value?: ConflictResolutionMode): ScheduleMutationMode {
    if (value === 'archive_conflicts') {
        return 'replace_window';
    }

    if (value === 'strict' || value === 'none') {
        return 'strict';
    }

    return 'insert_shift';
}

async function applySchedulePlanPreparation(input: {
    date: string;
    shifts: ScheduleBlockShift[];
    archives: Parameters<typeof archiveConflictingBlocks>[0]['conflicts'];
    reason: string;
}) {
    if (input.archives.length) {
        await archiveConflictingBlocks({
            date: input.date,
            conflicts: input.archives,
            reason: input.reason,
        });
    }

    if (!input.shifts.length) {
        return;
    }

    const db = await getDb();

    for (const shift of input.shifts) {
        await db
            .update(programBlocks)
            .set({ status: 'archived', updatedAt: new Date().toISOString() })
            .where(eq(programBlocks.id, shift.id));
    }
}

async function applyScheduleShiftRestores(shifts: ScheduleBlockShift[]) {
    if (!shifts.length) {
        return;
    }

    const db = await getDb();

    for (const shift of shifts) {
        await db
            .update(programBlocks)
            .set({
                startTime: shift.startTime,
                startTimeSeconds: shift.startTimeSeconds,
                status: shift.status,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(programBlocks.id, shift.id));
    }
}

async function archiveConflictingBlocks(input: {
    date: string;
    conflicts: Array<{
        blockId: string;
        title: string;
        startTimeSeconds: number;
        endTimeSeconds: number;
    }>;
    reason: string;
}) {
    const db = await getDb();

    for (const conflict of input.conflicts) {
        await auditedMutation(
            {
                action: 'program_block.archived_for_replacement',
                entityType: 'program_blocks',
                entityId: conflict.blockId,
                metadata: {
                    date: input.date,
                    reason: input.reason,
                    start_seconds: conflict.startTimeSeconds,
                    end_seconds: conflict.endTimeSeconds,
                },
                previous: { title: conflict.title },
                next: { status: 'archived' },
            },
            async () => {
                await db
                    .update(programBlocks)
                    .set({ status: 'archived', updatedAt: new Date().toISOString() })
                    .where(eq(programBlocks.id, conflict.blockId));
            },
        );
    }
}
