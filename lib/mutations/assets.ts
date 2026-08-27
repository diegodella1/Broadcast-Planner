import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { auditedMutation } from '../audit/audit';
import { getDb } from '../db/client';
import { mediaAssets, programBlocks, scheduledLayers, slideAssets } from '../db/schema';
import { err, extractError, ok, type Result } from '../result';
import { getMediaBucket } from '../storage/r2';

export async function createSlideAsset(input: {
    title: string;
    slideType: string;
    content?: string | undefined;
    imageUrl?: string | undefined;
    templateId?: string | undefined;
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}): Promise<Result<void>> {
    try {
        if (
            input.slideType !== 'image' &&
            input.slideType !== 'html' &&
            input.slideType !== 'markdown' &&
            input.slideType !== 'template'
        ) {
            return err('Unsupported slide type');
        }

        const db = await getDb();

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
                await db.insert(slideAssets).values({
                    title: input.title,
                    slideType: input.slideType,
                    content: input.content || null,
                    imageUrl: input.imageUrl || null,
                    templateId: input.templateId || null,
                    defaultDurationSeconds: input.defaultDurationSeconds || null,
                    metadata: input.metadata ?? {},
                    status: input.status || 'ready',
                });
            },
        );
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function archiveSlideAsset(slideId: string): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: 'slide_asset.archived',
                entityType: 'slide_assets',
                entityId: slideId,
                next: { status: 'archived' },
            },
            async () => {
                await db
                    .update(slideAssets)
                    .set({ status: 'archived', updatedAt: new Date().toISOString() })
                    .where(eq(slideAssets.id, slideId));
            },
        );
        revalidatePath('/admin/slides');
        revalidatePath('/admin/calendar');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createMediaAsset(input: {
    title: string;
    sourceType: string;
    mediaKind: string;
    assetType: string;
    url?: string | undefined;
    storageBucket?: string | undefined;
    storagePath?: string | undefined;
    durationSeconds?: number | null | undefined;
    metadata?: Record<string, unknown> | undefined;
    lifecycleState?: string | undefined;
    canonicalUrl?: string | undefined;
    playbackKind?: string | undefined;
    contentType?: string | undefined;
    fileSizeBytes?: number | undefined;
    width?: number | undefined;
    height?: number | undefined;
    videoCodec?: string | undefined;
    audioCodec?: string | undefined;
    bitRate?: number | undefined;
    frameRate?: number | undefined;
    qualityLabel?: string | undefined;
    metadataStatus?: string | undefined;
}): Promise<Result<string>> {
    try {
        if (input.assetType === 'ad' && input.durationSeconds && input.durationSeconds > 300) {
            return err('Ads cannot be longer than 300 seconds');
        }

        const db = await getDb();
        const id = crypto.randomUUID();

        const data = await auditedMutation(
            {
                action: 'media_asset.created',
                entityType: 'media_assets',
                next: { title: input.title, source_type: input.sourceType, status: 'ready' },
            },
            async () => {
                await db.insert(mediaAssets).values({
                    id,
                    title: input.title,
                    sourceType: input.sourceType,
                    mediaKind: input.mediaKind,
                    assetType: input.assetType,
                    url: input.url || null,
                    storageBucket: input.storageBucket || null,
                    storagePath: input.storagePath || null,
                    durationSeconds: input.durationSeconds || null,
                    canonicalUrl: input.canonicalUrl || null,
                    playbackKind: input.playbackKind || null,
                    contentType: input.contentType || null,
                    fileSizeBytes: input.fileSizeBytes ?? null,
                    width: input.width ?? null,
                    height: input.height ?? null,
                    videoCodec: input.videoCodec || null,
                    audioCodec: input.audioCodec || null,
                    bitRate: input.bitRate ?? null,
                    frameRate: input.frameRate ?? null,
                    qualityLabel: input.qualityLabel || null,
                    metadataStatus: input.metadataStatus || 'ready',
                    metadataCheckedAt: new Date().toISOString(),
                    metadata: input.metadata ?? {},
                    status: 'ready',
                    playbackReadinessStatus: 'ready',
                    lifecycleState: input.lifecycleState ?? 'reviewed',
                });

                return { id };
            },
        );
        revalidatePath('/admin/assets');

        return ok(String(data.id));
    } catch (error) {
        return err(extractError(error));
    }
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
}): Promise<Result<void>> {
    try {
        if (!input.id) {
            return err('Asset missing');
        }

        if (input.assetType === 'ad' && input.durationSeconds && input.durationSeconds > 300) {
            return err('Ads cannot be longer than 300 seconds');
        }

        const db = await getDb();
        const [current] = await db
            .select({ metadata: mediaAssets.metadata })
            .from(mediaAssets)
            .where(eq(mediaAssets.id, input.id))
            .limit(1);

        if (!current) {
            throw new Error('Asset not found');
        }

        const metadata = buildUpdateMediaMetadata(current, input);

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
                await db
                    .update(mediaAssets)
                    .set({
                        title: input.title,
                        description: input.description || null,
                        sourceType: input.sourceType,
                        mediaKind: input.mediaKind,
                        assetType: input.assetType,
                        url: input.url || null,
                        thumbnailUrl: input.thumbnailUrl || null,
                        durationSeconds: input.durationSeconds || null,
                        status: input.status,
                        lifecycleState: input.lifecycleState ?? 'reviewed',
                        metadata,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(mediaAssets.id, input.id));
            },
        );

        if (input.fallbackLoop) {
            const cleared = await clearOtherFallbackLoops(input.id);

            if (!cleared.success) {
                return cleared;
            }
        }
        revalidatePath('/admin/assets');
        revalidatePath('/admin/output');

        for (const path of input.revalidatePaths ?? []) {
            revalidatePath(path);
        }

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

function buildUpdateMediaMetadata(
    current: { metadata?: unknown } | null,
    input: {
        assetType: string;
        orientation?: string | undefined;
        fallbackLoop?: boolean | undefined;
        playlistOrder?: number | undefined;
    },
): Record<string, unknown> {
    const metadata =
        current && typeof current.metadata === 'object' && current.metadata !== null
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

    return metadata;
}

async function clearOtherFallbackLoops(activeAssetId: string): Promise<Result<void>> {
    try {
        const db = await getDb();
        const rows = await db
            .select({ id: mediaAssets.id, metadata: mediaAssets.metadata })
            .from(mediaAssets);

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

            await db
                .update(mediaAssets)
                .set({ metadata, updatedAt: new Date().toISOString() })
                .where(eq(mediaAssets.id, id));
        }

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function deleteMediaAsset(input: {
    id: string;
    force?: boolean;
}): Promise<Result<void>> {
    try {
        if (!input.id) {
            return err('Asset missing');
        }

        const db = await getDb();
        const [asset] = await db
            .select({
                title: mediaAssets.title,
                storageBucket: mediaAssets.storageBucket,
                storagePath: mediaAssets.storagePath,
                lifecycleState: mediaAssets.lifecycleState,
            })
            .from(mediaAssets)
            .where(eq(mediaAssets.id, input.id))
            .limit(1);

        if (!asset) {
            throw new Error('Asset not found');
        }

        const scheduledInUse =
            asset.lifecycleState === 'scheduled_in_use' || (await isAssetScheduled(input.id));

        if (scheduledInUse && !input.force) {
            return err('Asset is scheduled in use. Confirm force delete to continue.');
        }

        const storageBucket = asset.storageBucket ? String(asset.storageBucket) : '';
        const storagePath = asset.storagePath ? String(asset.storagePath) : '';

        if (storageBucket && storagePath) {
            const bucket = await getMediaBucket();
            await bucket.delete(storagePath);
        }

        await auditedMutation(
            {
                action: 'media_asset.deleted',
                entityType: 'media_assets',
                entityId: input.id,
                previous: { title: String(asset.title ?? '') },
            },
            async () => {
                await db.delete(mediaAssets).where(eq(mediaAssets.id, input.id));
            },
        );
        revalidatePath('/admin/assets');
        revalidatePath('/admin/music');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

async function isAssetScheduled(assetId: string): Promise<boolean> {
    const db = await getDb();
    const [blockRows, layerRows] = await Promise.all([
        db
            .select({
                assetId: programBlocks.assetId,
                fallbackAssetId: programBlocks.fallbackAssetId,
                status: programBlocks.status,
            })
            .from(programBlocks),
        db
            .select({
                assetId: scheduledLayers.assetId,
                enabled: scheduledLayers.enabled,
            })
            .from(scheduledLayers),
    ]);

    return (
        blockRows.some(
            (row) =>
                row.status !== 'archived' &&
                (row.assetId === assetId || row.fallbackAssetId === assetId),
        ) || layerRows.some((row) => row.enabled !== false && row.assetId === assetId)
    );
}
