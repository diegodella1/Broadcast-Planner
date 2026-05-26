import { revalidatePath } from 'next/cache';

import { auditedMutation } from '../audit/audit';
import { getScheduleForDate } from '../data';
import { buildTemplateBlocks, getDayTemplate } from '../scheduling/day-templates';
import { err, ok, type Result } from '../result';
import { buildBulkCardLoop, buildLongTestSchedule } from '../scheduling/schedule-builder';
import { analyzeSchedule } from '../scheduling/schedule-health';
import {
    planScheduleMutation,
    type ScheduleBlockShift,
    type ScheduleMutationMode,
} from '../scheduling/schedule-planner';
import { parseReutersStreamInput, maskStreamUrl } from '../services/reuters-stream';
import { recordedBugMetadata, type RecordedBugPosition } from '../recorded-bug';
import { createServiceClient } from '../supabase/server';
import { formatTimecode, parseTimecode, PLAYOUT_TIMEZONE } from '../helpers/time';

import type { BlockCategory, ProgramBlock, ProgramStatus } from '../types';

type ConflictResolutionMode = 'none' | 'insert_shift' | 'archive_conflicts' | 'strict';

function extractError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export async function ensureProgramDay(date: string): Promise<Result<string>> {
    try {
        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from('program_days')
            .upsert(
                {
                    air_date: date,
                    timezone: PLAYOUT_TIMEZONE,
                    status: 'draft',
                    title: `Programming ${date}`,
                },
                { onConflict: 'air_date' },
            )
            .select('id')
            .single();

        if (error) {
            throw error;
        }
        revalidatePath('/admin/calendar');
        revalidatePath(`/admin/schedule/${date}`);

        return ok(data.id as string);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const metadata = reutersStream
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
        const supabase = createServiceClient();
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
                const { data, error } = await supabase
                    .from('program_blocks')
                    .insert({
                        program_day_id: dayId,
                        title: input.title,
                        block_type: input.blockType,
                        category: reutersStream ? 'reuters' : (input.category ?? 'mercados'),
                        asset_id: input.assetId || null,
                        slide_id: input.slideId || null,
                        start_time: input.startTime,
                        start_time_seconds: startTimeSeconds,
                        duration_seconds: durationSeconds,
                        status: 'ready',
                        hide_overlays: input.hideOverlays,
                        metadata,
                    })
                    .select('id,start_time_seconds')
                    .single();

                if (error) {
                    throw error;
                }
                createdBlock = data as { id: string; start_time_seconds: number };
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

        const supabase = createServiceClient();
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
                const { error } = await supabase.from('program_blocks').insert(
                    blocks.map((block) => ({
                        program_day_id: dayId,
                        title: block.title,
                        block_type: block.blockType,
                        category: block.category,
                        asset_id: null,
                        slide_id: null,
                        start_time: block.startTime,
                        start_time_seconds: block.startTimeSeconds,
                        duration_seconds: block.durationSeconds,
                        status: 'draft',
                        hide_overlays: false,
                    })),
                );

                if (error) {
                    throw error;
                }
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({
                        title,
                        asset_id: asset?.id ?? null,
                        slide_id: slide?.id ?? null,
                        duration_seconds: durationSeconds,
                        status: 'ready',
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', block.id);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_days')
                    .update({ status: input.status, updated_at: new Date().toISOString() })
                    .eq('id', day.id);

                if (error) {
                    throw error;
                }
            },
        );
        revalidatePath('/admin/calendar');
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const metadata = reutersStream
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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({
                        title: input.title,
                        block_type: input.blockType,
                        category: reutersStream ? 'reuters' : (input.category ?? block.category),
                        asset_id: input.assetId || null,
                        slide_id: input.slideId || null,
                        start_time: input.startTime,
                        start_time_seconds: startTimeSeconds,
                        duration_seconds: durationSeconds,
                        status: input.status,
                        hide_overlays: input.hideOverlays,
                        fallback_asset_id: input.fallbackAssetId || null,
                        notes: input.notes || null,
                        metadata,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', input.blockId);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
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
                    const { error } = await supabase
                        .from('program_blocks')
                        .update({
                            status: 'archived',
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', update.id);

                    if (error) {
                        throw error;
                    }
                }

                for (const update of updates) {
                    const { error } = await supabase
                        .from('program_blocks')
                        .update({
                            start_time: update.startTime,
                            start_time_seconds: update.startTimeSeconds,
                            status: update.status,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', update.id);

                    if (error) {
                        throw error;
                    }
                }
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({
                        duration_seconds: durationSeconds,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', block.id);

                if (error) {
                    throw error;
                }
                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({
                        start_time: startTime,
                        start_time_seconds: startTimeSeconds,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', block.id);

                if (error) {
                    throw error;
                }
                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase.from('program_blocks').insert({
                    program_day_id: block.programDayId,
                    title: `${block.title} copy`,
                    block_type: block.blockType,
                    category: block.category,
                    asset_id: block.assetId || null,
                    slide_id: block.slideId || null,
                    start_time: formatTimecode(insertStart),
                    start_time_seconds: insertStart,
                    duration_seconds: block.durationSeconds,
                    status: 'draft',
                    hide_overlays: block.hideOverlays,
                    fallback_asset_id: block.fallbackAssetId || null,
                    notes: block.notes || null,
                });

                if (error) {
                    throw error;
                }
                await applyScheduleShiftRestores(plan.blocksToShift);
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({ status: input.status, updated_at: new Date().toISOString() })
                    .in('id', blockIds);

                if (error) {
                    throw error;
                }
            },
        );
        revalidateSchedule(input.date);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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
    const supabase = createServiceClient();

    for (const shift of input.shifts) {
        const { error } = await supabase
            .from('program_blocks')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('id', shift.id);

        if (error) {
            throw error;
        }
    }
}

async function applyScheduleShiftRestores(shifts: ScheduleBlockShift[]) {
    if (!shifts.length) {
        return;
    }
    const supabase = createServiceClient();

    for (const shift of shifts) {
        const { error } = await supabase
            .from('program_blocks')
            .update({
                start_time: shift.startTime,
                start_time_seconds: shift.startTimeSeconds,
                status: shift.status,
                updated_at: new Date().toISOString(),
            })
            .eq('id', shift.id);

        if (error) {
            throw error;
        }
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
    const supabase = createServiceClient();

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
                const { error } = await supabase
                    .from('program_blocks')
                    .update({ status: 'archived', updated_at: new Date().toISOString() })
                    .eq('id', conflict.blockId);

                if (error) {
                    throw error;
                }
            },
        );
    }
}

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
        const supabase = createServiceClient();
        const { error: layerError } = await supabase
            .from('scheduled_layers')
            .delete()
            .eq('program_block_id', input.blockId);

        if (layerError) {
            throw layerError;
        }
        await auditedMutation(
            {
                action: 'program_block.deleted',
                entityType: 'program_blocks',
                entityId: input.blockId,
                metadata: { date: input.date },
                previous: { title: block.title, start_time: block.startTime, status: block.status },
            },
            async () => {
                const { error } = await supabase
                    .from('program_blocks')
                    .delete()
                    .eq('id', input.blockId);

                if (error) {
                    throw error;
                }
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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

        const supabase = createServiceClient();
        const startSeconds = firstBlock.startTimeSeconds;
        const endSeconds = lastBlock.startTimeSeconds + lastBlock.durationSeconds;

        if (input.replaceWindow) {
            const { error: deleteError } = await supabase
                .from('program_blocks')
                .delete()
                .eq('program_day_id', dayId)
                .gte('start_time_seconds', startSeconds)
                .lt('start_time_seconds', endSeconds);

            if (deleteError) {
                throw deleteError;
            }
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
                const { error } = await supabase.from('program_blocks').insert(
                    generatedBlocks.map((block) => ({
                        program_day_id: dayId,
                        title: block.title,
                        block_type: block.blockType,
                        category: 'broadcast' satisfies BlockCategory,
                        asset_id: block.assetId || null,
                        slide_id: block.slideId || null,
                        start_time: block.startTime,
                        start_time_seconds: block.startTimeSeconds,
                        duration_seconds: block.durationSeconds,
                        status: 'ready',
                        hide_overlays: false,
                    })),
                );

                if (error) {
                    throw error;
                }
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath('/admin/calendar');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

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

        const supabase = createServiceClient();
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
                    const { error: archiveError } = await supabase
                        .from('program_blocks')
                        .update({ status: 'archived', updated_at: new Date().toISOString() })
                        .in(
                            'id',
                            conflicts.map((block) => block.id),
                        );

                    if (archiveError) {
                        throw archiveError;
                    }
                }
                const { error } = await supabase.from('program_blocks').insert(
                    generatedBlocks.map((block) => ({
                        program_day_id: dayId,
                        title: block.title,
                        block_type: 'slide',
                        category: 'broadcast' satisfies BlockCategory,
                        asset_id: null,
                        slide_id: block.slideId,
                        start_time: block.startTime,
                        start_time_seconds: block.startTimeSeconds,
                        duration_seconds: block.durationSeconds,
                        status: 'ready',
                        hide_overlays: false,
                    })),
                );

                if (error) {
                    throw error;
                }
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
