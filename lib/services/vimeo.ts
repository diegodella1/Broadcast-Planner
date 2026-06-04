import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/client';
import { mediaAssets } from '../db/schema';

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
    const db = await getDb();
    const rows = videos.map((video) => vimeoVideoToAssetRow(video));

    if (rows.length) {
        // rows[0] is guaranteed non-undefined inside this branch
        await db
            .insert(mediaAssets)
            .values(rows)
            .onConflictDoUpdate({
                target: mediaAssets.vimeoId,

                set: buildUpsertSet(rows[0]!),
            });
    }
    revalidatePath('/admin/assets');
}

export async function syncVimeoCatalog(token: string, scopeUri?: string): Promise<VimeoSyncResult> {
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
    const { existingByVimeoId } = await selectExistingVimeoRows();

    const rows = videos.map((video) => {
        const vimeoId = video.uri.split('/').pop();

        if (vimeoId) {
            seen.add(vimeoId);
        }

        return vimeoVideoToAssetRow(
            video,
            now,
            vimeoId ? existingByVimeoId.get(vimeoId) : undefined,
        );
    });

    let failedCount = 0;

    if (rows.length) {
        for (const batch of chunks(rows, 100)) {
            try {
                const db = await getDb();

                await db
                    .insert(mediaAssets)
                    .values(batch)
                    .onConflictDoUpdate({
                        target: mediaAssets.vimeoId,
                        // batch is always non-empty (chunks() never emits empty slices)

                        set: buildUpsertSet(batch[0]!),
                    });
            } catch {
                failedCount += batch.length;
            }
        }
    }

    const readiness = await validateSyncedVimeoPlayback(
        token,
        rows.map((row) => row.vimeoId ?? '').filter(Boolean),
    );
    failedCount += readiness.failedCount;

    let staleCount = 0;
    const staleEntries = [...existingByVimeoId.entries()].filter(([vimeoId, row]) => {
        if (!vimeoId || seen.has(vimeoId)) {
            return false;
        }

        if (!scopeUri) {
            return true;
        }
        const metadata =
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};

        return metadata.vimeo_show_uri === scopeUri;
    });

    for (const [, row] of staleEntries) {
        const existingMeta =
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};

        try {
            const db = await getDb();

            await db
                .update(mediaAssets)
                .set({
                    status: 'archived',
                    metadata: {
                        ...existingMeta,
                        vimeo_sync_status: 'stale',
                        vimeo_last_synced_at: now,
                    },
                    updatedAt: now,
                })
                .where(eq(mediaAssets.id, row.id));

            staleCount += 1;
        } catch {
            failedCount += 1;
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
        readinessSkipped: readiness.skippedCount > 0,
        readinessSkippedCount: readiness.skippedCount,
    };
}

export async function checkVimeoAssetPlayback(assetId: string, token: string) {
    const db = await getDb();
    const [asset] = await db
        .select({
            id: mediaAssets.id,
            title: mediaAssets.title,
            vimeoId: mediaAssets.vimeoId,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, assetId))
        .limit(1);

    if (!asset || asset.vimeoId === null || asset.vimeoId === undefined) {
        throw new Error('Vimeo asset not found');
    }

    const row = asset as { id: string; title: string; vimeoId: string };

    if (!row.vimeoId) {
        throw new Error('Vimeo asset not found');
    }
    await validateOneVimeoPlayback(token, {
        id: row.id,
        vimeoId: row.vimeoId,
        title: row.title ?? '',
    });
    revalidatePath('/admin/assets');
    revalidatePath('/admin/vimeo');
}

async function validateSyncedVimeoPlayback(token: string, vimeoIds: string[]) {
    if (!vimeoIds.length) {
        return { checkedCount: 0, failedCount: 0, skippedCount: 0 };
    }
    const maxInlineChecks = Number(process.env.VIMEO_INLINE_PLAYBACK_CHECK_LIMIT ?? 25);

    if (vimeoIds.length > maxInlineChecks) {
        return { checkedCount: 0, failedCount: 0, skippedCount: vimeoIds.length };
    }

    const db = await getDb();
    const rows: Array<{ id: string; title: string; vimeoId: string | null }> = [];

    for (const batch of chunks(vimeoIds, 50)) {
        const batchRows = await db
            .select({
                id: mediaAssets.id,
                title: mediaAssets.title,
                vimeoId: mediaAssets.vimeoId,
            })
            .from(mediaAssets)
            .where(inArray(mediaAssets.vimeoId, batch));

        rows.push(...batchRows);
    }

    let failedCount = 0;

    for (const row of rows) {
        if (!row.vimeoId) {
            continue;
        }

        try {
            await validateOneVimeoPlayback(token, {
                id: row.id,
                vimeoId: row.vimeoId,
                title: row.title ?? '',
            });
        } catch {
            failedCount += 1;
        }
    }

    return { checkedCount: rows.length, failedCount, skippedCount: 0 };
}

async function validateOneVimeoPlayback(
    token: string,
    asset: { id: string; vimeoId: string; title: string },
) {
    const now = new Date().toISOString();

    try {
        const playback = await getVimeoPlayback(token, asset.vimeoId);
        await updateVimeoPlaybackSuccess(asset.id, playback.durationSeconds || null, now);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Vimeo playback error';
        await updateVimeoPlaybackFailure(asset.id, message, now);
        throw error;
    }
}

// ─── Row builder ─────────────────────────────────────────────────────────────

type ExistingVimeoRow = {
    id: string;
    title: string | null;
    assetType: string;
    status: string;
    vimeoId: string | null;
    metadata: unknown;
    playbackReadinessStatus: string;
};

function vimeoVideoToAssetRow(
    video: VimeoVideo,
    syncedAt = new Date().toISOString(),
    existing?: ExistingVimeoRow,
) {
    const vimeoId = video.uri.split('/').pop() ?? null;
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
        typeof existing?.assetType === 'string' && existing.assetType ? existing.assetType : null;
    const assetType =
        existingAssetType && !(existingAssetType === 'ad' && video.duration > 300)
            ? existingAssetType
            : hasDuration && video.duration <= 300
              ? 'ad'
              : 'video';

    return {
        title: typeof existing?.title === 'string' && existing.title ? existing.title : video.name,
        sourceType: 'vimeo',
        mediaKind: 'video',
        assetType,
        url: video.link,
        thumbnailUrl: thumbnail,
        durationSeconds: hasDuration ? video.duration : null,
        status,
        lifecycleState: status === 'archived' ? 'expired' : 'synced',
        vimeoId,
        vimeoUri: video.uri,
        vimeoPrivacy: video.privacy?.view ?? null,
        vimeoEmbedStatus: video.privacy?.embed ?? null,
        playbackReadinessStatus:
            typeof existing?.playbackReadinessStatus === 'string'
                ? existing.playbackReadinessStatus
                : 'unchecked',
        playbackError: null,
        metadata: {
            ...existingMetadata,
            ...video,
            vimeo_show_uri: video.showUri ?? existingMetadata.vimeo_show_uri ?? null,
            vimeo_show_name: video.showName ?? existingMetadata.vimeo_show_name ?? null,
            vimeo_created_time: video.created_time ?? existingMetadata.vimeo_created_time ?? null,
            vimeo_last_synced_at: syncedAt,
            vimeo_sync_status: 'review',
        },
        updatedAt: syncedAt,
    };
}

// Builds the `set` object for onConflictDoUpdate — must list every column we
// want to overwrite on conflict. We use an ad-hoc object because Drizzle's
// sqlite `excluded` helper isn't available without raw SQL.
function buildUpsertSet(sample: ReturnType<typeof vimeoVideoToAssetRow>) {
    return {
        title: sample.title,
        sourceType: sample.sourceType,
        mediaKind: sample.mediaKind,
        assetType: sample.assetType,
        url: sample.url,
        thumbnailUrl: sample.thumbnailUrl,
        durationSeconds: sample.durationSeconds,
        status: sample.status,
        lifecycleState: sample.lifecycleState,
        vimeoUri: sample.vimeoUri,
        vimeoPrivacy: sample.vimeoPrivacy,
        vimeoEmbedStatus: sample.vimeoEmbedStatus,
        playbackReadinessStatus: sample.playbackReadinessStatus,
        playbackError: sample.playbackError,
        metadata: sample.metadata,
        updatedAt: sample.updatedAt,
    };
}

// ─── Existing-row loader ──────────────────────────────────────────────────────

async function selectExistingVimeoRows(): Promise<{
    existingByVimeoId: Map<string, ExistingVimeoRow>;
}> {
    const db = await getDb();

    // D1 has a 999-row result limit per statement when using `.all()`; fetch
    // in large slices via offset pagination to handle big catalogs.
    const allRows: ExistingVimeoRow[] = [];
    const pageSize = 500;
    let offset = 0;

    while (true) {
        const page = await db
            .select({
                id: mediaAssets.id,
                title: mediaAssets.title,
                assetType: mediaAssets.assetType,
                status: mediaAssets.status,
                vimeoId: mediaAssets.vimeoId,
                metadata: mediaAssets.metadata,
                playbackReadinessStatus: mediaAssets.playbackReadinessStatus,
            })
            .from(mediaAssets)
            .where(eq(mediaAssets.sourceType, 'vimeo'))
            .limit(pageSize)
            .offset(offset);

        allRows.push(...page);

        if (page.length < pageSize) {
            break;
        }
        offset += pageSize;
    }

    const existingByVimeoId = new Map<string, ExistingVimeoRow>(
        allRows.filter((row) => row.vimeoId).map((row) => [row.vimeoId as string, row]),
    );

    return { existingByVimeoId };
}

// ─── Playback status helpers ──────────────────────────────────────────────────

async function updateVimeoPlaybackSuccess(
    assetId: string,
    durationSeconds: number | null,
    now: string,
) {
    const db = await getDb();

    await db
        .update(mediaAssets)
        .set({
            status: 'ready',
            durationSeconds,
            playbackReadinessStatus: 'ready',
            playbackCheckedAt: now,
            playbackError: null,
            updatedAt: now,
        })
        .where(eq(mediaAssets.id, assetId));
}

async function updateVimeoPlaybackFailure(assetId: string, message: string, now: string) {
    const db = await getDb();

    await db
        .update(mediaAssets)
        .set({
            status: 'failed',
            playbackReadinessStatus: 'failed',
            playbackCheckedAt: now,
            playbackError: message,
            updatedAt: now,
        })
        .where(eq(mediaAssets.id, assetId));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
