import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { recordAuditEvent } from '../audit/audit';
import { getDb } from '../db/client';
import { integrationSettings, mediaAssets, type MediaAssetRow } from '../db/schema';
import { canonicalizePublicUrl, inspectPublicMedia } from './public-metadata';

const METADATA_PROVIDER = 'media_metadata';
const REVIEW_AFTER_FAILURES = 3;

export type PublicAssetResult = {
    assetId: string;
    created: boolean;
    status: string;
    metadataStatus: string;
};

export async function createOrRefreshPublicAsset(rawUrl: string): Promise<PublicAssetResult> {
    const canonicalUrl = canonicalizePublicUrl(rawUrl);
    const existing = await findPublicAssetByUrl(canonicalUrl);

    if (existing) {
        const refreshed = await refreshPublicAsset(existing.id);

        return { ...refreshed, created: false };
    }

    try {
        const metadata = await inspectPublicMedia(canonicalUrl);
        const finalExisting = await findPublicAssetByUrl(metadata.canonicalUrl);

        if (finalExisting) {
            const refreshed = await refreshPublicAsset(finalExisting.id);

            return { ...refreshed, created: false };
        }

        return await insertVerifiedPublicAsset(metadata);
    } catch (error) {
        return insertUnverifiedPublicAsset(canonicalUrl, error);
    }
}

export async function refreshPublicAsset(
    assetId: string,
): Promise<Omit<PublicAssetResult, 'created'>> {
    const db = await getDb();
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);

    if (!asset) {
        throw new Error('Asset not found');
    }

    if (asset.sourceType !== 'public_url') {
        throw new Error('Only public URL assets can be refreshed');
    }

    const sourceUrl = asset.canonicalUrl || asset.url;

    if (!sourceUrl) {
        throw new Error('Asset has no public URL');
    }

    try {
        const metadata = await inspectPublicMedia(sourceUrl);
        const now = new Date().toISOString();
        const metadataBag = mergeMetadata(asset, metadata.metadata, now);

        await db
            .update(mediaAssets)
            .set({
                title: metadata.title || asset.title,
                description: metadata.description,
                canonicalUrl: metadata.canonicalUrl,
                url: metadata.playbackUrl,
                playbackKind: metadata.playbackKind,
                mediaKind: metadata.mediaKind,
                thumbnailUrl: metadata.thumbnailUrl,
                contentType: metadata.contentType,
                fileSizeBytes: metadata.fileSizeBytes,
                durationSeconds: metadata.durationSeconds,
                width: metadata.width,
                height: metadata.height,
                videoCodec: metadata.videoCodec,
                audioCodec: metadata.audioCodec,
                bitRate: metadata.bitRate,
                frameRate: metadata.frameRate,
                qualityLabel: metadata.qualityLabel,
                etag: metadata.etag,
                lastModified: metadata.lastModified,
                metadataStatus: metadata.metadataStatus,
                metadataCheckedAt: now,
                metadataFailures: 0,
                metadataError: null,
                metadata: metadataBag,
                status: 'ready',
                playbackReadinessStatus: 'ready',
                playbackCheckedAt: now,
                playbackError: null,
                updatedAt: now,
            })
            .where(eq(mediaAssets.id, asset.id));

        await auditRefresh(asset.id, true, {
            duration_changed:
                asset.durationSeconds !== null &&
                metadata.durationSeconds !== null &&
                asset.durationSeconds !== metadata.durationSeconds,
        });

        return {
            assetId: asset.id,
            status: 'ready',
            metadataStatus: metadata.metadataStatus,
        };
    } catch (error) {
        return recordRefreshFailure(asset, error);
    }
}

export async function refreshPublicAssetBatch(limit = 25, concurrency = 3) {
    const db = await getDb();
    const rows = await db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.sourceType, 'public_url'), ne(mediaAssets.status, 'archived')))
        .orderBy(asc(mediaAssets.metadataCheckedAt))
        .limit(Math.max(1, Math.min(100, limit)));
    const results = await mapWithConcurrency(rows, concurrency, async ({ id }) => {
        try {
            return await refreshPublicAsset(id);
        } catch (error) {
            return {
                assetId: id,
                status: 'needs_review',
                metadataStatus: 'failed',
                error: errorMessage(error),
            };
        }
    });
    const failed = results.filter((result) => result.metadataStatus === 'failed').length;
    const stale = results.filter((result) => result.metadataStatus === 'stale').length;

    await recordBatchStatus({ checked: results.length, failed, stale });

    return { checked: results.length, failed, stale, results };
}

export async function getMetadataRefreshHealth() {
    const db = await getDb();
    const [settings] = await db
        .select()
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, METADATA_PROVIDER))
        .limit(1);
    const [reviewCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(mediaAssets)
        .where(
            and(eq(mediaAssets.sourceType, 'public_url'), eq(mediaAssets.status, 'needs_review')),
        );

    return {
        settings: settings ?? null,
        needsReview: Number(reviewCount?.count ?? 0),
    };
}

async function insertVerifiedPublicAsset(
    metadata: Awaited<ReturnType<typeof inspectPublicMedia>>,
): Promise<PublicAssetResult> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(mediaAssets).values({
        id,
        title: metadata.title,
        description: metadata.description,
        sourceType: 'public_url',
        mediaKind: metadata.mediaKind,
        assetType:
            metadata.mediaKind === 'image'
                ? 'image'
                : metadata.mediaKind === 'audio'
                  ? 'music'
                  : 'video',
        canonicalUrl: metadata.canonicalUrl,
        url: metadata.playbackUrl,
        playbackKind: metadata.playbackKind,
        thumbnailUrl: metadata.thumbnailUrl,
        durationSeconds: metadata.durationSeconds,
        contentType: metadata.contentType,
        fileSizeBytes: metadata.fileSizeBytes,
        width: metadata.width,
        height: metadata.height,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
        bitRate: metadata.bitRate,
        frameRate: metadata.frameRate,
        qualityLabel: metadata.qualityLabel,
        etag: metadata.etag,
        lastModified: metadata.lastModified,
        metadataStatus: metadata.metadataStatus,
        metadataCheckedAt: now,
        metadataFailures: 0,
        metadata: metadata.metadata,
        status: 'ready',
        playbackReadinessStatus: 'ready',
        playbackCheckedAt: now,
        lifecycleState: 'reviewed',
        createdAt: now,
        updatedAt: now,
    });
    await recordAuditEvent({
        actor: 'admin',
        action: 'media_asset.public_url_created',
        entityType: 'media_assets',
        entityId: id,
        metadata: { canonical_url: metadata.canonicalUrl },
    });

    return {
        assetId: id,
        created: true,
        status: 'ready',
        metadataStatus: metadata.metadataStatus,
    };
}

async function insertUnverifiedPublicAsset(
    canonicalUrl: string,
    error: unknown,
): Promise<PublicAssetResult> {
    const db = await getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const message = errorMessage(error);

    await db.insert(mediaAssets).values({
        id,
        title: titleFromUrl(canonicalUrl),
        sourceType: 'public_url',
        mediaKind: 'video',
        assetType: 'video',
        canonicalUrl,
        url: canonicalUrl,
        metadataStatus: 'failed',
        metadataCheckedAt: now,
        metadataFailures: 1,
        metadataError: message,
        metadata: { original_url: canonicalUrl, resolver_error: message },
        status: 'needs_review',
        playbackReadinessStatus: 'review',
        playbackCheckedAt: now,
        playbackError: message,
        lifecycleState: 'reviewed',
        createdAt: now,
        updatedAt: now,
    });
    await auditRefresh(id, false, { error: message, created: true });

    return {
        assetId: id,
        created: true,
        status: 'needs_review',
        metadataStatus: 'failed',
    };
}

async function recordRefreshFailure(
    asset: MediaAssetRow,
    error: unknown,
): Promise<Omit<PublicAssetResult, 'created'>> {
    const db = await getDb();
    const message = errorMessage(error);
    const transition = metadataFailureState(asset);
    const { failures, metadataStatus, status } = transition;
    const now = new Date().toISOString();

    await db
        .update(mediaAssets)
        .set({
            metadataStatus,
            metadataCheckedAt: now,
            metadataFailures: failures,
            metadataError: message,
            status,
            playbackReadinessStatus:
                status === 'needs_review' ? 'review' : asset.playbackReadinessStatus,
            playbackError: status === 'needs_review' ? message : asset.playbackError,
            updatedAt: now,
        })
        .where(eq(mediaAssets.id, asset.id));
    await auditRefresh(asset.id, false, { error: message, failures });

    return { assetId: asset.id, status, metadataStatus };
}

export function metadataFailureState(
    asset: Pick<MediaAssetRow, 'metadataFailures' | 'metadataStatus' | 'status'>,
) {
    const failures = (asset.metadataFailures ?? 0) + 1;
    const hasValidMetadata =
        asset.metadataStatus === 'ready' ||
        asset.metadataStatus === 'partial' ||
        asset.metadataStatus === 'stale';

    return {
        failures,
        metadataStatus: hasValidMetadata ? ('stale' as const) : ('failed' as const),
        status: failures >= REVIEW_AFTER_FAILURES ? ('needs_review' as const) : asset.status,
    };
}

async function findPublicAssetByUrl(url: string) {
    const db = await getDb();
    const [row] = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.sourceType, 'public_url'), eq(mediaAssets.canonicalUrl, url)))
        .limit(1);

    return row ?? null;
}

function mergeMetadata(
    asset: MediaAssetRow,
    providerMetadata: Record<string, unknown>,
    checkedAt: string,
) {
    const previous =
        typeof asset.metadata === 'object' && asset.metadata !== null
            ? (asset.metadata as Record<string, unknown>)
            : {};

    return {
        ...previous,
        ...providerMetadata,
        metadata_source: providerMetadata.resolver ?? 'public_http',
        metadata_checked_at: checkedAt,
        previous_duration_seconds: asset.durationSeconds,
    };
}

async function recordBatchStatus(input: { checked: number; failed: number; stale: number }) {
    const db = await getDb();
    const now = new Date().toISOString();
    const publicConfig = {
        last_refresh_at: now,
        last_refresh_count: input.checked,
        last_refresh_failed_count: input.failed,
        last_refresh_stale_count: input.stale,
        schedule: '04:15 daily',
        batch_size: 25,
        concurrency: 3,
    };

    await db
        .insert(integrationSettings)
        .values({
            provider: METADATA_PROVIDER,
            publicConfig,
            status: input.failed ? 'failed' : 'connected',
            lastCheckedAt: now,
            lastError: input.failed ? `${input.failed} metadata refreshes failed` : null,
            createdAt: now,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: integrationSettings.provider,
            set: {
                publicConfig,
                status: input.failed ? 'failed' : 'connected',
                lastCheckedAt: now,
                lastError: input.failed ? `${input.failed} metadata refreshes failed` : null,
                updatedAt: now,
            },
        });
}

async function auditRefresh(assetId: string, success: boolean, metadata: Record<string, unknown>) {
    await recordAuditEvent({
        actor: 'metadata-refresh',
        action: 'media_asset.metadata_refreshed',
        entityType: 'media_assets',
        entityId: assetId,
        result: success ? 'success' : 'failure',
        metadata,
    }).catch(() => undefined);
}

async function mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    operation: (value: T) => Promise<R>,
) {
    const results = new Array<R>(values.length);
    let cursor = 0;
    const workers = Array.from(
        { length: Math.min(Math.max(1, concurrency), values.length) },
        async () => {
            while (cursor < values.length) {
                const index = cursor;
                cursor += 1;
                results[index] = await operation(values[index] as T);
            }
        },
    );

    await Promise.all(workers);

    return results;
}

function titleFromUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    const pathTitle = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');

    return pathTitle.replace(/\.[a-z0-9]{2,5}$/i, '') || url.hostname;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
