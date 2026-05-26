import { revalidatePath } from 'next/cache';

import { auditedMutation } from '../audit';
import { err, ok, type Result } from '../result';
import { createServiceClient } from '../supabase/server';

function extractError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
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
}): Promise<Result<void>> {
    try {
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function archiveSlideAsset(slideId: string): Promise<Result<void>> {
    try {
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
    durationSeconds?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
    lifecycleState?: string | undefined;
}): Promise<Result<string>> {
    try {
        if (input.assetType === 'ad' && input.durationSeconds && input.durationSeconds > 300) {
            return err('Ads cannot be longer than 300 seconds');
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
        const supabase = createServiceClient();
        const { data: current, error: currentError } = await supabase
            .from('media_assets')
            .select('metadata')
            .eq('id', input.id)
            .single();

        if (currentError) {
            throw currentError;
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
            return err('Asset is scheduled in use. Confirm force delete to continue.');
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
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
