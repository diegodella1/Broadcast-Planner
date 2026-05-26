import { revalidatePath } from 'next/cache';

import { auditedMutation } from './audit';
import { getScheduleForDate } from './data';
import { buildTemplateBlocks, getDayTemplate } from './day-templates';
import type { FallbackCarouselCard } from './fallback-carousel';
import { buildBulkCardLoop, buildLongTestSchedule } from './schedule-builder';
import { analyzeSchedule } from './schedule-health';
import {
    planScheduleMutation,
    type ScheduleBlockShift,
    type ScheduleMutationMode,
} from './schedule-planner';
import { parseReutersStreamInput, maskStreamUrl } from './reuters-stream';
import { recordedBugMetadata, type RecordedBugPosition } from './recorded-bug';
import { createServiceClient } from './supabase/server';
import { formatTimecode, parseTimecode, PLAYOUT_TIMEZONE } from './time';

import type {
    BlockCategory,
    GuestStatus,
    ProgramBlock,
    ProgramStatus,
    RunbookSection,
} from './types';

type ConflictResolutionMode = 'none' | 'insert_shift' | 'archive_conflicts' | 'strict';

export async function ensureProgramDay(date: string) {
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

    return data.id as string;
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
}) {
    const dayId = await ensureProgramDay(input.date);
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
        throw new Error('Ads cannot be longer than 300 seconds');
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
    const plan = planScheduleMutation({ blocks: schedule.blocks, candidate, mode: mutationMode });
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

    return {
        id: createdBlock.id,
        startTimeSeconds: createdBlock.start_time_seconds,
    };
}

export async function createProgramDayFromTemplate(input: {
    date: string;
    templateId: string;
    startTime: string;
}) {
    const template = getDayTemplate(input.templateId);

    if (!template) {
        throw new Error('Unknown day template');
    }
    const dayId = await ensureProgramDay(input.date);
    const blocks = buildTemplateBlocks(template, input.startTime);
    const lastBlock = blocks[blocks.length - 1];

    if (!lastBlock) {
        throw new Error('Template has no blocks');
    }

    if (lastBlock.startTimeSeconds + lastBlock.durationSeconds > 86400) {
        throw new Error('Template exceeds the 24 hour day');
    }

    const schedule = await getScheduleForDate(input.date);
    const activeBlocks = schedule.blocks.filter((block) => block.status !== 'archived');

    if (activeBlocks.length) {
        throw new Error('Day already has blocks. Open the schedule and edit it instead.');
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
}

export async function fillProgramBlockContent(input: {
    date: string;
    blockId: string;
    assetId?: string;
    slideId?: string;
}) {
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
    }
    const asset = input.assetId
        ? schedule.mediaAssets.find((item) => item.id === input.assetId)
        : null;
    const slide = input.slideId
        ? schedule.slideAssets.find((item) => item.id === input.slideId)
        : null;

    if (!asset && !slide) {
        throw new Error('Choose content for this block');
    }

    if (asset && slide) {
        throw new Error('Choose either media or slide, not both');
    }

    if (asset && asset.status !== 'ready') {
        throw new Error('Asset is not ready');
    }

    if (slide && slide.status !== 'ready') {
        throw new Error('Slide is not ready');
    }

    if (asset && !assetMatchesBlock(block.blockType, asset.assetType)) {
        throw new Error('Asset type does not match this block');
    }

    if (slide && block.blockType !== 'slide') {
        throw new Error('Slides can only fill slide blocks');
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
}) {
    if (!['draft', 'ready', 'active', 'archived'].includes(input.status)) {
        throw new Error('Estado invalido');
    }
    const schedule = await getScheduleForDate(input.date);

    if (!schedule.day) {
        throw new Error('Dia no encontrado');
    }
    const day = schedule.day;
    const health = analyzeSchedule(schedule);

    if ((input.status === 'ready' || input.status === 'active') && health.criticalCount > 0) {
        throw new Error('No se puede publicar con alertas criticas');
    }

    if (
        (input.status === 'ready' || input.status === 'active') &&
        health.warnCount > 0 &&
        !input.allowWarnings
    ) {
        throw new Error('Hay advertencias pendientes');
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
}) {
    if (!['video', 'image', 'slide', 'ad', 'promo', 'fallback'].includes(input.blockType)) {
        throw new Error('Tipo de bloque invalido');
    }

    if (!['draft', 'ready', 'active', 'archived'].includes(input.status)) {
        throw new Error('Estado invalido');
    }
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
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
    const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), contentDuration || 1);

    if (input.blockType === 'ad' && durationSeconds > 300) {
        throw new Error('Ads cannot be longer than 300 seconds');
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
}

export async function reorderProgramBlocks(input: { date: string; orderedBlockIds: string[] }) {
    const schedule = await getScheduleForDate(input.date);
    const activeBlocks = schedule.blocks
        .filter((block) => block.status !== 'archived')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const orderedSet = new Set(input.orderedBlockIds);

    if (orderedSet.size !== input.orderedBlockIds.length) {
        throw new Error('Hay bloques repetidos en el orden del rundown');
    }

    if (activeBlocks.length !== input.orderedBlockIds.length) {
        throw new Error('El rundown cambio. Recarga antes de reordenar');
    }
    const byId = new Map(activeBlocks.map((block) => [block.id, block]));

    if (input.orderedBlockIds.some((id) => !byId.has(id))) {
        throw new Error('El rundown incluye un bloque inexistente');
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
        throw new Error('El rundown excede las 24 horas');
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
}

export async function resizeProgramBlock(input: {
    date: string;
    blockId: string;
    durationSeconds: number;
}) {
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
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
                .update({ duration_seconds: durationSeconds, updated_at: new Date().toISOString() })
                .eq('id', block.id);

            if (error) {
                throw error;
            }
            await applyScheduleShiftRestores(plan.blocksToShift);
        },
    );
    revalidateSchedule(input.date);
}

export async function moveProgramBlock(input: {
    date: string;
    blockId: string;
    startTimeSeconds: number;
}) {
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
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
            previous: { start_time: block.startTime, start_time_seconds: block.startTimeSeconds },
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
}

export async function duplicateProgramBlock(input: { date: string; blockId: string }) {
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
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
}

export async function archiveProgramBlock(input: { date: string; blockId: string }) {
    await bulkUpdateProgramBlockStatus({
        date: input.date,
        blockIds: [input.blockId],
        status: 'archived',
    });
}

export async function bulkUpdateProgramBlockStatus(input: {
    date: string;
    blockIds: string[];
    status: ProgramStatus;
}) {
    assertProgramStatus(input.status);
    const blockIds = [...new Set(input.blockIds)].filter(Boolean);

    if (!blockIds.length) {
        throw new Error('Selecciona al menos un bloque');
    }
    const schedule = await getScheduleForDate(input.date);
    const existing = schedule.blocks.filter((block) => blockIds.includes(block.id));

    if (existing.length !== blockIds.length) {
        throw new Error('Uno o mas bloques no existen');
    }
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'program_blocks.bulk_status_updated',
            entityType: 'program_blocks',
            metadata: { date: input.date, blocks: blockIds.length },
            previous: { blocks: existing.map((block) => ({ id: block.id, status: block.status })) },
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
}

export async function updateRunbookCheck(input: {
    date: string;
    programDayId: string;
    section: RunbookSection;
    itemKey: string;
    checked: boolean;
    notes?: string;
}) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'operator_runbook.updated',
            entityType: 'operator_runbook_checks',
            metadata: {
                date: input.date,
                section: input.section,
                item_key: input.itemKey,
            },
            next: { checked: input.checked, notes: input.notes || null },
        },
        async () => {
            const { error } = await supabase.from('operator_runbook_checks').upsert(
                {
                    program_day_id: input.programDayId,
                    section: input.section,
                    item_key: input.itemKey,
                    checked: input.checked,
                    notes: input.notes || null,
                    checked_at: input.checked ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'program_day_id,section,item_key' },
            );

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath(`/admin/runbook/${input.date}`);
    revalidatePath(`/admin/schedule/${input.date}`);
    revalidatePath('/admin/output');
}

function assertProgramStatus(status: ProgramStatus) {
    if (!['draft', 'ready', 'active', 'archived'].includes(status)) {
        throw new Error('Estado invalido');
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

export async function deleteProgramBlock(input: { date: string; blockId: string }) {
    const schedule = await getScheduleForDate(input.date);
    const block = schedule.blocks.find((item) => item.id === input.blockId);

    if (!block) {
        throw new Error('Bloque no encontrado');
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
}

export async function createLongTestSchedule(input: {
    date: string;
    startTime: string;
    totalHours: number;
    programMinutes: number;
    adBreakMinutes: number;
    imageBumperSeconds: number;
    replaceWindow: boolean;
}) {
    const dayId = await ensureProgramDay(input.date);
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
        throw new Error('No se pudo generar la grilla');
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
}

export async function createBulkCardLoop(input: {
    date: string;
    startTime: string;
    endTime: string;
    cards: Array<{ slideId: string; durationSeconds: number }>;
    replaceWindow: boolean;
}) {
    const dayId = await ensureProgramDay(input.date);
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
                    Math.round(Number(card.durationSeconds || slide.defaultDurationSeconds || 30)),
                ),
            };
        })
        .filter(Boolean) as Array<{ slideId: string; title: string; durationSeconds: number }>;

    if (!cards.length) {
        throw new Error('Selecciona al menos una card ready');
    }

    const generatedBlocks = buildBulkCardLoop({
        cards,
        startTime: input.startTime,
        endTime: input.endTime,
    });
    const firstBlock = generatedBlocks[0];
    const lastBlock = generatedBlocks[generatedBlocks.length - 1];

    if (!firstBlock || !lastBlock) {
        throw new Error('El rango no admite ninguna card completa');
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
        throw new Error('El rango se solapa con bloques existentes');
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
}

export async function saveGlobalFallbackCarouselFromSlides(input: {
    cards: Array<{ slideId: string; durationSeconds: number }>;
}) {
    const supabase = createServiceClient();
    const cards = input.cards
        .map((card) => ({
            slideId: String(card.slideId || ''),
            durationSeconds: Math.max(1, Math.round(Number(card.durationSeconds || 30))),
        }))
        .filter((card): card is FallbackCarouselCard => Boolean(card.slideId));

    if (!cards.length) {
        throw new Error('Selecciona al menos una card para fallback');
    }

    await auditedMutation(
        {
            action: 'fallback_carousel.updated',
            entityType: 'integration_settings',
            entityId: 'fallback_carousel',
            next: { enabled: true, cards: cards.length },
        },
        async () => {
            const { error } = await supabase.from('integration_settings').upsert(
                {
                    provider: 'fallback_carousel',
                    public_config: {
                        enabled: true,
                        cards,
                    },
                    status: 'connected',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'provider' },
            );

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/schedule');
    revalidatePath('/admin/assets');
    revalidatePath('/admin/output');
}

export async function createSlideAsset(input: {
    title: string;
    slideType: string;
    content?: string | undefined;
    imageUrl?: string | undefined;
    htmlContent?: string | undefined;
    templateId?: string | undefined;
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'slide_asset.created',
            entityType: 'slide_assets',
            next: {
                title: input.title,
                slide_type: input.slideType,
                status: input.status || 'ready',
            },
        },
        async () => {
            const { error } = await supabase.from('slide_assets').insert({
                title: input.title,
                slide_type: input.slideType,
                content: input.content || null,
                image_url: input.imageUrl || null,
                html_content: input.htmlContent || null,
                template_id: input.templateId || null,
                default_duration_seconds: input.defaultDurationSeconds || null,
                metadata: input.metadata ?? {},
                status: input.status || 'ready',
            });

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/slides');
}

export async function archiveSlideAsset(slideId: string) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'slide_asset.archived',
            entityType: 'slide_assets',
            entityId: slideId,
            next: { status: 'archived' },
        },
        async () => {
            const { error } = await supabase
                .from('slide_assets')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('id', slideId);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/slides');
    revalidatePath('/admin/calendar');
}

export async function createWeatherPlate(input: {
    title: string;
    locationName: string;
    lat: number;
    lon: number;
    defaultDurationSeconds?: number;
    status?: string;
}) {
    const location = normalizeWeatherLocation(input);
    await createSlideAsset({
        title: input.title,
        slideType: 'template',
        templateId: 'weather',
        content: `Weather plate for ${location.locationName}.`,
        defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
        status: input.status || 'ready',
        metadata: weatherPlateMetadata(location),
    });
    revalidatePath('/admin/slides');
}

export async function updateWeatherPlate(input: {
    slideId: string;
    title: string;
    locationName: string;
    lat: number;
    lon: number;
    defaultDurationSeconds?: number;
    status?: string;
}) {
    const location = normalizeWeatherLocation(input);
    const status = input.status === 'draft' || input.status === 'archived' ? input.status : 'ready';
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'weather_plate.updated',
            entityType: 'slide_assets',
            entityId: input.slideId,
            next: { title: input.title, status, locationName: location.locationName },
        },
        async () => {
            const { error } = await supabase
                .from('slide_assets')
                .update({
                    title: input.title,
                    content: `Weather plate for ${location.locationName}.`,
                    default_duration_seconds: input.defaultDurationSeconds ?? 30,
                    status,
                    metadata: weatherPlateMetadata(location),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', input.slideId)
                .eq('template_id', 'weather');

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/slides');
    revalidatePath('/admin/schedule');
    revalidatePath('/admin/output');
}

function normalizeWeatherLocation(input: { locationName: string; lat: number; lon: number }) {
    const locationName = input.locationName.trim();
    const lat = Number(input.lat);
    const lon = Number(input.lon);

    if (!locationName) {
        throw new Error('City name is required');
    }

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error('Latitude is invalid');
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new Error('Longitude is invalid');
    }

    return { locationName, lat, lon };
}

function weatherPlateMetadata(location: { locationName: string; lat: number; lon: number }) {
    return {
        weatherLocationName: location.locationName,
        weatherLat: location.lat,
        weatherLon: location.lon,
    };
}

export async function createGuest(input: {
    name: string;
    role?: string;
    company?: string;
    host?: string;
    program?: string;
    category?: string;
    appearanceAt?: string;
    photoUrl?: string;
    photoAssetId?: string;
    videoUrl?: string;
    videoAssetId?: string;
    color?: string;
    sortOrder?: number;
    status?: GuestStatus;
}) {
    const supabase = createServiceClient();
    const status = normalizeGuestStatus(input.status);
    await auditedMutation(
        {
            action: 'guest.created',
            entityType: 'guests',
            next: { name: input.name, status },
        },
        async () => {
            const { error } = await supabase.from('guests').insert({
                name: input.name,
                role: input.role || null,
                company: input.company || null,
                host: input.host || null,
                program: input.program || null,
                category: input.category || 'markets',
                appearance_at: input.appearanceAt || null,
                photo_url: input.photoUrl || null,
                photo_asset_id: input.photoAssetId || null,
                video_url: input.videoUrl || null,
                video_asset_id: input.videoAssetId || null,
                color: input.color || '#f7931a',
                sort_order: input.sortOrder ?? 0,
                status,
            });

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

export async function updateGuest(input: {
    id: string;
    name: string;
    role?: string;
    company?: string;
    host?: string;
    program?: string;
    category?: string;
    appearanceAt?: string;
    photoUrl?: string;
    photoAssetId?: string;
    videoUrl?: string;
    videoAssetId?: string;
    color?: string;
    sortOrder?: number;
    status?: GuestStatus;
}) {
    const supabase = createServiceClient();
    const status = normalizeGuestStatus(input.status);
    await auditedMutation(
        {
            action: 'guest.updated',
            entityType: 'guests',
            entityId: input.id,
            next: { name: input.name, status },
        },
        async () => {
            const { error } = await supabase
                .from('guests')
                .update({
                    name: input.name,
                    role: input.role || null,
                    company: input.company || null,
                    host: input.host || null,
                    program: input.program || null,
                    category: input.category || 'markets',
                    appearance_at: input.appearanceAt || null,
                    photo_url: input.photoUrl || null,
                    photo_asset_id: input.photoAssetId || null,
                    video_url: input.videoUrl || null,
                    video_asset_id: input.videoAssetId || null,
                    color: input.color || '#f7931a',
                    sort_order: input.sortOrder ?? 0,
                    status,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', input.id);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

export async function archiveGuest(id: string) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'guest.archived',
            entityType: 'guests',
            entityId: id,
            next: { status: 'archived' },
        },
        async () => {
            const { error } = await supabase
                .from('guests')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

export async function attachGuestMediaAsset(input: {
    guestId: string;
    kind: 'photo' | 'video';
    assetId: string;
    url: string;
}) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'guest.media_attached',
            entityType: 'guests',
            entityId: input.guestId,
            next: { kind: input.kind, asset_id: input.assetId },
        },
        async () => {
            const update =
                input.kind === 'photo'
                    ? {
                          photo_asset_id: input.assetId,
                          photo_url: input.url,
                          updated_at: new Date().toISOString(),
                      }
                    : {
                          video_asset_id: input.assetId,
                          video_url: input.url,
                          updated_at: new Date().toISOString(),
                      };
            const { error } = await supabase.from('guests').update(update).eq('id', input.guestId);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

function normalizeGuestStatus(status?: GuestStatus) {
    if (status === 'draft' || status === 'archived') {
        return status;
    }

    return 'ready';
}

export async function createGuestPlate(input: {
    title: string;
    guestIds: string[];
    defaultDurationSeconds?: number;
    status?: string;
}) {
    const guestIds = normalizeGuestIds(input.guestIds);

    if (!guestIds.length) {
        throw new Error('Selecciona al menos un invitado');
    }
    await createSlideAsset({
        title: input.title,
        slideType: 'template',
        templateId: 'guest-lineup',
        content: 'Guest Lineup plate with custom guest selection.',
        defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
        status: input.status || 'ready',
        metadata: { guestIds },
    });
    revalidatePath('/admin/guests');
}

export async function updateGuestPlate(input: {
    slideId: string;
    title: string;
    guestIds: string[];
    defaultDurationSeconds?: number;
    status?: string;
}) {
    const guestIds = normalizeGuestIds(input.guestIds);

    if (!guestIds.length) {
        throw new Error('Selecciona al menos un invitado');
    }
    const status = input.status === 'draft' || input.status === 'archived' ? input.status : 'ready';
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'guest_plate.updated',
            entityType: 'slide_assets',
            entityId: input.slideId,
            next: { title: input.title, status, guests: guestIds.length },
        },
        async () => {
            const { error } = await supabase
                .from('slide_assets')
                .update({
                    title: input.title,
                    default_duration_seconds: input.defaultDurationSeconds ?? 30,
                    status,
                    metadata: { guestIds },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', input.slideId)
                .eq('template_id', 'guest-lineup');

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

export async function archiveGuestPlate(slideId: string) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'guest_plate.archived',
            entityType: 'slide_assets',
            entityId: slideId,
            next: { status: 'archived' },
        },
        async () => {
            const { error } = await supabase
                .from('slide_assets')
                .update({ status: 'archived', updated_at: new Date().toISOString() })
                .eq('id', slideId)
                .eq('template_id', 'guest-lineup');

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/guests');
    revalidatePath('/admin/slides');
}

function normalizeGuestIds(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function createScheduledLayer(input: {
    date: string;
    blockId: string;
    title: string;
    layerType: string;
    assetId?: string;
    slideId?: string;
    startTime: string;
    durationSeconds: number;
    zIndex: number;
    position: string;
}) {
    const startTimeSeconds = parseTimecode(input.startTime);
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'scheduled_layer.created',
            entityType: 'scheduled_layers',
            metadata: { block_id: input.blockId },
            next: {
                title: input.title,
                start_time: input.startTime,
                duration_seconds: input.durationSeconds,
            },
        },
        async () => {
            const { error } = await supabase.from('scheduled_layers').insert({
                program_block_id: input.blockId,
                title: input.title,
                layer_type: input.layerType,
                asset_id: input.assetId || null,
                slide_id: input.slideId || null,
                start_time_seconds: startTimeSeconds,
                duration_seconds: input.durationSeconds,
                z_index: input.zIndex,
                position: input.position,
                enabled: true,
            });

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`);
    revalidatePath(`/admin/schedule/${input.date}`);
}

export async function setScheduledLayerEnabled(input: {
    date: string;
    blockId: string;
    layerId: string;
    enabled: boolean;
}) {
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: input.enabled ? 'scheduled_layer.enabled' : 'scheduled_layer.disabled',
            entityType: 'scheduled_layers',
            entityId: input.layerId,
            metadata: { block_id: input.blockId },
            next: { enabled: input.enabled },
        },
        async () => {
            const { error } = await supabase
                .from('scheduled_layers')
                .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
                .eq('id', input.layerId);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath(`/admin/schedule/${input.date}`);
    revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`);
}

export async function createMediaAsset(input: {
    title: string;
    sourceType: string;
    mediaKind: string;
    assetType: string;
    url?: string | undefined;
    storageBucket?: string | undefined;
    storagePath?: string | undefined;
    durationSeconds?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    lifecycleState?: string | undefined;
}) {
    if (input.assetType === 'ad' && input.durationSeconds && input.durationSeconds > 300) {
        throw new Error('Ads cannot be longer than 300 seconds');
    }
    const supabase = createServiceClient();
    const data = await auditedMutation(
        {
            action: 'media_asset.created',
            entityType: 'media_assets',
            next: { title: input.title, source_type: input.sourceType, status: 'ready' },
        },
        async () => {
            const { data, error } = await supabase
                .from('media_assets')
                .insert({
                    title: input.title,
                    source_type: input.sourceType,
                    media_kind: input.mediaKind,
                    asset_type: input.assetType,
                    url: input.url || null,
                    storage_bucket: input.storageBucket || null,
                    storage_path: input.storagePath || null,
                    duration_seconds: input.durationSeconds || null,
                    metadata: input.metadata ?? {},
                    status: 'ready',
                    lifecycle_state: input.lifecycleState ?? 'reviewed',
                })
                .select('id')
                .single();

            if (error) {
                throw error;
            }

            return data;
        },
    );
    revalidatePath('/admin/assets');

    return String(data.id);
}

export async function updateMediaAsset(input: {
    id: string;
    title: string;
    description?: string | undefined;
    sourceType: string;
    mediaKind: string;
    assetType: string;
    url?: string | undefined;
    thumbnailUrl?: string | undefined;
    durationSeconds?: number | undefined;
    status: string;
    lifecycleState?: string | undefined;
    orientation?: string | undefined;
    fallbackLoop?: boolean | undefined;
    playlistOrder?: number | undefined;
    revalidatePaths?: string[] | undefined;
}) {
    if (!input.id) {
        throw new Error('Asset missing');
    }

    if (input.assetType === 'ad' && input.durationSeconds && input.durationSeconds > 300) {
        throw new Error('Ads cannot be longer than 300 seconds');
    }
    const supabase = createServiceClient();
    const { data: current, error: currentError } = await supabase
        .from('media_assets')
        .select('metadata')
        .eq('id', input.id)
        .single();

    if (currentError) {
        throw currentError;
    }

    const metadata =
        typeof current.metadata === 'object' && current.metadata !== null
            ? { ...(current.metadata as Record<string, unknown>) }
            : {};
    const orientation = input.orientation || String(metadata.orientation || 'auto');
    metadata.orientation = orientation;
    metadata.presentation = orientation === 'vertical' ? 'vertical_blur' : 'fit';
    metadata.background = orientation === 'vertical' ? 'blur' : 'black';
    metadata.fallback_loop = input.fallbackLoop === true;
    metadata.fallback_muted = input.fallbackLoop === true;

    if (input.fallbackLoop) {
        metadata.fallback_loop_selected_at = new Date().toISOString();
    } else {
        delete metadata.fallback_loop_selected_at;
    }

    if (input.assetType === 'music' && typeof input.playlistOrder === 'number') {
        metadata.playlist_order = input.playlistOrder;
    }

    await auditedMutation(
        {
            action: 'media_asset.updated',
            entityType: 'media_assets',
            entityId: input.id,
            ...(typeof current === 'object' && current !== null
                ? { previous: { metadata: current.metadata ?? null } }
                : {}),
            next: {
                title: input.title,
                source_type: input.sourceType,
                asset_type: input.assetType,
                status: input.status,
                lifecycle_state: input.lifecycleState ?? 'reviewed',
            },
        },
        async () => {
            const { error } = await supabase
                .from('media_assets')
                .update({
                    title: input.title,
                    description: input.description || null,
                    source_type: input.sourceType,
                    media_kind: input.mediaKind,
                    asset_type: input.assetType,
                    url: input.url || null,
                    thumbnail_url: input.thumbnailUrl || null,
                    duration_seconds: input.durationSeconds || null,
                    status: input.status,
                    lifecycle_state: input.lifecycleState ?? 'reviewed',
                    metadata,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', input.id);

            if (error) {
                throw error;
            }
        },
    );

    if (input.fallbackLoop) {
        await clearOtherFallbackLoops(input.id);
    }
    revalidatePath('/admin/assets');
    revalidatePath('/admin/output');

    for (const path of input.revalidatePaths ?? []) {
        revalidatePath(path);
    }
}

async function clearOtherFallbackLoops(activeAssetId: string) {
    const supabase = createServiceClient();
    const { data, error } = await supabase.from('media_assets').select('id,metadata');

    if (error) {
        throw error;
    }
    const rows = Array.isArray(data) ? data : [];

    for (const row of rows) {
        const id = typeof row?.id === 'string' ? row.id : '';
        const metadata =
            typeof row?.metadata === 'object' && row.metadata !== null
                ? { ...(row.metadata as Record<string, unknown>) }
                : {};

        if (!id || id === activeAssetId || metadata.fallback_loop !== true) {
            continue;
        }
        metadata.fallback_loop = false;
        metadata.fallback_muted = false;
        delete metadata.fallback_loop_selected_at;
        const { error: updateError } = await supabase
            .from('media_assets')
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) {
            throw updateError;
        }
    }
}

export async function deleteMediaAsset(input: { id: string; force?: boolean }) {
    if (!input.id) {
        throw new Error('Asset missing');
    }
    const supabase = createServiceClient();
    const { data: asset, error: assetError } = await supabase
        .from('media_assets')
        .select('title, storage_bucket, storage_path, lifecycle_state')
        .eq('id', input.id)
        .single();

    if (assetError) {
        throw assetError;
    }
    const scheduledInUse =
        asset.lifecycle_state === 'scheduled_in_use' || (await isAssetScheduled(input.id));

    if (scheduledInUse && !input.force) {
        throw new Error('Asset is scheduled in use. Confirm force delete to continue.');
    }

    const storageBucket = asset.storage_bucket ? String(asset.storage_bucket) : '';
    const storagePath = asset.storage_path ? String(asset.storage_path) : '';

    if (storageBucket && storagePath) {
        const { error: storageError } = await supabase.storage
            .from(storageBucket)
            .remove([storagePath]);

        if (storageError) {
            throw storageError;
        }
    }

    await auditedMutation(
        {
            action: 'media_asset.deleted',
            entityType: 'media_assets',
            entityId: input.id,
            previous: { title: String(asset.title ?? '') },
        },
        async () => {
            const { error } = await supabase.from('media_assets').delete().eq('id', input.id);

            if (error) {
                throw error;
            }
        },
    );
    revalidatePath('/admin/assets');
    revalidatePath('/admin/music');
}

async function isAssetScheduled(assetId: string) {
    const supabase = createServiceClient();
    const [{ data: blocks, error: blocksError }, { data: layers, error: layersError }] =
        await Promise.all([
            supabase.from('program_blocks').select('asset_id, fallback_asset_id, status'),
            supabase.from('scheduled_layers').select('asset_id, enabled'),
        ]);

    if (blocksError) {
        throw blocksError;
    }

    if (layersError) {
        throw layersError;
    }
    const blockRows = (blocks ?? []) as Array<Record<string, unknown>>;
    const layerRows = (layers ?? []) as Array<Record<string, unknown>>;

    return (
        blockRows.some(
            (row) =>
                row.status !== 'archived' &&
                (row.asset_id === assetId || row.fallback_asset_id === assetId),
        ) || layerRows.some((row) => row.enabled !== false && row.asset_id === assetId)
    );
}
