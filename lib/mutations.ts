import { revalidatePath } from 'next/cache';

import { auditedMutation } from './audit';
import type { FallbackCarouselCard } from './fallback-carousel';
import { createSlideAsset } from './mutations/assets';
import { createServiceClient } from './supabase/server';
import { parseTimecode } from './time';

import type { RunbookSection } from './types';

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

export {
    archiveSlideAsset,
    createMediaAsset,
    createSlideAsset,
    deleteMediaAsset,
    updateMediaAsset,
} from './mutations/assets';

export {
    archiveGuest,
    archiveGuestPlate,
    attachGuestMediaAsset,
    createGuest,
    createGuestPlate,
    updateGuest,
    updateGuestPlate,
} from './mutations/guests';

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

export async function createWeatherPlate(input: {
    title: string;
    locationName: string;
    lat: number;
    lon: number;
    defaultDurationSeconds?: number;
    status?: string;
}) {
    const location = normalizeWeatherLocation(input);
    const result = await createSlideAsset({
        title: input.title,
        slideType: 'template',
        templateId: 'weather',
        content: `Weather plate for ${location.locationName}.`,
        defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
        status: input.status || 'ready',
        metadata: weatherPlateMetadata(location),
    });

    if (!result.success) {
        throw new Error(result.error);
    }
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
