import { revalidatePath } from 'next/cache';

import { auditedMutation } from '../audit';
import type { FallbackCarouselCard } from '../fallback-carousel';
import { err, ok, type Result } from '../result';
import { createServiceClient } from '../supabase/server';
import { parseTimecode } from '../time';

import { createSlideAsset } from './assets';

import type { RunbookSection } from '../types';

function extractError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

type WeatherLocationInput = { locationName: string; lat: number; lon: number };

function normalizeWeatherLocation(input: WeatherLocationInput): Result<WeatherLocationInput> {
    const locationName = input.locationName.trim();
    const lat = Number(input.lat);
    const lon = Number(input.lon);

    if (!locationName) {
        return err('City name is required');
    }

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return err('Latitude is invalid');
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        return err('Longitude is invalid');
    }

    return ok({ locationName, lat, lon });
}

function weatherPlateMetadata(location: WeatherLocationInput) {
    return {
        weatherLocationName: location.locationName,
        weatherLat: location.lat,
        weatherLon: location.lon,
    };
}

function normalizeWeatherStatus(status: string | undefined): 'draft' | 'archived' | 'ready' {
    if (status === 'draft' || status === 'archived') {
        return status;
    }

    return 'ready';
}

function normalizeFallbackCards(
    cards: Array<{ slideId: string; durationSeconds: number }>,
): FallbackCarouselCard[] {
    return cards
        .map((card) => ({
            slideId: String(card.slideId || ''),
            durationSeconds: Math.max(1, Math.round(Number(card.durationSeconds || 30))),
        }))
        .filter((card): card is FallbackCarouselCard => Boolean(card.slideId));
}

export type RunbookCheckInput = {
    date: string;
    programDayId: string;
    section: RunbookSection;
    itemKey: string;
    checked: boolean;
    notes?: string | undefined;
};

export type FallbackCarouselInput = {
    cards: Array<{ slideId: string; durationSeconds: number }>;
};

export type WeatherPlateBaseInput = {
    title: string;
    locationName: string;
    lat: number;
    lon: number;
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
};

export type ScheduledLayerInput = {
    date: string;
    blockId: string;
    title: string;
    layerType: string;
    assetId?: string | undefined;
    slideId?: string | undefined;
    startTime: string;
    durationSeconds: number;
    zIndex: number;
    position: string;
};

export type SetScheduledLayerEnabledInput = {
    date: string;
    blockId: string;
    layerId: string;
    enabled: boolean;
};

export async function updateRunbookCheck(input: RunbookCheckInput): Promise<Result<void>> {
    try {
        const supabase = createServiceClient();
        await auditedMutation(
            {
                action: 'operator_runbook.updated',
                entityType: 'operator_runbook_checks',
                metadata: { date: input.date, section: input.section, item_key: input.itemKey },
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function saveGlobalFallbackCarouselFromSlides(
    input: FallbackCarouselInput,
): Promise<Result<void>> {
    try {
        const supabase = createServiceClient();
        const cards = normalizeFallbackCards(input.cards);

        if (!cards.length) {
            return err('Selecciona al menos una card para fallback');
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
                        public_config: { enabled: true, cards },
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createWeatherPlate(input: WeatherPlateBaseInput): Promise<Result<void>> {
    try {
        const normalized = normalizeWeatherLocation(input);

        if (!normalized.success) {
            return normalized;
        }
        const result = await createSlideAsset({
            title: input.title,
            slideType: 'template',
            templateId: 'weather',
            content: `Weather plate for ${normalized.data.locationName}.`,
            defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
            status: input.status || 'ready',
            metadata: weatherPlateMetadata(normalized.data),
        });

        if (!result.success) {
            return result;
        }
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function updateWeatherPlate(
    input: WeatherPlateBaseInput & { slideId: string },
): Promise<Result<void>> {
    try {
        const normalized = normalizeWeatherLocation(input);

        if (!normalized.success) {
            return normalized;
        }
        const status = normalizeWeatherStatus(input.status);
        const supabase = createServiceClient();
        await auditedMutation(
            {
                action: 'weather_plate.updated',
                entityType: 'slide_assets',
                entityId: input.slideId,
                next: { title: input.title, status, locationName: normalized.data.locationName },
            },
            async () => {
                const { error } = await supabase
                    .from('slide_assets')
                    .update({
                        title: input.title,
                        content: `Weather plate for ${normalized.data.locationName}.`,
                        default_duration_seconds: input.defaultDurationSeconds ?? 30,
                        status,
                        metadata: weatherPlateMetadata(normalized.data),
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createScheduledLayer(input: ScheduledLayerInput): Promise<Result<void>> {
    try {
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function setScheduledLayerEnabled(
    input: SetScheduledLayerEnabledInput,
): Promise<Result<void>> {
    try {
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

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}
