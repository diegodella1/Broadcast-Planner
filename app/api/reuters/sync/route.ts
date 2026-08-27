import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';

import { recordAuditEvent } from '@/lib/audit/audit';
import { requireAdmin } from '@/lib/auth/auth';
import { verifyCsrfToken } from '@/lib/auth/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { getReutersClient, type ReutersChannel } from '@/lib/services/reuters';
import { getDb } from '@/lib/db/client';
import { mediaAssets } from '@/lib/db/schema';
import type { InsertMediaAssetRow } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type ReutersSyncedChannel = ReutersChannel & {
    /** `media_assets.id` for the cached row, or null if not yet synced. */
    assetId: string | null;
};

type SyncResponse = {
    synced: number;
    channels: ReutersSyncedChannel[];
};

type ChannelsResponse = {
    channels: ReutersSyncedChannel[];
};

/**
 * GET /api/reuters/sync
 *
 * Returns the current list of Reuters live channels (from `getReutersClient()`)
 * merged with the cached `media_assets.id` for each channel — used by the
 * operations panel to drive the "Reuters Live" picker without forcing a sync.
 * Channels without a cached asset id surface `assetId: null`; the caller must
 * trigger POST /api/reuters/sync first to be able to schedule them.
 */
export async function GET(): Promise<NextResponse> {
    try {
        await requireAdmin();
        const client = await getReutersClient();
        const channels = await client.listLiveChannels();
        const merged = await mergeWithCachedAssetIds(channels);
        const body: ChannelsResponse = { channels: merged };

        return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: { 'Cache-Control': 'no-store' } },
            );
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[api/reuters/sync:GET]', error);

        return NextResponse.json(
            { error: message },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}

/**
 * POST /api/reuters/sync
 *
 * Calls the configured Reuters client (fixtures by default — see
 * REUTERS_PROVIDER and `lib/reuters.ts`), upserts each live channel into
 * `media_assets` keyed by URL, and revalidates affected admin routes.
 *
 * The natural key is `media_assets.url`: Reuters HLS endpoints are stable per
 * channel id even when the upstream signing rotates, so two runs against the
 * same provider reconcile in place. If the upstream URL changes, the row is
 * inserted as a fresh asset and the stale row is left untouched (operator
 * cleanup task — out of scope for the scaffolding round).
 */
export async function POST(request: Request): Promise<NextResponse> {
    try {
        await requireAdmin();
        await assertRateLimit({ scope: 'api:reuters:sync', request, limit: 20, windowSeconds: 60 });
        await verifyCsrfToken(request);
        const client = await getReutersClient();
        const channels = await client.listLiveChannels();
        const db = await getDb();

        const urls = channels.map((c) => c.hlsUrl);
        const existingRows = urls.length
            ? await db
                  .select({ id: mediaAssets.id, url: mediaAssets.url })
                  .from(mediaAssets)
                  .where(inArray(mediaAssets.url, urls))
            : [];

        const existingByUrl = new Map<string, string>();

        for (const row of existingRows) {
            const url = typeof row.url === 'string' ? row.url : '';
            const id = typeof row.id === 'string' ? row.id : '';

            if (url && id) {
                existingByUrl.set(url, id);
            }
        }

        const nowIso = new Date().toISOString();
        const inserts = channels
            .filter((c) => !existingByUrl.has(c.hlsUrl))
            .map((c) => buildAssetInsertRow(c, nowIso));

        if (inserts.length) {
            await db.insert(mediaAssets).values(inserts);
        }

        const updates = channels.filter((c) => existingByUrl.has(c.hlsUrl));

        for (const channel of updates) {
            const id = existingByUrl.get(channel.hlsUrl);

            if (!id) {
                continue;
            }
            await db
                .update(mediaAssets)
                .set(buildAssetUpdateRow(channel, nowIso))
                .where(eq(mediaAssets.id, id));
        }

        revalidatePath('/admin/assets');
        revalidatePath('/admin/output');
        revalidatePath('/admin/settings');

        const merged = await mergeWithCachedAssetIds(channels);
        await recordAuditEvent({
            actor: 'reuters-sync',
            action: 'reuters.sync',
            entityType: 'media_assets',
            metadata: { synced_count: channels.length },
        });
        const body: SyncResponse = { synced: channels.length, channels: merged };

        return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        if (error instanceof Error && error.message === 'Rate limit exceeded') {
            const { retryAfterSeconds } = rateLimitErrorResponse(error);

            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                {
                    status: 429,
                    headers: {
                        'Cache-Control': 'no-store',
                        'Retry-After': String(retryAfterSeconds),
                    },
                },
            );
        }

        if (error instanceof Error && error.message === 'Invalid CSRF token') {
            return NextResponse.json(
                { error: 'Invalid CSRF token' },
                { status: 403, headers: { 'Cache-Control': 'no-store' } },
            );
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        await recordAuditEvent({
            actor: 'reuters-sync',
            action: 'reuters.sync',
            entityType: 'media_assets',
            result: 'failure',
            metadata: { error: message },
        }).catch(() => undefined);
        console.error('[api/reuters/sync:POST]', error);

        return NextResponse.json(
            { error: message },
            { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}

async function mergeWithCachedAssetIds(
    channels: ReutersChannel[],
): Promise<ReutersSyncedChannel[]> {
    const urls = channels.map((c) => c.hlsUrl);

    if (!urls.length) {
        return [];
    }
    const db = await getDb();
    const rows = await db
        .select({ id: mediaAssets.id, url: mediaAssets.url, metadata: mediaAssets.metadata })
        .from(mediaAssets)
        .where(eq(mediaAssets.sourceType, 'public_url'));

    const byUrl = new Map<string, string>();

    for (const row of rows) {
        const url = typeof row.url === 'string' ? row.url : '';
        const id = typeof row.id === 'string' ? row.id : '';

        const metadata =
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {};

        if (url && id && urls.includes(url) && metadata.reuters_channel_id) {
            byUrl.set(url, id);
        }
    }

    return channels.map((c) => ({ ...c, assetId: byUrl.get(c.hlsUrl) ?? null }));
}

function buildAssetInsertRow(channel: ReutersChannel, nowIso: string): InsertMediaAssetRow {
    return {
        title: channel.name,
        description: channel.description ?? null,
        sourceType: 'public_url',
        mediaKind: 'video',
        assetType: 'video',
        url: channel.hlsUrl,
        canonicalUrl: channel.hlsUrl,
        playbackKind: 'hls',
        thumbnailUrl: channel.thumbnailUrl ?? null,
        durationSeconds: null,
        status: 'ready',
        metadataStatus: 'ready',
        metadataCheckedAt: nowIso,
        playbackReadinessStatus: 'ready',
        lifecycleState: 'synced',
        metadata: {
            reuters_channel_id: channel.id,
            reuters_category: channel.category ?? null,
        },
        updatedAt: nowIso,
    };
}

function buildAssetUpdateRow(
    channel: ReutersChannel,
    nowIso: string,
): Partial<InsertMediaAssetRow> {
    return {
        title: channel.name,
        description: channel.description ?? null,
        thumbnailUrl: channel.thumbnailUrl ?? null,
        canonicalUrl: channel.hlsUrl,
        playbackKind: 'hls',
        status: 'ready',
        metadataStatus: 'ready',
        metadataCheckedAt: nowIso,
        lifecycleState: 'synced',
        metadata: {
            reuters_channel_id: channel.id,
            reuters_category: channel.category ?? null,
        },
        updatedAt: nowIso,
    };
}
