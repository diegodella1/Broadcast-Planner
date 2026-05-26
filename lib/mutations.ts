import { revalidatePath } from 'next/cache';

import { auditedMutation } from './audit';
import type { FallbackCarouselCard } from './fallback-carousel';
import { createServiceClient } from './supabase/server';
import { parseTimecode } from './time';

import type { GuestStatus, RunbookSection } from './types';

export {
    archiveProgramBlock,
    bulkUpdateProgramBlockStatus,
    createBulkCardLoop,
    createLongTestSchedule,
    createProgramBlock,
    createProgramDayFromTemplate,
    deleteProgramBlock,
    duplicateProgramBlock,
    ensureProgramDay,
    fillProgramBlockContent,
    moveProgramBlock,
    reorderProgramBlocks,
    resizeProgramBlock,
    updateProgramBlock,
    updateProgramDayStatus,
} from './mutations/blocks';

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
