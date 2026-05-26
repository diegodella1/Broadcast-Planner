import { revalidatePath } from 'next/cache';

import { auditedMutation, recordAuditEvent } from '../audit/audit';
import { getCurrentOperatorSession } from '../auth/auth';
import { getMediaAssetById, getMediaAssetByVimeoUri } from '../data';
import { maskStreamUrl, parseReutersStreamInput } from '../services/reuters-stream';
import { err, ok, type Result } from '../result';
import { getVimeoToken } from '../settings';
import { createServiceClient } from '../supabase/server';
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

function extractError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

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
        const supabase = createServiceClient();
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
                const { error } = await supabase.from('output_overrides').insert({
                    program_day_id: input.programDayId,
                    enabled: true,
                    source_type: 'reuters',
                    stream_url: stream.url,
                    stream_protocol: stream.protocol,
                    label: stream.label,
                    expires_at: stream.expiresAt ?? null,
                    metadata: {
                        stream_url_masked: maskStreamUrl(stream.url),
                        refreshed_at: new Date().toISOString(),
                    },
                    created_by: operator?.operatorId === 'bootstrap' ? null : operator?.operatorId,
                });

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
        const { error } = await supabase
            .from('output_overrides')
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq('program_day_id', programDayId)
            .eq('enabled', true);

        if (error) {
            throw error;
        }

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
        const supabase = createServiceClient();
        const { data: day } = await supabase
            .from('program_days')
            .select('id')
            .eq('air_date', date)
            .maybeSingle();

        if (!day?.id) {
            return null;
        }
        const { data } = await supabase
            .from('program_blocks')
            .select('id')
            .eq('program_day_id', String(day.id))
            .eq('start_time_seconds', startSeconds)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        return data?.id ? String(data.id) : null;
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
