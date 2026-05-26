import { revalidatePath } from 'next/cache';

import { createServiceClient } from '../supabase/server';

const VIMEO_API = 'https://api.vimeo.com';
const VIMEO_ACCEPT = 'application/vnd.vimeo.*+json;version=3.4';

export type VimeoShow = {
    uri: string;
    name: string;
    link?: string;
    description?: string;
    videoCount?: number;
};

export type VimeoVideo = {
    uri: string;
    name: string;
    link: string;
    duration: number;
    created_time?: string;
    pictures?: { sizes?: Array<{ link: string; width: number }> };
    privacy?: { view?: string; embed?: string };
    status?: string;
    showUri?: string | null;
    showName?: string | null;
};

export type VimeoPlayback = {
    hlsUrl: string;
    title: string;
    durationSeconds: number;
};

type VimeoPage<T> = {
    data?: T[];
    paging?: { next?: string | null };
};

export type VimeoSyncResult = {
    syncedCount: number;
    staleCount: number;
    failedCount: number;
    showCount: number;
    readinessCheckedCount?: number;
    readinessSkipped?: boolean;
    readinessSkippedCount?: number;
};

export async function listVimeoShows(token: string): Promise<VimeoShow[]> {
    const page = await vimeoFetch<
        VimeoPage<{
            uri: string;
            name: string;
            link?: string;
            description?: string;
            metadata?: { connections?: { videos?: { total?: number } } };
        }>
    >(
        '/me/albums?per_page=100&fields=uri,name,link,description,metadata.connections.videos.total',
        token,
    );

    return (page.data ?? []).map((show) => {
        const videoCount = show.metadata?.connections?.videos?.total;

        return {
            uri: show.uri,
            name: show.name,
            ...(show.link !== undefined ? { link: show.link } : {}),
            ...(show.description !== undefined ? { description: show.description } : {}),
            ...(videoCount !== undefined ? { videoCount } : {}),
        };
    });
}

export async function listVimeoEpisodes(token: string, showUri: string): Promise<VimeoVideo[]> {
    return listVimeoVideos(token, `${showUri}/videos?per_page=100&fields=${videoFields()}`);
}

export async function listVimeoAccountVideos(token: string): Promise<VimeoVideo[]> {
    return listVimeoVideos(token, `/me/videos?per_page=100&fields=${videoFields()}`);
}

export async function searchVimeoAccountVideos(
    token: string,
    query: string,
    perPage = 25,
): Promise<VimeoVideo[]> {
    const path = `/me/videos?per_page=${perPage}&query=${encodeURIComponent(
        query,
    )}&fields=${videoFields()}`;

    return listVimeoVideos(token, path);
}

export async function getVimeoVideo(token: string, videoUri: string): Promise<VimeoVideo> {
    return vimeoFetch<VimeoVideo>(`${videoUri}?fields=${videoFields()}`, token);
}

export async function getVimeoPlayback(token: string, videoId: string): Promise<VimeoPlayback> {
    const video = await vimeoFetch<{
        name?: string;
        duration?: number;
        play?: { hls?: { link?: string } };
    }>(`/videos/${encodeURIComponent(videoId)}?fields=name,duration,play.hls.link`, token);
    const hlsUrl = video.play?.hls?.link;

    if (!hlsUrl) {
        throw new Error('Vimeo playback URL unavailable');
    }

    return {
        hlsUrl,
        title: video.name ?? 'Vimeo video',
        durationSeconds: typeof video.duration === 'number' ? video.duration : 0,
    };
}

export async function upsertVimeoVideos(videos: VimeoVideo[]) {
    const supabase = createServiceClient();
    const rows = videos.map((video) => vimeoVideoToAssetRow(video));

    if (rows.length) {
        const { error } = await supabase
            .from('media_assets')
            .upsert(rows, { onConflict: 'vimeo_id' });

        if (error) {
            throw error;
        }
    }
    revalidatePath('/admin/assets');
}

export async function syncVimeoCatalog(token: string, scopeUri?: string): Promise<VimeoSyncResult> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const shows = scopeUri ? [] : await listVimeoShows(token);
    const scopedShow = scopeUri ? { uri: scopeUri, name: scopeUri } : null;
    const seen = new Set<string>();
    const merged = new Map<string, VimeoVideo>();

    const accountVideos = scopeUri
        ? await listVimeoVideos(token, `${scopeUri}/videos?per_page=100&fields=${videoFields()}`)
        : await listVimeoAccountVideos(token);

    for (const video of accountVideos) {
        merged.set(video.uri, scopedShow ? withShow(video, scopedShow) : video);
    }

    for (const show of shows) {
        const episodes = await listVimeoEpisodes(token, show.uri);

        for (const episode of episodes) {
            merged.set(episode.uri, withShow(episode, show));
        }
    }

    const videos = [...merged.values()];
    const { rows: existingRows, hasPlaybackReadinessColumns } =
        await selectExistingVimeoRows(supabase);
    const existingByVimeoId = new Map(
        (existingRows ?? [])
            .filter((row) => row.vimeo_id)
            .map((row) => [String(row.vimeo_id), row as Record<string, unknown>]),
    );

    const rows = videos.map((video) => {
        const vimeoId = video.uri.split('/').pop();

        if (vimeoId) {
            seen.add(vimeoId);
        }

        return vimeoVideoToAssetRow(
            video,
            now,
            vimeoId ? existingByVimeoId.get(vimeoId) : undefined,
            hasPlaybackReadinessColumns,
        );
    });

    let failedCount = 0;

    if (rows.length) {
        const { error } = await supabase
            .from('media_assets')
            .upsert(rows, { onConflict: 'vimeo_id' });

        if (isMissingLifecycleStateError(error)) {
            const { error: retryError } = await supabase
                .from('media_assets')
                .upsert(rows.map(withoutLifecycleState), { onConflict: 'vimeo_id' });

            if (retryError) {
                failedCount = rows.length;
                throw retryError;
            }
        } else if (error) {
            failedCount = rows.length;
            throw error;
        }
    }

    const readiness = hasPlaybackReadinessColumns
        ? await validateSyncedVimeoPlayback(
              token,
              rows.map((row) => String(row.vimeo_id ?? '')).filter(Boolean),
          )
        : { checkedCount: 0, failedCount: 0, skippedCount: 0 };
    failedCount += readiness.failedCount;

    let staleCount = 0;
    const staleRows = (existingRows ?? []).filter((row) => {
        const vimeoId = row.vimeo_id ? String(row.vimeo_id) : '';

        if (!vimeoId || seen.has(vimeoId)) {
            return false;
        }

        if (!scopeUri) {
            return true;
        }
        const metadata = row.metadata as Record<string, unknown> | null;

        return metadata?.vimeo_show_uri === scopeUri;
    });

    for (const row of staleRows) {
        const metadata =
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};
        const { error } = await supabase
            .from('media_assets')
            .update({
                status: 'archived',
                metadata: {
                    ...metadata,
                    vimeo_sync_status: 'stale',
                    vimeo_last_synced_at: now,
                },
                updated_at: now,
            })
            .eq('id', String(row.id));

        if (error) {
            failedCount += 1;
        } else {
            staleCount += 1;
        }
    }

    revalidatePath('/admin/assets');
    revalidatePath('/admin/vimeo');
    revalidatePath('/admin/settings');

    return {
        syncedCount: rows.length,
        staleCount,
        failedCount,
        showCount: scopeUri ? 1 : shows.length,
        readinessCheckedCount: readiness.checkedCount,
        readinessSkipped: !hasPlaybackReadinessColumns || readiness.skippedCount > 0,
        readinessSkippedCount: readiness.skippedCount,
    };
}

export async function checkVimeoAssetPlayback(assetId: string, token: string) {
    const supabase = createServiceClient();
    const { data: asset, error } = await supabase
        .from('media_assets')
        .select('id,title,vimeo_id')
        .eq('id', assetId)
        .eq('source_type', 'vimeo')
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!asset?.vimeo_id) {
        throw new Error('Vimeo asset not found');
    }
    await validateOneVimeoPlayback(token, {
        id: String(asset.id),
        vimeoId: String(asset.vimeo_id),
        title: String(asset.title ?? ''),
    });
    revalidatePath('/admin/assets');
    revalidatePath('/admin/vimeo');
}

async function validateSyncedVimeoPlayback(token: string, vimeoIds: string[]) {
    const supabase = createServiceClient();

    if (!vimeoIds.length) {
        return { checkedCount: 0, failedCount: 0, skippedCount: 0 };
    }
    const maxInlineChecks = Number(process.env.VIMEO_INLINE_PLAYBACK_CHECK_LIMIT ?? 25);

    if (vimeoIds.length > maxInlineChecks) {
        return { checkedCount: 0, failedCount: 0, skippedCount: vimeoIds.length };
    }
    const data = [];

    for (const batch of chunks(vimeoIds, 50)) {
        const { data: rows, error } = await supabase
            .from('media_assets')
            .select('id,title,vimeo_id')
            .eq('source_type', 'vimeo')
            .in('vimeo_id', batch);

        if (error) {
            throw error;
        }
        data.push(...(rows ?? []));
    }

    let failedCount = 0;

    for (const row of data) {
        try {
            await validateOneVimeoPlayback(token, {
                id: String(row.id),
                vimeoId: String(row.vimeo_id),
                title: String(row.title ?? ''),
            });
        } catch {
            failedCount += 1;
        }
    }

    return { checkedCount: data.length, failedCount, skippedCount: 0 };
}

async function validateOneVimeoPlayback(
    token: string,
    asset: { id: string; vimeoId: string; title: string },
) {
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    try {
        const playback = await getVimeoPlayback(token, asset.vimeoId);
        await updateVimeoPlaybackSuccess(supabase, asset.id, playback.durationSeconds || null, now);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Vimeo playback error';
        await updateVimeoPlaybackFailure(supabase, asset.id, message, now);
        throw error;
    }
}

function vimeoVideoToAssetRow(
    video: VimeoVideo,
    syncedAt = new Date().toISOString(),
    existing?: Record<string, unknown>,
    includePlaybackReadinessFields = true,
) {
    const vimeoId = video.uri.split('/').pop();
    const thumbnail = video.pictures?.sizes?.sort((a, b) => b.width - a.width)[0]?.link ?? null;
    const existingMetadata =
        typeof existing?.metadata === 'object' && existing.metadata !== null
            ? (existing.metadata as Record<string, unknown>)
            : {};
    const existingStatus = typeof existing?.status === 'string' ? existing.status : null;
    const hasDuration = typeof video.duration === 'number' && video.duration > 0;
    const status =
        existingStatus === 'archived'
            ? 'archived'
            : video.status === 'available' && hasDuration
              ? 'ready'
              : 'syncing';
    const existingAssetType =
        typeof existing?.asset_type === 'string' && existing.asset_type
            ? existing.asset_type
            : null;
    const assetType =
        existingAssetType && !(existingAssetType === 'ad' && video.duration > 300)
            ? existingAssetType
            : hasDuration && video.duration <= 300
              ? 'ad'
              : 'video';

    return {
        title: typeof existing?.title === 'string' && existing.title ? existing.title : video.name,
        source_type: 'vimeo',
        media_kind: 'video',
        asset_type: assetType,
        url: video.link,
        thumbnail_url: thumbnail,
        duration_seconds: hasDuration ? video.duration : null,
        status,
        lifecycle_state: status === 'archived' ? 'expired' : 'synced',
        vimeo_id: vimeoId,
        vimeo_uri: video.uri,
        vimeo_privacy: video.privacy?.view ?? null,
        vimeo_embed_status: video.privacy?.embed ?? null,
        ...(includePlaybackReadinessFields
            ? {
                  playback_readiness_status:
                      typeof existing?.playback_readiness_status === 'string'
                          ? existing.playback_readiness_status
                          : 'unchecked',
                  playback_error: null,
              }
            : {}),
        metadata: {
            ...existingMetadata,
            ...video,
            vimeo_show_uri: video.showUri ?? existingMetadata.vimeo_show_uri ?? null,
            vimeo_show_name: video.showName ?? existingMetadata.vimeo_show_name ?? null,
            vimeo_created_time: video.created_time ?? existingMetadata.vimeo_created_time ?? null,
            vimeo_last_synced_at: syncedAt,
            vimeo_sync_status: 'review',
        },
        updated_at: syncedAt,
    };
}

async function selectExistingVimeoRows(supabase: ReturnType<typeof createServiceClient>) {
    const withReadiness = await supabase
        .from('media_assets')
        .select('id,title,asset_type,status,vimeo_id,metadata,playback_readiness_status')
        .eq('source_type', 'vimeo');

    if (!isMissingColumnError(withReadiness.error)) {
        if (withReadiness.error) {
            throw withReadiness.error;
        }

        return { rows: withReadiness.data ?? [], hasPlaybackReadinessColumns: true };
    }

    const withoutReadiness = await supabase
        .from('media_assets')
        .select('id,title,asset_type,status,vimeo_id,metadata')
        .eq('source_type', 'vimeo');

    if (withoutReadiness.error) {
        throw withoutReadiness.error;
    }

    return { rows: withoutReadiness.data ?? [], hasPlaybackReadinessColumns: false };
}

async function updateVimeoPlaybackSuccess(
    supabase: ReturnType<typeof createServiceClient>,
    assetId: string,
    durationSeconds: number | null,
    now: string,
) {
    const update = {
        status: 'ready',
        duration_seconds: durationSeconds,
        playback_readiness_status: 'ready',
        playback_checked_at: now,
        playback_error: null,
        updated_at: now,
    };
    const { error } = await supabase.from('media_assets').update(update).eq('id', assetId);

    if (!isMissingColumnError(error)) {
        if (error) {
            throw error;
        }

        return;
    }
    const { error: fallbackError } = await supabase
        .from('media_assets')
        .update({
            status: 'ready',
            duration_seconds: durationSeconds,
            updated_at: now,
        })
        .eq('id', assetId);

    if (fallbackError) {
        throw fallbackError;
    }
}

async function updateVimeoPlaybackFailure(
    supabase: ReturnType<typeof createServiceClient>,
    assetId: string,
    message: string,
    now: string,
) {
    const update = {
        status: 'failed',
        playback_readiness_status: 'failed',
        playback_checked_at: now,
        playback_error: message,
        updated_at: now,
    };
    const { error } = await supabase.from('media_assets').update(update).eq('id', assetId);

    if (!isMissingColumnError(error)) {
        return;
    }
    await supabase
        .from('media_assets')
        .update({
            status: 'failed',
            updated_at: now,
        })
        .eq('id', assetId);
}

function isMissingColumnError(error: unknown) {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const item = error as { code?: unknown; message?: unknown };
    const message = String(item.message ?? '');

    return (
        item.code === '42703' ||
        item.code === 'PGRST204' ||
        message.includes('does not exist') ||
        message.includes('Could not find')
    );
}

function isMissingLifecycleStateError(error: unknown) {
    if (!isMissingColumnError(error)) {
        return false;
    }
    const message =
        error && typeof error === 'object'
            ? String((error as { message?: unknown }).message ?? '')
            : '';

    return message.includes('lifecycle_state');
}

function withoutLifecycleState<T extends Record<string, unknown>>(row: T) {
    const next = { ...row };
    delete next.lifecycle_state;

    return next;
}

function chunks<T>(items: T[], size: number) {
    const batches: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
    }

    return batches;
}

async function listVimeoVideos(token: string, path: string): Promise<VimeoVideo[]> {
    const videos: VimeoVideo[] = [];
    let nextPath: string | null = path;
    let pageCount = 0;

    while (nextPath && pageCount < 20) {
        const page = await vimeoFetch<VimeoPage<VimeoVideo>>(nextPath, token);
        videos.push(...(page.data ?? []));
        nextPath = normalizeVimeoPath(page.paging?.next);
        pageCount += 1;
    }

    return videos;
}

async function vimeoFetch<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`${VIMEO_API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: VIMEO_ACCEPT },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Vimeo returned ${response.status}`);
    }

    return response.json() as Promise<T>;
}

function videoFields() {
    return 'uri,name,link,duration,created_time,pictures,privacy,status';
}

function withShow(video: VimeoVideo, show: Pick<VimeoShow, 'uri' | 'name'>): VimeoVideo {
    return { ...video, showUri: show.uri, showName: show.name };
}

function normalizeVimeoPath(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    if (value.startsWith('https://api.vimeo.com')) {
        return value.slice(VIMEO_API.length);
    }

    return value;
}
