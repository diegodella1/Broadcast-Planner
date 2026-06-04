import { revalidatePath } from 'next/cache';
import { and, eq, desc } from 'drizzle-orm';

import { auditedMutation, recordAuditEvent } from '../audit/audit';
import { getCurrentOperatorSession } from '../auth/auth';
import { getMediaAssetById, getMediaAssetByVimeoUri } from '../data';
import { maskStreamUrl, parseReutersStreamInput } from '../services/reuters-stream';
import { err, extractError, ok, type Result } from '../result';
import { getVimeoToken } from '../settings';
import { getDb } from '../db/client';
import { outputOverrides, programBlocks, programDays } from '../db/schema';
import {
    formatTimecode,
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '../helpers/time';
import {
    getVimeoVideo,
    searchVimeoAccountVideos,
    upsertVimeoVideos,
    type VimeoVideo,
} from '../services/vimeo';

import { createProgramBlock } from './blocks';

import type {
    GoLiveNowInput,
    GoLiveReutersInput,
    ScheduleReutersBlockInput,
    ScheduleVimeoBlockInput,
} from '../schemas/manual-broadcast';
import type { MediaAsset } from '../types';

const TZ = PLAYOUT_TIMEZONE;
const DEFAULT_DURATION_SECONDS = 1800;
const REUTERS_LIVE_DEFAULT_DURATION_SECONDS = 1800;

export type ReutersOverrideInput = {
    programDayId: string;
    streamUrl: string;
    label?: string;
    expiresAt?: string;
};

export async function setReutersOutputOverride(input: ReutersOverrideInput): Promise<Result<void>> {
    try {
        const stream = parseReutersStreamInput({
            url: input.streamUrl,
            ...(input.label ? { label: input.label } : {}),
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        });

        if (!stream) {
            return err('Reuters stream URL is required');
        }

        const db = await getDb();
        const operator = await getCurrentOperatorSession();

        await auditedMutation(
            {
                action: 'output_override.reuters_set',
                entityType: 'output_overrides',
                entityId: input.programDayId,
                metadata: {
                    source_type: 'reuters',
                    protocol: stream.protocol,
                    stream_url: maskStreamUrl(stream.url),
                    expires_at: stream.expiresAt ?? null,
                },
            },
            async () => {
                const clear = await clearOutputOverrideInternal(input.programDayId);

                if (!clear.success) {
                    throw new Error(clear.error);
                }

                await db.insert(outputOverrides).values({
                    programDayId: input.programDayId,
                    enabled: true,
                    sourceType: 'reuters',
                    streamUrl: stream.url,
                    streamProtocol: stream.protocol,
                    label: stream.label,
                    expiresAt: stream.expiresAt ?? null,
                    metadata: {
                        stream_url_masked: maskStreamUrl(stream.url),
                        refreshed_at: new Date().toISOString(),
                    },
                    createdBy:
                        operator?.operatorId === 'bootstrap'
                            ? null
                            : (operator?.operatorId ?? null),
                });
            },
        );
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

async function clearOutputOverrideInternal(programDayId: string): Promise<Result<void>> {
    try {
        const db = await getDb();

        await db
            .update(outputOverrides)
            .set({ enabled: false, updatedAt: new Date().toISOString() })
            .where(
                and(
                    eq(outputOverrides.programDayId, programDayId),
                    eq(outputOverrides.enabled, true),
                ),
            );

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function clearOutputOverride(programDayId: string): Promise<Result<void>> {
    try {
        await auditedMutation(
            {
                action: 'output_override.cleared',
                entityType: 'output_overrides',
                entityId: programDayId,
            },
            async () => {
                const result = await clearOutputOverrideInternal(programDayId);

                if (!result.success) {
                    throw new Error(result.error);
                }
            },
        );
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function ensureVimeoAssetCached(
    token: string,
    vimeoUri: string,
): Promise<Result<string>> {
    try {
        const existing = await getMediaAssetByVimeoUri(vimeoUri);

        if (existing) {
            return ok(existing.id);
        }

        const video = await getVimeoVideo(token, vimeoUri);
        await upsertVimeoVideos([video]);

        const inserted = await getMediaAssetByVimeoUri(vimeoUri);

        if (!inserted) {
            return err('manual-broadcast: failed to cache Vimeo asset');
        }

        return ok(inserted.id);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function searchVimeoCatalog(query: string): Promise<Result<VimeoVideo[]>> {
    try {
        const token = await getVimeoToken();

        if (!token) {
            return err('vimeo: no token configured');
        }

        const videos = await searchVimeoAccountVideos(token, query);

        return ok(videos);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function goLiveWithVimeo(
    input: GoLiveNowInput,
): Promise<Result<{ programBlockId: string }>> {
    try {
        const token = await getVimeoToken();

        if (!token) {
            return err('vimeo: no token configured');
        }

        const cacheResult = await ensureVimeoAssetCached(token, input.vimeoUri);

        if (!cacheResult.success) {
            return cacheResult;
        }

        const assetId = cacheResult.data;
        const asset = await getMediaAssetById(assetId);

        if (!asset) {
            return err('manual-broadcast: cached asset not found');
        }

        const now = new Date();
        const airDate = isoDateInTimezone(now, TZ);
        const startSeconds = secondsSinceMidnightInTimezone(now, TZ);
        const startTime = formatTimecode(startSeconds);
        const durationSeconds = resolveDuration(asset);

        const createResult = await createProgramBlock({
            date: airDate,
            title: asset.title,
            blockType: 'video',
            category: 'broadcast',
            assetId,
            startTime,
            durationSeconds,
            hideOverlays: false,
            conflictResolution: 'archive_conflicts',
        });

        if (!createResult.success) {
            return err(createResult.error);
        }

        const programBlockId = await fetchInsertedBlockId(airDate, startSeconds);
        await logManualBroadcast('manual_broadcast.go_live', {
            asset_id: assetId,
            vimeo_uri: input.vimeoUri,
            air_date: airDate,
            start_time: startTime,
            program_block_id: programBlockId,
        });

        revalidatePath('/admin/output');
        revalidatePath(`/admin/schedule/${airDate}`);

        return ok({ programBlockId: programBlockId ?? '' });
    } catch (error) {
        return err(extractError(error));
    }
}

export async function scheduleVimeoBlock(
    input: ScheduleVimeoBlockInput,
): Promise<Result<{ programBlockId: string }>> {
    try {
        const token = await getVimeoToken();

        if (!token) {
            return err('vimeo: no token configured');
        }

        const cacheResult = await ensureVimeoAssetCached(token, input.vimeoUri);

        if (!cacheResult.success) {
            return cacheResult;
        }

        const assetId = cacheResult.data;
        const asset = await getMediaAssetById(assetId);

        if (!asset) {
            return err('manual-broadcast: cached asset not found');
        }

        const airDate = input.airDate ?? isoDateInTimezone(new Date(), TZ);
        const startTime = normalizeStartTime(input.startAt);
        const startSeconds = startTimeToSeconds(startTime);
        const durationSeconds = resolveDuration(asset);

        const createResult = await createProgramBlock({
            date: airDate,
            title: asset.title,
            blockType: 'video',
            category: 'broadcast',
            assetId,
            startTime,
            durationSeconds,
            hideOverlays: false,
        });

        if (!createResult.success) {
            return err(createResult.error);
        }

        const programBlockId = await fetchInsertedBlockId(airDate, startSeconds);
        await logManualBroadcast('manual_broadcast.schedule', {
            asset_id: assetId,
            vimeo_uri: input.vimeoUri,
            air_date: airDate,
            start_time: startTime,
            program_block_id: programBlockId,
        });

        revalidatePath('/admin/output');
        revalidatePath(`/admin/schedule/${airDate}`);

        return ok({ programBlockId: programBlockId ?? '' });
    } catch (error) {
        return err(extractError(error));
    }
}

export async function goLiveWithReuters(
    input: GoLiveReutersInput,
): Promise<Result<{ programBlockId: string }>> {
    try {
        const asset = await getMediaAssetById(input.assetId);

        if (!asset) {
            return err('manual-broadcast: reuters asset not found');
        }

        if (asset.sourceType !== 'reuters') {
            return err('manual-broadcast: asset is not a reuters channel');
        }

        const now = new Date();
        const airDate = isoDateInTimezone(now, TZ);
        const startSeconds = secondsSinceMidnightInTimezone(now, TZ);
        const startTime = formatTimecode(startSeconds);
        const durationSeconds = resolveReutersDuration(asset);

        const createResult = await createProgramBlock({
            date: airDate,
            title: asset.title,
            blockType: 'video',
            category: 'reuters',
            assetId: input.assetId,
            startTime,
            durationSeconds,
            hideOverlays: false,
            conflictResolution: 'archive_conflicts',
        });

        if (!createResult.success) {
            return err(createResult.error);
        }

        const programBlockId = await fetchInsertedBlockId(airDate, startSeconds);
        await logManualBroadcast('manual_broadcast.reuters_go_live', {
            asset_id: input.assetId,
            air_date: airDate,
            start_time: startTime,
            program_block_id: programBlockId,
        });

        revalidatePath('/admin/output');
        revalidatePath(`/admin/schedule/${airDate}`);

        return ok({ programBlockId: programBlockId ?? '' });
    } catch (error) {
        return err(extractError(error));
    }
}

export async function scheduleReutersBlock(
    input: ScheduleReutersBlockInput,
): Promise<Result<{ programBlockId: string }>> {
    try {
        const asset = await getMediaAssetById(input.assetId);

        if (!asset) {
            return err('manual-broadcast: reuters asset not found');
        }

        if (asset.sourceType !== 'reuters') {
            return err('manual-broadcast: asset is not a reuters channel');
        }

        const airDate = input.airDate ?? isoDateInTimezone(new Date(), TZ);
        const startTime = normalizeStartTime(input.startAt);
        const startSeconds = startTimeToSeconds(startTime);
        const durationSeconds = input.durationSeconds;

        const createResult = await createProgramBlock({
            date: airDate,
            title: asset.title,
            blockType: 'video',
            category: 'reuters',
            assetId: input.assetId,
            startTime,
            durationSeconds,
            hideOverlays: false,
        });

        if (!createResult.success) {
            return err(createResult.error);
        }

        const programBlockId = await fetchInsertedBlockId(airDate, startSeconds);
        await logManualBroadcast('manual_broadcast.reuters_schedule', {
            asset_id: input.assetId,
            air_date: airDate,
            start_time: startTime,
            duration_seconds: durationSeconds,
            program_block_id: programBlockId,
        });

        revalidatePath('/admin/output');
        revalidatePath(`/admin/schedule/${airDate}`);

        return ok({ programBlockId: programBlockId ?? '' });
    } catch (error) {
        return err(extractError(error));
    }
}

function resolveDuration(asset: MediaAsset): number {
    const value = asset.durationSeconds;

    if (typeof value === 'number' && value > 0) {
        return Math.round(value);
    }

    return DEFAULT_DURATION_SECONDS;
}

function resolveReutersDuration(asset: MediaAsset): number {
    const value = asset.durationSeconds;

    if (typeof value === 'number' && value > 0) {
        return Math.round(value);
    }

    return REUTERS_LIVE_DEFAULT_DURATION_SECONDS;
}

function normalizeStartTime(value: string): string {
    return value.length === 5 ? `${value}:00` : value;
}

function startTimeToSeconds(hhmmss: string): number {
    const [h, m, s] = hhmmss.split(':').map(Number) as [number, number, number];

    return h * 3600 + m * 60 + s;
}

async function fetchInsertedBlockId(date: string, startSeconds: number): Promise<string | null> {
    try {
        const db = await getDb();
        const [day] = await db
            .select({ id: programDays.id })
            .from(programDays)
            .where(eq(programDays.airDate, date))
            .limit(1);

        if (!day?.id) {
            return null;
        }

        const [row] = await db
            .select({ id: programBlocks.id })
            .from(programBlocks)
            .where(
                and(
                    eq(programBlocks.programDayId, day.id),
                    eq(programBlocks.startTimeSeconds, startSeconds),
                ),
            )
            .orderBy(desc(programBlocks.createdAt))
            .limit(1);

        return row?.id ? String(row.id) : null;
    } catch (error) {
        console.error('[lib/mutations/output.ts:fetchInsertedBlockId]', error);

        return null;
    }
}

async function logManualBroadcast(action: string, metadata: Record<string, unknown>) {
    try {
        await recordAuditEvent({
            actor: 'admin',
            action,
            entityType: 'program_blocks',
            metadata,
        });
    } catch (error) {
        console.error('[lib/mutations/output.ts:logManualBroadcast]', error);
    }
}
